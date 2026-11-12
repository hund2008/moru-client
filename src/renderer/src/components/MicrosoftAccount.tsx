import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import type {
  AuthCode,
  AuthStage,
  AuthState
} from '../../../shared/auth'

const errors: Record<AuthCode, [string, string]> = {
  CLIENT_ID_MISSING: [
    '.env.local에 MORU_MICROSOFT_CLIENT_ID를 설정한 뒤 앱을 다시 실행해 주세요.',
    'Set MORU_MICROSOFT_CLIENT_ID in .env.local and restart the app.'
  ],
  STORAGE_UNAVAILABLE: [
    '이 PC의 안전한 자격 증명 저장소를 사용할 수 없습니다. 평문으로 저장하지 않았습니다.',
    'Secure credential storage is unavailable. Nothing was stored in plaintext.'
  ],
  STORAGE_FAILED: [
    '로그인 정보 저장 또는 삭제에 실패했습니다. 앱 폴더 접근 권한을 확인해 주세요.',
    'Could not save or delete credentials. Check app data folder permissions.'
  ],
  CACHE_INVALID: [
    '저장된 로그인 정보를 읽지 못했습니다. 로그아웃한 뒤 다시 로그인해 주세요.',
    'Could not read saved credentials. Sign out, then sign in again.'
  ],
  CANCELLED: [
    '로그인을 취소했습니다.',
    'Sign-in cancelled.'
  ],
  TIMEOUT: [
    '로그인 시간이 초과됐습니다. 다시 시도해 주세요.',
    'Sign-in timed out. Please try again.'
  ],
  OAUTH_CONFIG: [
    'Microsoft 앱 등록 설정을 확인해 주세요. 개인 계정 지원과 모바일/데스크톱 리디렉션 http://localhost가 필요합니다.',
    'Check app registration: personal accounts and a mobile/desktop http://localhost redirect are required.'
  ],
  OAUTH_DENIED: [
    'Microsoft 로그인이 취소되었거나 권한 동의가 거부됐습니다.',
    'Microsoft sign-in was cancelled or consent was denied.'
  ],
  REAUTH_REQUIRED: [
    '로그인이 만료되었거나 다시 확인이 필요합니다. Microsoft 로그인으로 다시 연결해 주세요.',
    'Your session needs verification. Sign in with Microsoft again.'
  ],
  NETWORK: [
    '인증 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.',
    'Could not reach the authentication service. Check your connection.'
  ],
  XBOX_PROFILE_REQUIRED: [
    '이 계정의 Xbox 프로필을 먼저 생성한 뒤 다시 로그인해 주세요.',
    'Create an Xbox profile for this account, then try again.'
  ],
  XBOX_CHILD_ACCOUNT: [
    'Xbox 가족 설정이나 보호자 승인이 필요합니다. Microsoft 가족 설정을 확인해 주세요.',
    'Xbox family settings or parental approval are required. Check Microsoft family settings.'
  ],
  XBOX_RESTRICTED: [
    'Xbox 계정의 지역·연령 확인 또는 계정 제한 때문에 연결하지 못했습니다.',
    'Xbox account restrictions, region, or age verification prevented sign-in.'
  ],
  APP_ACCESS_REQUIRED: [
    'Minecraft Services가 MORU의 앱 등록을 거부했습니다. 개발자의 앱 접근 권한·승인 상태를 확인해야 합니다.',
    'Minecraft Services rejected MORU’s app registration. The developer must check app access or approval.'
  ],
  SERVICE_FORBIDDEN: [
    '서비스에서 접근을 거부했습니다. 이 오류만으로 미구매나 앱 승인 문제라고 단정할 수 없습니다.',
    'The service denied access. This alone does not establish an ownership or app approval problem.'
  ],
  NOT_OWNED: [
    '이 계정에서 Minecraft Java Edition 이용 권한을 확인하지 못했습니다. 구매 또는 이용권이 있는 계정인지 확인해 주세요.',
    'No Minecraft Java Edition entitlement was found. Check the account that holds your purchase or subscription.'
  ],
  PROFILE_MISSING: [
    'Minecraft Java 프로필이 없습니다. 공식 Minecraft 사이트에서 Java 프로필 설정을 완료해 주세요.',
    'No Minecraft Java profile was found. Finish Java profile setup on the official Minecraft site.'
  ],
  SERVICE_ERROR: [
    '인증 서비스 응답을 처리하지 못했습니다. 아래 단계와 오류 코드를 확인해 주세요.',
    'Could not process the authentication response. Check the stage and error code below.'
  ]
}

