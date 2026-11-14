import { useEffect, useRef, useState } from 'react'
import {
  MoruSelect,
  type LauncherPreferences
} from '../LauncherSupport'
import type { AuthState } from '../../../shared/auth'
import SkinSettings from './SkinSettings'
import VideoSettings from './VideoSettings'
import ClientSettings from './ClientSettings'
import { playClickSound } from '../click-sound'

type Tab =
  | 'account'
  | 'skin'
  | 'video'
  | 'audio'
  | 'language'
  | 'client'
  | 'about'

const tabs: Array<{ id: Tab; ko: string; en: string }> = [
  { id: 'account', ko: 'Minecraft 계정', en: 'Minecraft account' },
  { id: 'skin', ko: '스킨', en: 'Skin' },
  { id: 'video', ko: '비디오', en: 'Video' },
  { id: 'audio', ko: '오디오', en: 'Audio' },
  { id: 'language', ko: '언어', en: 'Language' },
  { id: 'client', ko: '클라이언트', en: 'Client' },
  { id: 'about', ko: '정보', en: 'About' }
]

export default function SettingsDialog({
  open,
  onClose,
  preferences: p
}: {
  open: boolean
  onClose: () => void
  preferences: LauncherPreferences
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<Tab>('account')
  const [account, setAccount] = useState<AuthState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [volume, setVolume] = useState(() => {
    try {
      const stored = localStorage.getItem('moru-interface-volume-v1')

      return stored === null
        ? 60
        : Math.max(0, Math.min(100, Number(stored) || 0))
    } catch {
      return 60
    }
  })

  const ko = p.language === 'ko'

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal()
    }

    if (!open) dialog.current?.close()
  }, [open])

  useEffect(() => {
    let alive = true
    let changed = false

    const off = window.api.auth.onChanged(value => {
      changed = true
      if (alive) setAccount(value)
    })

    void window.api.auth.getState()
      .then(value => {
        if (alive && !changed) setAccount(value)
      })
      .catch(() => {
        if (alive) setMessage('IPC_ERROR')
      })

    return () => {
      alive = false
      off()
    }
  }, [])

  async function authAction(
    action: 'login' | 'refresh' | 'logout'
  ) {
    if (busy) return

    setBusy(true)
    setMessage('')

    try {
      setAccount(await window.api.auth[action]())
    } catch {
      setMessage('IPC_ERROR')
    } finally {
      setBusy(false)
    }
  }

  async function testSound() {
    setMessage('')

    if (!await playClickSound(volume)) {
      setMessage(
        ko
          ? '소리를 재생하지 못했습니다.'
          : 'Could not play the sound.'
      )
    }
  }

  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-label={ko ? '설정' : 'Settings'}
      onCancel={onClose}
      onClick={event => {
        if (event.target !== event.currentTarget) return

        const rect = event.currentTarget.getBoundingClientRect()

        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          onClose()
        }
      }}
    >
      <header className="settings-heading">
        <div>
          <small>MORU</small>
          <h2>{ko ? '설정' : 'Settings'}</h2>
        </div>

        <button
          type="button"
          className="ghost"
          aria-label={ko ? '설정 닫기' : 'Close settings'}
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="settings-layout">
        <nav
          className="settings-nav"
          aria-label={ko ? '설정 메뉴' : 'Settings menu'}
        >
          {tabs.map(item => (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'selected' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              {ko ? item.ko : item.en}
            </button>
          ))}
        </nav>

        <section className="settings-body">
          {tab !== 'skin' && (
            <h3>
              {ko
                ? tabs.find(item => item.id === tab)!.ko
                : tabs.find(item => item.id === tab)!.en}
            </h3>
          )}

          {tab === 'account' && (
            <>
              <p className="muted">
                {ko
                  ? '현재 연결된 계정이 오른쪽 위에 표시됩니다.'
                  : 'Your connected account appears in the upper-right corner.'}
              </p>

              <div className="panel">
                <strong>
                  {account?.profile?.name ??
                    (ko ? '연결된 계정 없음' : 'No connected account')}
                </strong>

                <p className="muted">
                  {account?.status === 'signedIn'
                    ? 'Minecraft Java Edition'
                    : account?.error?.code ??
                      (ko
                        ? 'Microsoft 계정으로 로그인해 주세요.'
                        : 'Sign in with your Microsoft account.')}
                </p>

                <div className="button-row">
                  {account?.status !== 'signedIn' && (
                    <button
                      type="button"
                      className="action-button"
                      disabled={busy}
                      onClick={() => {
                        void authAction('login')
                      }}
                    >
                      {ko ? 'Microsoft 로그인' : 'Microsoft sign-in'}
                    </button>
                  )}

                  {account?.status === 'signedIn' && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        void authAction('refresh')
                      }}
                    >
                      {ko ? '계정 갱신' : 'Refresh account'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      void authAction('logout')
                    }}
                  >
                    {ko ? '로그아웃' : 'Sign out'}
                  </button>
                </div>
              </div>

              {account?.status === 'signingIn' && (
                <p role="status">
                  {ko ? '계정 확인 중' : 'Verifying account'}
                  {' · '}
                  {account.stage}
                </p>
              )}

              {account?.error && (
                <p className="error" role="alert">
                  {account.error.code === 'APP_ACCESS_REQUIRED'
                    ? ko
                      ? 'Minecraft Services의 MORU 앱 접근 승인이 필요합니다.'
                      : 'Minecraft Services app access approval is required.'
                    : account.error.code}
                  {' · '}
                  {account.error.stage}
                </p>
              )}
            </>
          )}

          {tab === 'skin' && (
            <SkinSettings language={p.language} />
          )}

          {tab === 'video' && (
            <VideoSettings ko={ko} />
          )}

          {tab === 'audio' && (
            <>
              <label
                className="field-label"
                htmlFor="moru-sound-volume"
              >
                {ko
                  ? '클라이언트 효과음 볼륨'
                  : 'Client sound effects volume'}
                {' · '}{volume}%
              </label>

              <input
                id="moru-sound-volume"
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={event => {
                  const value = Number(event.target.value)
                  setVolume(value)

                  try {
                    localStorage.setItem(
                      'moru-interface-volume-v1',
                      String(value)
                    )
                  } catch {
                    // 저장하지 못하면 현재 설정창에서만 유지됩니다.
                  }
                }}
              />

              <p>
                <button
                  type="button"
                  className="secondary-button"
                  data-moru-sound="off"
                  onClick={() => {
                    void testSound()
                  }}
                >
                  {ko ? '소리 테스트' : 'Test sound'}
                </button>
              </p>

              <p className="muted">
                {ko
                  ? '버튼 클릭 효과음에 적용됩니다. 0%로 설정하면 음소거됩니다. Minecraft 게임 음량과는 별개입니다.'
                  : 'Controls button click sounds. Set to 0% to mute. This is separate from Minecraft game volume.'}
              </p>
            </>
          )}

          {tab === 'language' && (
            <>
              <p className="muted">{p.t('languageHelp')}</p>

              <MoruSelect
                id="moru-language"
                value={p.language}
                onChange={value =>
                  p.setLanguage(value === 'en' ? 'en' : 'ko')
                }
                ariaLabel={p.t('language')}
                options={[
                  { value: 'ko', label: '한국어' },
                  { value: 'en', label: 'English' }
                ]}
              />

              <hr
                style={{
                  border: 0,
                  borderTop: '1px solid #2c4135',
                  margin: '24px 0'
                }}
              />

              <strong>{p.t('font')}</strong>
              <p className="muted">{p.t('fontHelp')}</p>
              <p>{p.fontName ?? p.t('fontDefault')}</p>

              <input
                ref={p.fontInput}
                type="file"
                accept=".ttf,font/ttf"
                hidden
                onChange={event => {
                  void p.onFontChange(event)
                }}
              />

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={p.fontBusy}
                  onClick={() => p.fontInput.current?.click()}
                >
                  {p.t('fontChooseFile')}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={p.fontBusy || !p.fontName}
                  onClick={() => {
                    void p.resetFont()
                  }}
                >
                  {p.t('fontReset')}
                </button>
              </div>

              {p.fontError && (
                <p className="error">{p.t(p.fontError)}</p>
              )}
            </>
          )}

          {tab === 'client' && (
            <ClientSettings ko={ko} />
          )}

          {tab === 'about' && (
            <section className="moru-about">
              <style>{`
                .moru-about {
                  display: grid;
                  gap: 18px;
                  line-height: 1.8;
                }

                .moru-about .panel {
                  margin: 0;
                  padding: 20px;
                  border: 1px solid #2c4135;
                  border-radius: 14px;
                  background: #101b15;
                }

                .moru-about h3,
                .moru-about h4 {
                  margin: 0 0 10px;
                }

                .moru-about p {
                  margin: 8px 0;
                }

                .moru-about a {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  margin-top: 10px;
                  padding: 10px 18px;
                  border: 1px solid #48765c;
                  border-radius: 10px;
                  background: #204332;
                  color: #a4f3c9;
                  text-decoration: none;
                  font-weight: 600;
                }

                .moru-about a:hover {
                  background: #2b5942;
                }

                .moru-about a:focus-visible {
                  outline: 2px solid #67e6ab;
                  outline-offset: 3px;
                }

                .moru-about details {
                  border: 1px solid #2c4135;
                  border-radius: 14px;
                  background: #101b15;
                }

                .moru-about summary {
                  padding: 16px 20px;
                  cursor: pointer;
                  color: #c8e5d4;
                  font-weight: 600;
                }

                .moru-about .legal-body {
                  padding: 0 20px 20px;
                  color: #b5cbbf;
                  font-size: 13px;
                  overflow-wrap: anywhere;
                }

                .moru-about .legal-body h4 {
                  margin-top: 18px;
                  color: #edf5f1;
                }
              `}</style>

              <div className="panel">
                <h3>MORU Client</h3>
                <p>{ko ? '제작: 헌디' : 'Created by: 헌디'}</p>
                <p className="muted">YOUR WORLD, YOUR WAY</p>

                <a
                  href="https://discord.gg/S7BWAzaEgD"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ko ? '공식 디스코드 열기 ↗' : 'Official Discord ↗'}
                </a>
              </div>

              <details>
                <summary>
                  {ko ? '라이선스' : 'License (Korean)'}
                </summary>

                <div className="legal-body">
                  <h4>MORU 자체 코드 및 디자인</h4>
                  <p>
                    헌디가 권리를 보유한 MORU 자체 코드와 디자인의
                    저작권은 헌디에게 있습니다. 별도로 허용된 경우를
                    제외하고 해당 저작물의 복제·수정·재배포·상업적
                    이용에는 권리자의 허락이 필요합니다. 소스코드의
                    공개만으로 이러한 이용 권한이 부여되지는 않습니다.
                    관련 법령에 따른 이용은 제한하지 않습니다.
                  </p>

                  <h4>외부 소프트웨어</h4>
                  <p>
                    Electron, React 등 외부 라이브러리와 글꼴·이미지에는
                    각 권리자의 라이선스가 적용됩니다.
                    MORU의 안내는 외부 저작물의 라이선스를 변경하거나
                    해당 라이선스에서 허용한 권리를 제한하지 않습니다.
                  </p>

                  <h4>콘텐츠 출처 및 라이선스</h4>
                  <p>
                    MORU의 콘텐츠 검색 및 다운로드 기능은 Modrinth
                    API를 통해 제공됩니다. 표시되는
                    모드·리소스팩·쉐이더·모드팩은 각 제작자가
                    Modrinth에 게시한 콘텐츠이며, 해당 콘텐츠의
                    저작권은 각 권리자에게 있습니다.
                  </p>
                  <p>
                    콘텐츠의 사용·수정·공유·재배포 시에는 각 제작자가
                    명시한 라이선스와 이용 조건을 따라야 합니다.
                    MORU를 통해 다운로드했다는 이유로 추가적인
                    이용 권한이 부여되지는 않습니다. 자세한 조건은
                    각 콘텐츠의 Modrinth 페이지에서 확인해 주세요.
                  </p>
                  <p>
                    사용자가 수동으로 추가한 콘텐츠에도 해당 제작자의
                    라이선스가 적용됩니다. MORU는 Modrinth의 공식
                    제품이 아니며, Modrinth와의 제휴 또는 후원을
                    의미하지 않습니다.
                  </p>

                  <h4>Minecraft와의 관계</h4>
                  <p>
                    Minecraft 및 관련 상표의 권리는 각 권리자에게
                    있습니다. MORU는 Mojang 또는 Microsoft의 공식
                    제품이 아니며, 두 회사의 승인·후원·제휴를
                    의미하지 않습니다.
                  </p>
                </div>
              </details>

              <details>
                <summary>
                  {ko ? '이용약관' : 'Terms of use (Korean)'}
                </summary>

                <div className="legal-body">
                  <h4>1. 이용 목적</h4>
                  <p>
                    MORU는 Minecraft Java Edition의 프로필과 콘텐츠를
                    관리하고 게임 실행을 지원하는 비공식
                    클라이언트입니다. 실제 게임 실행에는 정당한 이용
                    권한이 있는 Microsoft 계정과 필요한 인증이
                    요구됩니다.
                  </p>

                  <h4>2. 이용자의 준수 사항</h4>
                  <p>
                    Minecraft EULA, 이용 지침, Microsoft 및 연결
                    서비스의 약관과 관련 법령을 지켜 주세요.
                    타인의 계정 도용, 인증 우회, 악성 파일 배포,
                    타인의 권리 침해에 MORU를 이용해서는 안 됩니다.
                  </p>

                  <h4>3. 외부 콘텐츠와 서비스</h4>
                  <p>
                    모드와 기타 콘텐츠는 외부 제작자가 제공합니다.
                    설치 전 출처·호환 버전·라이선스를 확인해 주세요.
                    외부 서비스의 정책 변경, 장애 또는 접근 승인
                    상태에 따라 로그인·검색·다운로드·게임 실행
                    기능이 제한될 수 있습니다.
                  </p>

                  <h4>4. 데이터와 계정</h4>
                  <p>
                    프로필·설정·설치 파일 등은 기능에 따라 사용자
                    기기에 저장됩니다. 로그인 정보는 인증에 사용되며,
                    검색·다운로드·계정 연결 과정에서 Microsoft,
                    Minecraft Services, Modrinth 등 해당 외부
                    서비스와 통신합니다. 각 서비스의 개인정보
                    처리방침도 확인해 주세요. 중요한 월드와 설정은
                    변경·삭제 전에 백업해 주세요.
                  </p>

                  <h4>5. 업데이트와 책임</h4>
                  <p>
                    MORU는 개발 과정에서 기능이 변경되거나 오류가
                    발생할 수 있으며 모든 버전·콘텐츠와의 호환성
                    또는 중단 없는 동작을 보장하지 않습니다.
                    다만 관련 법령에 따라 인정되는 이용자의 권리와
                    제작자의 책임을 배제하지 않습니다.
                  </p>

                  <h4>6. 약관 변경 및 문의</h4>
                  <p>
                    약관을 변경할 경우 변경 내용과 적용 시점을
                    공식 디스코드 또는 앱을 통해 안내합니다.
                    중요한 변경은 적용 전에 안내합니다.
                    문의와 오류 제보는 공식 디스코드를
                    이용해 주세요.
                  </p>
                </div>
              </details>

              <p className="muted">
                {ko
                  ? '라이선스와 이용약관은 항목을 눌러 확인할 수 있습니다.'
                  : 'Expand each section to read the license and terms in Korean.'}
              </p>
            </section>
          )}

          {message && (
            <p role="status" className="error">{message}</p>
          )}
        </section>
      </div>

      <footer className="settings-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
        >
          {ko ? '닫기' : 'Close'}
        </button>
      </footer>
    </dialog>
  )
}