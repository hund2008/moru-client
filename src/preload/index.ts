import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent
} from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AuthState } from '../shared/auth'

const api = {
  auth: {
    getState: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:state'),

    login: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:login'),

    refresh: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:refresh'),

    logout: (): Promise<AuthState> =>
      ipcRenderer.invoke('auth:logout'),

    onChanged: (
      callback: (state: AuthState) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        state: AuthState
      ) => callback(state)

      ipcRenderer.on('auth:changed', listener)

      return () => {
        ipcRenderer.removeListener(
          'auth:changed',
          listener
        )
      }
    }
  },

  getReleaseVersions: () =>
    ipcRenderer.invoke('minecraft:get-releases'),

  searchMods: (
    keyword: string,
    version: string
  ) =>
    ipcRenderer.invoke(
      'modrinth:search',
      keyword,
      version
    ),

  installMod: (
    profile: {
      id: string
      version: string
      loader: string
    },
    projectId: string
  ) =>
    ipcRenderer.invoke(
      'mods:install',
      profile,
      projectId
    ),

  listInstalled: (
    profile: {
      id: string
      version: string
      loader: string
    }
  ) => ipcRenderer.invoke('mods:list', profile)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld(
      'electron',
      electronAPI
    )

    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore - Electron 통합 타입 선언
  window.electron = electronAPI
  // @ts-ignore - preload API 타입 선언
  window.api = api
}