import { useEffect, useRef, useState } from 'react'
import { MoruSelect } from '../LauncherSupport'

export type ProfileDraft = {
  name: string
  version: string
  loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
  loaderVersion: string | null
  icon: string | null
}

type Entry = {
  version: string
  label: string
}

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (draft: ProfileDraft) => string | null
  ko: boolean
  releases: string[]
  loading: boolean
  releasesFailed: boolean
  initialVersion: string
}

export default function CreateProfileDialog({
  open,
  onClose,
  onCreate,
  ko,
  releases,
  loading,
  releasesFailed,
  initialVersion
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const imageRequest = useRef(0)

  const [name, setName] = useState('')
  const [version, setVersion] = useState(initialVersion)
  const [loader, setLoader] = useState<ProfileDraft['loader']>('vanilla')
  const [chosen, setChosen] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [catalog, setCatalog] = useState<{
    key: string
    versions: Entry[]
    failed: boolean
  } | null>(null)

  const game = releases.includes(version)
    ? version
    : releases.includes(initialVersion)
      ? initialVersion
      : releases[0] ?? ''

  const key = `${game}|${loader}|${retry}`
  const entries = catalog?.key === key ? catalog.versions : []
  const loaderBusy =
    open && loader !== 'vanilla' && !!game && catalog?.key !== key
  const loaderFailed = catalog?.key === key && catalog.failed

  const loaderVersion =
    loader === 'vanilla'
      ? null
      : entries.some((entry) => entry.version === chosen)
        ? chosen
        : entries[0]?.version ?? ''

  const canCreate =
    !loading &&
    !releasesFailed &&
    !!game &&
    !!name.trim() &&
    !imageBusy &&
    !loaderBusy &&
    !loaderFailed &&
    (loader === 'vanilla' || !!loaderVersion)

  useEffect(() => {
    const element = dialog.current
    if (!element) return

    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  useEffect(() => {
    if (!open) return

    setName('')
    setVersion(initialVersion)
    setLoader('vanilla')
    setChosen('')
    setIcon(null)
    setError('')
    setImageBusy(false)
    imageRequest.current++

    return () => {
      imageRequest.current++
    }
  }, [open, initialVersion])

  useEffect(() => {
    if (!open || loader === 'vanilla' || !game) return

    let cancelled = false

    void window.api
      .getLoaderVersions(game, loader)
      .then((versions) => {
        if (!cancelled) {
          setCatalog({ key, versions, failed: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog({ key, versions: [], failed: true })
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, game, loader, key])

  async function chooseImage(file?: File) {
    if (!file) return

    const request = ++imageRequest.current
    setError('')
    setImageBusy(true)

    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        throw new Error('IMAGE')
      }

      const bitmap = await createImageBitmap(file, {
        resizeWidth: 256,
        resizeQuality: 'high'
      })

      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 160

        const context = canvas.getContext('2d')
        if (!context) throw new Error('IMAGE')

        const side = Math.min(bitmap.width, bitmap.height)

        context.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          160,
          160
        )

        const data = canvas.toDataURL('image/webp', 0.8)
        if (data.length > 100000) throw new Error('IMAGE')

        if (request === imageRequest.current) {
          setIcon(data)
        }
      } finally {
        bitmap.close()
      }
    } catch {
      if (request === imageRequest.current) {
        setError(
          ko
            ? '이미지를 읽지 못했습니다. 5MB 이하의 PNG·JPG·WebP를 선택해 주세요.'
            : 'Choose a readable PNG, JPG or WebP under 5MB.'
        )
      }
    } finally {
      if (request === imageRequest.current) {
        setImageBusy(false)
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="moru-create-dialog"
      aria-labelledby="create-profile-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <style>{styles}</style>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!canCreate) return

          const failure = onCreate({
            name: name.trim().slice(0, 40),
            version: game,
            loader,
            loaderVersion,
            icon
          })

          if (failure) setError(failure)
          else onClose()
        }}
      >
        <header>
          <div>
            <small className="eyebrow">YOUR NEXT WORLD</small>
            <h2 id="create-profile-title">
              {ko ? '새 프로필 만들기' : 'Create a profile'}
            </h2>
          </div>

          <button
            type="button"
            className="ghost"
            aria-label={ko ? '닫기' : 'Close'}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="create-dialog-body">
          <div className="create-identity">
            <div className="create-icon-box">
              <button
                type="button"
                className="create-icon-picker"
                onClick={() => picker.current?.click()}
                aria-label={
                  ko ? '프로필 이미지 선택' : 'Choose profile image'
                }
              >
                {icon ? (
                  <img
                    src={icon}
                    alt={
                      ko
                        ? '프로필 이미지 미리보기'
                        : 'Profile image preview'
                    }
                  />
                ) : (
                  <span>◆</span>
                )}
              </button>

              <button
                type="button"
                className="ghost"
                onClick={() => picker.current?.click()}
              >
                {ko ? '이미지 선택' : 'Choose image'}
              </button>

              {icon && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    imageRequest.current++
                    setImageBusy(false)
                    setIcon(null)
                  }}
                >
                  {ko ? '기본 이미지' : 'Reset image'}
                </button>
              )}

              <input
                ref={picker}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void chooseImage(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>

            <label className="create-field">
              {ko ? '프로필 이름' : 'Profile name'}
              <input
                autoFocus
                required
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  ko
                    ? '예: 친구들과 생존'
                    : 'Example: Survival with friends'
                }
              />
              <small>
                {ko
                  ? '이미지는 선택 사항이며, 정사각형으로 저장됩니다.'
                  : 'An optional image will be saved as a square.'}
              </small>
            </label>
          </div>

          <label className="create-field">
            {ko
              ? 'Minecraft 버전 · 정식 릴리즈'
              : 'Minecraft release version'}
            <MoruSelect
              id="create-game-version"
              value={game}
              ariaLabel={ko ? 'Minecraft 버전' : 'Minecraft version'}
              disabled={loading || !releases.length}
              options={releases.map((value) => ({
                value,
                label: value
              }))}
              onChange={(value) => {
                setVersion(value)
                setChosen('')
                setError('')
              }}
            />
          </label>

          {loading && (
            <p className="muted" role="status">
              {ko ? '릴리즈 버전을 불러오는 중…' : 'Loading releases…'}
            </p>
          )}

          {releasesFailed && (
            <p className="error">
              {ko
                ? '릴리즈 목록을 불러오지 못했습니다. 앱을 다시 실행해 주세요.'
                : 'Could not load releases. Restart the app to retry.'}
            </p>
          )}

          <fieldset>
            <legend>{ko ? '모드로더' : 'Mod loader'}</legend>
            <div className="create-loader-grid">
              {(
                [
                  ['vanilla', 'Vanilla'],
                  ['fabric', 'Fabric'],
                  ['forge', 'Forge'],
                  ['neoforge', 'NeoForge']
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={loader === value ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name="profile-loader"
                    value={value}
                    checked={loader === value}
                    onChange={() => {
                      setLoader(value)
                      setChosen('')
                      setError('')
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="create-field">
            <label htmlFor="create-loader-version">
              {ko ? '모드로더 버전' : 'Loader version'}
            </label>

            {loader === 'vanilla' ? (
              <p className="create-vanilla">
                {ko
                  ? '필요 없음 · Minecraft 기본 실행'
                  : 'Not needed · Vanilla Minecraft'}
              </p>
            ) : (
              <>
                <MoruSelect
                  id="create-loader-version"
                  value={loaderVersion ?? ''}
                  ariaLabel={ko ? '모드로더 버전' : 'Loader version'}
                  disabled={
                    loaderBusy || loaderFailed || !entries.length
                  }
                  options={entries.map((entry) => ({
                    value: entry.version,
                    label: entry.label
                  }))}
                  onChange={setChosen}
                />

                {loaderBusy && (
                  <p className="muted" role="status">
                    {ko
                      ? '호환되는 로더 버전을 확인하는 중…'
                      : 'Checking compatible loader versions…'}
                  </p>
                )}

                {loaderFailed && (
                  <p className="error">
                    {ko
                      ? '로더 목록에 연결하지 못했습니다.'
                      : 'Could not reach the loader catalog.'}{' '}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      {ko ? '다시 시도' : 'Retry'}
                    </button>
                  </p>
                )}

                {!loaderBusy && !loaderFailed && !entries.length && (
                  <p className="muted">
                    {ko
                      ? '이 Minecraft 버전을 지원하는 로더가 없습니다. 다른 버전이나 로더를 선택해 주세요.'
                      : 'No compatible loader. Choose another Minecraft version or loader.'}
                  </p>
                )}
              </>
            )}
          </div>

          {imageBusy && (
            <p className="muted" role="status">
              {ko ? '이미지를 준비하는 중…' : 'Preparing image…'}
            </p>
          )}

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          <p className="inline-note">
            {ko
              ? '프로필 설정을 저장합니다. 게임과 로더의 실제 설치·실행은 실행 엔진 연결 후 사용할 수 있습니다.'
              : 'Saves profile settings. Game and loader installation require the launch engine.'}
          </p>
        </div>

        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            {ko ? '취소' : 'Cancel'}
          </button>

          <button
            type="submit"
            className="action-button"
            disabled={!canCreate}
          >
            {ko ? '프로필 만들기' : 'Create profile'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

const styles = `
.moru-create-dialog {
  margin: auto;
  inset: 0;
  padding: 0;
  width: min(660px, 94vw);
  max-width: none;
  max-height: 90vh;
  border: 1px solid #41614f;
  border-radius: 20px;
  background: #131e19;
  color: #edf5f1;
  font: inherit;
  overflow: visible;
}

.moru-create-dialog::backdrop {
  background: #050b09bd;
  backdrop-filter: blur(6px);
}

.moru-create-dialog > form {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.moru-create-dialog header,
.moru-create-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  flex-shrink: 0;
}

.moru-create-dialog header {
  border-bottom: 1px solid #2c4135;
}

.moru-create-dialog header h2 {
  margin: 8px 0 0;
  font-size: 23px;
}

.moru-create-dialog footer {
  justify-content: flex-end;
  border-top: 1px solid #2c4135;
}

.create-dialog-body {
  padding: 24px;
  overflow: auto;
  display: grid;
  gap: 22px;
  min-height: 0;
}

.create-identity {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: 24px;
  align-items: center;
}

.create-icon-box {
  display: grid;
  gap: 8px;
}

.create-icon-box > .ghost {
  padding: 7px;
  font-size: 12px;
}

.create-icon-picker {
  width: 136px;
  height: 136px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid #50755e;
  border-radius: 20px;
  overflow: hidden;
  background: #1d3d2d;
  color: #67e6ab;
  font-size: 46px;
}

.create-icon-picker img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.create-field {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #c1d5c9;
  min-width: 0;
}

.create-field > input {
  width: 100%;
  padding: 13px;
  border: 1px solid #3c5949;
  border-radius: 10px;
  background: #0d1812;
  color: #edf5f1;
}

.create-field small {
  font-size: 12px;
  color: #8fa999;
  line-height: 1.6;
}

.moru-create-dialog fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.moru-create-dialog legend {
  margin-bottom: 12px;
  font-size: 13px;
  color: #c1d5c9;
}

.create-loader-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.create-loader-grid label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 8px;
  border: 1px solid #355141;
  border-radius: 10px;
  color: #a6bfb0;
  font-size: 13px;
  cursor: pointer;
}

.create-loader-grid label.selected {
  border-color: #55d99c;
  background: #204332;
  color: #a4f3c9;
}

.create-loader-grid input {
  accent-color: #40d99b;
  margin: 0;
}

.create-vanilla {
  margin: 0;
  padding: 13px;
  border: 1px dashed #3c5949;
  border-radius: 10px;
  color: #9cb9a6;
  background: #101c15;
}

.create-dialog-body p {
  margin: 0;
  line-height: 1.7;
}

@media (max-width: 550px) {
  .create-loader-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .create-identity {
    grid-template-columns: 1fr;
  }

  .create-icon-box {
    justify-items: start;
  }

  .create-dialog-body {
    padding: 20px;
  }

  .moru-create-dialog header,
  .moru-create-dialog footer {
    padding: 16px 20px;
  }
}
`