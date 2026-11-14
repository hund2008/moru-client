import { useEffect, useRef, useState } from 'react'
import {
  MoruSelect,
  useLauncherPreferences
} from './LauncherSupport'
import SettingsDialog from './components/SettingsDialog'
import ProfileSettingsDialog from './components/ProfileSettingsDialog'
import type {
  ProfileSettingsResult
} from '../../shared/profile-settings'
import ContentBrowser from './components/ContentBrowser'
import GameLaunchPanel, {
  useGameLauncher
} from './components/GameLaunchPanel'
import CreateProfileDialog, {
  type ProfileDraft
} from './components/CreateProfileDialog'
import './assets/moru-shell.css'

type Page = 'home' | 'profiles' | 'content' | 'mods'

type Profile = {
  id: string
  name: string
  version: string
  loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
  loaderVersion?: string | null
  icon?: string | null
}

type Catalog = {
  releases: string[]
  fabric: string[]
  fabricAvailable: boolean
}

type Mod = {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

type Installed = {
  projectId: string
  versionId: string
  filename: string
}

const DEFAULT: Profile = {
  id: 'moru-default',
  name: 'MORU',
  version: '26.1.2',
  loader: 'fabric'
}

const PROFILE_KEY = 'moru-game-profiles-v1'
const ACTIVE_KEY = 'moru-active-profile-v1'

function readProfiles(): Profile[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PROFILE_KEY) || '[]'
    )

    if (!Array.isArray(value)) return [DEFAULT]

    const seen = new Set<string>()

    const valid = value.filter((item): item is Profile => {
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.version !== 'string' ||
        !['vanilla', 'fabric', 'forge', 'neoforge'].includes(
          item.loader
        ) ||
        seen.has(item.id)
      ) {
        return false
      }

      seen.add(item.id)
      return true
    })

    return valid.length ? valid : [DEFAULT]
  } catch {
    return [DEFAULT]
  }
}