const stages: Record<AuthStage, [string, string]> = {
  idle: ['대기', 'Idle'],
  microsoft: [
    'Microsoft 로그인',
    'Microsoft sign-in'
  ],
  xbox: [
    'Xbox Live 인증',
    'Xbox Live authentication'
  ],
  xsts: [
    'XSTS 인증',
    'XSTS authentication'
  ],
  minecraft: [
    'Minecraft Services 인증',
    'Minecraft Services authentication'
  ],
  ownership: [
    'Java Edition 이용 권한 확인',
    'Checking Java Edition entitlement'
  ],
  profile: [
    'Minecraft 프로필 조회',
    'Loading Minecraft profile'
  ],
  storage: [
    '안전한 로그인 정보 저장',
    'Secure credential storage'
  ]
}

const emptyState: AuthState = {
  status: 'signedOut',
  stage: 'idle',
  profile: null,
  error: null
}

function SkinFace({
  skin,
  name
}: {
  skin: string | null
  name: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    if (
      !skin ||
      !skin.startsWith('data:image/png;base64,')
    ) {
      return
    }

    const image = new Image()

    image.onload = () => {
      if (
        cancelled ||
        image.width !== 64 ||
        (
          image.height !== 64 &&
          image.height !== 32
        )
      ) {
        return
      }

      const context =
        canvas.current?.getContext('2d')

      if (!context) return

      context.clearRect(0, 0, 8, 8)
      context.imageSmoothingEnabled = false

      context.drawImage(
        image,
        8, 8, 8, 8,
        0, 0, 8, 8
      )

      context.drawImage(
        image,
        40, 8, 8, 8,
        0, 0, 8, 8
      )

      setReady(true)
    }

    image.src = skin

    return () => {
      cancelled = true
      image.onload = null
    }
  }, [skin])

  return (
    <span
      className="moru-account-face"
      aria-hidden="true"
    >
      <canvas
        ref={canvas}
        width={8}
        height={8}
        style={{
          display: ready ? 'block' : 'none'
        }}
      />
      {!ready && name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function MicrosoftAccount() {
  const [target, setTarget] =
    useState<Element | null>(null)

  const [state, setState] =
    useState<AuthState>(emptyState)

  const [ko, setKo] = useState(
    document.documentElement.lang !== 'en'
  )

  const [working, setWorking] = useState(false)
  const [ipcError, setIpcError] = useState(false)

  const dialog = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    setTarget(
      document.querySelector('#root .moru .topbar')
    )

    const observer = new MutationObserver(() =>
      setKo(
        document.documentElement.lang !== 'en'
      )
    )

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    let changed = false

    const unsubscribe =
      window.api.auth.onChanged(next => {
        changed = true
        if (alive) setState(next)
      })

    void window.api.auth
      .getState()
      .then(next => {
        if (alive && !changed) setState(next)
      })
      .catch(() => {
        if (alive) setIpcError(true)
      })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function action(
    kind: 'login' | 'refresh' | 'logout'
  ) {
    if (working) return

    setWorking(true)
    setIpcError(false)

    if (!dialog.current?.open) {
      dialog.current?.showModal()
    }

    try {
      setState(await window.api.auth[kind]())
    } catch {
      setIpcError(true)
    } finally {
      setWorking(false)
    }
  }

  const index = ko ? 0 : 1
  const signedIn =
    state.status === 'signedIn' && state.profile

  const busy = state.status === 'signingIn'

  if (!target) return null

  return createPortal(
    <div className="moru-account">
      <style>{`
        .topbar > .microsoft-account {
          display: none;
        }
        .moru-account-trigger {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 13px;
          color: #c7ddd2;
          background: #172420;
          border: 1px solid #30483f;
          border-radius: 11px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
        }
        .moru-account-face {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          overflow: hidden;
          background: #294c3d;
          color: #83e8b9;
        }
        .moru-account-face canvas {
          width: 32px;
          height: 32px;
          image-rendering: pixelated;
        }
        .moru-account-dialog {
          width: min(520px, 90vw);
          max-height: 80vh;
          overflow: auto;
          color: #edf5f1;
          background: #152720;
          border: 1px solid #456957;
          border-radius: 16px;
          padding: 24px;
          font: inherit;
        }
        .moru-account-dialog::backdrop {
          background: #0009;
        }
        .moru-account-dialog p {
          line-height: 1.7;
          overflow-wrap: anywhere;
        }
        .moru-account-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 20px;
        }
        .moru-account-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .moru-account-dialog button:disabled {
          opacity: .5;
          cursor: default;
        }
        .moru-account-error {
          color: #ffaaaa;
        }
      `}</style>

      <button
        type="button"
        className="moru-account-trigger"
        onClick={() => {
          if (state.status === 'signedOut') {
            void action('login')
          } else if (!dialog.current?.open) {
            dialog.current?.showModal()
          }
        }}
      >
        {signedIn ? (
          <>
            <SkinFace
              skin={signedIn.skin}
              name={signedIn.name}
            />
            <span>{signedIn.name}</span>
          </>
        ) : (
          <>
            <span
              className="microsoft-mark"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>
              {busy
                ? ko
                  ? '로그인 확인 중…'
                  : 'Signing in…'
                : ko
                  ? 'Microsoft 로그인'
                  : 'Microsoft sign-in'}
            </span>
          </>
        )}
      </button>

      <dialog
        ref={dialog}
        className="moru-account-dialog"
        aria-label={
          ko ? 'Microsoft 계정' : 'Microsoft account'
        }
      >
        <h2>
          {ko ? 'Microsoft 계정' : 'Microsoft account'}
        </h2>

        {signedIn && (
          <div className="moru-account-profile">
            <SkinFace
              skin={signedIn.skin}
              name={signedIn.name}
            />
            <strong>{signedIn.name}</strong>
          </div>
        )}

        {signedIn && (
          <p>
            {ko
              ? 'Minecraft Java Edition 이용 권한과 프로필을 확인했습니다.'
              : 'Minecraft Java Edition entitlement and profile verified.'}
          </p>
        )}

        {busy && (
          <p role="status">
            {stages[state.stage][index]}…
          </p>
        )}

        {state.status === 'signedOut' && (
          <p>
            {ko
              ? '기본 웹브라우저에서 Microsoft 계정으로 로그인합니다.'
              : 'Sign in with Microsoft in your default browser.'}
          </p>
        )}

        {state.error && (
          <div
            className="moru-account-error"
            role="alert"
          >
            <p>{errors[state.error.code][index]}</p>
            <p>
              {stages[state.error.stage][index]}
              {' · '}
              {state.error.code}
              {state.error.httpStatus
                ? ` · HTTP ${state.error.httpStatus}`
                : ''}
              {state.error.xboxCode
                ? ` · Xbox ${state.error.xboxCode}`
                : ''}
            </p>
          </div>
        )}

        {ipcError && (
          <p
            className="moru-account-error"
            role="alert"
          >
            {ko
              ? '앱과 인증 프로세스의 연결에 실패했습니다. 앱을 다시 실행해 주세요.'
              : 'Could not contact the authentication process. Restart the app.'}
          </p>
        )}

        <div className="moru-account-actions">
          {!busy && !signedIn && (
            <button
              type="button"
              className="secondary-button"
              disabled={working}
              onClick={() => {
                void action('login')
              }}
            >
              {ko
                ? 'Microsoft 로그인'
                : 'Sign in with Microsoft'}
            </button>
          )}

          {signedIn && (
            <button
              type="button"
              className="secondary-button"
              disabled={working}
              onClick={() => {
                void action('refresh')
              }}
            >
              {ko ? '계정 갱신' : 'Refresh account'}
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            disabled={working && !busy}
            onClick={() => {
              if (busy) {
                void window.api.auth
                  .logout()
                  .then(setState)
                  .catch(() => setIpcError(true))
              } else {
                void action('logout')
              }
            }}
          >
            {busy
              ? ko
                ? '로그인 취소'
                : 'Cancel sign-in'
              : ko
                ? '로그아웃'
                : 'Sign out'}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              dialog.current?.close()
            }
          >
            {ko ? '닫기' : 'Close'}
          </button>
        </div>

        <p className="muted">
          {ko
            ? '로그아웃은 MORU에 저장된 연결을 해제합니다. 브라우저의 Microsoft 로그인은 유지됩니다.'
            : 'Signing out clears MORU’s saved connection. Your browser’s Microsoft session remains.'}
        </p>
      </dialog>
    </div>,
    target
  )
}