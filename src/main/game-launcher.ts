import {
  parseJvmArgs,
  profileMutationActive,
  readProfileSettings,
  recordProfileJava,
  registerProfileSettings
} from './profile-settings'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { launch } from '@xmcl/core'
import type { ChildProcess } from 'node:child_process'
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  open
} from 'node:fs/promises'
import { join } from 'node:path'
import { domainToASCII } from 'node:url'
import { isIP } from 'node:net'
import type { MicrosoftAuth } from './microsoft-auth'
import type {
  GameCode,
  GamePhase,
  GameProfile,
  GameResult,
  GameState
} from '../shared/game'
import {
  installMinecraft,
  inspectJava,
  saveJava,
  InstallFailure
} from './minecraft-install'
import type {
  ProgressTrackerMultiple
} from '@xmcl/installer'

declare const __MORU_MICROSOFT_CLIENT_ID__: string

const initial: GameState = {
  status: 'idle',
  phase: 'none',
  profileId: null,
  profileName: null,
  downloaded: 0,
  total: 0,
  code: null,
  javaMajor: null,
  exitCode: null
}

function validProfile(
  value: unknown
): value is GameProfile {
  if (!value || typeof value !== 'object') return false

  const p = value as Partial<GameProfile>

  return (
    typeof p.id === 'string' &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(p.id) &&
    typeof p.name === 'string' &&
    !!p.name.trim() &&
    p.name.length <= 100 &&
    typeof p.version === 'string' &&
    /^[a-zA-Z0-9._+\-]{1,100}$/.test(p.version) &&
    ['vanilla', 'fabric', 'forge', 'neoforge'].includes(
      String(p.loader)
    ) &&
    (
      p.loaderVersion == null ||
      (
        typeof p.loaderVersion === 'string' &&
        /^[a-zA-Z0-9._+\-]{1,150}$/.test(
          p.loaderVersion
        )
      )
    )
  )
}

function parseServer(
  value: unknown
): {
  host: string
  port: number
  quick: string
} | null {
  if (
    typeof value !== 'string' ||
    value.length > 253 ||
    /[\s/@?#\\]/.test(value)
  ) {
    return null
  }

  const match = value.startsWith('[')
    ? /^\[([^\]]+)\](?::([0-9]+))?$/.exec(value)
    : /^([^:]+)(?::([0-9]+))?$/.exec(value)

  if (!match) return null

  const host = isIP(match[1])
    ? match[1]
    : domainToASCII(match[1]).toLowerCase()

  const port = match[2]
    ? Number(match[2])
    : 25565

  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (
      value.startsWith('[') &&
      isIP(host) !== 6
    )
  ) {
    return null
  }

  if (
    !isIP(host) &&
    !host.split('.').every(
      label =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
          label
        )
    )
  ) {
    return null
  }

  return {
    host,
    port,
    quick:
      `${isIP(host) === 6 ? `[${host}]` : host}:${port}`
  }
}