export default function App() {
  const preferences = useLauncherPreferences()
  const launcher = useGameLauncher()
  const { language, t } = preferences
  const ko = language === 'ko'

  const [page, setPage] = useState<Page>('home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileSettingsOpen, setProfileSettingsOpen] =
    useState(false)
  const [profiles, setProfiles] =
    useState<Profile[]>(readProfiles)

  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || DEFAULT.id
    } catch {
      return DEFAULT.id
    }
  })

  const active =
    profiles.find(item => item.id === activeId) ??
    profiles[0]

  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogFailed, setCatalogFailed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [profileQuery, setProfileQuery] = useState('')
  const [installed, setInstalled] = useState<Installed[]>([])
  const [installedFailed, setInstalledFailed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const installLock = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify(profiles)
      )
      localStorage.setItem(ACTIVE_KEY, active.id)
    } catch {
      // 현재 실행에서만 유지합니다.
    }
  }, [profiles, active.id])

  useEffect(() => {
    let cancelled = false

    void window.api.getReleaseVersions()
      .then(value => {
        if (!cancelled) setCatalog(value)
      })
      .catch(() => {
        if (!cancelled) setCatalogFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setInstalled([])
    setInstalledFailed(false)

    void window.api.listInstalled(active)
      .then(value => {
        if (!cancelled) setInstalled(value)
      })
      .catch(() => {
        if (!cancelled) setInstalledFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [active.id, page, refresh])

  function createProfile(draft: ProfileDraft): string | null {
    if (profiles.length >= 40) {
      return ko
        ? '프로필은 최대 40개까지 만들 수 있습니다.'
        : 'You can create up to 40 profiles.'
    }

    if (
      !draft.name.trim() ||
      !catalog?.releases.includes(draft.version) ||
      (
        draft.loader !== 'vanilla' &&
        !draft.loaderVersion
      )
    ) {
      return ko
        ? '프로필 설정을 확인해 주세요.'
        : 'Check profile settings.'
    }

    const item: Profile = {
      ...draft,
      id:
        `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    }

    const next = [...profiles, item]

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    } catch {
      return ko
        ? '프로필을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'
        : 'Could not save the profile. Check storage.'
    }

    setProfiles(next)
    setActiveId(item.id)

    return null
  }

  function openProfile(profile: Profile) {
    setActiveId(profile.id)
    setPage('mods')
    setMessage('')
  }

  async function removeProfile(
    confirmation: string
  ): Promise<string | null> {
    if (
      active.id === DEFAULT.id ||
      profiles.length <= 1 ||
      installLock.current ||
      launcher.busy ||
      confirmation !== active.name
    ) {
      return ko
        ? '현재 이 프로필을 삭제할 수 없습니다.'
        : 'This profile cannot be deleted right now.'
    }

    const previous = profiles
    const next = profiles.filter(
      item => item.id !== active.id
    )

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    } catch {
      return ko
        ? '프로필 목록을 저장할 수 없어 삭제를 중단했습니다.'
        : 'Could not save the profile list. Deletion cancelled.'
    }

    try {
      const result =
        await window.electron.ipcRenderer.invoke(
          'profile-settings:delete',
          active.id,
          active.name,
          confirmation
        ) as ProfileSettingsResult

      if (!result.ok) throw Error(result.code)
    } catch (error) {
      try {
        localStorage.setItem(
          PROFILE_KEY,
          JSON.stringify(previous)
        )
      } catch {
        // 메모리에 있는 프로필 목록은 유지합니다.
      }

      return error instanceof Error &&
        error.message === 'BUSY'
        ? ko
          ? '게임 실행과 다운로드가 끝난 뒤 삭제해 주세요.'
          : 'Finish the game and downloads first.'
        : ko
          ? '프로필 폴더를 휴지통으로 옮기지 못했습니다. 삭제하지 않았습니다.'
          : 'Could not move the profile folder to the recycle bin.'
    }

    setProfiles(next)
    setActiveId(next[0].id)
    setProfileSettingsOpen(false)
    setPage('profiles')
    setFailed(false)

    setMessage(
      ko
        ? '프로필을 삭제하고 폴더를 휴지통으로 이동했습니다.'
        : 'Profile removed. Its folder was moved to the recycle bin.'
    )

    return null
  }

  async function install(mod: Mod) {
    if (
      installLock.current ||
      active.loader !== 'fabric'
    ) {
      return
    }

    const destination = active

    installLock.current = true
    setInstalling(true)
    setFailed(false)

    setMessage(
      ko
        ? `${destination.name}에 다운로드 중…`
        : `Downloading to ${destination.name}…`
    )

    try {
      const result = await window.api.installMod(
        destination,
        mod.id
      )

      setRefresh(value => value + 1)

      setMessage(
        result.added
          ? ko
            ? `${destination.name}: ${mod.name} 설치 완료`
            : `${destination.name}: ${mod.name} installed`
          : ko
            ? `${destination.name}에 이미 설치되어 있습니다.`
            : `Already installed in ${destination.name}.`
      )
    } catch (error) {
      setFailed(true)
      setMessage(
        error instanceof Error
          ? error.message
          : String(error)
      )
    } finally {
      installLock.current = false
      setInstalling(false)
    }
  }

  async function openFolder() {
    setFailed(false)

    try {
      const result =
        await window.api.openProfileMods(active.id)

      setFailed(!result.ok)

      setMessage(
        result.ok
          ? ko
            ? `${active.name}의 모드 폴더를 열었습니다.`
            : `Opened ${active.name} mods folder.`
          : ko
            ? '폴더를 열지 못했습니다.'
            : 'Could not open the folder.'
      )
    } catch {
      setFailed(true)
      setMessage(
        ko
          ? '폴더를 열지 못했습니다.'
          : 'Could not open the folder.'
      )
    }
  }

  const names: Record<Page, string> = {
    home: ko ? '홈' : 'Home',
    profiles: ko ? '프로필' : 'Profiles',
    content: ko ? '콘텐츠' : 'Content',
    mods: active.name
  }

  const profileOptions = profiles.map(item => ({
    value: item.id,
    label:
      `${item.name} · ${item.version} · ${loaderName(item.loader)}`
  }))

  return (
    <div className="moru moru-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">◆</span>
          <div>
            MORU
            <small>MINECRAFT CLIENT</small>
          </div>
        </div>

        <nav
          aria-label={ko ? '메인 메뉴' : 'Main navigation'}
        >
          {(['home', 'profiles', 'content'] as const).map(
            (id, i) => (
              <button
                type="button"
                key={id}
                className={
                  `nav-button ${
                    page === id ||
                    (id === 'profiles' && page === 'mods')
                      ? 'active'
                      : ''
                  }`
                }
                onClick={() => {
                  setPage(id)
                  setMessage('')
                }}
              >
                <span className="nav-symbol">
                  {['⌂', '▤', '▦'][i]}
                </span>
                {names[id]}
              </button>
            )
          )}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-button"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="nav-symbol">⚙</span>
            {ko ? '설정' : 'Settings'}
          </button>
          <small>MORU Client</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <small className="eyebrow">
              YOUR WORLD, YOUR WAY
            </small>
            <h2>{names[page]}</h2>
          </div>
        </header>

        <GameLaunchPanel launcher={launcher} ko={ko} />

        {message && (
          <p
            role="status"
            className={failed ? 'error' : 'notice'}
          >
            {message}
          </p>
        )}

        {page === 'home' && (
          <>
            <section className="hero">
              <div className="eyebrow">
                MINECRAFT JAVA EDITION
              </div>

              <h1>
                {ko
                  ? '나만의 세계를 준비하세요.'
                  : 'Make room for your world.'}
              </h1>

              <p className="muted">
                {active.name} · Minecraft {active.version}
                {' · '}
                {loaderName(active.loader)}
              </p>

              <div className="home-profile-picker">
                <label htmlFor="home-profile">
                  {ko ? '실행할 프로필' : 'Launcher profile'}
                </label>

                <MoruSelect
                  id="home-profile"
                  ariaLabel={t('homeProfileSelect')}
                  value={active.id}
                  options={profileOptions}
                  onChange={setActiveId}
                />
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="action-button"
                  disabled={launcher.busy}
                  onClick={() => {
                    void launcher.start(active)
                  }}
                >
                  ▶ PLAY
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openProfile(active)}
                >
                  {ko ? '프로필 열기' : 'Open profile'}
                </button>
              </div>
            </section>

            <HomeServers
              profiles={profiles}
              activeId={active.id}
              ko={ko}
              launchBusy={launcher.busy}
              onLaunch={(profile, address) => {
                void launcher.start(profile, address)
              }}
            />

            <div className="summary-grid">
              <div className="panel">
                <small>{ko ? '프로필' : 'Profiles'}</small>
                <strong className="stat">
                  {profiles.length}
                </strong>
              </div>

              <div className="panel">
                <small>
                  {ko ? '현재 버전' : 'Current version'}
                </small>
                <strong className="stat">
                  {active.version}
                </strong>
              </div>

              <div className="panel">
                <small>
                  {ko
                    ? '현재 프로필의 모드'
                    : 'Mods in this profile'}
                </small>
                <strong className="stat">
                  {installedFailed ? '—' : installed.length}
                </strong>
              </div>
            </div>
          </>
        )}

        {page === 'profiles' && (
          <>
            <div className="toolbar">
              <input
                className="search"
                aria-label={
                  ko ? '프로필 검색' : 'Search profiles'
                }
                placeholder={
                  ko
                    ? '프로필 이름 또는 버전 검색'
                    : 'Search profile name or version'
                }
                value={profileQuery}
                onChange={event =>
                  setProfileQuery(event.target.value)
                }
              />

              <button
                type="button"
                className="action-button"
                onClick={() => setCreating(true)}
              >
                {t('createProfile')}
              </button>
            </div>

            <div className="profile-grid">
              {profiles
                .filter(item =>
                  `${item.name} ${item.version}`
                    .toLowerCase()
                    .includes(profileQuery.toLowerCase())
                )
                .map(profile => (
                  <article
                    className={
                      `profile-tile ${
                        profile.id === active.id
                          ? 'selected'
                          : ''
                      }`
                    }
                    key={profile.id}
                  >
                    <button
                      type="button"
                      className="profile-open"
                      onClick={() => openProfile(profile)}
                    >
                      <ProfileIcon profile={profile} />
                      <strong>{profile.name}</strong>

                      <span className="muted">
                        Minecraft {profile.version}
                        {' · '}
                        {loaderName(profile.loader)}
                      </span>
                    </button>

                    <div className="profile-tile-footer">
                      {profile.id === DEFAULT.id && (
                        <small>
                          {ko
                            ? '기본 프로필 · 보호됨'
                            : 'Default profile · Protected'}
                        </small>
                      )}

                      <small>
                        {profile.id === active.id
                          ? t('activeProfile')
                          : ''}
                      </small>
                    </div>
                  </article>
                ))}
            </div>
          </>
        )}

        {page === 'mods' && (
          <>
            <button
              type="button"
              className="back-button"
              onClick={() => setPage('profiles')}
            >
              ← {ko ? '프로필 목록' : 'Profiles'}
            </button>

            <div className="profile-heading">
              <ProfileIcon profile={active} />

              <div>
                <h1>{active.name}</h1>
                <p className="muted">
                  Minecraft {active.version}
                  {' · '}
                  {loaderName(active.loader)}
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  setProfileSettingsOpen(true)
                }
              >
                {ko
                  ? '⚙ 프로필 설정'
                  : '⚙ Profile settings'}
              </button>
            </div>

            <section className="panel">
              <div className="mods-toolbar">
                <h3>{t('navInstalled')}</h3>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void openFolder()
                  }}
                >
                  {ko
                    ? '모드 폴더 열기'
                    : 'Open mods folder'}
                </button>

                <div className="button-row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setRefresh(value => value + 1)
                    }
                  >
                    {ko ? '새로고침' : 'Refresh'}
                  </button>

                  <button
                    type="button"
                    className="action-button"
                    onClick={() => setPage('content')}
                  >
                    {ko ? '콘텐츠 추가' : 'Add content'}
                  </button>
                </div>
              </div>

              {installedFailed ? (
                <p className="error">
                  {ko
                    ? '설치 목록을 읽지 못했습니다.'
                    : 'Could not read installed mods.'}
                </p>
              ) : installed.length ? (
                <div className="mod-list">
                  {installed.map(item => (
                    <div
                      className="mod-card"
                      key={item.projectId}
                    >
                      <span className="mod-icon">▦</span>

                      <div className="mod-info">
                        <strong>{item.filename}</strong>
                        <small className="muted">
                          Modrinth
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  {t('emptyInstalled')}
                </p>
              )}

              <p className="inline-note">
                {ko
                  ? '현재 목록은 MORU에서 다운로드한 모드를 표시합니다. 수동 파일 확인은 폴더 열기를 사용해 주세요.'
                  : 'This list currently shows mods downloaded by MORU. Open the folder to check manual files.'}
              </p>
            </section>
          </>
        )}

        {page === 'content' && (
          <ContentBrowser
            profiles={profiles}
            active={active}
            onSelectProfile={setActiveId}
            language={language}
            installing={installing}
            onInstall={item => {
              void install(item)
            }}
          />
        )}
      </main>

      <CreateProfileDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={createProfile}
        ko={ko}
        releases={catalog?.releases ?? []}
        loading={!catalog && !catalogFailed}
        releasesFailed={catalogFailed}
        initialVersion={active.version}
      />

      <ProfileSettingsDialog
        open={profileSettingsOpen}
        profile={active}
        ko={ko}
        locked={installing || launcher.busy}
        onClose={() => setProfileSettingsOpen(false)}
        onDelete={removeProfile}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
      />
    </div>
  )
}

type Server = {
  id: string
  name: string
  address: string
  profileId: string
}

type Saved = {
  servers: Server[]
  selectedId: string
}

const SERVER_KEY = 'moru-home-servers-v1'

function readSaved(): Saved {
  try {
    const value = JSON.parse(
      localStorage.getItem(SERVER_KEY) || 'null'
    )

    if (!value || !Array.isArray(value.servers)) {
      return { servers: [], selectedId: '' }
    }

    const seen = new Set<string>()

    const servers = value.servers
      .filter((item: unknown): item is Server => {
        if (!item || typeof item !== 'object') {
          return false
        }

        const s = item as Partial<Server>

        if (
          typeof s.id !== 'string' ||
          !s.id ||
          seen.has(s.id) ||
          typeof s.name !== 'string' ||
          typeof s.address !== 'string' ||
          typeof s.profileId !== 'string'
        ) {
          return false
        }

        seen.add(s.id)
        return true
      })
      .slice(0, 100)

    return {
      servers,
      selectedId: servers.some(
        (s: Server) => s.id === value.selectedId
      )
        ? value.selectedId
        : servers[0]?.id || ''
    }
  } catch {
    return { servers: [], selectedId: '' }
  }
}

function validAddress(address: string): boolean {
  if (
    !address ||
    address.length > 253 ||
    /[\s/@?#\\]/.test(address)
  ) {
    return false
  }

  const match = address.startsWith('[')
    ? /^(\[[0-9a-fA-F:.]+\])(?::([0-9]+))?$/.exec(address)
    : /^([^:]+)(?::([0-9]+))?$/.exec(address)

  if (
    !match ||
    (
      match[2] &&
      (+match[2] < 1 || +match[2] > 65535)
    )
  ) {
    return false
  }

  try {
    const host =
      new URL(`http://${match[1]}`).hostname

    return (
      host.startsWith('[') ||
      host.split('.').every(
        label =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
            label
          )
      )
    )
  } catch {
    return false
  }
}

function HomeServers({
  profiles,
  activeId,
  ko,
  launchBusy,
  onLaunch
}: {
  profiles: Profile[]
  activeId: string
  ko: boolean
  launchBusy: boolean
  onLaunch: (profile: Profile, address: string) => void
}) {
  const [saved, setSaved] = useState<Saved>(readSaved)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [profileId, setProfileId] = useState(activeId)
  const [error, setError] = useState('')

  const selected = saved.servers.find(
    item => item.id === saved.selectedId
  )

  const selectedProfile = profiles.find(
    item => item.id === selected?.profileId
  )

  function commit(next: Saved): boolean {
    try {
      localStorage.setItem(
        SERVER_KEY,
        JSON.stringify(next)
      )

      setSaved(next)
      setError('')
      return true
    } catch {
      setError(
        ko
          ? '저장하지 못했습니다. 저장 공간을 확인해 주세요.'
          : 'Could not save. Check storage and try again.'
      )
      return false
    }
  }

  function start(server?: Server) {
    setEditing(server?.id ?? '')
    setName(server?.name ?? '')
    setAddress(server?.address ?? '')
    setProfileId(server?.profileId ?? activeId)
    setError('')
  }

  function save() {
    if (!name.trim()) {
      setError(
        ko
          ? '서버 이름을 입력해 주세요.'
          : 'Enter a server name.'
      )
      return
    }

    if (!validAddress(address.trim())) {
      setError(
        ko
          ? '서버 주소를 확인해 주세요. 예: play.example.com:25565 (포트 1~65535)'
          : 'Check the address. Example: play.example.com:25565 (port 1–65535)'
      )
      return
    }

    if (
      !profiles.some(item => item.id === profileId)
    ) {
      setError(
        ko
          ? '사용할 프로필을 선택해 주세요.'
          : 'Choose an available profile.'
      )
      return
    }

    if (
      editing === '' &&
      saved.servers.length >= 100
    ) {
      return
    }

    const item: Server = {
      id: editing || crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      profileId
    }

    const servers = editing
      ? saved.servers.map(
          s => s.id === editing ? item : s
        )
      : [...saved.servers, item]

    if (
      commit({
        servers,
        selectedId: item.id
      })
    ) {
      setEditing(null)
    }
  }

  function remove(server: Server) {
    if (
      !window.confirm(
        ko
          ? `“${server.name}” 서버 바로가기를 삭제할까요? 구동기 프로필과 파일은 유지됩니다.`
          : `Delete “${server.name}”? Its profile and files will be kept.`
      )
    ) {
      return
    }

    const servers = saved.servers.filter(
      item => item.id !== server.id
    )

    if (
      commit({
        servers,
        selectedId:
          saved.selectedId === server.id
            ? servers[0]?.id || ''
            : saved.selectedId
      }) &&
      editing === server.id
    ) {
      setEditing(null)
    }
  }

  return (
    <section
      className="panel"
      style={{ marginTop: 20 }}
      aria-label={
        ko ? '서버 바로가기' : 'Server shortcuts'
      }
    >
      <div className="toolbar">
        <div>
          <small className="eyebrow">YOUR SERVERS</small>
          <h3>
            {ko ? '서버 바로가기' : 'Server shortcuts'}
          </h3>
        </div>

        <button
          type="button"
          className="action-button"
          disabled={saved.servers.length >= 100}
          onClick={() => start()}
        >
          {ko ? '+ 서버 추가' : '+ Add server'}
        </button>
      </div>

      {error && (
        <p role="alert" className="error">{error}</p>
      )}

      {editing !== null && (
        <form
          className="create-profile"
          onSubmit={event => {
            event.preventDefault()
            save()
          }}
        >
          <h3>
            {editing
              ? ko ? '서버 수정' : 'Edit server'
              : ko ? '새 서버' : 'New server'}
          </h3>

          <div className="form-grid">
            <label htmlFor="server-name">
              {ko ? '서버 이름' : 'Server name'}

              <input
                id="server-name"
                required
                maxLength={40}
                value={name}
                onChange={event =>
                  setName(event.target.value)
                }
                placeholder={
                  ko
                    ? '친구들과 하는 서버'
                    : 'Friends server'
                }
              />
            </label>

            <label htmlFor="server-address">
              {ko ? '서버 주소' : 'Server address'}

              <input
                id="server-address"
                required
                maxLength={253}
                value={address}
                onChange={event =>
                  setAddress(event.target.value)
                }
                placeholder="play.example.com:25565"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>

            <div>
              <label htmlFor="server-profile">
                {ko
                  ? '사용할 구동기 프로필'
                  : 'Launcher profile'}
              </label>

              <MoruSelect
                id="server-profile"
                ariaLabel={
                  ko
                    ? '서버에 사용할 프로필'
                    : 'Profile for server'
                }
                value={profileId}
                options={profiles.map(item => ({
                  value: item.id,
                  label:
                    `${item.name} · ${item.version} · ${loaderName(item.loader)}`
                }))}
                onChange={setProfileId}
              />

              {!profiles.some(
                item => item.id === profileId
              ) && (
                <p className="error">
                  {ko
                    ? '연결된 프로필이 없습니다. 다시 선택해 주세요.'
                    : 'The linked profile is missing. Choose another.'}
                </p>
              )}
            </div>
          </div>

          <div className="button-row">
            <button
              className="action-button"
              type="submit"
            >
              {ko ? '저장' : 'Save'}
            </button>

            <button
              className="ghost"
              type="button"
              onClick={() => {
                setEditing(null)
                setError('')
              }}
            >
              {ko ? '취소' : 'Cancel'}
            </button>
          </div>
        </form>
      )}

      {!saved.servers.length && (
        <p className="empty">
          {ko
            ? '서버 주소와 사용할 프로필을 등록해 보세요.'
            : 'Add a server address and its launcher profile.'}
        </p>
      )}

      <div className="profile-grid">
        {saved.servers.map(server => {
          const profile = profiles.find(
            item => item.id === server.profileId
          )

          const chosen =
            server.id === saved.selectedId

          return (
            <article
              className={
                `profile-tile ${chosen ? 'selected' : ''}`
              }
              key={server.id}
            >
              <button
                className="profile-open"
                type="button"
                aria-pressed={chosen}
                onClick={() =>
                  commit({
                    ...saved,
                    selectedId: server.id
                  })
                }
              >
                <ServerIcon
                  address={server.address}
                  ko={ko}
                />

                <strong>{server.name}</strong>

                <span
                  className="muted"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {server.address}
                </span>

                <small
                  className={profile ? 'muted' : 'error'}
                >
                  {profile
                    ? `${profile.name} · ${profile.version} · ${loaderName(profile.loader)}`
                    : ko
                      ? '연결된 프로필 없음 · 수정 필요'
                      : 'Linked profile missing · Edit required'}
                </small>
              </button>

              <div className="profile-tile-footer">
                <span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => start(server)}
                  >
                    {ko ? '수정' : 'Edit'}
                  </button>

                  <button
                    type="button"
                    className="ghost"
                    onClick={() => remove(server)}
                  >
                    {ko ? '삭제' : 'Delete'}
                  </button>
                </span>

                <small>
                  {chosen
                    ? ko ? '선택됨' : 'Selected'
                    : ''}
                </small>
              </div>
            </article>
          )
        })}
      </div>

      {selected && (
        <div
          className="button-row"
          style={{ marginTop: 16 }}
        >
          <button
            type="button"
            className="action-button"
            disabled={launchBusy || !selectedProfile}
            onClick={() => {
              if (selectedProfile) {
                onLaunch(
                  selectedProfile,
                  selected.address
                )
              }
            }}
          >
            {ko
              ? '▶ 선택한 서버 접속'
              : '▶ Join selected server'}
          </button>

          <span
            className={
              selectedProfile ? 'muted' : 'error'
            }
          >
            {selected.name}
            {' · '}
            {selectedProfile?.name ??
              (ko
                ? '사용할 프로필을 다시 지정해 주세요.'
                : 'Choose another profile.')}
          </span>
        </div>
      )}

      <p className="inline-note">
        {ko
          ? '서버를 선택하고 접속하면 연결된 프로필로 Minecraft를 실행합니다.'
          : 'Joining starts Minecraft using the selected server’s linked profile.'}
      </p>
    </section>
  )
}

function ServerIcon({
  address,
  ko
}: {
  address: string
  ko: boolean
}) {
  const [result, setResult] = useState<{
    address: string
    icon: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.api.getServerIcon(address)
      .then(icon => {
        if (!cancelled) setResult({ address, icon })
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ address, icon: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [address])

  const icon =
    result?.address === address
      ? result.icon
      : null

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}
    >
      <span
        className="profile-emblem"
        style={{ overflow: 'hidden' }}
      >
        {icon ? (
          <img
            src={icon}
            alt={ko ? '서버 아이콘' : 'Server icon'}
            width={54}
            height={54}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              imageRendering: 'pixelated'
            }}
            onError={() =>
              setResult({ address, icon: null })
            }
          />
        ) : '⌂'}
      </span>
    </span>
  )
}

function loaderName(loader: Profile['loader']): string {
  return {
    vanilla: 'Vanilla',
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge'
  }[loader]
}

function ProfileIcon({
  profile
}: {
  profile: Profile
}) {
  const [failedIcon, setFailedIcon] =
    useState<string | null>(null)

  const icon =
    typeof profile.icon === 'string' &&
    profile.icon.length <= 100000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      profile.icon
    ) &&
    profile.icon !== failedIcon
      ? profile.icon
      : null

  return (
    <span
      className="profile-emblem"
      style={{
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      {icon ? (
        <img
          src={icon}
          alt=""
          width={52}
          height={52}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          onError={() =>
            setFailedIcon(icon)
          }
        />
      ) : '◆'}
    </span>
  )
}