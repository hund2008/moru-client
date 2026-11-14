import { useEffect, useRef, useState } from 'react'
import type {
  GameCode,
  GamePhase,
  GameProfile,
  GameState
} from '../../../shared/game'

const empty: GameState = {
  status: 'idle',
  phase: 'none',
  profileId: null,
  profileName: null,
  downloaded: 0,
  total: 0,
  code: null,
  javaMajor: null,
  exitCode: null
}

export function useGameLauncher() {
  const [state, setState] = useState<GameState>(empty)
  const [loginOpen, setLoginOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<GameCode | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    let alive = true
    let changed = false

    const unsubscribe = window.api.game.onChanged(value => {
      changed = true

      if (alive) {
        setState(value)

        if (
          value.status === 'error' &&
          (
            value.code === 'AUTH_REQUIRED' ||
            value.code === 'APP_ACCESS_REQUIRED'
          )
        ) {
          setLoginOpen(true)
        }
      }
    })

    void window.api.game.getState()
      .then(value => {
        if (alive && !changed) setState(value)
      })
      .catch(() => {})

    const unsubscribeAuth = window.api.auth.onChanged(value => {
      if (
        alive &&
        value.status === 'signedIn' &&
        value.profile
      ) {
        setLoginOpen(false)
      }
    })

    return () => {
      alive = false
      unsubscribe()
      unsubscribeAuth()
    }
  }, [])

  const busy = checking || [
    'preparing',
    'installing',
    'starting',
    'running',
    'cancelling'
  ].includes(state.status)

  async function start(profile: GameProfile, server?: string) {
    if (lock.current || busy) return

    lock.current = true
    setChecking(true)
    setError(null)

    try {
      const auth = await window.api.auth.getState()

      if (auth.status !== 'signedIn' || !auth.profile) {
        setLoginOpen(true)
        return
      }

      const result = await window.api.game.start(profile, server)

      if (!result.ok) {
        if (
          result.code === 'AUTH_REQUIRED' ||
          result.code === 'APP_ACCESS_REQUIRED'
        ) {
          setLoginOpen(true)
        } else {
          setError(result.code)
        }
      }
    } catch {
      setError('LAUNCH_FAILED')
    } finally {
      lock.current = false
      setChecking(false)
    }
  }

  return {
    state,
    busy,
    checking,
    start,
    loginOpen,
    closeLogin: () => setLoginOpen(false),
    error,
    setError
  }
}

type Launcher = ReturnType<typeof useGameLauncher>

const phases: Record<GamePhase, [string, string]> = {
  none: ['', ''],
  auth: ['계정 확인', 'Checking account'],
  metadata: ['게임 버전 확인', 'Checking game version'],
  java: ['Java 준비', 'Preparing Java'],
  game: ['게임 파일 준비', 'Preparing game files'],
  loader: ['모드로더 설치', 'Installing mod loader'],
  assets: ['게임 리소스 준비', 'Preparing game assets'],
  launch: ['Minecraft 실행', 'Starting Minecraft']
}

const messages: Record<GameCode, [string, string]> = {
  AUTH_REQUIRED: [
    '로그인 후 이용 가능합니다.',
    'Please sign in to continue.'
  ],
  APP_ACCESS_REQUIRED: [
    '로그인 후 이용 가능합니다.',
    'Please sign in to continue.'
  ],
  INVALID_PROFILE: [
    '프로필 설정을 확인해 주세요.',
    'Check profile settings.'
  ],
  INVALID_SERVER: [
    '서버 주소를 확인해 주세요.',
    'Check the server address.'
  ],
  BUSY: [
    '이미 설치 또는 실행 중입니다.',
    'An installation or game is already running.'
  ],
  ALREADY_RUNNING: [
    '이 프로필의 Minecraft가 이미 실행 중입니다.',
    'Minecraft is already running for this profile.'
  ],
  JAVA_REQUIRED: [
    '필요한 Java를 자동으로 준비하지 못했습니다. Java 실행 파일을 선택해 주세요.',
    'Select the required Java executable.'
  ],
  JAVA_INVALID: [
    '필요한 버전의 Java 실행 파일을 선택해 주세요.',
    'Choose a Java executable with the required version.'
  ],
  DOWNLOAD_FAILED: [
    '파일을 다운로드하지 못했습니다. 연결 상태를 확인하고 다시 실행해 주세요.',
    'Download failed. Check your connection and try again.'
  ],
  INSTALL_FAILED: [
    '게임 또는 로더 설치를 완료하지 못했습니다. 다시 시도해 주세요.',
    'Game or loader installation failed. Try again.'
  ],
  LAUNCH_FAILED: [
    'Minecraft를 실행하지 못했습니다. 로그 폴더를 확인해 주세요.',
    'Could not start Minecraft. Check the log folder.'
  ],
  GAME_EXITED: [
    'Minecraft가 오류로 종료됐습니다. 로그 폴더를 확인해 주세요.',
    'Minecraft exited with an error. Check the log folder.'
  ],
  CANCELLED: [
    '설치를 취소했습니다. 다시 실행하면 이어서 확인합니다.',
    'Installation cancelled. Launch again to resume checking files.'
  ],
  OPEN_FAILED: [
    '로그 폴더를 열지 못했습니다.',
    'Could not open the log folder.'
  ]
}

