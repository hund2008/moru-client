import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { localizedModDescription, translate, type Language, type TranslationKey } from './locales'

type Page = 'home' | 'discover' | 'installed' | 'settings'
type ListMode = 'recommended' | 'search'

type MoruMod = {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

const styles = `
  * { box-sizing: border-box; }
  html, body, #root {
    width: 100%; height: 100%; margin: 0 !important;
    padding: 0 !important; max-width: none !important;
  }
  body {
    display: block !important; overflow: hidden;
    background: #0c1113; color: #edf5f1;
    font-family: var(--moru-selected-font, 'Segoe UI', 'Malgun Gothic', sans-serif);
  }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  .moru {
    display: flex; width: 100%; height: 100vh;
    text-align: left; background: #0c1113;
  }
  .sidebar {
    display: flex; flex-direction: column; flex-shrink: 0;
    width: 225px; padding: 28px 15px;
    border-right: 1px solid #27312e; background: #101719;
  }
  .brand {
    display: flex; align-items: center; gap: 12px;
    padding: 0 13px 42px; font-size: 23px;
    font-weight: 800; letter-spacing: 2px;
  }
  .brand-icon {
    display: grid; place-items: center;
    width: 39px; height: 39px; border-radius: 11px;
    background: #43d9a0; color: #0d1b17; font-size: 25px;
  }
  .nav-label {
    margin: 0 13px 15px; color: #718b81;
    font-size: 11px; letter-spacing: 2px;
  }
  .nav-button {
    width: 100%; padding: 14px; margin-bottom: 5px;
    border: none; border-radius: 10px; background: transparent;
    color: #91a49d; text-align: left; font-size: 14px;
  }
  .nav-button:hover { background: #1c2927; }
  .nav-button.active {
    background: #1b3c32; color: #55e7ae; font-weight: 700;
  }
  .nav-symbol { display: inline-block; width: 30px; font-size: 18px; }
  .sidebar-bottom {
    margin-top: auto; padding: 13px; color: #7f998f;
    font-size: 12px; border-top: 1px solid #27312e;
  }
  .content { flex: 1; min-width: 0; overflow: auto; padding: 32px 42px; }
  .topbar {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 35px;
  }
  .topbar h2 { margin: 0; font-size: 20px; }
  .profile {
    display: flex; align-items: center; gap: 10px;
    color: #b2c4bc; font-size: 13px;
  }
  .avatar {
    display: grid; place-items: center; width: 33px; height: 33px;
    border-radius: 50%; background: #25483b;
    color: #6ce7b3; font-weight: 700;
  }
  .hero {
    position: relative; overflow: hidden; min-height: 290px;
    padding: 39px; border: 1px solid #345749; border-radius: 20px;
    background: radial-gradient(circle at 90% 25%, #245c46, transparent 45%),
      linear-gradient(125deg, #152d26, #111b1b);
  }
  .hero::after {
    content: '◆'; position: absolute; right: 8%; top: 0;
    font-size: 260px; line-height: 1; color: #46df9b;
    opacity: .10; transform: rotate(-15deg); pointer-events: none;
  }
  .eyebrow {
    color: #63daa5; font-size: 11px;
    font-weight: 700; letter-spacing: 2.5px;
  }
  .hero h1 { margin: 19px 0 9px; font-size: clamp(30px, 4vw, 43px); }
  .muted { color: #98aea4; font-size: 14px; line-height: 1.7; }
  .play {
    margin-top: 27px; padding: 13px 38px;
    border: none; border-radius: 10px;
    background: #40d99b; color: #0b221a; font-weight: 800;
  }
  .play:disabled { cursor: default; opacity: .7; }
  .section-title { margin: 35px 0 17px; font-size: 18px; }
  .cards {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px;
  }
  .card, .panel {
    border: 1px solid #25352e; border-radius: 15px; background: #161f20;
  }
  .card { padding: 21px; }
  .panel { padding: 28px; }
  .card-label { color: #8fa49a; font-size: 12px; }
  .card-value { margin-top: 13px; font-size: 20px; font-weight: 750; }
  .search-row { display: flex; gap: 10px; margin: 22px 0; }
  .search {
    flex: 1; min-width: 0; padding: 14px 18px;
    border: 1px solid #355144; outline: none; border-radius: 10px;
    color: #edf5f1; background: #0e1718;
  }
  .search:focus { border-color: #43d9a0; }
  .action-button {
    padding: 12px 22px; border: none; border-radius: 10px;
    background: #40d99b; color: #0b221a; font-weight: 750;
  }
  .action-button:disabled { opacity: .5; cursor: default; }
  .list-heading {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin: 10px 0 16px;
  }
  .list-heading h3 { margin: 0; font-size: 17px; }
  .list-heading span { color: #8fa49a; font-size: 12px; }
  .mod-list { display: flex; flex-direction: column; gap: 11px; }
  .mod-card {
    display: flex; align-items: center; width: 100%; gap: 16px;
    padding: 16px; border: 1px solid #2b3b34;
    border-radius: 12px; background: #192522;
    color: #edf5f1; text-align: left;
  }
  .mod-card:hover, .mod-card.selected { border-color: #4ad5a0; }
  .mod-icon {
    position: relative; display: grid; place-items: center;
    width: 48px; height: 48px; flex-shrink: 0;
    border-radius: 11px; overflow: hidden;
    background: #294c3d; color: #60e6ad;
    font-size: 22px; font-weight: 800;
  }
  .mod-icon img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  }
  .mod-info { flex: 1; min-width: 0; }
  .mod-name { font-size: 15px; font-weight: 700; }
  .mod-desc { margin-top: 5px; color: #9bb0a6; font-size: 12px; line-height: 1.5; }
  .downloads { color: #61dba9; font-size: 12px; white-space: nowrap; }
  .empty { padding: 55px 20px; text-align: center; color: #9ab2a6; }
  .secondary-button {
    padding: 11px 18px; border: 1px solid #45715b;
    border-radius: 9px; background: #203b30;
    color: #83e8b9; font-weight: 650;
  }
  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 20px; padding: 20px 0; border-bottom: 1px solid #293c32;
  }
  .ram-slider { width: 190px; accent-color: #46df9f; }
  .language-select {
    min-width: 145px; padding: 11px 14px;
    border: 1px solid #45715b; border-radius: 9px;
    background: #203b30; color: #edf5f1;
    cursor: pointer;
  }
  .language-select:focus { outline: 2px solid #43d9a0; outline-offset: 2px; }
  .font-control { min-width: 205px; max-width: 255px; text-align: right; }
  .font-name { font-size: 12px; color: #b4d1c3; margin-bottom: 10px; overflow-wrap: anywhere; }
  .font-actions { display: flex; gap: 7px; justify-content: flex-end; flex-wrap: wrap; }
  .font-button {
    padding: 9px 13px; border: 1px solid #45715b; border-radius: 9px;
    background: #203b30; color: #83e8b9; font-size: 12px;
  }
  .font-button:disabled { opacity: 0.45; cursor: default; }
  .font-error { color: #ffaaaa; font-size: 12px; margin-top: 8px; }


  .error {
    padding: 15px; border-radius: 10px; background: #422423;
    color: #ffaaaa; font-size: 13px;
  }
  @media (max-width: 800px) {
    .sidebar { width: 175px; }
    .content { padding: 24px; }
    .cards { grid-template-columns: 1fr; }
    .hero { padding: 27px; }
    .mod-card { flex-wrap: wrap; }
  }
`

// 사용자 글꼴은 GitHub 프로젝트가 아닌 Electron의 로컬 IndexedDB에 저장합니다.
// 글꼴 파일은 서버로 전송하지 않고, 선택한 PC에서만 사용합니다.
const FONT_DATABASE = 'moru-font-db'
const FONT_STORE = 'settings'
const FONT_KEY = 'selected-font'
const MAX_FONT_BYTES = 25 * 1024 * 1024

type SavedFont = { name: string; file: Blob }

function openFontDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FONT_DATABASE, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(FONT_STORE)) {
        database.createObjectStore(FONT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB is blocked'))
  })
}

