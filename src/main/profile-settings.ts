import {
  app,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { totalmem } from 'node:os'
import type {
  ProfileSettings,
  ProfileSettingsInfo,
  ProfileSettingsResult
} from '../shared/profile-settings'

const mutations = new Set<string>()

export const profileMutationActive = () =>
  mutations.size > 0

const invalid = () =>
  ({ ok: false, code: 'INVALID' } as const)

function memory() {
  const total = Math.floor(totalmem() / 1024 / 1024)

  const max = Math.max(
    512,
    Math.min(
      process.arch === 'ia32' ? 1024 : 65536,
      total - 1024
    )
  )

  return {
    total,
    min: 512,
    max,
    default: Math.max(
      512,
      Math.min(4096, Math.floor(total / 2), max)
    )
  }
}

async function directory(id: unknown): Promise<string> {
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
  ) {
    throw Error('INVALID')
  }

  const root = join(
    app.getPath('userData'),
    'profiles'
  )

  await mkdir(root, { recursive: true })

  if ((await lstat(root)).isSymbolicLink()) {
    throw Error('INVALID')
  }

  const path = join(root, id)

  try {
    const info = await lstat(path)

    if (
      !info.isDirectory() ||
      info.isSymbolicLink()
    ) {
      throw Error('INVALID')
    }
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error
    }
  }

  return path
}

export function parseJvmArgs(value: string): string[] {
  if (
    value.length > 8192 ||
    /[\r\n\0]/.test(value)
  ) {
    throw Error('JVM_ARGS')
  }

  const args: string[] = []
  let token = ''
  let quote = ''

  for (const char of value.trim()) {
    if (quote) {
      if (char === quote) quote = ''
      else token += char
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (/\s/.test(char)) {
      if (token) {
        args.push(token)
        token = ''
      }
    } else {
      token += char
    }
  }

  if (quote) throw Error('JVM_ARGS')
  if (token) args.push(token)

  if (
    args.length > 128 ||
    args.some(
      arg =>
        !arg.startsWith('-') ||
        /^-Xm[sx]/i.test(arg) ||
        /^-XX:(?:MaxRAM|InitialRAM|MinRAM|MaxHeapSize|InitialHeapSize)/i.test(arg) ||
        /^(?:-jar|-cp|-classpath|--class-path)(?:=|$)/i.test(arg)
    )
  ) {
    throw Error('JVM_ARGS')
  }

  return args
}

function validate(
  value: unknown
): value is ProfileSettings {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as ProfileSettings
  const range = memory()

  return (
    Number.isInteger(settings.memoryMb) &&
    settings.memoryMb >= range.min &&
    settings.memoryMb <= range.max &&
    typeof settings.jvmArgs === 'string' &&
    typeof settings.description === 'string' &&
    settings.description.length <= 2000
  )
}

export async function readProfileSettings(
  id: string
): Promise<ProfileSettings> {
  const path = await directory(id)
  const range = memory()
  let value: unknown

  try {
    value = JSON.parse(
      await readFile(
        join(path, '.moru-settings.json'),
        'utf8'
      )
    )
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return {
        memoryMb: range.default,
        jvmArgs: '',
        description: ''
      }
    }

    throw error
  }

  if (!value || typeof value !== 'object') {
    throw Error('INVALID')
  }

  const settings = value as ProfileSettings

  if (!Number.isInteger(settings.memoryMb)) {
    throw Error('INVALID')
  }

  settings.memoryMb = Math.max(
    range.min,
    Math.min(range.max, settings.memoryMb)
  )

  if (!validate(settings)) throw Error('INVALID')

  parseJvmArgs(settings.jvmArgs)

  return settings
}

async function sizeOf(path: string) {
  const pending = [path]
  const deadline = Date.now() + 4000

  let bytes = 0
  let count = 0
  let complete = true

  while (pending.length) {
    if (
      ++count > 100000 ||
      Date.now() > deadline
    ) {
      complete = false
      break
    }

    const next = pending.pop()!

    try {
      const info = await lstat(next)

      if (info.isSymbolicLink()) continue

      if (info.isDirectory()) {
        for (const entry of await readdir(next)) {
          pending.push(join(next, entry))
        }
      } else if (info.isFile()) {
        bytes += info.size
      }
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        complete = false
      }
    }
  }

  return { bytes, complete }
}

