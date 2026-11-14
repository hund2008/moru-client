import { registerClientSettings } from './client-settings'
import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent
} from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DesktopResult, DesktopState } from '../shared/desktop'

type Size = {
  width: number
  height: number
}

const FILE = 'window-preferences.json'

function validSize(value: unknown): value is Size {
  if (!value || typeof value !== 'object') return false

  const size = value as Partial<Size>

  return (
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width! > 0 &&
    size.height! > 0 &&
    size.width! <= 16384 &&
    size.height! <= 16384
  )
}

function defaults(area: { width: number; height: number }): Size {
  const units = Math.max(
    1,
    Math.floor(
      Math.min(80, area.width / 16, area.height / 9)
    )
  )

  return {
    width: units * 16,
    height: units * 9
  }
}

function limits(area: { width: number; height: number }) {
  const base = defaults(area)

  return {
    minWidth: Math.min(800, base.width),
    minHeight: Math.min(600, base.height),
    maxWidth: Math.floor(area.width),
    maxHeight: Math.floor(area.height)
  }
}

function saved(): Size | null {
  try {
    const value: unknown = JSON.parse(
      readFileSync(
        join(app.getPath('userData'), FILE),
        'utf8'
      )
    )

    return validSize(value) ? value : null
  } catch {
    return null
  }
}

let saving = Promise.resolve()

function persist(size: Size): Promise<void> {
  const write = async () => {
    const root = app.getPath('userData')
    await mkdir(root, { recursive: true })

    const temp = join(
      root,
      `window-${randomUUID()}.tmp`
    )

    await writeFile(
      temp,
      JSON.stringify(size),
      { mode: 0o600 }
    )

    await rename(temp, join(root, FILE))
  }

  const next = saving.catch(() => {}).then(write)
  saving = next

  return next
}

export function desktopWindowOptions():
  BrowserWindowConstructorOptions {
  const area = screen.getPrimaryDisplay().workArea
  const range = limits(area)
  const size = saved() ?? defaults(area)

  const scale = Math.min(
    range.maxWidth / size.width,
    range.maxHeight / size.height,
    Math.max(
      1,
      range.minWidth / size.width,
      range.minHeight / size.height
    )
  )

  const width = Math.min(
    range.maxWidth,
    Math.max(
      range.minWidth,
      Math.floor(size.width * scale)
    )
  )

  const height = Math.min(
    range.maxHeight,
    Math.max(
      range.minHeight,
      Math.floor(size.height * scale)
    )
  )

  return {
    width,
    height,
    minWidth: range.minWidth,
    minHeight: range.minHeight,
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    backgroundColor: '#0c1113',
    ...(process.platform === 'win32'
      ? { frame: false }
      : {})
  }
}

function state(window: BrowserWindow): DesktopState {
  const bounds = window.getBounds()
  const area =
    screen.getDisplayMatching(bounds).workArea

  return {
    platform: process.platform,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    ...limits(area)
  }
}

export function observeDesktopWindow(
  window: BrowserWindow
): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const send = () => {
    if (
      !window.isDestroyed() &&
      !window.webContents.isDestroyed()
    ) {
      window.webContents.send(
        'desktop:changed',
        state(window)
      )
    }
  }

  const remember = () => {
    send()
    clearTimeout(timer)

    if (
      window.isDestroyed() ||
      window.isMaximized() ||
      window.isFullScreen() ||
      window.isMinimized()
    ) {
      return
    }

    timer = setTimeout(() => {
      if (
        window.isDestroyed() ||
        window.isMaximized() ||
        window.isFullScreen() ||
        window.isMinimized()
      ) {
        return
      }

      const bounds = window.getBounds()

      void persist({
        width: bounds.width,
        height: bounds.height
      }).catch(() => {})
    }, 350)
  }

  window.on('resize', remember)
  window.on('move', send)
  window.on('maximize', send)
  window.on('unmaximize', send)
  window.on('enter-full-screen', send)
  window.on('leave-full-screen', send)
  window.once('closed', () => clearTimeout(timer))
}

async function restore(
  window: BrowserWindow
): Promise<void> {
  if (window.isFullScreen()) {
    await new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer)
        window.removeListener(
          'leave-full-screen',
          done
        )
        resolve()
      }

      const timer = setTimeout(done, 1200)
      window.once('leave-full-screen', done)
      window.setFullScreen(false)
    })
  }

  if (window.isMaximized()) {
    await new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer)
        window.removeListener('unmaximize', done)
        resolve()
      }

      const timer = setTimeout(done, 1200)
      window.once('unmaximize', done)
      window.unmaximize()
    })
  }
}

export function registerDesktopWindow(
  trusted: (event: IpcMainInvokeEvent) => void
): void {
  registerClientSettings(trusted)

  const owner = (event: IpcMainInvokeEvent) => {
    trusted(event)

    const window =
      BrowserWindow.fromWebContents(event.sender)

    if (!window || window.isDestroyed()) {
      throw new Error('Invalid window')
    }

    return window
  }

  async function apply(
    window: BrowserWindow,
    width: unknown,
    height: unknown
  ): Promise<DesktopResult> {
    if (!validSize({ width, height })) {
      return { ok: false, code: 'INVALID_SIZE' }
    }

    const size = { width, height } as Size
    const current = state(window)

    if (
      size.width < current.minWidth ||
      size.height < current.minHeight ||
      size.width > current.maxWidth ||
      size.height > current.maxHeight
    ) {
      return { ok: false, code: 'INVALID_SIZE' }
    }

    try {
      await persist(size)
    } catch {
      return { ok: false, code: 'SAVE_FAILED' }
    }

    await restore(window)

    if (window.isDestroyed()) {
      return { ok: false, code: 'SAVE_FAILED' }
    }

    window.setMinimumSize(
      current.minWidth,
      current.minHeight
    )

    const area =
      screen.getDisplayMatching(
        window.getBounds()
      ).workArea

    window.setBounds({
      x:
        area.x +
        Math.floor((area.width - size.width) / 2),
      y:
        area.y +
        Math.floor((area.height - size.height) / 2),
      width: size.width,
      height: size.height
    })

    return { ok: true, state: state(window) }
  }

  ipcMain.handle(
    'desktop:state',
    event => state(owner(event))
  )

  ipcMain.handle(
    'desktop:apply-size',
    (event, width: unknown, height: unknown) =>
      apply(owner(event), width, height)
  )

  ipcMain.handle('desktop:reset-size', event => {
    const window = owner(event)

    const size = defaults(
      screen.getDisplayMatching(
        window.getBounds()
      ).workArea
    )

    return apply(window, size.width, size.height)
  })

  ipcMain.handle('desktop:minimize', event => {
    owner(event).minimize()
  })

  ipcMain.handle(
    'desktop:toggle-maximize',
    event => {
      const window = owner(event)

      if (window.isFullScreen()) {
        window.setFullScreen(false)
      } else if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  )

  ipcMain.handle('desktop:close', event => {
    const window = owner(event)

    setImmediate(() => {
      if (!window.isDestroyed()) window.close()
    })
  })
}