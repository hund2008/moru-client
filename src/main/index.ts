import {
  desktopWindowOptions,
  observeDesktopWindow,
  registerDesktopWindow
} from './desktop-window'
import { registerGameLauncher } from './game-launcher'
import { registerLoaderCatalog } from './loader-catalog'
import { registerServerIcons } from './server-icons'
import { registerCustomization } from './customization'
import { MicrosoftAuth } from './microsoft-auth'
import type { IpcMainInvokeEvent } from 'electron'
import { installMod, listInstalled } from './mod-installer'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

type ReleaseCatalog = {
  releases: string[]
  fabric: string[]
  fabricAvailable: boolean
}

type SearchItem = {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

type SearchResult = {
  items: SearchItem[]
  total: number
  offset: number
  limit: number
}

let catalogCache: {
  value: ReleaseCatalog
  expiresAt: number
} | null = null

let catalogPending: Promise<ReleaseCatalog> | null = null

async function getReleaseCatalog(): Promise<ReleaseCatalog> {
  if (catalogCache && Date.now() < catalogCache.expiresAt) {
    return catalogCache.value
  }

  if (catalogPending) return catalogPending

  catalogPending = (async () => {
    const response = await fetch(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
      {
        headers: {
          'User-Agent': 'MORU-Client/0.2.0',
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      }
    )

    if (!response.ok) {
      throw new Error(
        `Minecraft 버전 목록 요청 실패 (${response.status})`
      )
    }

    const manifest = await response.json() as {
      versions?: Array<{ id?: string; type?: string }>
    }

    if (!Array.isArray(manifest.versions)) {
      throw new Error('Minecraft 버전 목록 형식 오류')
    }

    const releases = Array.from(new Set(
      manifest.versions
        .filter(item =>
          item.type === 'release' &&
          typeof item.id === 'string'
        )
        .map(item => item.id as string)
    ))

    if (!releases.length) {
      throw new Error('릴리즈 버전을 찾을 수 없습니다.')
    }

    let fabric: string[] = []
    let fabricAvailable = false

    try {
      const fabricResponse = await fetch(
        'https://meta.fabricmc.net/v2/versions/game',
        {
          headers: {
            'User-Agent': 'MORU-Client/0.2.0',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        }
      )

      if (fabricResponse.ok) {
        const games = await fabricResponse.json() as Array<{
          version?: string
        }>

        if (Array.isArray(games)) {
          const supported = new Set(
            games.map(item => item.version)
          )

          fabric = releases.filter(version =>
            supported.has(version)
          )

          fabricAvailable = true
        }
      }
    } catch (error) {
      console.warn('Fabric 호환 버전 조회 실패:', error)
    }

    const value: ReleaseCatalog = {
      releases,
      fabric,
      fabricAvailable
    }

    catalogCache = {
      value,
      expiresAt: Date.now() + 30 * 60 * 1000
    }

    return value
  })()

  try {
    return await catalogPending
  } finally {
    catalogPending = null
  }
}

async function searchModrinth(
  keyword: string,
  version: string,
  kind: string = 'mod',
  loader: string = 'fabric',
  sort: string = 'downloads',
  page: number = 1
): Promise<SearchResult> {
  if (
    typeof keyword !== 'string' ||
    typeof version !== 'string' ||
    !['mod', 'resourcepack', 'shader', 'modpack'].includes(kind) ||
    !['fabric', 'vanilla', 'forge', 'neoforge'].includes(loader) ||
    !['downloads', 'follows', 'newest'].includes(sort) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000
  ) {
    throw new Error(
      '잘못된 콘텐츠 검색 조건입니다. / Invalid content search.'
    )
  }

  const catalog = await getReleaseCatalog()

  if (!catalog.releases.includes(version)) {
    throw new Error('정식 출시 버전만 선택할 수 있습니다.')
  }

  const limit = 20
  const offset = (page - 1) * limit
  const url = new URL('https://api.modrinth.com/v2/search')

  url.searchParams.set('query', keyword.trim().slice(0, 100))
  url.searchParams.set('index', sort)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))

  url.searchParams.set('facets', JSON.stringify([
    [`project_type:${kind}`],
    [`versions:${version}`],
    ...(
      kind === 'mod' ||
      (kind === 'modpack' && loader !== 'vanilla')
        ? [[`categories:${loader === 'vanilla' ? 'fabric' : loader}`]]
        : []
    )
  ]))

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MORU-Client/1.0.0',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`Modrinth 검색 실패 (${response.status})`)
  }

  const data = await response.json() as {
    hits?: Array<{
      project_id: string
      title: string
      description: string
      icon_url: string | null
      downloads: number
    }>
    total_hits?: number
  }

  if (
    !Array.isArray(data.hits) ||
    typeof data.total_hits !== 'number' ||
    !Number.isSafeInteger(data.total_hits) ||
    data.total_hits < 0
  ) {
    throw new Error('Modrinth 응답 형식 오류')
  }

  return {
    items: data.hits.map(item => ({
      id: item.project_id,
      name: item.title,
      description: item.description,
      icon: item.icon_url,
      downloads: item.downloads
    })),
    total: data.total_hits,
    offset,
    limit
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    ...desktopWindowOptions(),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  observeDesktopWindow(mainWindow)

  mainWindow.webContents.on(
    'will-navigate',
    event => event.preventDefault()
  )

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(details => {
    try {
      const url = new URL(details.url)

      if (url.protocol === 'https:') {
        void shell.openExternal(details.url)
      }
    } catch {
      console.error('잘못된 외부 URL')
    }

    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const instanceLock = app.requestSingleInstanceLock()

if (!instanceLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    const auth = new MicrosoftAuth(state => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('auth:changed', state)
        }
      }
    })

    const trusted = (event: IpcMainInvokeEvent) => {
      if (
        !BrowserWindow.fromWebContents(event.sender) ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error('Invalid sender')
      }
    }

    registerDesktopWindow(trusted)
    registerGameLauncher(auth, trusted)
    registerLoaderCatalog(trusted, getReleaseCatalog)
    registerServerIcons(trusted)
    registerCustomization(auth, trusted)

    ipcMain.handle('auth:state', event => {
      trusted(event)
      return auth.getState()
    })

    ipcMain.handle('auth:login', event => {
      trusted(event)
      return auth.login()
    })

    ipcMain.handle('auth:refresh', event => {
      trusted(event)
      return auth.refresh()
    })

    ipcMain.handle('auth:logout', event => {
      trusted(event)
      return auth.logout()
    })

    app.on('before-quit', () => auth.dispose())

    app.on('second-instance', () => {
      const window = BrowserWindow.getAllWindows()[0]

      if (window) {
        if (window.isMinimized()) window.restore()
        window.focus()
      }
    })

    electronApp.setAppUserModelId('com.moru.client')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.handle('mods:list', (_event, profile) =>
      listInstalled(profile)
    )

    ipcMain.handle(
      'mods:install',
      async (_event, profile, projectId) => {
        const catalog = await getReleaseCatalog()

        if (
          !profile ||
          !catalog.releases.includes(profile.version)
        ) {
          throw new Error(
            '정식 릴리즈 프로필을 선택해 주세요. / Select a release profile.'
          )
        }

        return installMod(profile, projectId)
      }
    )

    ipcMain.on('ping', () => console.log('pong'))

    ipcMain.handle(
      'minecraft:get-releases',
      () => getReleaseCatalog()
    )

    ipcMain.handle(
      'modrinth:search',
      async (
        event,
        keyword: string,
        version: string,
        kind?: string,
        loader?: string
      ) => {
        trusted(event)

        return (
          await searchModrinth(
            keyword,
            version,
            kind,
            loader
          )
        ).items
      }
    )

    ipcMain.handle(
      'modrinth:content-search',
      (
        event,
        keyword: string,
        version: string,
        kind?: string,
        loader?: string,
        sort?: string,
        page?: number
      ) => {
        trusted(event)

        return searchModrinth(
          keyword,
          version,
          kind,
          loader,
          sort,
          page
        )
      }
    )

    createWindow()
    void auth.initialize()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})