export type ProfileSettings = {
  memoryMb: number
  jvmArgs: string
  description: string
}

export type ProfileSettingsInfo = {
  settings: ProfileSettings
  minMemoryMb: number
  maxMemoryMb: number
  totalMemoryMb: number
  bytes: number
  sizeComplete: boolean
  java: {
    path: string
    selectedAt: string
  } | null
}

export type ProfileSettingsResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'BUSY'
        | 'PROTECTED'
        | 'INVALID'
        | 'JVM_ARGS'
        | 'FAILED'
    }