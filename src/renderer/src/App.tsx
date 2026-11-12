
import { useState } from 'react'

type Page = 'home' | 'discover' | 'installed' | 'settings'

const mods = [
  {
    name: 'Sodium',
    icon: 'S',
    description: '마인크래프트 렌더링 성능을 개선하는 모드',
    category: '최적화'
  },
  {
    name: 'Lithium',
    icon: 'L',
    description: '게임 내부 연산과 처리 성능을 최적화하는 모드',
    category: '최적화'
  },
  {
    name: 'Mod Menu',
    icon: 'M',
    description: '설치된 Fabric 모드를 관리하는 메뉴',
    category: '편의 기능'
  }
]

const css = `
  * { box-sizing: border-box; }

  html, body, #root {
    margin: 0 !important;
    padding: 0 !important;
    width: 100%;
    height: 100%;
    min-width: 0;
    max-width: none !important;
  }

  body {
    display: block !important;
    overflow: hidden;
    background: #0c1113;
    color: #edf5f1;
    font-family: 'Segoe UI', sans-serif;
  }

  button, input { font: inherit; }
  button { cursor: pointer; }

  .moru {
    display: flex;
    width: 100%;
    height: 100vh;
    text-align: left;
    background: #0c1113;
  }

  .sidebar {
    width: 225px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: 28px 15px;
    border-right: 1px solid #27312e;
    background: #101719;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 13px 42px;
    font-size: 23px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .brand-icon {
    display: grid;
    place-items: center;
    width: 39px;
    height: 39px;
    border-radius: 11px;
    background: #43d9a0;
    color: #0d1b17;
    font-size: 25px;
  }

  .nav-label {
    margin: 0 13px 15px;
    color: #718b81;
    font-size: 11px;
    letter-spacing: 2px;
  }

  .nav-button {
    width: 100%;
    padding: 14px;
    margin-bottom: 5px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #91a49d;
    text-align: left;
    font-size: 14px;
  }

  .nav-button:hover { background: #1c2927; }

  .nav-button.active {
    background: #1b3c32;
    color: #55e7ae;
    font-weight: 700;
  }

  .nav-symbol {
    display: inline-block;
    width: 30px;
    font-size: 18px;
  }

  .sidebar-bottom {
    margin-top: auto;
    padding: 13px;
    color: #7f998f;
    font-size: 12px;
    border-top: 1px solid #27312e;
  }

  .content {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 32px 42px;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 35px;
  }

  .topbar h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  .profile {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #b2c4bc;
    font-size: 13px;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 33px;
    height: 33px;
    background: #25483b;
    border-radius: 50%;
    color: #6ce7b3;
    font-weight: 700;
  }

  .hero {
    position: relative;
    overflow: hidden;
    min-height: 290px;
    padding: 39px;
    border: 1px solid #345749;
    border-radius: 20px;
    background:
      radial-gradient(circle at 90% 25%, #245c46 0%, transparent 45%),
      linear-gradient(125deg, #152d26, #111b1b);
  }

  .hero::after {
    content: '◆';
    position: absolute;
    right: 8%;
    top: 0;
    font-size: 260px;
    line-height: 1;
    color: #46df9b;
    opacity: .10;
    transform: rotate(-15deg);
    pointer-events: none;
  }

  .eyebrow {
    font-size: 11px;
    letter-spacing: 2.5px;
    color: #63daa5;
    font-weight: 700;
  }

  .hero h1 {
    position: relative;
    margin: 19px 0 9px;
    font-size: clamp(30px, 4vw, 43px);
    letter-spacing: -1px;
  }

  .muted {
    color: #98aea4;
    font-size: 14px;
    line-height: 1.7;
  }

  .play {
    margin-top: 27px;
    padding: 13px 38px;
    border: 0;
    border-radius: 10px;
    background: #40d99b;
    color: #0b221a;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .play:disabled {
    cursor: default;
    opacity: .8;
  }

  .section-title {
    margin: 35px 0 17px;
    font-size: 18px;
    font-weight: 700;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 15px;
  }

  .card {
    min-width: 0;
    padding: 21px;
    border: 1px solid #25352e;
    border-radius: 15px;
    background: #161f20;
  }

  .card-label {
    color: #8fa49a;
    font-size: 12px;
  }

  .card-value {
    margin-top: 13px;
    font-size: 20px;
    font-weight: 750;
  }

  .panel {
    padding: 28px;
    border: 1px solid #26372f;
    border-radius: 16px;
    background: #151e1f;
  }

  .search {
    width: 100%;
    padding: 15px 18px;
    margin: 10px 0 20px;
    border: 1px solid #355144;
    outline: none;
    border-radius: 10px;
    color: #edf5f1;
    background: #0e1718;
  }

  .search:focus { border-color: #43d9a0; }

  .mod-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .mod-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border: 1px solid #2b3b34;
    border-radius: 12px;
    background: #192522;
    color: #edf5f1;
    text-align: left;
    width: 100%;
  }

  .mod-card:hover, .mod-card.selected {
    border-color: #4ad5a0;
  }

  .mod-icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    border-radius: 11px;
    background: #294c3d;
    color: #60e6ad;
    font-size: 23px;
    font-weight: 800;
  }

  .mod-name { font-size: 15px; font-weight: 700; }
  .mod-desc { margin-top: 5px; color: #9bb0a6; font-size: 12px; }
  .mod-category { margin-left: auto; color: #61dba9; font-size: 11px; }

  .empty {
    padding: 65px 20px;
    text-align: center;
    color: #9ab2a6;
  }

  .secondary-button {
    padding: 11px 18px;
    border: 1px solid #45715b;
    border-radius: 9px;
    background: #203b30;
    color: #83e8b9;
    font-weight: 650;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 20px 0;
    border-bottom: 1px solid #293c32;
  }

  .ram-slider {
    width: 190px;
    accent-color: #46df9f;
  }

  @media (max-width: 800px) {
    .sidebar { width: 175px; }
    .content { padding: 24px; }
    .cards { grid-template-columns: 1fr; }
    .hero { padding: 27px; }
  }
`

