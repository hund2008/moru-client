export type DesktopState = {
  platform: string
  width: number
  height: number
  maximized: boolean
  fullscreen: boolean
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export type DesktopResult =
  | { ok: true; state: DesktopState }
  | { ok: false; code: 'INVALID_SIZE' | 'SAVE_FAILED' }