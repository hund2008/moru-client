import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { inspectJava, saveJava } from './minecraft-install'

const releasesPage =
  'https://github.com/hund2008/moru-client/releases'
const releaseApi =
  'https://api.github.com/repos/hund2008/moru-client/releases/latest'

type Release = {
  version: string
  name: string
  body: string
  newer: boolean | null
}

function versionParts(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  return match ? match.slice(1).map(Number) : null
}

function isNewer(latest: string, current: string): boolean | null {
  const a = versionParts(latest)
  const b = versionParts(current)

  if (!a || !b) return null

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }

  return false
}

async function javaPaths(): Promise<
  Array<{ major: number; path: string }>
> {
  try {
    const values: unknown = JSON.parse(
      await readFile(
        join(app.getPath('userData'), 'java-paths.json'),
        'utf8'
      )
    )

    if (
      !values ||
      typeof values !== 'object' ||
      Array.isArray(values)
    ) {
      return []
    }

    return Object.entries(values)
      .filter(
        ([key, value]) =>
          /^\d+$/.test(key) && typeof value === 'string'
      )
      .map(([major, path]) => ({
        major: Number(major),
        path: path as string
      }))
      .sort((a, b) => a.major - b.major)
  } catch {
    return []
  }
}

async function uninstaller(): Promise<string | null> {
  if (!app.isPackaged || process.platform !== 'win32') {
    return null
  }

  const path = join(
    dirname(process.execPath),
    'Uninstall moru-client.exe'
  )

  try {
    await access(path)
    return path
  } catch {
    return null
  }
}

async function gameRunning(): Promise<boolean> {
  const root = join(app.getPath('userData'), 'profiles')
  let entries

  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return false
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    try {
      const value = JSON.parse(
        await readFile(
          join(root, entry.name, '.moru-game-running.json'),
          'utf8'
        )
      ) as { pid?: number }

      if (Number.isInteger(value.pid) && value.pid! > 0) {
        try {
          process.kill(value.pid!, 0)
          return true
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== 'ESRCH'
          ) {
            return true
          }
        }
      }
    } catch {
      // 실행 중인 게임 기록이 없습니다.
    }
  }

  return false
}

export function registerClientSettings(
  trusted: (event: IpcMainInvokeEvent) => void
): void {
  let checking: Promise<Release | null> | null = null
  let cached: {
    at: number
    value: Release | null
  } | null = null
  let uninstalling = false

  const owner = (event: IpcMainInvokeEvent) => {
    trusted(event)

    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window || window.isDestroyed()) {
      throw new Error('Invalid window')
    }

    return window
  }

  ipcMain.handle('client:info', async event => {
    owner(event)

    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      dataPath: app.getPath('userData'),
      installPath: dirname(process.execPath),
      managedJavaPath: join(app.getPath('userData'), 'java'),
      java: await javaPaths(),
      canUninstall: !!(await uninstaller())
    }
  })

  ipcMain.handle('client:folder', async event => {
    owner(event)
    const error = await shell.openPath(app.getPath('userData'))
    return { ok: !error }
  })

  ipcMain.handle('client:releases', async event => {
    owner(event)
    await shell.openExternal(releasesPage)
  })

  ipcMain.handle('client:check-update', async event => {
    owner(event)

    if (cached && Date.now() - cached.at < 60000) {
      return cached.value
    }

    if (!checking) {
      checking = (async () => {
        const response = await fetch(releaseApi, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MORU-Client'
          },
          signal: AbortSignal.timeout(15000)
        })

        if (response.status === 404) {
          cached = { at: Date.now(), value: null }
          return null
        }

        if (!response.ok) {
          throw new Error(
            `Release request failed: ${response.status}`
          )
        }

        const value =
          (await response.json()) as Record<string, unknown>

        if (
          typeof value.tag_name !== 'string' ||
          value.draft === true ||
          value.prerelease === true
        ) {
          throw new Error('Invalid release')
        }

        const release: Release = {
          version: value.tag_name.slice(0, 100),
          name:
            typeof value.name === 'string'
              ? value.name.slice(0, 200)
              : value.tag_name,
          body:
            typeof value.body === 'string'
              ? value.body.slice(0, 50000)
              : '',
          newer: isNewer(value.tag_name, app.getVersion())
        }

        cached = { at: Date.now(), value: release }
        return release
      })().finally(() => {
        checking = null
      })
    }

    return checking
  })

  ipcMain.handle('client:java', async event => {
    const window = owner(event)

    const selected = await dialog.showOpenDialog(window, {
      title: 'MORU · Java 실행 파일 선택',
      properties: ['openFile'],
      ...(process.platform === 'win32'
        ? {
            filters: [
              { name: 'Java', extensions: ['exe'] }
            ]
          }
        : {})
    })

    if (selected.canceled || !selected.filePaths[0]) {
      return { ok: false, code: 'CANCELLED' }
    }

    const path = selected.filePaths[0]
    const major = await inspectJava(path)

    if (!major) {
      return { ok: false, code: 'JAVA_INVALID' }
    }

    await saveJava(app.getPath('userData'), major, path)

    return { ok: true, major, path }
  })

  ipcMain.handle('client:restart', async event => {
    const window = owner(event)

    if (!app.isPackaged) {
      return { ok: false, code: 'DEV_MODE' }
    }

    const answer = await dialog.showMessageBox(window, {
      type: 'question',
      title: 'MORU Client',
      message: 'MORU를 재시작할까요?',
      detail: '저장된 프로필과 설정은 유지됩니다.',
      buttons: ['취소', '재시작'],
      defaultId: 0,
      cancelId: 0
    })

    if (answer.response !== 1) {
      return { ok: false, code: 'CANCELLED' }
    }

    setTimeout(() => {
      app.relaunch()
      app.quit()
    }, 200)

    return { ok: true }
  })

  ipcMain.handle(
    'client:uninstall',
    async (event, confirmation: unknown) => {
      const window = owner(event)

      if (confirmation !== '삭제' || uninstalling) {
        return { ok: false, code: 'CANCELLED' }
      }

      const executable = await uninstaller()

      if (!executable) {
        return { ok: false, code: 'NOT_INSTALLED' }
      }

      if (await gameRunning()) {
        return { ok: false, code: 'GAME_BUSY' }
      }

      const answer = await dialog.showMessageBox(window, {
        type: 'warning',
        title: 'MORU 전체 삭제',
        message: 'MORU와 모든 플레이 데이터를 삭제할까요?',
        detail:
          '프로필, 모드, 리소스팩, 쉐이더, 모드팩, 월드, 계정 연결 및 설정이 삭제됩니다. 복구할 수 없습니다. 제거 프로그램에서 취소하면 삭제하지 않습니다.',
        buttons: ['취소', '전체 삭제'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })

      if (answer.response !== 1) {
        return { ok: false, code: 'CANCELLED' }
      }

      if (await gameRunning()) {
        return { ok: false, code: 'GAME_BUSY' }
      }

      uninstalling = true

      try {
        const child = spawn(
          executable,
          ['--deleteAppData'],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          }
        )

        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })

        child.unref()
        setTimeout(() => app.quit(), 200)

        return { ok: true }
      } catch {
        uninstalling = false
        return { ok: false, code: 'UNINSTALL_FAILED' }
      }
    }
  )
}