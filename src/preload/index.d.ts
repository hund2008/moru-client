import type {
  ElectronAPI
} from '@electron-toolkit/preload'
import type { AuthState } from '../shared/auth'

interface MoruMod {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

interface ReleaseCatalog {
  releases: string[]
  fabric: string[]
  fabricAvailable: boolean
}

interface MoruProfile {
  id: string
  version: string
  loader: string
}

interface InstalledMod {
  projectId: string
  versionId: string
  filename: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      auth: {
        getState: () => Promise<AuthState>
        login: () => Promise<AuthState>
        refresh: () => Promise<AuthState>
        logout: () => Promise<AuthState>
        onChanged: (
          callback: (state: AuthState) => void
        ) => () => void
      }

      getReleaseVersions: () =>
        Promise<ReleaseCatalog>

      searchMods: (
        keyword: string,
        version: string
      ) => Promise<MoruMod[]>

      installMod: (
        profile: MoruProfile,
        projectId: string
      ) => Promise<{ added: number }>

      listInstalled: (
        profile: MoruProfile
      ) => Promise<InstalledMod[]>
    }
  }
}