export function registerGameLauncher(
  auth: MicrosoftAuth,
  trusted: (event: IpcMainInvokeEvent) => void
): void {
  let state = { ...initial }
  let controller: AbortController | null = null
  let child: ChildProcess | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let progress: ProgressTrackerMultiple | undefined
  let lastPublish = 0

  const userData = app.getPath('userData')

  registerProfileSettings(
    trusted,
    () => !!controller || !!child
  )

  function publish(patch: Partial<GameState>) {
    state = { ...state, ...patch }

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(
          'game:changed',
          state
        )
      }
    }
  }

  function phase(
    value: GamePhase,
    tracker?: ProgressTrackerMultiple
  ) {
    progress = tracker

    publish({
      status:
        value === 'auth' || value === 'metadata'
          ? 'preparing'
          : 'installing',
      phase: value,
      downloaded: 0,
      total: 0
    })
  }

  const lockPath = (id: string) =>
    join(
      userData,
      'profiles',
      id,
      '.moru-game-running.json'
    )

  async function alreadyRunning(
    id: string
  ): Promise<boolean> {
    try {
      const lock = JSON.parse(
        await readFile(lockPath(id), 'utf8')
      ) as { pid?: number }

      if (
        Number.isInteger(lock.pid) &&
        lock.pid! > 0
      ) {
        try {
          process.kill(lock.pid!, 0)
          return true
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code ===
            'EPERM'
          ) {
            return true
          }
        }
      }
    } catch {
      // 실행 중인 게임 기록이 없습니다.
    }

    return false
  }

  const failed = (code: GameCode): GameResult => ({
    ok: false,
    code
  })

  async function run(
    profile: GameProfile,
    server: ReturnType<typeof parseServer>,
    signal: AbortSignal
  ) {
    let log: Awaited<ReturnType<typeof open>> | null = null
    let launched = false

    const secrets = new Set<string>()

    try {
      if (await alreadyRunning(profile.id)) {
        publish({
          status: 'error',
          code: 'ALREADY_RUNNING'
        })
        return
      }

      signal.throwIfAborted()
      phase('auth')

      const first = await auth.getGameSession()

      if (!first.accessToken) throw Error('AUTH')

      secrets.add(first.accessToken)
      signal.throwIfAborted()

      if (auth.getState().status !== 'signedIn') {
        throw Error('AUTH')
      }

      const installed = await installMinecraft(
        profile,
        userData,
        signal,
        phase
      )

      phase('auth')

      const session = await auth.getGameSession()

      if (!session.accessToken) throw Error('AUTH')

      secrets.add(session.accessToken)

      const account = auth.getState().profile

      if (
        auth.getState().status !== 'signedIn' ||
        !account
      ) {
        throw Error('AUTH')
      }

      signal.throwIfAborted()

      await mkdir(
        join(installed.game, 'logs'),
        { recursive: true }
      )

      log = await open(
        join(
          installed.game,
          'logs',
          'moru-launcher.log'
        ),
        'w',
        0o600
      )

      const handle = log
      let writes = Promise.resolve()

      function line(value: string) {
        let clean = value

        for (const secret of secrets) {
          if (secret) {
            clean = clean
              .split(secret)
              .join('[REDACTED]')
          }
        }

        writes = writes
          .then(() =>
            handle.write(clean + '\n').then(() => {})
          )
          .catch(() => {})
      }

      publish({
        status: 'starting',
        phase: 'launch',
        downloaded: 0,
        total: 0
      })

      const parts = profile.version
        .split('.')
        .map(Number)

      const quick =
        parts[0] >= 26 ||
        (parts[0] === 1 && parts[1] >= 20)

      const settings =
        await readProfileSettings(profile.id)

      const maxMemory = settings.memoryMb

      await recordProfileJava(
        profile.id,
        installed.java
      )

      child = await launch({
        gamePath: installed.game,
        resourcePath: installed.resources,
        version: installed.version,
        javaPath: installed.java,

        gameProfile: {
          name: account.name,
          id: account.id
        },

        accessToken: session.accessToken,

        launcherName: 'MORU',
        launcherBrand: 'MORU',
        minMemory: 256,
        maxMemory,

        extraJVMArgs: parseJvmArgs(settings.jvmArgs),

        nativeRoot: join(
          installed.game,
          '.moru-natives',
          installed.version.id
        ),

        features: {
          moru_auth: {
            clientid: __MORU_MICROSOFT_CLIENT_ID__,
            auth_xuid: ''
          }
        },

        ...(
          server
            ? quick
              ? { quickPlayMultiplayer: server.quick }
              : {
                  server: {
                    ip: server.host,
                    port: server.port
                  }
                }
            : {}
        ),

        extraExecOption: {
          cwd: installed.game,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          signal
        }
      })

      const processChild = child

      // 실행 인수와 인증 토큰은 로그에 기록하지 않습니다.
      for (const stream of [
        processChild.stdout,
        processChild.stderr
      ]) {
        if (!stream) continue

        stream.setEncoding('utf8')

        let buffer = ''
        let dropping = false

        stream.on('data', (chunk: string) => {
          for (const piece of chunk.split(/(?<=\n)/)) {
            if (!dropping) buffer += piece

            if (buffer.length > 256 * 1024) {
              buffer = ''
              dropping = true
            }

            if (piece.endsWith('\n')) {
              if (!dropping) {
                line(buffer.trimEnd())
              }

              buffer = ''
              dropping = false
            }
          }
        })

        stream.once('end', () => {
          if (buffer && !dropping) line(buffer)
        })
      }

      let closed = false

      processChild.once('close', () => {
        closed = true
      })

      await new Promise<void>((resolve, reject) => {
        processChild.once('error', reject)

        if (processChild.pid) resolve()
        else processChild.once('spawn', resolve)
      })

      signal.throwIfAborted()
      launched = true

      await writeFile(
        lockPath(profile.id),
        JSON.stringify({
          pid: processChild.pid,
          startedAt: Date.now()
        }),
        { mode: 0o600 }
      ).catch(() => {})

      processChild.once('error', () => {
        line('Minecraft process error')
      })

      const onClose = (exitCode: number | null) => {
        child = null

        void unlink(lockPath(profile.id))
          .catch(() => {})

        line(
          `Minecraft exited: ${exitCode ?? 'signal'}`
        )

        void writes.finally(() =>
          handle.close().catch(() => {})
        )

        publish({
          status: exitCode === 0 ? 'idle' : 'error',
          phase: 'none',
          code:
            exitCode === 0
              ? null
              : 'GAME_EXITED',
          exitCode
        })
      }

      if (closed) {
        onClose(processChild.exitCode)
      } else {
        processChild.once('close', onClose)
        processChild.unref()

        publish({
          status: 'running',
          phase: 'none',
          code: null
        })
      }
    } catch (error) {
      if (signal.aborted) {
        publish({
          status: 'idle',
          phase: 'none',
          code: 'CANCELLED'
        })
      } else if (state.phase === 'auth') {
        publish({
          status: 'error',
          code:
            auth.getState().error?.code ===
            'APP_ACCESS_REQUIRED'
              ? 'APP_ACCESS_REQUIRED'
              : 'AUTH_REQUIRED'
        })
      } else if (error instanceof InstallFailure) {
        publish({
          status: 'error',
          code: error.code,
          javaMajor: error.javaMajor
        })
      } else {
        publish({
          status: 'error',
          code:
            state.phase === 'launch'
              ? 'LAUNCH_FAILED'
              : 'INSTALL_FAILED'
        })
      }

      if (!launched) {
        child = null
        await log?.close().catch(() => {})
      }
    } finally {
      controller = null
      clearInterval(timer)
      timer = undefined
      progress = undefined
    }
  }

  ipcMain.handle('game:state', event => {
    trusted(event)
    return state
  })

  ipcMain.handle(
    'game:start',
    (
      event,
      input: unknown,
      serverInput?: unknown
    ): GameResult => {
      trusted(event)

      if (
        controller ||
        child ||
        profileMutationActive()
      ) {
        return failed('BUSY')
      }

      if (!validProfile(input)) {
        return failed('INVALID_PROFILE')
      }

      const server =
        serverInput == null || serverInput === ''
          ? null
          : parseServer(serverInput)

      if (
        serverInput != null &&
        serverInput !== '' &&
        !server
      ) {
        return failed('INVALID_SERVER')
      }

      const profile: GameProfile = {
        id: input.id,
        name: input.name,
        version: input.version,
        loader: input.loader,
        loaderVersion: input.loaderVersion
      }

      controller = new AbortController()

      publish({
        ...initial,
        status: 'preparing',
        phase: 'auth',
        profileId: profile.id,
        profileName: profile.name
      })

      timer = setInterval(() => {
        if (
          progress &&
          Date.now() - lastPublish > 400
        ) {
          lastPublish = Date.now()

          publish({
            downloaded: Number.isFinite(progress.progress)
              ? progress.progress
              : 0,
            total: Number.isFinite(progress.total)
              ? progress.total
              : 0
          })
        }
      }, 500)

      void run(
        profile,
        server,
        controller.signal
      )

      return { ok: true }
    }
  )

  ipcMain.handle('game:cancel', event => {
    trusted(event)

    if (controller && !child) {
      publish({ status: 'cancelling' })
      controller.abort()
    }

    return { ok: true } satisfies GameResult
  })

  ipcMain.handle(
    'game:choose-java',
    async (event): Promise<GameResult> => {
      trusted(event)

      if (
        controller ||
        child ||
        profileMutationActive()
      ) {
        return failed('BUSY')
      }

      const major = state.javaMajor

      if (!major) return failed('JAVA_INVALID')

      const window =
        BrowserWindow.fromWebContents(event.sender)

      if (!window) return failed('JAVA_INVALID')

      const selected = await dialog.showOpenDialog(
        window,
        {
          title:
            `Java ${major} · java${process.platform === 'win32' ? '.exe' : ''}`,
          properties: ['openFile'],
          ...(
            process.platform === 'win32'
              ? {
                  filters: [
                    {
                      name: 'Java executable',
                      extensions: ['exe']
                    }
                  ]
                }
              : {}
          )
        }
      )

      if (
        selected.canceled ||
        !selected.filePaths[0]
      ) {
        return { ok: true }
      }

      if (
        await inspectJava(selected.filePaths[0]) !== major
      ) {
        return failed('JAVA_INVALID')
      }

      try {
        await saveJava(
          userData,
          major,
          selected.filePaths[0]
        )
      } catch {
        return failed('JAVA_INVALID')
      }

      publish({
        status: 'idle',
        code: null,
        javaMajor: null,
        phase: 'none'
      })

      return { ok: true }
    }
  )

  ipcMain.handle(
    'game:open-log',
    async (event): Promise<GameResult> => {
      trusted(event)

      if (!state.profileId) {
        return failed('OPEN_FAILED')
      }

      const path = join(
        userData,
        'profiles',
        state.profileId,
        'logs'
      )

      try {
        await mkdir(path, { recursive: true })

        return await shell.openPath(path)
          ? failed('OPEN_FAILED')
          : { ok: true }
      } catch {
        return failed('OPEN_FAILED')
      }
    }
  )

  app.on('before-quit', () => {
    controller?.abort()
  })
}