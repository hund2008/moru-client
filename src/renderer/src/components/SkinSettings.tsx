import {
  useEffect,
  useRef,
  useState
} from 'react'
import { SkinViewer } from 'skinview3d'
import type { Language } from '../locales'
import type { AuthState } from '../../../shared/auth'
import type {
  SkinError,
  SkinSelection,
  SkinVariant
} from '../../../shared/customization'

const messages: Record<SkinError, [string, string]> = {
  AUTH_REQUIRED: [
    '스킨을 적용하려면 Minecraft 계정을 연결해 주세요.',
    'Connect your Minecraft account to apply a skin.'
  ],
  INVALID_PNG: [
    '64×64 또는 64×32 크기의 올바른 PNG 스킨을 선택해 주세요.',
    'Choose a valid 64×64 or 64×32 PNG skin.'
  ],
  PNG_TOO_LARGE: [
    '1MB 이하의 PNG 스킨을 선택해 주세요.',
    'Choose a PNG skin no larger than 1 MB.'
  ],
  LEGACY_SLIM: [
    '64×32 스킨은 일반형만 지원합니다. 슬림형은 64×64 스킨을 사용해 주세요.',
    '64×32 skins support Classic only. Use a 64×64 skin for Slim.'
  ],
  NO_SELECTION: [
    'PNG 스킨 파일을 다시 선택해 주세요.',
    'Please select the PNG skin again.'
  ],
  RATE_LIMIT: [
    '변경 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    'Too many changes. Please try again later.'
  ],
  APP_ACCESS_REQUIRED: [
    'Minecraft Services 앱 접근 승인이 필요합니다. 미리보기는 사용할 수 있습니다.',
    'Minecraft Services app access approval is required. Preview is still available.'
  ],
  FORBIDDEN: [
    'Minecraft Services가 스킨 변경을 허용하지 않았습니다.',
    'Minecraft Services did not allow the skin change.'
  ],
  UPLOAD_FAILED: [
    '스킨을 적용하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    'Could not apply the skin. Please try again later.'
  ],
  NETWORK: [
    'Minecraft Services에 연결하지 못했습니다.',
    'Could not connect to Minecraft Services.'
  ],
  FILE_READ_FAILED: [
    '스킨 파일을 읽지 못했습니다.',
    'Could not read the skin file.'
  ],
  BUSY: [
    '스킨을 적용하고 있습니다. 잠시 기다려 주세요.',
    'A skin change is already in progress.'
  ]
}

