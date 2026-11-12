
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// MORU 전용 API
const api = {
  // Modrinth 모드 검색
  searchMods: (keyword: string) =>
    ipcRenderer.invoke('modrinth:search', keyword)
}

// React와 Electron 연결
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI

  // @ts-ignore
  window.api = api
}
