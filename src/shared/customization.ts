import type { AuthCode } from './auth'

export type SkinVariant = 'classic' | 'slim'

export type SkinSelection = {
  id: string
  name: string
  dataUrl: string
  height: 32 | 64
}

export type SkinError =
  | 'AUTH_REQUIRED'
  | 'INVALID_PNG'
  | 'PNG_TOO_LARGE'
  | 'LEGACY_SLIM'
  | 'NO_SELECTION'
  | 'RATE_LIMIT'
  | 'APP_ACCESS_REQUIRED'
  | 'FORBIDDEN'
  | 'UPLOAD_FAILED'
  | 'NETWORK'
  | 'FILE_READ_FAILED'
  | 'BUSY'

export type SkinFailure = {
  ok: false
  code: SkinError
  authCode?: AuthCode
}

export type SkinPickResult =
  | {
      ok: true
      skin: SkinSelection | null
    }
  | SkinFailure

export type SkinApplyResult =
  | {
      ok: true
      refreshed: boolean
    }
  | SkinFailure

export type FolderResult =
  | {
      ok: true
    }
  | {
      ok: false
      code: 'INVALID_PROFILE' | 'OPEN_FAILED'
    }