export default function SkinSettings({
  language
}: {
  language: Language
}) {
  const ko = language === 'ko'

  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const viewer = useRef<SkinViewer | null>(null)

  const [auth, setAuth] =
    useState<AuthState | null>(null)

  const [selection, setSelection] =
    useState<SkinSelection | null>(null)

  const [variant, setVariant] =
    useState<SkinVariant | null>(null)

  const [rotating, setRotating] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [previewError, setPreviewError] =
    useState(false)

  const [error, setError] =
    useState<SkinError | null>(null)

  const [authCode, setAuthCode] = useState('')

  const [success, setSuccess] = useState<
    'applied' | 'refreshFailed' | null
  >(null)

  const signedIn = auth?.status === 'signedIn'

  const skin =
    selection?.dataUrl ??
    auth?.profile?.skin ??
    null

  useEffect(() => {
    let alive = true
    let changed = false

    const unsubscribe =
      window.api.auth.onChanged(state => {
        changed = true
        if (alive) setAuth(state)
      })

    void window.api.auth
      .getState()
      .then(state => {
        if (alive && !changed) setAuth(state)
      })
      .catch(() => {
        if (alive) setError('AUTH_REQUIRED')
      })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!selection) setVariant(null)
  }, [auth?.profile?.skin, selection])

  useEffect(() => {
    if (!canvas.current || !container.current) {
      return
    }

    let instance: SkinViewer

    try {
      instance = new SkinViewer({
        canvas: canvas.current,
        width: Math.max(
          240,
          container.current.clientWidth
        ),
        height: 360,
        background: 0x101719
      })

      instance.zoom = 0.85
      instance.controls.enablePan = false
      instance.autoRotate = true
      viewer.current = instance
    } catch {
      setPreviewError(true)
      return
    }

    const observer = new ResizeObserver(() => {
      if (container.current) {
        instance.width = Math.max(
          240,
          container.current.clientWidth
        )
      }
    })

    observer.observe(container.current)

    return () => {
      observer.disconnect()
      instance.dispose()
      viewer.current = null
    }
  }, [])

  useEffect(() => {
    const instance = viewer.current

    if (!instance) return

    let cancelled = false

    setLoaded(false)
    instance.playerObject.visible = !!skin

    if (!skin) {
      instance.loadSkin(null)
      return
    }

    setPreviewError(false)

    void instance
      .loadSkin(skin, {
        model:
          variant === 'slim'
            ? 'slim'
            : variant === 'classic'
              ? 'default'
              : 'auto-detect'
      })
      .then(() => {
        if (cancelled) return

        setLoaded(true)

        if (variant === null) {
          setVariant(
            instance.playerObject.skin.modelType === 'slim'
              ? 'slim'
              : 'classic'
          )
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true)
      })

    return () => {
      cancelled = true
    }
  }, [skin, variant])

  useEffect(() => {
    if (viewer.current) {
      viewer.current.autoRotate = rotating
    }
  }, [rotating])

  async function choose() {
    if (busy) return

    setBusy(true)
    setError(null)
    setSuccess(null)
    setAuthCode('')

    try {
      const result = await window.api.skin.choose()

      if (!result.ok) {
        setError(result.code)
        return
      }

      if (!result.skin) return

      setSelection(result.skin)

      setVariant(
        result.skin.height === 32
          ? 'classic'
          : (variant ?? 'classic')
      )
    } catch {
      setError('FILE_READ_FAILED')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!selection || !variant || busy) return

    setBusy(true)
    setError(null)
    setSuccess(null)
    setAuthCode('')

    try {
      const result = await window.api.skin.apply(
        selection.id,
        variant
      )

      if (!result.ok) {
        setError(result.code)
        setAuthCode(result.authCode ?? '')
        return
      }

      setSuccess(
        result.refreshed
          ? 'applied'
          : 'refreshFailed'
      )
    } catch {
      setError('UPLOAD_FAILED')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="skin-settings">
      <style>{`
        .skin-settings {
          margin-top: 24px;
        }
        .skin-layout {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) minmax(230px, 1fr);
          gap: 24px;
          align-items: start;
        }
        .skin-preview {
          min-width: 0;
          position: relative;
          overflow: hidden;
          border: 1px solid #30483f;
          border-radius: 16px;
          background: #101719;
        }
        .skin-preview canvas {
          display: block;
          width: 100%;
          height: 360px;
          touch-action: none;
        }
        .skin-preview-note {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          text-align: center;
          pointer-events: none;
          color: #98aea4;
        }
        .skin-controls {
          display: grid;
          gap: 18px;
          min-width: 0;
        }
        .skin-variants {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          border: 0;
          padding: 0;
          margin: 0;
        }
        .skin-variants legend {
          margin-bottom: 12px;
          font-weight: 700;
        }
        .skin-variant {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border: 1px solid #365548;
          border-radius: 10px;
          cursor: pointer;
        }
        .skin-variant input {
          accent-color: #43d9a0;
        }
        .skin-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .skin-filename {
          overflow-wrap: anywhere;
          color: #b4d1c3;
        }
        @media (max-width: 950px) {
          .skin-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <h3>
        {ko ? '스킨 설정' : 'Skin settings'}
      </h3>

      <div className="skin-layout">
        <div>
          <div
            className="skin-preview"
            ref={container}
          >
            <canvas
              ref={canvas}
              aria-label={
                ko
                  ? 'Minecraft 스킨 3D 미리보기'
                  : 'Minecraft skin 3D preview'
              }
            />

            {!loaded && (
              <div className="skin-preview-note">
                {previewError
                  ? ko
                    ? '3D 미리보기를 표시하지 못했습니다.'
                    : 'Could not display the 3D preview.'
                  : skin
                    ? ko
                      ? '스킨 불러오는 중…'
                      : 'Loading skin…'
                    : ko
                      ? 'PNG 스킨을 선택하면 미리보기가 표시됩니다.'
                      : 'Choose a PNG skin to preview it.'}
              </div>
            )}
          </div>

          <p className="inline-note">
            {ko
              ? '드래그하여 회전 · 마우스 휠로 확대/축소'
              : 'Drag to rotate · Scroll to zoom'}
          </p>

          <button
            type="button"
            className="secondary-button"
            aria-pressed={rotating}
            onClick={() =>
              setRotating(value => !value)
            }
          >
            {rotating
              ? ko
                ? '자동 회전 끄기'
                : 'Stop rotation'
              : ko
                ? '자동 회전 켜기'
                : 'Auto-rotate'}
          </button>
        </div>

        <div className="skin-controls">
          <div>
            <strong>
              {ko ? '스킨 파일' : 'Skin file'}
            </strong>

            <p className="skin-filename">
              {selection?.name ??
                (
                  skin
                    ? ko
                      ? '현재 Minecraft 스킨'
                      : 'Current Minecraft skin'
                    : ko
                      ? '선택한 파일 없음'
                      : 'No file selected'
                )}
            </p>

            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void choose()
              }}
            >
              {ko
                ? 'PNG 스킨 선택'
                : 'Choose PNG skin'}
            </button>

            <p className="inline-note">
              {ko
                ? '64×64 PNG 권장 · 기존 64×32 PNG는 일반형만 지원 · 최대 1MB'
                : '64×64 PNG recommended · Legacy 64×32 supports Classic only · Maximum 1 MB'}
            </p>
          </div>

          <fieldset
            className="skin-variants"
            disabled={busy}
          >
            <legend>
              {ko ? '모델 유형' : 'Model type'}
            </legend>

            <label className="skin-variant">
              <input
                type="radio"
                name="moru-skin-model"
                value="classic"
                checked={variant === 'classic'}
                onChange={() => setVariant('classic')}
              />
              {ko
                ? '일반형 · Steve'
                : 'Classic · Steve'}
            </label>

            <label className="skin-variant">
              <input
                type="radio"
                name="moru-skin-model"
                value="slim"
                checked={variant === 'slim'}
                disabled={selection?.height === 32}
                onChange={() => setVariant('slim')}
              />
              {ko
                ? '슬림형 · Alex'
                : 'Slim · Alex'}
            </label>
          </fieldset>

          <div className="skin-actions">
            <button
              type="button"
              className="action-button"
              disabled={
                busy ||
                !selection ||
                !variant ||
                !signedIn
              }
              onClick={() => {
                void apply()
              }}
            >
              {busy
                ? ko
                  ? '처리 중…'
                  : 'Working…'
                : ko
                  ? 'Minecraft에 적용'
                  : 'Apply to Minecraft'}
            </button>
          </div>

          {!signedIn && (
            <p className="inline-note">
              {auth?.error?.code === 'APP_ACCESS_REQUIRED'
                ? messages.APP_ACCESS_REQUIRED[ko ? 0 : 1]
                : messages.AUTH_REQUIRED[ko ? 0 : 1]}
            </p>
          )}

          {error && (
            <p
              className="error"
              role="alert"
            >
              {messages[error][ko ? 0 : 1]}
              {authCode ? ` (${authCode})` : ''}
            </p>
          )}

          {success && (
            <p
              className="inline-note"
              role="status"
            >
              {success === 'applied'
                ? ko
                  ? 'Minecraft 계정에 스킨을 적용했습니다.'
                  : 'Skin applied to your Minecraft account.'
                : ko
                  ? '스킨 적용은 완료됐지만 계정 표시를 갱신하지 못했습니다. 나중에 계정을 다시 확인해 주세요.'
                  : 'Skin applied, but the account preview could not be refreshed. Check your account again later.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}