async function readSavedFont(): Promise<SavedFont | null> {
  const database = await openFontDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readonly')
      const request = transaction.objectStore(FONT_STORE).get(FONT_KEY)
      request.onsuccess = () => resolve((request.result as SavedFont | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('Font read failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Font read aborted'))
    })
  } finally {
    database.close()
  }
}

async function saveSelectedFont(value: SavedFont): Promise<void> {
  const database = await openFontDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readwrite')
      transaction.objectStore(FONT_STORE).put(value, FONT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Font save failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Font save aborted'))
    })
  } finally {
    database.close()
  }
}

async function clearSelectedFont(): Promise<void> {
  const database = await openFontDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readwrite')
      transaction.objectStore(FONT_STORE).delete(FONT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Font remove failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Font remove aborted'))
    })
  } finally {
    database.close()
  }
}

function isTrueTypeFont(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  const signature = new Uint8Array(buffer, 0, 4)
  // 일반 TTF: 00 01 00 00. 예전 TrueType 서명: 'true'.
  return (
    (signature[0] === 0 && signature[1] === 1 && signature[2] === 0 && signature[3] === 0) ||
    (signature[0] === 0x74 && signature[1] === 0x72 && signature[2] === 0x75 && signature[3] === 0x65)
  )
}

async function prepareFont(file: Blob): Promise<FontFace> {
  const buffer = await file.arrayBuffer()
  if (!isTrueTypeFont(buffer)) throw new Error('font-format')
  const face = new FontFace('MORU User Font', buffer)
  return face.load()
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return window.localStorage.getItem('moru-language') === 'en' ? 'en' : 'ko'
    } catch {
      return 'ko'
    }
  })
  const t = (key: TranslationKey) => translate(language, key)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      window.localStorage.setItem('moru-language', language)
    } catch {
      // 로컬 저장이 제한된 환경에서는 이번 실행에만 언어 적용
    }
  }, [language])

  const [page, setPage] = useState<Page>('home')
  const [search, setSearch] = useState('')
  const [mods, setMods] = useState<MoruMod[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedMod, setSelectedMod] = useState('')
  const [listMode, setListMode] = useState<ListMode>('recommended')
  const [ram, setRam] = useState(6)
  const [fontName, setFontName] = useState<string | null>(null)
  const [fontBusy, setFontBusy] = useState(false)
  const [fontError, setFontError] = useState<TranslationKey | null>(null)
  const fontInput = useRef<HTMLInputElement>(null)
  const currentFont = useRef<FontFace | null>(null)
  const requestId = useRef(0)

  function activateFont(face: FontFace): void {
    if (currentFont.current) document.fonts.delete(currentFont.current)
    document.fonts.add(face)
    currentFont.current = face
    document.documentElement.style.setProperty(
      '--moru-selected-font',
      '"MORU User Font", "Segoe UI", "Malgun Gothic", sans-serif'
    )
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const saved = await readSavedFont()
        if (!saved || cancelled) return
        const face = await prepareFont(saved.file)
        if (cancelled) return
        activateFont(face)
        setFontName(saved.name)
      } catch {
        if (!cancelled) setFontError('fontLoadError')
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function onFontFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setFontError(null)
    if (!file.name.toLowerCase().endsWith('.ttf')) {
      setFontError('fontInvalidFile')
      return
    }
    if (file.size === 0 || file.size > MAX_FONT_BYTES) {
      setFontError('fontTooLarge')
      return
    }

    setFontBusy(true)
    try {
      const face = await prepareFont(file)
      await saveSelectedFont({ name: file.name, file })
      activateFont(face)
      setFontName(file.name)
    } catch (error) {
      setFontError(error instanceof Error && error.message === 'font-format'
        ? 'fontInvalidFile' : 'fontSaveError')
    } finally {
      setFontBusy(false)
    }
  }

  async function resetFont() {
    setFontBusy(true)
    setFontError(null)
    try {
      await clearSelectedFont()
      if (currentFont.current) document.fonts.delete(currentFont.current)
      currentFont.current = null
      document.documentElement.style.removeProperty('--moru-selected-font')
      setFontName(null)
    } catch {
      setFontError('fontResetError')
    } finally {
      setFontBusy(false)
    }
  }


  const navigation: { id: Page; label: string; icon: string }[] = [
    { id: 'home', label: t('navHome'), icon: '⌂' },
    { id: 'discover', label: t('navDiscover'), icon: '▦' },
    { id: 'installed', label: t('navInstalled'), icon: '▣' },
    { id: 'settings', label: t('navSettings'), icon: '⚙' }
  ]

  const titles: Record<Page, string> = {
    home: t('navHome'),
    discover: t('navDiscover'),
    installed: t('navInstalled'),
    settings: t('navSettings')
  }

  const loadMods = useCallback(async (keyword: string) => {
    const currentRequest = ++requestId.current
    const normalized = keyword.trim()

    setListMode(normalized ? 'search' : 'recommended')
    setLoading(true)
    setLoaded(false)
    setSearchError('')
    setMods([])
    setSelectedMod('')

    try {
      // 검색어가 비어 있으면 main/index.ts에서 다운로드순으로 검색함
      const results = (await window.api.searchMods(normalized)) as MoruMod[]
      if (currentRequest !== requestId.current) return
      setMods(results)
    } catch (error) {
      if (currentRequest !== requestId.current) return
      setSearchError('failed')
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
        setLoaded(true)
      }
    }
  }, [])

  // 다운로드 화면에 들어갈 때마다 인기 모드를 자동으로 조회함
  useEffect(() => {
    if (page !== 'discover') return
    setSearch('')
    void loadMods('')
  }, [page, loadMods])

  return (
    <div className="moru">
      <style>{styles}</style>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">◆</div>
          MORU
        </div>
        <div className="nav-label">{t('menu')}</div>
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-button ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-symbol">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div className="sidebar-bottom">MORU CLIENT</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <h2>{titles[page]}</h2>
          <div className="profile">
            <span>{t('profile')}</span>
            <div className="avatar">M</div>
          </div>
        </header>

        {page === 'home' && (
          <>
            <section className="hero">
              <div className="eyebrow">MINECRAFT JAVA EDITION</div>
              <h1>Minecraft 26.1.2</h1>
              <div className="muted">{t('heroSubtitle')}</div>
              <button className="play" type="button" disabled>▶ {t('play')}</button>
            </section>
            <h3 className="section-title">{t('environment')}</h3>
            <div className="cards">
              <div className="card">
                <div className="card-label">{t('minecraft')}</div>
                <div className="card-value">26.1.2</div>
              </div>
              <div className="card">
                <div className="card-label">{t('modLoader')}</div>
                <div className="card-value">Fabric</div>
              </div>
              <div className="card">
                <div className="card-label">{t('modCount')}</div>
                <div className="card-value">{t('zeroMods')}</div>
              </div>
            </div>
          </>
        )}

        {page === 'discover' && (
          <section className="panel">
            <div className="eyebrow">MODRINTH</div>
            <h2>{t('discoverTitle')}</h2>
            <p className="muted">Minecraft 26.1.2 · Fabric</p>

            <form
              className="search-row"
              onSubmit={(event) => {
                event.preventDefault()
                void loadMods(search)
              }}
            >
              <input
                className="search"
                type="search"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button className="action-button" type="submit" disabled={loading}>
                {loading ? t('searching') : t('search')}
              </button>
            </form>

            <div className="list-heading">
              <h3>{listMode === 'recommended' ? t('recommended') : t('searchResults')}</h3>
              <span>
                {listMode === 'recommended' ? t('sortedByDownloads') : `${mods.length} ${t('shownCount')}`}
              </span>
            </div>

            {searchError && <div className="error">{t('failedSearch')}</div>}
            {loading && <div className="empty">{t('loadingMods')}</div>}
            {!loading && !searchError && loaded && mods.length === 0 && (
              <div className="empty">{t('emptySearch')}</div>
            )}

            {!loading && (
              <div className="mod-list">
                {mods.map((mod) => {
                  const safeIcon = mod.icon?.startsWith('https://cdn.modrinth.com/')
                    ? mod.icon
                    : null

                  return (
                    <button
                      type="button"
                      key={mod.id}
                      className={`mod-card ${selectedMod === mod.id ? 'selected' : ''}`}
                      onClick={() => setSelectedMod(mod.id)}
                    >
                      <div className="mod-icon">
                        <span>{mod.name.charAt(0).toUpperCase()}</span>
                        {safeIcon && (
                          <img
                            src={safeIcon}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(event) => { event.currentTarget.style.display = 'none' }}
                          />
                        )}
                      </div>
                      <div className="mod-info">
                        <div className="mod-name">{mod.name}</div>
                        <div className="mod-desc">{localizedModDescription(mod, language)}</div>
                      </div>
                      <div className="downloads">↓ {mod.downloads.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} {t('downloadsUnit')}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {page === 'installed' && (
          <section className="panel">
            <h2>{t('navInstalled')}</h2>
            <div className="empty">
              <p>{t('emptyInstalled')}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPage('discover')}
              >
                {t('navDiscover')}
              </button>
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="panel">
            <h2>{t('settingsTitle')}</h2>

            {/* 1. 언어 */}
            <div className="setting-row">
              <div>
                <strong>{t('language')}</strong>
                <p className="muted">{t('languageHelp')}</p>
              </div>
              <select
                className="language-select"
                aria-label={t('language')}
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                <option value="ko">{t('languageKorean')}</option>
                <option value="en">{t('languageEnglish')}</option>
              </select>
            </div>

            {/* 2. 글꼴 (TTF 파일 선택) */}
            <div className="setting-row">
              <div>
                <strong>{t('font')}</strong>
                <p className="muted">{t('fontHelp')}</p>
              </div>
              <div className="font-control">
                <div className="font-name">{fontName ?? t('fontDefault')}</div>
                <div className="font-actions">
                  <input
                    ref={fontInput}
                    type="file"
                    accept=".ttf,font/ttf"
                    aria-label={t('fontChooseFile')}
                    style={{ display: 'none' }}
                    onChange={(event) => { void onFontFileChange(event) }}
                  />
                  <button
                    type="button"
                    className="font-button"
                    disabled={fontBusy}
                    onClick={() => fontInput.current?.click()}
                  >
                    {t('fontChooseFile')}
                  </button>
                  {fontName && (
                    <button
                      type="button"
                      className="font-button"
                      disabled={fontBusy}
                      onClick={() => { void resetFont() }}
                    >
                      {t('fontReset')}
                    </button>
                  )}
                </div>
                {fontError && <div className="font-error">{t(fontError)}</div>}
              </div>
            </div>

            {/* 3. 게임 버전 */}
            <div className="setting-row">
              <div>
                <strong>{t('gameVersion')}</strong>
                <p className="muted">Minecraft Java Edition</p>
              </div>
              <strong>26.1.2</strong>
            </div>

            {/* 4. 메모리 할당 */}
            <div className="setting-row">
              <div>
                <strong>{t('memoryAllocation')}</strong>
                <p className="muted">{t('memoryHelp')}</p>
              </div>
              <div>
                <strong>{ram} GB</strong>
                <div>
                  <input
                    className="ram-slider"
                    type="range"
                    min="2"
                    max="16"
                    step="1"
                    value={ram}
                    onChange={(event) => setRam(Number(event.target.value))}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