function App() {
  const [page, setPage] = useState<Page>('home')
  const [search, setSearch] = useState('')
  const [selectedMod, setSelectedMod] = useState('')
  const [ram, setRam] = useState(6)

  const navigation: { id: Page; label: string; icon: string }[] = [
    { id: 'home', label: '홈', icon: '⌂' },
    { id: 'discover', label: '모드 탐색', icon: '▦' },
    { id: 'installed', label: '내 모드', icon: '▣' },
    { id: 'settings', label: '설정', icon: '⚙' }
  ]

  const filteredMods = mods.filter((mod) =>
    mod.name.toLowerCase().includes(search.toLowerCase())
  )

  const titles: Record<Page, string> = {
    home: '홈',
    discover: '모드 탐색',
    installed: '내 모드',
    settings: '설정'
  }

  return (
    <div className="moru">
      <style>{css}</style>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">◆</div>
          MORU
        </div>

        <div className="nav-label">MENU</div>

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

        <div className="sidebar-bottom">
          MORU CLIENT
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <h2>{titles[page]}</h2>
          <div className="profile">
            <span>내 프로필</span>
            <div className="avatar">M</div>
          </div>
        </header>

        {page === 'home' && (
          <>
            <section className="hero">
              <div className="eyebrow">MINECRAFT JAVA EDITION</div>
              <h1>Minecraft 26.1.2</h1>
              <div className="muted">
                MORU와 함께하는 새로운 마인크래프트 경험
              </div>
              <button className="play" type="button" disabled>
                ▶ PLAY
              </button>
            </section>

            <h3 className="section-title">게임 환경</h3>
            <div className="cards">
              <div className="card">
                <div className="card-label">Minecraft</div>
                <div className="card-value">26.1.2</div>
              </div>
              <div className="card">
                <div className="card-label">모드 로더</div>
                <div className="card-value">Fabric</div>
              </div>
              <div className="card">
                <div className="card-label">내 모드</div>
                <div className="card-value">0개</div>
              </div>
            </div>
          </>
        )}

        {page === 'discover' && (
          <section className="panel">
            <div className="eyebrow">MODRINTH</div>
            <h2>모드 탐색</h2>
            <p className="muted">
              원하는 모드를 검색하고 살펴보세요.
            </p>

            <input
              className="search"
              placeholder="모드 이름 검색..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="mod-list">
              {filteredMods.map((mod) => (
                <button
                  className={`mod-card ${selectedMod === mod.name ? 'selected' : ''}`}
                  key={mod.name}
                  type="button"
                  onClick={() => setSelectedMod(mod.name)}
                >
                  <div className="mod-icon">{mod.icon}</div>
                  <div>
                    <div className="mod-name">{mod.name}</div>
                    <div className="mod-desc">{mod.description}</div>
                  </div>
                  <span className="mod-category">{mod.category}</span>
                </button>
              ))}
              {filteredMods.length === 0 && (
                <p className="muted">검색 결과가 없습니다.</p>
              )}
            </div>
          </section>
        )}

        {page === 'installed' && (
          <section className="panel">
            <h2>내 모드</h2>
            <div className="empty">
              <p>설치된 모드가 없습니다.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPage('discover')}
              >
                모드 탐색하기
              </button>
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="panel">
            <h2>클라이언트 설정</h2>
            <div className="setting-row">
              <div>
                <strong>게임 버전</strong>
                <p className="muted">Minecraft Java Edition</p>
              </div>
              <strong>26.1.2</strong>
            </div>

            <div className="setting-row">
              <div>
                <strong>메모리 할당</strong>
                <p className="muted">게임에 사용할 RAM 용량</p>
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
                    onChange={(event) =>
                      setRam(Number(event.target.value))
                    }
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
