export type AuthStage =
  | 'idle'
  | 'microsoft'
  | 'xbox'
  | 'xsts'
  | 'minecraft'
  | 'ownership'
  | 'profile'
  | 'storage'

export type AuthCode =
  | 'CLIENT_ID_MISSING'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FAILED'
  | 'CACHE_INVALID'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'OAUTH_CONFIG'
  | 'OAUTH_DENIED'
  | 'REAUTH_REQUIRED'
  | 'NETWORK'
  | 'XBOX_PROFILE_REQUIRED'
  | 'XBOX_CHILD_ACCOUNT'
  | 'XBOX_RESTRICTED'
  | 'APP_ACCESS_REQUIRED'
  | 'SERVICE_FORBIDDEN'
  | 'NOT_OWNED'
  | 'PROFILE_MISSING'
  | 'SERVICE_ERROR'

export type AuthState = {
  status: 'signedOut' | 'signingIn' | 'signedIn' | 'error'
  stage: AuthStage
  profile: {
    id: string
    name: string
    skin: string | null
  } | null
  error: {
    code: AuthCode
    stage: AuthStage
    httpStatus?: number
    xboxCode?: number
  } | null
}