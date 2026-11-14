import {
  useEffect,
  useLayoutEffect,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import type { DesktopState } from '../../../shared/desktop'

export default function WindowTitleBar() {
  const [state, setState] = useState<DesktopState | null>(null)
  const [target, setTarget] = useState<Element | null>(null)
  const [ko, setKo] = useState(
    document.documentElement.lang !== 'en'
  )

  useEffect(() => {
    let alive = true
    let changed = false

    const unsubscribe = window.api.desktop.onChanged(value => {
      changed = true
      if (alive) setState(value)
    })

    void window.api.desktop.getState()
      .then(value => {
        if (alive && !changed) setState(value)
      })
      .catch(() => {})

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const enabled = state
    ? state.platform === 'win32'
    : window.electron?.process?.platform === 'win32'

  useLayoutEffect(() => {
    if (!enabled) return

    document.documentElement.classList.add(
      'moru-has-caption'
    )

    const update = () => {
      const opened = Array.from(
        document.querySelectorAll('dialog[open]')
      )

      const active = document.activeElement?.closest(
        'dialog[open]'
      )

      setTarget(
        active ??
        opened[opened.length - 1] ??
        document.body
      )

      setKo(document.documentElement.lang !== 'en')
    }

    update()

    const observer = new MutationObserver(update)

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'lang']
    })

    document.addEventListener('focusin', update)

    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', update)

      document.documentElement.classList.remove(
        'moru-has-caption'
      )
    }
  }, [enabled])

  if (!enabled || !target) return null

  const restored = Boolean(
    state?.maximized || state?.fullscreen
  )

  return createPortal(
    <div className="moru-desktop-titlebar" role="banner">
      <style>{styles}</style>

      <div className="moru-caption-brand">
        <span aria-hidden="true">◆</span>
        <span>MORU <small>Client</small></span>
      </div>

      <div
        className="moru-caption-controls"
        role="group"
        aria-label={ko ? '창 제어' : 'Window controls'}
      >
        <button
          type="button"
          className="moru-caption-button"
          aria-label={
            ko
              ? restored ? '창 복원' : '창 최대화'
              : restored ? 'Restore window' : 'Maximize window'
          }
          title={
            ko
              ? restored ? '복원' : '최대화'
              : restored ? 'Restore' : 'Maximize'
          }
          onClick={() => {
            void window.api.desktop
              .toggleMaximize()
              .catch(() => {})
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {restored ? (
              <>
                <path d="M8 5h11v11" />
                <path d="M5 8h11v11H5z" />
              </>
            ) : (
              <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" />
            )}
          </svg>
        </button>

        <button
          type="button"
          className="moru-caption-button"
          aria-label={ko ? '창 최소화' : 'Minimize window'}
          title={ko ? '최소화' : 'Minimize'}
          onClick={() => {
            void window.api.desktop
              .minimize()
              .catch(() => {})
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>

        <button
          type="button"
          className="moru-caption-button moru-caption-close"
          aria-label={ko ? '창 닫기' : 'Close window'}
          title={ko ? '닫기' : 'Close'}
          onClick={() => {
            void window.api.desktop
              .close()
              .catch(() => {})
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>,
    target
  )
}

const styles = `
html.moru-has-caption .moru-shell {
  height: calc(100vh - 40px);
  margin-top: 40px;
}

html.moru-has-caption dialog {
  top: 40px;
  max-height: calc(100vh - 64px);
}

html.moru-has-caption .moru-create-dialog > form {
  max-height: calc(100vh - 64px);
}

.moru-desktop-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 18px;
  background: #17231f;
  border-bottom: 1px solid #2c4137;
  color: #c9dbd0;
  font-family: var(
    --moru-selected-font,
    'Segoe UI',
    'Malgun Gothic',
    sans-serif
  );
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .3px;
  user-select: none;
  -webkit-app-region: drag;
  text-align: left;
}

.moru-caption-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  pointer-events: none;
}

.moru-caption-brand > span:first-child {
  color: #62dca5;
  font-size: 15px;
}

.moru-caption-brand small {
  font: inherit;
  color: #8fa99b;
}

.moru-caption-controls {
  display: flex;
  align-items: stretch;
  height: 40px;
  margin-left: 20px;
  -webkit-app-region: no-drag;
}

.moru-desktop-titlebar .moru-caption-button {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 48px;
  height: 39px;
  color: #b5cabc;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color .14s, color .14s;
}

.moru-desktop-titlebar .moru-caption-button:hover {
  background: #294235;
  color: #a3f1c5;
}

.moru-desktop-titlebar .moru-caption-button:active {
  background: #355b45;
}

.moru-desktop-titlebar .moru-caption-button:focus-visible {
  outline: 2px solid #65dca4;
  outline-offset: -4px;
}

.moru-desktop-titlebar .moru-caption-close:hover {
  background: #a94350;
  color: #fff;
}

.moru-desktop-titlebar .moru-caption-close:active {
  background: #8b3540;
}

.moru-caption-button svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .moru-desktop-titlebar .moru-caption-button {
    transition: none;
  }
}
`