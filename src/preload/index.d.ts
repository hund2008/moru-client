import type {
  DesktopResult,
  DesktopState
} from '../shared/desktop'
import type {
  FolderResult,
  SkinApplyResult,
  SkinPickResult,
  SkinVariant
} from '../shared/customization'
import type { AuthState } from '../shared/auth'
import type {
  GameProfile,
  GameResult,
  GameState
} from '../shared/game'
import type { ElectronAPI } from '@electron-toolkit/preload'

type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge'
type Kind = 'mod' | 'resourcepack' | 'shader' | 'modpack'
type Sort = 'downloads' | 'follows' | 'newest'

interface Item {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

interface SearchResult {
  items: Item[]
  total: number
  offset: number
  limit: number
}

interface Catalog {
  releases: string[]
  fabric: string[]
  fabricAvailable: boolean
}

declare global {
  interface Window {
    electron: ElectronAPI

    api: {
      desktop: {
        getState: () => Promise<DesktopState>
        applySize: (
          width: number,
          height: number
        ) => Promise<DesktopResult>
        resetSize: () => Promise<DesktopResult>
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<void>
        close: () => Promise<void>
        onChanged: (
          callback: (state: DesktopState) => void
        ) => () => void
      }

      game: {
        getState: () => Promise<GameState>
        start: (
          profile: GameProfile,
          server?: string
        ) => Promise<GameResult>
        cancel: () => Promise<GameResult>
        chooseJava: () => Promise<GameResult>
        openLog: () => Promise<GameResult>
        onChanged: (
          callback: (state: GameState) => void
        ) => () => void
      }

      getLoaderVersions: (
        game: string,
        loader: Loader
      ) => Promise<Array<{ version: string; label: string }>>

      getServerIcon: (address: string) => Promise<string | null>
      openProfileMods: (id: string) => Promise<FolderResult>

      skin: {
        choose: () => Promise<SkinPickResult>
        apply: (
          id: string,
          variant: SkinVariant
        ) => Promise<SkinApplyResult>
      }

      auth: {
        getState: () => Promise<AuthState>
        login: () => Promise<AuthState>
        refresh: () => Promise<AuthState>
        logout: () => Promise<AuthState>
        onChanged: (
          callback: (state: AuthState) => void
        ) => () => void
      }

      installMod: (
        profile: { id: string; version: string; loader: string },
        projectId: string
      ) => Promise<{ added: number }>

      listInstalled: (
        profile: { id: string; version: string; loader: string }
      ) => Promise<
        Array<{
          projectId: string
          versionId: string
          filename: string
        }>
      >

      getReleaseVersions: () => Promise<Catalog>

      searchMods: (
        keyword: string,
        version: string,
        kind?: Kind,
        loader?: Loader
      ) => Promise<Item[]>

      searchContent: (
        keyword: string,
        version: string,
        kind?: Kind,
        loader?: Loader,
        sort?: Sort,
        page?: number
      ) => Promise<SearchResult>
    }
  }
}