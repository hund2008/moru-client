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
import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent
} from 'electron'
import type { AuthState } from '../shared/auth'
import type {
  GameProfile,
  GameResult,
  GameState
} from '../shared/game'
import { electronAPI } from '@electron-toolkit/preload'

type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge'
type Kind = 'mod' | 'resourcepack' | 'shader' | 'modpack'
type Sort = 'downloads' | 'follows' | 'newest'

const api = {
  desktop: {
    getState: (): Promise<DesktopState> =>
      ipcRenderer.invoke('desktop:state'),

    applySize: (
      width: number,
      height: number
    ): Promise<DesktopResult> =>
      ipcRenderer.invoke('desktop:apply-size', width, height),

    resetSize: (): Promise<DesktopResult> =>
      ipcRenderer.invoke('desktop:reset-size'),

    minimize: (): Promise<void> =>
      ipcRenderer.invoke('desktop:minimize'),

    toggleMaximize: (): Promise<void> =>
      ipcRenderer.invoke('desktop:toggle-maximize'),

    close: (): Promise<void> =>
      ipcRenderer.invoke('desktop:close'),

    onChanged: (callback: (state: DesktopState) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        state: DesktopState
      ) => callback(state)

      ipcRenderer.on('desktop:changed', listener)

      return () => {
        ipcRenderer.removeListener('desktop:changed', listener)
      }
    }
  },

  game: {
    getState: (): Promise<GameState> =>
      ipcRenderer.invoke('game:state'),

    start: (
      profile: GameProfile,
      server?: string
    ): Promise<GameResult> =>
      ipcRenderer.invoke('game:start', profile, server),

    cancel: (): Promise<GameResult> =>
      ipcRenderer.invoke('game:cancel'),

    chooseJava: (): Promise<GameResult> =>
      ipcRenderer.invoke('game:choose-java'),

    openLog: (): Promise<GameResult> =>
      ipcRenderer.invoke('game:open-log'),

    onChanged: (callback: (state: GameState) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        state: GameState
      ) => callback(state)

      ipcRenderer.on('game:changed', listener)

      return () => {
        ipcRenderer.removeListener('game:changed', listener)
      }
    }
  },

  getLoaderVersions: (
    game: string,
    loader: Loader
  ): Promise<Array<{ version: string; label: string }>> =>
    ipcRenderer.invoke('profiles:loader-versions', game, loader),

  getServerIcon: (address: string): Promise<string | null> =>
    ipcRenderer.invoke('servers:icon', address),

  openProfileMods: (id: string): Promise<FolderResult> =>
    ipcRenderer.invoke('profiles:open-mods', id),

  skin: {
    choose: (): Promise<SkinPickResult> =>
      ipcRenderer.invoke('skin:choose'),

    apply: (
      id: string,
      variant: SkinVariant
    ): Promise<SkinApplyResult> =>
      ipcRenderer.invoke('skin:apply', id, variant)
  },

  auth: {
    getState: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:state'),

    login: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:login'),

    refresh: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:refresh'),

    logout: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:logout'),

    onChanged: (callback: (state: AuthState) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        state: AuthState
      ) => callback(state)

      ipcRenderer.on('auth:changed', listener)

      return () => {
        ipcRenderer.removeListener('auth:changed', listener)
      }
    }
  },

  installMod: (
    profile: { id: string; version: string; loader: string },
    projectId: string
  ) => ipcRenderer.invoke('mods:install', profile, projectId),

  listInstalled: (
    profile: { id: string; version: string; loader: string }
  ) => ipcRenderer.invoke('mods:list', profile),

  getReleaseVersions: () =>
    ipcRenderer.invoke('minecraft:get-releases'),

  searchMods: (
    keyword: string,
    version: string,
    kind: Kind = 'mod',
    loader: Loader = 'fabric'
  ) => ipcRenderer.invoke(
    'modrinth:search',
    keyword,
    version,
    kind,
    loader
  ),

  searchContent: (
    keyword: string,
    version: string,
    kind: Kind = 'mod',
    loader: Loader = 'fabric',
    sort: Sort = 'downloads',
    page: number = 1
  ) => ipcRenderer.invoke(
    'modrinth:content-search',
    keyword,
    version,
    kind,
    loader,
    sort,
    page
  )
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore - Electron integration is declared separately.
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}