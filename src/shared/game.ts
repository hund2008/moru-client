export type GameProfile = {
  id: string
  name: string
  version: string
  loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
  loaderVersion?: string | null
}

export type GamePhase =
  | 'none'
  | 'auth'
  | 'metadata'
  | 'java'
  | 'game'
  | 'loader'
  | 'assets'
  | 'launch'

export type GameStatus =
  | 'idle'
  | 'preparing'
  | 'installing'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'error'

export type GameCode =
  | 'AUTH_REQUIRED'
  | 'APP_ACCESS_REQUIRED'
  | 'INVALID_PROFILE'
  | 'INVALID_SERVER'
  | 'BUSY'
  | 'ALREADY_RUNNING'
  | 'JAVA_REQUIRED'
  | 'JAVA_INVALID'
  | 'DOWNLOAD_FAILED'
  | 'INSTALL_FAILED'
  | 'LAUNCH_FAILED'
  | 'GAME_EXITED'
  | 'CANCELLED'
  | 'OPEN_FAILED'

export type GameState = {
  status: GameStatus
  phase: GamePhase
  profileId: string | null
  profileName: string | null
  downloaded: number
  total: number
  code: GameCode | null
  javaMajor: number | null
  exitCode: number | null
}

export type GameResult =
  | { ok: true }
  | { ok: false; code: GameCode }