export default function GameLaunchPanel({
  launcher,
  ko
}: {
  launcher: Launcher
  ko: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return

    if (launcher.loginOpen && !element.open) element.showModal()
    if (!launcher.loginOpen && element.open) element.close()
  }, [launcher.loginOpen])

  const index = ko ? 0 : 1
  const state = launcher.state
  const code = launcher.error ?? state.code

  const active =
    launcher.busy ||
    state.status === 'error' ||
    !!code

  async function cancel() {
    try {
      await window.api.game.cancel()
    } catch {
      launcher.setError('INSTALL_FAILED')
    }
  }

  async function chooseJava() {
    try {
      const result = await window.api.game.chooseJava()
      if (!result.ok) launcher.setError(result.code)
      else launcher.setError(null)
    } catch {
      launcher.setError('JAVA_INVALID')
    }
  }

  async function openLog() {
    try {
      const result = await window.api.game.openLog()
      if (!result.ok) launcher.setError(result.code)
    } catch {
      launcher.setError('OPEN_FAILED')
    }
  }

  return (
    <>
      {active && (
        <section
          className={
            state.status === 'error' || launcher.error
              ? 'error'
              : 'notice'
          }
          aria-live="polite"
          style={{ marginBottom: 20 }}
        >
          <strong>
            {state.profileName ? `${state.profileName} · ` : ''}
            {state.status === 'running'
              ? ko ? 'Minecraft 실행 중' : 'Minecraft is running'
              : state.status === 'cancelling'
                ? ko ? '취소하는 중…' : 'Cancelling…'
                : launcher.checking
                  ? ko ? '로그인 확인 중…' : 'Checking sign-in…'
                  : phases[state.phase][index]}
          </strong>

          {code && (
            <p>
              {messages[code][index]}
              {state.javaMajor ? ` (Java ${state.javaMajor})` : ''}
              {state.exitCode != null ? ` · ${state.exitCode}` : ''}
            </p>
          )}

          {state.status === 'installing' && state.total > 0 && (
            <div>
              <progress
                max={state.total}
                value={Math.min(state.downloaded, state.total)}
                style={{ width: '100%', accentColor: '#43d9a0' }}
              />
              <small>
                {(state.downloaded / 1048576).toFixed(1)} /{' '}
                {(state.total / 1048576).toFixed(1)} MB
              </small>
            </div>
          )}

          <div className="button-row">
            {['preparing', 'installing', 'starting'].includes(state.status) && (
              <button
                className="ghost"
                type="button"
                onClick={() => { void cancel() }}
              >
                {ko ? '설치 취소' : 'Cancel installation'}
              </button>
            )}

            {state.javaMajor && !launcher.busy && (
              <button
                className="ghost"
                type="button"
                onClick={() => { void chooseJava() }}
              >
                {ko ? 'Java 실행 파일 선택' : 'Choose Java executable'}
              </button>
            )}

            {state.profileId && (
              <button
                className="ghost"
                type="button"
                onClick={() => { void openLog() }}
              >
                {ko ? '로그 폴더 열기' : 'Open log folder'}
              </button>
            )}
          </div>
        </section>
      )}

      <dialog
        ref={dialog}
        className="moru-login-required"
        aria-labelledby="login-required-title"
        onCancel={event => {
          event.preventDefault()
          launcher.closeLogin()
        }}
        onClick={event => {
          if (event.target === event.currentTarget) {
            launcher.closeLogin()
          }
        }}
      >
        <style>{`
          .moru-login-required {
            margin: auto;
            inset: 0;
            width: min(430px, 92vw);
            padding: 28px;
            border: 1px solid #41614f;
            border-radius: 18px;
            background: #15231c;
            color: #edf5f1;
            font: inherit;
          }
          .moru-login-required::backdrop {
            background: #050b09bd;
            backdrop-filter: blur(5px);
          }
          .moru-login-required h2 {
            margin: 0 0 14px;
            font-size: 22px;
          }
          .moru-login-required p {
            color: #a9c3b3;
            line-height: 1.8;
          }
          .moru-login-required .button-row {
            justify-content: flex-end;
          }
        `}</style>

        <h2 id="login-required-title">
          {ko ? '로그인이 필요한 기능입니다.' : 'Sign-in required'}
        </h2>

        <p>
          {ko
            ? 'Microsoft 계정으로 로그인 후 이용해 주세요.'
            : 'Please sign in with your Microsoft account to continue.'}
        </p>

        <div className="button-row">
          <button
            type="button"
            className="ghost"
            onClick={() => launcher.closeLogin()}
          >
            {ko ? '취소' : 'Cancel'}
          </button>

          <button
            type="button"
            className="action-button"
            onClick={() => {
              dialog.current?.close()
              launcher.closeLogin()

              const account = document.querySelector<HTMLButtonElement>(
                '.moru-account-trigger'
              )

              if (account) account.click()
              else launcher.setError('AUTH_REQUIRED')
            }}
          >
            {ko ? '로그인하기' : 'Sign in'}
          </button>
        </div>
      </dialog>
    </>
  )
}