
import { ElectronAPI } from '@electron-toolkit/preload'

export interface MoruMod {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

declare global {
  interface Window {
    electron: ElectronAPI

    api: {
      searchMods: (keyword: string) => Promise<MoruMod[]>
    }
  }
}
