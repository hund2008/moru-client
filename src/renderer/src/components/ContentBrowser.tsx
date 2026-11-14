import { useEffect, useRef, useState } from 'react'
import { MoruSelect } from '../LauncherSupport'
import { localizedModDescription, type Language } from '../locales'

type Kind = 'mod' | 'resourcepack' | 'shader' | 'modpack'
type Sort = 'downloads' | 'follows' | 'newest'
type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge'
type Profile = { id: string; name: string; version: string; loader: Loader }
type Item = { id: string; name: string; description: string; icon: string | null; downloads: number }
type Result = { key: string; items: Item[]; total: number; loading: boolean; error: boolean }

export default function ContentBrowser({
  profiles,
  active,
  onSelectProfile,
  language,
  installing,
  onInstall
}: {
  profiles: Profile[]
  active: Profile
  onSelectProfile: (id: string) => void
  language: Language
  installing: boolean
  onInstall: (item: Item) => void
}) {
  const ko = language === 'ko'
  const [kind, setKind] = useState<Kind>('mod')
  const [sort, setSort] = useState<Sort>('downloads')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)

  const [result, setResult] = useState<Result>({
    key: '', items: [], total: 0, loading: true, error: false
  })

  const root = useRef<HTMLElement>(null)
  const blocked = kind === 'mod' && active.loader === 'vanilla'
  const canInstall = kind === 'mod' && active.loader === 'fabric'

  const key = JSON.stringify([
    active.id, active.version, active.loader,
    kind, sort, query, page, retry
  ])

  const current = result.key === key
  const loading = !blocked && (!current || result.loading)
  const items = current && !result.loading && !result.error ? result.items : []
  const total = current && !result.error ? result.total : 0
  const pages = Math.max(1, Math.ceil(total / 20))

  useEffect(() => {
    if (blocked) return
    let cancelled = false

    setResult({
      key, items: [], total: 0, loading: true, error: false
    })

    void window.api.searchContent(
      query, active.version, kind, active.loader, sort, page
    ).then(value => {
      if (cancelled) return

      const last = Math.max(1, Math.ceil(value.total / 20))

      if (page > last) {
        setPage(last)
        return
      }

      setResult({
        key, items: value.items, total: value.total,
        loading: false, error: false
      })
    }).catch(() => {
      if (!cancelled) {
        setResult({
          key, items: [], total: 0, loading: false, error: true
        })
      }
    })

    return () => { cancelled = true }
  }, [key, blocked, query, active.version, active.loader, kind, sort, page])

  function go(next: number) {
    if (loading || next < 1 || next > pages || next === page) return
    setPage(next)
    root.current?.scrollIntoView({ block: 'start' })
  }

  let start = Math.max(1, page - 2)
  const end = Math.min(pages, start + 4)
  start = Math.max(1, end - 4)
  const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const loaderNames = {
    vanilla: 'Vanilla',
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge'
  }

  return (
    <section className="panel" ref={root}>
      <div className="content-target">
        <div>
          <small className="eyebrow">MODRINTH</small>
          <h3>{ko ? '설치 대상 프로필' : 'Install to profile'}</h3>
        </div>
        <MoruSelect
          id="content-profile"
          value={active.id}
          ariaLabel={ko ? '설치 대상 프로필' : 'Installation profile'}
          options={profiles.map(profile => ({
            value: profile.id,
            label: `${profile.name} · ${profile.version} · ${loaderNames[profile.loader]}`
          }))}
          onChange={id => {
            setPage(1)
            onSelectProfile(id)
          }}
        />
      </div>

      <div
        className="button-row"
        role="group"
        aria-label={ko ? '콘텐츠 종류' : 'Content type'}
        style={{ margin: '0 0 20px', gap: 8 }}
      >
        {([
          ['mod', ko ? '모드' : 'Mods'],
          ['resourcepack', ko ? '리소스팩' : 'Resource packs'],
          ['shader', ko ? '쉐이더' : 'Shaders'],
          ['modpack', ko ? '모드팩' : 'Modpacks']
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            className={kind === value ? 'action-button' : 'ghost'}
            onClick={() => { setKind(value); setPage(1) }}
          >{label}</button>
        ))}
      </div>

      {kind !== 'mod' && (
        <p className="inline-note">
          {ko
            ? kind === 'modpack'
              ? '모드팩을 새 프로필로 설치하는 기능은 준비 중입니다.'
              : kind === 'shader'
                ? '쉐이더 설치는 준비 중입니다. 게임 적용에는 호환되는 쉐이더 로더가 필요합니다.'
                : '리소스팩 설치 기능은 준비 중입니다.'
            : kind === 'modpack'
              ? 'Installation into a new profile is coming later.'
              : kind === 'shader'
                ? 'Installation is coming later. A compatible shader loader is required.'
                : 'Resource pack installation is coming later.'}
        </p>
      )}

      {kind === 'mod' && (active.loader === 'forge' || active.loader === 'neoforge') && (
        <p className="inline-note">
          {ko
            ? '이 로더의 모드는 검색할 수 있습니다. 설치 기능은 준비 중입니다.'
            : 'You can browse mods for this loader. Installation is coming later.'}
        </p>
      )}

      <form
        className="toolbar"
        style={{ flexWrap: 'wrap' }}
        onSubmit={event => {
          event.preventDefault()
          setQuery(draft.trim().slice(0, 100))
          setPage(1)
          setRetry(value => value + 1)
        }}
      >
        <input
          className="search"
          style={{ flexBasis: 180 }}
          maxLength={100}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          aria-label={ko ? '콘텐츠 검색' : 'Search content'}
          placeholder={ko ? 'Modrinth에서 검색…' : 'Search Modrinth…'}
        />

        <div style={{ flex: '0 1 230px', minWidth: 0, maxWidth: '100%' }}>
          <MoruSelect
            id="content-sort"
            value={sort}
            ariaLabel={ko ? '콘텐츠 정렬' : 'Content sort'}
            options={[
              { value: 'downloads', label: ko ? '가장 많은 다운로드순' : 'Most downloads' },
              { value: 'follows', label: ko ? '인기순' : 'Most followed' },
              { value: 'newest', label: ko ? '최신순' : 'Newest' }
            ]}
            onChange={value => { setSort(value as Sort); setPage(1) }}
          />
        </div>

        <button type="submit" className="action-button" disabled={blocked}>
          {ko ? '검색' : 'Search'}
        </button>
      </form>

      <p className="inline-note">
        {ko
          ? '인기순은 Modrinth 팔로워 수, 최신순은 콘텐츠 등록일 기준입니다.'
          : 'Popularity uses Modrinth followers. Newest uses project creation date.'}
      </p>

      {blocked ? (
        <p className="empty">
          {ko
            ? '모드를 검색하려면 모드로더가 있는 프로필을 선택해 주세요.'
            : 'Choose a profile with a mod loader to browse mods.'}
        </p>
      ) : (
        <>
          {loading && (
            <p className="empty" role="status">
              {ko ? '콘텐츠를 불러오는 중…' : 'Loading content…'}
            </p>
          )}

          {current && result.error && (
            <div className="error" role="alert">
              {ko ? '목록을 불러오지 못했습니다.' : 'Could not load content.'}{' '}
              <button type="button" className="ghost" onClick={() => setRetry(value => value + 1)}>
                {ko ? '다시 시도' : 'Retry'}
              </button>
            </div>
          )}

          {!loading && current && !result.error && (
            <p className="muted" role="status">
              {ko
                ? `검색 결과 ${total.toLocaleString('ko-KR')}개 · ${page} / ${pages}페이지`
                : `${total.toLocaleString('en-US')} results · Page ${page} of ${pages}`}
            </p>
          )}

          {!loading && current && !result.error && !items.length && (
            <p className="empty">
              {ko ? '이 프로필 버전에 맞는 검색 결과가 없습니다.' : 'No results for this profile version.'}
            </p>
          )}

          <div className="mod-list" aria-busy={loading}>
            {items.map(item => (
              <div className="mod-card" key={item.id}>
                <div className="mod-icon">
                  {item.name.charAt(0)}
                  {item.icon?.startsWith('https://cdn.modrinth.com/') && (
                    <img
                      src={item.icon}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={event => { event.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>

                <div className="mod-info">
                  <strong>{item.name}</strong>
                  <p className="muted">{localizedModDescription(item, language)}</p>
                  <small>↓ {item.downloads.toLocaleString(ko ? 'ko-KR' : 'en-US')}</small>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={installing || !canInstall}
                  title={canInstall ? undefined : ko ? '설치 기능은 준비 중입니다.' : 'Installation is coming later.'}
                  onClick={() => { if (canInstall) onInstall(item) }}
                >
                  {canInstall
                    ? ko ? '다운로드' : 'Download'
                    : ko ? '설치 준비 중' : 'Coming later'}
                </button>
              </div>
            ))}
          </div>

          {!loading && current && !result.error && total > 0 && (
            <nav
              aria-label={ko ? '콘텐츠 페이지' : 'Content pages'}
              className="button-row"
              style={{
                position: 'sticky', bottom: 0, justifyContent: 'center',
                gap: 8, padding: '16px 8px', marginTop: 20,
                background: '#101c17', border: '1px solid #345344',
                borderRadius: 12, zIndex: 1
              }}
            >
              <button type="button" className="ghost" aria-label={ko ? '이전 페이지' : 'Previous page'} disabled={page <= 1} onClick={() => go(page - 1)}>‹</button>

              {start > 1 && (
                <button type="button" className="ghost" aria-label={ko ? '1페이지' : 'Page 1'} onClick={() => go(1)}>1</button>
              )}
              {start > 2 && <span className="muted" aria-hidden="true">…</span>}

              {numbers.map(number => (
                <button
                  type="button"
                  key={number}
                  aria-label={ko ? `${number}페이지` : `Page ${number}`}
                  aria-current={number === page ? 'page' : undefined}
                  className={number === page ? 'action-button' : 'ghost'}
                  onClick={() => go(number)}
                >{number}</button>
              ))}

              {end < pages - 1 && <span className="muted" aria-hidden="true">…</span>}
              {end < pages && (
                <button type="button" className="ghost" aria-label={ko ? `${pages}페이지` : `Page ${pages}`} onClick={() => go(pages)}>{pages}</button>
              )}

              <button type="button" className="ghost" aria-label={ko ? '다음 페이지' : 'Next page'} disabled={page >= pages} onClick={() => go(page + 1)}>›</button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}