
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// MORU 클라이언트 메인 창
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 800,
    minHeight: 600,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 외부 링크는 HTTPS만 허용
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

  // 개발 모드와 배포 모드 구분
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Modrinth 검색 결과 타입
interface ModrinthSearchResult {
  project_id: string
  title: string
  description: string
  icon_url: string | null
  downloads: number
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchResult[]
}

// Modrinth 검색 함수
async function searchModrinth(keyword: string) {
  if (typeof keyword !== 'string') {
    throw new Error('잘못된 검색어입니다.')
  }

  const query = keyword.trim().slice(0, 100)

  const url = new URL('https://api.modrinth.com/v2/search')

  url.searchParams.set('query', query)
  url.searchParams.set('limit', '20')
  url.searchParams.set('index', query ? 'relevance' : 'downloads')

  // Minecraft 26.1.2 + Fabric 모드만 검색
  url.searchParams.set(
    'facets',
    JSON.stringify([
      ['project_type:mod'],
      ['categories:fabric'],
      ['versions:26.1.2']
    ])
  )

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'MORU-Client/0.1.0',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(
      `Modrinth API 오류: ${response.status}`
    )
  }

  const data = (await response.json()) as ModrinthSearchResponse

  return data.hits.map((mod) => ({
    id: mod.project_id,
    name: mod.title,
    description: mod.description,
    icon: mod.icon_url,
    downloads: mod.downloads
  }))
}

// Electron 초기화
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.moru.client')

  // 개발 단축키 설정
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 테스트
  ipcMain.on('ping', () => {
    console.log('pong')
  })

  // Modrinth 검색 IPC 연결
  ipcMain.handle(
    'modrinth:search',
    async (_event, keyword: string) => {
      try {
        return await searchModrinth(keyword)
      } catch (error) {
        console.error('Modrinth 검색 오류:', error)
        throw error
      }
    }
  )

  // 클라이언트 실행
  createWindow()

  // macOS 창 복구
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 모든 창 종료 시 프로그램 종료
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