async function running(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(
      await readFile(
        join(path, '.moru-game-running.json'),
        'utf8'
      )
    ) as { pid?: number }

    if (
      Number.isInteger(value.pid) &&
      value.pid! > 0
    ) {
      try {
        process.kill(value.pid!, 0)
        return true
      } catch (error) {
        return (
          (error as NodeJS.ErrnoException).code !==
          'ESRCH'
        )
      }
    }
  } catch {
    // 실행 중인 게임 기록이 없습니다.
  }

  return false
}

export async function recordProfileJava(
  id: string,
  path: string
): Promise<void> {
  const root = await directory(id)

  await mkdir(root, { recursive: true })

  await writeFile(
    join(root, '.moru-runtime.json'),
    JSON.stringify({
      path,
      selectedAt: new Date().toISOString()
    }),
    { mode: 0o600 }
  )
}

export function registerProfileSettings(
  trusted: (event: IpcMainInvokeEvent) => void,
  busy: () => boolean
): void {
  ipcMain.handle(
    'profile-settings:info',
    async (
      event,
      id: unknown
    ): Promise<ProfileSettingsInfo> => {
      trusted(event)

      const root = await directory(id)
      const settings =
        await readProfileSettings(id as string)
      const size = await sizeOf(root)

      let java: ProfileSettingsInfo['java'] = null

      try {
        const value = JSON.parse(
          await readFile(
            join(root, '.moru-runtime.json'),
            'utf8'
          )
        ) as Record<string, unknown>

        if (
          typeof value.path === 'string' &&
          typeof value.selectedAt === 'string'
        ) {
          java = {
            path: value.path,
            selectedAt: value.selectedAt
          }
        }
      } catch {
        // 아직 Java 선택 기록이 없습니다.
      }

      const range = memory()

      return {
        settings,
        minMemoryMb: range.min,
        maxMemoryMb: range.max,
        totalMemoryMb: range.total,
        bytes: size.bytes,
        sizeComplete: size.complete,
        java
      }
    }
  )

  ipcMain.handle(
    'profile-settings:save',
    async (
      event,
      id: unknown,
      input: unknown
    ): Promise<ProfileSettingsResult> => {
      trusted(event)

      if (busy() || profileMutationActive()) {
        return { ok: false, code: 'BUSY' }
      }

      if (!validate(input)) return invalid()

      try {
        parseJvmArgs(input.jvmArgs)
      } catch {
        return { ok: false, code: 'JVM_ARGS' }
      }

      if (
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
      ) {
        return invalid()
      }

      mutations.add(id)

      try {
        const root = await directory(id)

        if (await running(root)) {
          return { ok: false, code: 'BUSY' }
        }

        await mkdir(root, { recursive: true })

        const temporary = join(
          root,
          `.moru-settings-${randomUUID()}.tmp`
        )

        await writeFile(
          temporary,
          JSON.stringify({
            memoryMb: input.memoryMb,
            jvmArgs: input.jvmArgs.trim(),
            description: input.description.trim()
          }),
          { mode: 0o600 }
        )

        await rename(
          temporary,
          join(root, '.moru-settings.json')
        )

        return { ok: true }
      } catch {
        return { ok: false, code: 'FAILED' }
      } finally {
        mutations.delete(id)
      }
    }
  )

  ipcMain.handle(
    'profile-settings:delete',
    async (
      event,
      id: unknown,
      name: unknown,
      confirmation: unknown
    ): Promise<ProfileSettingsResult> => {
      trusted(event)

      if (id === 'moru-default') {
        return { ok: false, code: 'PROTECTED' }
      }

      if (busy() || profileMutationActive()) {
        return { ok: false, code: 'BUSY' }
      }

      if (
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
        typeof name !== 'string' ||
        !name.trim() ||
        name.length > 100 ||
        confirmation !== name
      ) {
        return invalid()
      }

      mutations.add(id)

      try {
        const root = await directory(id)

        if (await running(root)) {
          return { ok: false, code: 'BUSY' }
        }

        try {
          await lstat(root)
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code ===
            'ENOENT'
          ) {
            return { ok: true }
          }

          throw error
        }

        await shell.trashItem(root)

        return { ok: true }
      } catch {
        return { ok: false, code: 'FAILED' }
      } finally {
        mutations.delete(id)
      }
    }
  )
}