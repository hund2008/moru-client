import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import {
  currentTheme,
  setTheme,
  subscribeTheme,
  themes
} from '../theme'
import type { DesktopState } from '../../../shared/desktop'

export default function VideoSettings({
  ko
}: {
  ko: boolean
}) {
  const [size, setSize] = useState<DesktopState | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [themeSaved, setThemeSaved] = useState(true)

  const theme = useSyncExternalStore(
    subscribeTheme,
    currentTheme
  )

  const dirty = useRef(false)

  useEffect(() => {
    let alive = true
    let changed = false

    const update = (value: DesktopState) => {
      if (!alive) return

      setSize(value)

      if (!dirty.current) {
        setWidth(String(value.width))
        setHeight(String(value.height))
      }
    }

    const unsubscribe = window.api.desktop.onChanged(value => {
      changed = true
      update(value)
    })

    void window.api.desktop.getState()
      .then(value => {
        if (!changed) update(value)
      })
      .catch(() => {
        if (alive) {
          setFailed(true)
          setMessage(
            ko
              ? '창 정보를 읽지 못했습니다. 설정을 다시 열어 주세요.'
              : 'Could not read window size. Reopen settings.'
          )
        }
      })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [ko])

  async function apply(reset: boolean) {
    if (busy || !size) return

    const w = Number(width)
    const h = Number(height)

    setMessage('')
    setFailed(false)

    if (
      !reset &&
      (
        !/^\d+$/.test(width) ||
        !/^\d+$/.test(height) ||
        !Number.isSafeInteger(w) ||
        !Number.isSafeInteger(h) ||
        w < size.minWidth ||
        h < size.minHeight ||
        w > size.maxWidth ||
        h > size.maxHeight
      )
    ) {
      setFailed(true)
      setMessage(
        ko
          ? '화면에 표시된 범위 안에서 너비와 높이를 입력해 주세요.'
          : 'Enter a width and height within the displayed range.'
      )
      return
    }

    setBusy(true)

    try {
      const result = reset
        ? await window.api.desktop.resetSize()
        : await window.api.desktop.applySize(w, h)

      if (!result.ok) {
        setFailed(true)
        setMessage(
          ko
            ? result.code === 'INVALID_SIZE'
              ? '현재 화면에 맞는 창 크기를 입력해 주세요.'
              : '설정을 저장하지 못했습니다. 다시 시도해 주세요.'
            : result.code === 'INVALID_SIZE'
              ? 'Enter a size that fits this display.'
              : 'Could not save settings. Try again.'
        )
        return
      }

      dirty.current = false
      setSize(result.state)
      setWidth(String(result.state.width))
      setHeight(String(result.state.height))

      setMessage(
        ko
          ? '창 크기를 적용했습니다. 다음 실행에도 유지됩니다.'
          : 'Window size applied and saved for the next launch.'
      )
    } catch {
      setFailed(true)
      setMessage(
        ko
          ? '창 크기를 변경하지 못했습니다.'
          : 'Could not resize the window.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="moru-video-settings">
      <style>{`
        .moru-video-settings {
          display: grid;
          gap: 16px;
          line-height: 1.7;
        }

        .moru-video-settings .video-card {
          padding: 18px;
          border: 1px solid var(--moru-border, #2c4135);
          border-radius: 14px;
          background: var(--moru-panel, #17271f);
          min-width: 0;
        }

        .moru-video-settings h4 {
          margin: 0 0 10px;
          color: var(--moru-text, #edf5f1);
        }

        .moru-video-settings p {
          margin: 8px 0;
        }

        .moru-video-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin: 20px 0 12px;
        }

        .moru-video-fields label {
          display: grid;
          gap: 10px;
          color: var(--moru-muted, #bbd2c4);
          font-size: 13px;
        }

        .moru-video-fields input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid var(--moru-border, #3c5949);
          border-radius: 10px;
          background: var(--moru-input, #0e1913);
          color: var(--moru-text, #edf5f1);
          font: inherit;
        }

        .moru-video-settings small {
          display: block;
          color: var(--moru-muted, #98aea4);
          line-height: 1.7;
        }

        .moru-video-settings .button-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .moru-theme-options {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(140px, 1fr)
          );
          gap: 12px;
          margin: 18px 0;
          padding: 0;
          border: 0;
          min-width: 0;
        }

        .moru-theme-options legend {
          padding: 0;
          color: var(--moru-muted, #98aea4);
          font-size: 12px;
        }

        .moru-theme-choice {
          position: relative;
          display: grid;
          gap: 12px;
          padding: 14px;
          border: 1px solid var(--moru-border, #3c5949);
          border-radius: 12px;
          background: var(--moru-input, #0e1913);
          color: var(--moru-text, #edf5f1);
          cursor: pointer;
          min-width: 0;
        }

        .moru-theme-choice.is-selected {
          border-color: var(--moru-accent, #49d9a0);
          box-shadow:
            0 0 0 1px var(--moru-accent, #49d9a0);
        }

        .moru-theme-choice:focus-within {
          outline:
            2px solid var(--moru-accent, #49d9a0);
          outline-offset: 3px;
        }

        .moru-theme-choice input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
        }

        .moru-theme-colors {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .moru-theme-colors > span {
          width: 25px;
          height: 25px;
          border-radius: 50%;
          border: 1px solid #ffffff30;
          flex-shrink: 0;
        }

        .moru-theme-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          font-size: 12px;
        }

        .moru-theme-check {
          color: var(--moru-accent, #49d9a0);
          font-size: 16px;
        }

        @media (max-width: 650px) {
          .moru-video-fields {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="video-card">
        <h4>
          {ko ? '클라이언트 창 크기' : 'Client window size'}
        </h4>

        <p className="muted">
          {ko
            ? '처음 실행할 때는 16:9 비율의 1280 × 720으로 열립니다. 변경한 크기는 다음 실행에도 유지됩니다.'
            : 'The default is 1280 × 720 (16:9). Your custom size is saved for future launches.'}
        </p>

        <form
          onSubmit={event => {
            event.preventDefault()
            void apply(false)
          }}
        >
          <div className="moru-video-fields">
            <label htmlFor="moru-window-width">
              {ko ? '너비 (px)' : 'Width (px)'}

              <input
                id="moru-window-width"
                type="number"
                step={1}
                min={size?.minWidth}
                max={size?.maxWidth}
                required
                value={width}
                disabled={!size || busy}
                onChange={event => {
                  dirty.current = true
                  setWidth(event.target.value)
                  setMessage('')
                }}
              />
            </label>

            <label htmlFor="moru-window-height">
              {ko ? '높이 (px)' : 'Height (px)'}

              <input
                id="moru-window-height"
                type="number"
                step={1}
                min={size?.minHeight}
                max={size?.maxHeight}
                required
                value={height}
                disabled={!size || busy}
                onChange={event => {
                  dirty.current = true
                  setHeight(event.target.value)
                  setMessage('')
                }}
              />
            </label>
          </div>

          {size && (
            <small>
              {ko
                ? `입력 범위: 너비 ${size.minWidth}~${size.maxWidth}px · 높이 ${size.minHeight}~${size.maxHeight}px`
                : `Width ${size.minWidth}–${size.maxWidth}px · Height ${size.minHeight}–${size.maxHeight}px`}
            </small>
          )}

          <div className="button-row">
            <button
              type="submit"
              className="action-button"
              disabled={!size || busy}
            >
              {ko
                ? busy ? '적용 중…' : '적용'
                : busy ? 'Applying…' : 'Apply'}
            </button>

            <button
              type="button"
              className="ghost"
              disabled={!size || busy}
              onClick={() => {
                void apply(true)
              }}
            >
              {ko ? '16:9 기본 크기' : 'Reset to 16:9'}
            </button>
          </div>
        </form>

        <p className="inline-note">
          {ko
            ? '현재 모니터의 작업 영역보다 크게 설정할 수 없습니다. 작은 화면에서는 기본 크기를 16:9로 줄입니다.'
            : 'The window must fit the current display work area. Defaults scale down in 16:9 on smaller displays.'}
        </p>

        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={failed ? 'error' : 'notice'}
          >
            {message}
          </p>
        )}
      </div>

      <div className="video-card">
        <h4>{ko ? '테마 색상' : 'Theme colors'}</h4>

        <p className="muted">
          {ko
            ? '색상을 선택하면 바로 적용됩니다. 선택한 테마는 다음 실행에도 유지됩니다.'
            : 'Choose a color to apply it immediately. Your selection is saved for the next launch.'}
        </p>

        <fieldset className="moru-theme-options">
          <legend>
            {ko ? '원하는 테마 선택' : 'Choose a theme'}
          </legend>

          {themes.map(value => (
            <label
              key={value.id}
              className={
                `moru-theme-choice ${
                  theme === value.id ? 'is-selected' : ''
                }`
              }
            >
              <input
                type="radio"
                name="moru-theme"
                value={value.id}
                checked={theme === value.id}
                onChange={() => {
                  setThemeSaved(setTheme(value.id))
                }}
              />

              <span
                className="moru-theme-colors"
                aria-hidden="true"
              >
                <span
                  style={{ background: value.background }}
                />
                <span
                  style={{ background: value.panel }}
                />
                <span
                  style={{ background: value.accent }}
                />
              </span>

              <span className="moru-theme-name">
                <span>{ko ? value.ko : value.en}</span>
                <span
                  className="moru-theme-check"
                  aria-hidden="true"
                >
                  {theme === value.id ? '✓' : ''}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          className="ghost"
          onClick={() => {
            setThemeSaved(setTheme('mint'))
          }}
        >
          {ko
            ? '기본 테마로 복원'
            : 'Restore default theme'}
        </button>

        <p className="inline-note">
          {ko
            ? '삭제와 오류 경고는 테마와 관계없이 빨간색으로 표시됩니다.'
            : 'Deletion and error warnings stay red in every theme.'}
        </p>

        {!themeSaved && (
          <p className="error" role="alert">
            {ko
              ? '테마는 적용했지만 저장하지 못했습니다. 현재 실행에서만 유지됩니다.'
              : 'Theme applied, but could not be saved. It will only last for this session.'}
          </p>
        )}
      </div>
    </section>
  )
}