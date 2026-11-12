import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'
import {
  localizedModDescription,
  translate,
  type Language,
  type TranslationKey
} from './locales'

type Page =
  | 'home'
  | 'profiles'
  | 'discover'
  | 'installed'
  | 'settings'

type ModLoader = 'vanilla' | 'fabric'

type GameProfile = {
  id: string
  name: string
  version: string
  loader: ModLoader
}

type ReleaseCatalog = {
  releases: string[]
  fabric: string[]
  fabricAvailable: boolean
}

type MoruMod = {
  id: string
  name: string
  description: string
  icon: string | null
  downloads: number
}

type InstalledMod = {
  projectId: string
  versionId: string
  filename: string
}

type ListMode = 'recommended' | 'search'

const DEFAULT_PROFILE: GameProfile = {
  id: 'moru-default',
  name: 'MORU',
  version: '26.1.2',
  loader: 'fabric'
}

const PROFILES_STORAGE = 'moru-game-profiles-v1'
const ACTIVE_PROFILE_STORAGE = 'moru-active-profile-v1'

function readProfiles(): GameProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE)

    if (!raw) return [DEFAULT_PROFILE]

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) return [DEFAULT_PROFILE]

    const profiles: GameProfile[] = parsed
      .filter((item): item is GameProfile => {
        if (!item || typeof item !== 'object') return false

        const value = item as Partial<GameProfile>

        return (
          typeof value.id === 'string' &&
          typeof value.name === 'string' &&
          typeof value.version === 'string' &&
          (
            value.loader === 'vanilla' ||
            value.loader === 'fabric'
          )
        )
      })
      .slice(0, 40)

    return profiles.length ? profiles : [DEFAULT_PROFILE]
  } catch {
    return [DEFAULT_PROFILE]
  }
}

const styles = `
  * { box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; margin: 0 !important; padding: 0 !important; max-width: none !important; }
  body { display: block !important; overflow: hidden; background: #0c1113; color: #edf5f1; font-family: var(--moru-selected-font, 'Segoe UI', 'Malgun Gothic', sans-serif); }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  .moru { display: flex; width: 100%; height: 100vh; text-align: left; background: #0c1113; }
  .sidebar { display: flex; flex-direction: column; flex-shrink: 0; width: 225px; padding: 28px 15px; border-right: 1px solid #27312e; background: #101719; }
  .brand { display: flex; align-items: center; gap: 12px; padding: 0 13px 42px; font-size: 23px; font-weight: 800; letter-spacing: 2px; }
  .brand-icon { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; background: #43d9a0; color: #0d1b17; font-size: 25px; }
  .nav-label { margin: 0 13px 15px; color: #718b81; font-size: 11px; letter-spacing: 2px; }
  .nav-button { width: 100%; padding: 14px; margin-bottom: 5px; border: none; border-radius: 10px; background: transparent; color: #91a49d; text-align: left; font-size: 14px; }
  .nav-button:hover { background: #1c2927; }
  .nav-button.active { background: #1b3c32; color: #55e7ae; font-weight: 700; }
  .nav-symbol { display: inline-block; width: 30px; font-size: 18px; }
  .sidebar-bottom { margin-top: auto; padding: 13px; color: #7f998f; font-size: 12px; border-top: 1px solid #27312e; }
  .content { flex: 1; min-width: 0; overflow: auto; padding: 32px 42px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 35px; }
  .topbar h2 { margin: 0; font-size: 20px; }
  .microsoft-account { display: flex; align-items: center; gap: 10px; padding: 9px 13px; flex-shrink: 0; border: 1px solid #30483f; border-radius: 11px; background: #172420; color: #c7ddd2; font-size: 13px; font-weight: 600; }
  .microsoft-account:disabled { opacity: 1; cursor: default; }
  .microsoft-mark { display: grid; grid-template-columns: repeat(2, 7px); grid-template-rows: repeat(2, 7px); gap: 2px; width: 16px; height: 16px; flex-shrink: 0; }
  .microsoft-mark span:nth-child(1) { background: #f35325; }
  .microsoft-mark span:nth-child(2) { background: #81bc06; }
  .microsoft-mark span:nth-child(3) { background: #05a6f0; }
  .microsoft-mark span:nth-child(4) { background: #ffba08; }
  .home-profile-picker { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; max-width: 360px; margin-top: 25px; }
  .home-profile-picker label { font-size: 12px; font-weight: 700; color: #b7e0ce; }
  .moru-select-root { width: 100%; min-width: 0; }
  .moru-select-trigger { width: 100%; min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; color: #eaf9f1; background: #132521; border: 1px solid #365548; border-radius: 12px; text-align: left; cursor: pointer; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .moru-select-trigger:hover { background: #1c332a; border-color: #579477; }
  .moru-select-trigger.is-open { background: #1a382d; border-color: #55d5a0; box-shadow: 0 0 0 3px rgba(67, 217, 160, .12); }
  .moru-select-trigger:focus-visible { outline: 2px solid #57e6ab; outline-offset: 2px; }
  .moru-select-trigger:disabled { opacity: .5; cursor: default; }
  .moru-select-hero { background: rgba(9, 29, 23, .78); border-color: rgba(108, 204, 158, .42); backdrop-filter: blur(8px); }
  .moru-select-value { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .moru-select-dot { width: 9px; height: 9px; flex-shrink: 0; border-radius: 50%; background: #4be2a3; box-shadow: 0 0 0 4px rgba(73, 226, 163, .12); }
  .moru-select-text { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .moru-select-arrow { width: 8px; height: 8px; flex-shrink: 0; margin-right: 4px; border-right: 2px solid #93c6ab; border-bottom: 2px solid #93c6ab; transform: translateY(-2px) rotate(45deg); transition: transform .18s ease; }
  .moru-select-trigger.is-open .moru-select-arrow { transform: translateY(2px) rotate(225deg); }
  .moru-select-menu { z-index: 9999; padding: 6px; overflow-y: auto; overscroll-behavior: contain; background: #152720; color: #eaf9f1; border: 1px solid #456957; border-radius: 14px; box-shadow: 0 18px 42px rgba(0, 0, 0, .42), 0 5px 16px rgba(0, 0, 0, .2); scrollbar-color: #3d6a55 #152720; scrollbar-width: thin; animation: moru-select-appear .16s ease-out both; }
  .moru-select-menu.opens-above { transform-origin: bottom center; }
  .moru-select-option { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 40px; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; text-align: left; color: #c6e2d2; cursor: pointer; transition: background .14s ease, color .14s ease; }
  .moru-select-option:hover, .moru-select-option.is-highlighted { background: #234838; color: #f3fff8; }
  .moru-select-option.is-selected { color: #65efb4; background: #1c3d30; }
  .moru-select-option:disabled { opacity: .38; cursor: default; }
  .moru-select-option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .moru-select-check { font-size: 15px; color: #68f0b9; margin-left: 12px; }
  @keyframes moru-select-appear {
    from { opacity: 0; transform: translateY(-5px) scale(.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .moru-select-trigger, .moru-select-arrow, .moru-select-option { transition: none; }
    .moru-select-menu { animation: none; }
  }
  .hero { position: relative; overflow: hidden; min-height: 290px; padding: 39px; border: 1px solid #345749; border-radius: 20px; background: radial-gradient(circle at 90% 25%, #245c46, transparent 45%), linear-gradient(125deg, #152d26, #111b1b); }
  .hero::after { content: '◆'; position: absolute; right: 8%; top: 0; font-size: 260px; line-height: 1; color: #46df9b; opacity: .10; transform: rotate(-15deg); pointer-events: none; }
  .eyebrow { color: #63daa5; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; }
  .hero h1 { margin: 19px 0 9px; font-size: clamp(30px, 4vw, 43px); }
  .muted { color: #98aea4; font-size: 14px; line-height: 1.7; }
  .play { position: relative; z-index: 1; margin-top: 16px; padding: 13px 38px; border: none; border-radius: 10px; background: #40d99b; color: #0b221a; font-weight: 800; }
  .play:disabled { cursor: default; opacity: .7; }
  .section-title { margin: 35px 0 17px; font-size: 18px; }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; }
  .card, .panel { border: 1px solid #25352e; border-radius: 15px; background: #161f20; }
  .card { padding: 21px; }
  .panel { padding: 28px; }
  .card-label { color: #8fa49a; font-size: 12px; }
  .card-value { margin-top: 13px; font-size: 20px; font-weight: 750; }
  .search-row { display: flex; gap: 10px; margin: 22px 0; }
  .search { flex: 1; min-width: 0; padding: 14px 18px; border: 1px solid #355144; outline: none; border-radius: 10px; color: #edf5f1; background: #0e1718; }
  .search:focus { border-color: #43d9a0; }
  .action-button { padding: 12px 22px; border: none; border-radius: 10px; background: #40d99b; color: #0b221a; font-weight: 750; }
  .action-button:disabled { opacity: .5; cursor: default; }
  .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0 16px; }
  .list-heading h3 { margin: 0; font-size: 17px; }
  .list-heading span { color: #8fa49a; font-size: 12px; }
  .mod-list { display: flex; flex-direction: column; gap: 11px; }
  .mod-card { display: flex; align-items: center; width: 100%; gap: 16px; padding: 16px; border: 1px solid #2b3b34; border-radius: 12px; background: #192522; color: #edf5f1; text-align: left; }
  .mod-card:hover, .mod-card.selected { border-color: #4ad5a0; }
  .mod-icon { position: relative; display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 11px; overflow: hidden; background: #294c3d; color: #60e6ad; font-size: 22px; font-weight: 800; }
  .mod-icon img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .mod-info { flex: 1; min-width: 0; }
  .mod-name { font-size: 15px; font-weight: 700; }
  .mod-desc { margin-top: 5px; color: #9bb0a6; font-size: 12px; line-height: 1.5; }
  .downloads { color: #61dba9; font-size: 12px; white-space: nowrap; }
  .empty { padding: 55px 20px; text-align: center; color: #9ab2a6; }
  .secondary-button { padding: 11px 18px; border: 1px solid #45715b; border-radius: 9px; background: #203b30; color: #83e8b9; font-weight: 650; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 0; border-bottom: 1px solid #293c32; }
  .ram-slider { width: 190px; accent-color: #46df9f; }
  .font-control { min-width: 205px; max-width: 255px; text-align: right; }
  .font-name { font-size: 12px; color: #b4d1c3; margin-bottom: 10px; overflow-wrap: anywhere; }
  .font-actions { display: flex; gap: 7px; justify-content: flex-end; flex-wrap: wrap; }
  .font-button { padding: 9px 13px; border: 1px solid #45715b; border-radius: 9px; background: #203b30; color: #83e8b9; font-size: 12px; }
  .font-button:disabled { opacity: 0.45; cursor: default; }
  .font-error { color: #ffaaaa; font-size: 12px; margin-top: 8px; }
  .profile-list { display: grid; gap: 12px; margin: 18px 0 28px; }
  .profile-card { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 19px; background: #192522; border: 1px solid #2b3b34; border-radius: 12px; }
  .profile-card.is-active { border-color: #4ad5a0; }
  .profile-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
  .profile-select { padding: 10px 13px; border: 1px solid #45715b; border-radius: 9px; background: #203b30; color: #edf5f1; max-width: 100%; }
  .profile-select:disabled, .secondary-button:disabled { opacity: .5; cursor: default; }
  .new-profile { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .profile-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
  .profile-field label { color: #9bb0a6; font-size: 13px; }
  .profile-field input, .profile-field select { width: 100%; padding: 12px; color: #edf5f1; background: #0e1718; border: 1px solid #355144; border-radius: 9px; }
  .profile-field input:focus, .profile-field select:focus { outline: 1px solid #43d9a0; }
  .inline-note { margin: 10px 0; color: #98aea4; font-size: 12px; line-height: 1.6; }
  .error { padding: 15px; border-radius: 10px; background: #422423; color: #ffaaaa; font-size: 13px; }
  .install-dialog { width: min(520px, 90vw); max-height: 80vh; overflow-y: auto; padding: 24px; color: #edf5f1; background: #152720; border: 1px solid #456957; border-radius: 16px; font: inherit; }
  .install-dialog::backdrop { background: #0009; }
  .install-profile-list { display: grid; gap: 10px; margin: 20px 0; }
  .install-profile-list button { text-align: left; line-height: 1.7; }
  @media (max-width: 900px) {
    .new-profile { grid-template-columns: 1fr; }
  }
  @media (max-width: 800px) {
    .sidebar { width: 175px; }
    .content { padding: 24px; }
    .cards { grid-template-columns: 1fr; }
    .hero { padding: 27px; }
    .mod-card { flex-wrap: wrap; }
    .microsoft-account { padding: 8px; }
  }
`

const FONT_DATABASE = 'moru-font-db'
const FONT_STORE = 'settings'
const FONT_KEY = 'selected-font'
const MAX_FONT_BYTES = 25 * 1024 * 1024

type SavedFont = {
  name: string
  file: Blob
}

function openFontDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FONT_DATABASE, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(FONT_STORE)) {
        database.createObjectStore(FONT_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)

    request.onerror = () =>
      reject(
        request.error ??
        new Error('IndexedDB open failed')
      )

    request.onblocked = () =>
      reject(new Error('IndexedDB is blocked'))
  })
}

async function readSavedFont(): Promise<SavedFont | null> {
  const database = await openFontDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        FONT_STORE,
        'readonly'
      )

      const request = transaction
        .objectStore(FONT_STORE)
        .get(FONT_KEY)

      request.onsuccess = () =>
        resolve(
          (request.result as SavedFont | undefined) ?? null
        )

      request.onerror = () =>
        reject(
          request.error ??
          new Error('Font read failed')
        )

      transaction.onabort = () =>
        reject(
          transaction.error ??
          new Error('Font read aborted')
        )
    })
  } finally {
    database.close()
  }
}

async function saveSelectedFont(
  value: SavedFont
): Promise<void> {
  const database = await openFontDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        FONT_STORE,
        'readwrite'
      )

      transaction
        .objectStore(FONT_STORE)
        .put(value, FONT_KEY)

      transaction.oncomplete = () => resolve()

      transaction.onerror = () =>
        reject(
          transaction.error ??
          new Error('Font save failed')
        )

      transaction.onabort = () =>
        reject(
          transaction.error ??
          new Error('Font save aborted')
        )
    })
  } finally {
    database.close()
  }
}

async function clearSelectedFont(): Promise<void> {
  const database = await openFontDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        FONT_STORE,
        'readwrite'
      )

      transaction
        .objectStore(FONT_STORE)
        .delete(FONT_KEY)

      transaction.oncomplete = () => resolve()

      transaction.onerror = () =>
        reject(
          transaction.error ??
          new Error('Font remove failed')
        )

      transaction.onabort = () =>
        reject(
          transaction.error ??
          new Error('Font remove aborted')
        )
    })
  } finally {
    database.close()
  }
}

function isTrueTypeFont(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false

  const signature = new Uint8Array(buffer, 0, 4)

  return (
    (
      signature[0] === 0 &&
      signature[1] === 1 &&
      signature[2] === 0 &&
      signature[3] === 0
    ) ||
    (
      signature[0] === 0x74 &&
      signature[1] === 0x72 &&
      signature[2] === 0x75 &&
      signature[3] === 0x65
    )
  )
}

async function prepareFont(file: Blob): Promise<FontFace> {
  const buffer = await file.arrayBuffer()

  if (!isTrueTypeFont(buffer)) {
    throw new Error('font-format')
  }

  const face = new FontFace('MORU User Font', buffer)

  return face.load()
}

type MoruOption = {
  value: string
  label: string
  disabled?: boolean
}

type MoruSelectProps = {
  id: string
  value: string
  options: MoruOption[]
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  variant?: 'hero' | 'default'
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  above: boolean
}

function MoruSelect({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  variant = 'default'
}: MoruSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [position, setPosition] =
    useState<MenuPosition | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const chosen = options.find(
    option => option.value === value
  )

  const updatePosition = useCallback(() => {
    const target = triggerRef.current

    if (!target) return

    const rect = target.getBoundingClientRect()

    const visibleHeight = Math.min(
      284,
      options.length * 46 + 12
    )

    const below =
      window.innerHeight - rect.bottom - 12

    const above = rect.top - 12

    const showAbove =
      below < visibleHeight && above > below

    const maxHeight = Math.max(
      60,
      Math.min(
        284,
        (showAbove ? above : below) - 8
      )
    )

    const top = showAbove
      ? Math.max(8, rect.top - maxHeight - 7)
      : rect.bottom + 7

    const width = Math.min(
      rect.width,
      window.innerWidth - 16
    )

    const left = Math.max(
      8,
      Math.min(
        rect.left,
        window.innerWidth - width - 8
      )
    )

    setPosition({
      top,
      left,
      width,
      maxHeight,
      above: showAbove
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return

    updatePosition()

    const reposition = () => updatePosition()

    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener(
        'scroll',
        reposition,
        true
      )
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const outside = (event: PointerEvent) => {
      const node = event.target as Node

      if (
        !triggerRef.current?.contains(node) &&
        !menuRef.current?.contains(node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', outside)

    return () =>
      document.removeEventListener(
        'pointerdown',
        outside
      )
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function openMenu() {
    if (disabled) return

    const selectedIndex = options.findIndex(
      option =>
        option.value === value &&
        !option.disabled
    )

    setHighlighted(
      selectedIndex >= 0
        ? selectedIndex
        : Math.max(
            0,
            options.findIndex(option => !option.disabled)
          )
    )

    setPosition(null)
    setOpen(true)
  }

  function selectOption(option: MoruOption) {
    if (option.disabled) return

    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key === 'Escape') {
      if (open) event.preventDefault()
      setOpen(false)
      return
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp'
    ) {
      event.preventDefault()

      if (!open) {
        openMenu()
        return
      }

      if (!options.some(option => !option.disabled)) {
        return
      }

      const direction =
        event.key === 'ArrowDown' ? 1 : -1

      let next = highlighted

      for (let i = 0; i < options.length; i++) {
        next =
          (next + direction + options.length) %
          options.length

        if (!options[next].disabled) {
          setHighlighted(next)
          break
        }
      }

      return
    }

    if (
      (event.key === 'Enter' || event.key === ' ') &&
      open
    ) {
      event.preventDefault()

      const option = options[highlighted]

      if (option) selectOption(option)
    }
  }

  return (
    <div className="moru-select-root">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={[
          'moru-select-trigger',
          variant === 'hero' ? 'moru-select-hero' : '',
          open ? 'is-open' : ''
        ].join(' ')}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={
          open ? `${id}-options` : undefined
        }
        aria-activedescendant={
          open
            ? `${id}-option-${highlighted}`
            : undefined
        }
        disabled={disabled || options.length === 0}
        onClick={() =>
          open ? setOpen(false) : openMenu()
        }
        onKeyDown={handleKeyDown}
      >
        <span className="moru-select-value">
          {variant === 'hero' && (
            <span
              className="moru-select-dot"
              aria-hidden="true"
            />
          )}
          <span className="moru-select-text">
            {chosen?.label ?? '—'}
          </span>
        </span>
        <span
          className="moru-select-arrow"
          aria-hidden="true"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            id={`${id}-options`}
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            className={`moru-select-menu ${
              position.above ? 'opens-above' : ''
            }`}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight
            }}
          >
            {options.map((option, index) => (
              <button
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                key={option.value}
                tabIndex={-1}
                disabled={option.disabled}
                aria-selected={option.value === value}
                className={[
                  'moru-select-option',
                  option.value === value
                    ? 'is-selected'
                    : '',
                  index === highlighted
                    ? 'is-highlighted'
                    : ''
                ].join(' ')}
                onMouseEnter={() =>
                  setHighlighted(index)
                }
                onClick={() => selectOption(option)}
              >
                <span className="moru-select-option-label">
                  {option.label}
                </span>
                {option.value === value && (
                  <span
                    className="moru-select-check"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState<Language>(
    () => {
      try {
        return localStorage.getItem('moru-language') === 'en'
          ? 'en'
          : 'ko'
      } catch {
        return 'ko'
      }
    }
  )

  const t = (key: TranslationKey) =>
    translate(language, key)

  useEffect(() => {
    document.documentElement.lang = language

    try {
      localStorage.setItem('moru-language', language)
    } catch {
      // 保存できない環境ではメモリ上で保持
    }
  }, [language])

  const [page, setPage] = useState<Page>('home')
  const [profiles, setProfiles] =
    useState<GameProfile[]>(readProfiles)

  const [activeId, setActiveId] = useState(() => {
    try {
      return (
        localStorage.getItem(ACTIVE_PROFILE_STORAGE) ||
        DEFAULT_PROFILE.id
      )
    } catch {
      return DEFAULT_PROFILE.id
    }
  })

  const activeProfile =
    profiles.find(profile => profile.id === activeId) ??
    profiles[0]

  const [catalog, setCatalog] =
    useState<ReleaseCatalog | null>(null)

  const [catalogLoading, setCatalogLoading] =
    useState(true)

  const [catalogError, setCatalogError] =
    useState(false)

  const [newName, setNewName] = useState('')
  const [newVersion, setNewVersion] =
    useState('26.1.2')

  const [newLoader, setNewLoader] =
    useState<ModLoader>('vanilla')

  useEffect(() => {
    try {
      localStorage.setItem(
        PROFILES_STORAGE,
        JSON.stringify(profiles)
      )

      localStorage.setItem(
        ACTIVE_PROFILE_STORAGE,
        activeProfile.id
      )
    } catch {
      // 저장할 수 없으면 현재 실행에서만 유지
    }
  }, [profiles, activeProfile.id])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const result =
          await window.api.getReleaseVersions()

        if (cancelled) return

        setCatalog(result)
        setCatalogError(false)

        setNewVersion(previous =>
          result.releases.includes(previous)
            ? previous
            : (result.releases[0] ?? '26.1.2')
        )
      } catch {
        if (!cancelled) setCatalogError(true)
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  function createProfile() {
    const name = newName.trim().slice(0, 40)

    if (
      !name ||
      !catalog?.releases.includes(newVersion) ||
      profiles.length >= 40
    ) {
      return
    }

    if (
      newLoader === 'fabric' &&
      !catalog.fabric.includes(newVersion)
    ) {
      return
    }

    const id =
      `profile-${Date.now()}-` +
      Math.random().toString(36).slice(2, 9)

    const next: GameProfile = {
      id,
      name,
      version: newVersion,
      loader: newLoader
    }

    setProfiles(current => [...current, next])
    setActiveId(id)
    setNewName('')
  }

  function removeProfile(id: string) {
    if (profiles.length <= 1) return

    const remaining = profiles.filter(
      profile => profile.id !== id
    )

    setProfiles(remaining)

    if (activeProfile.id === id) {
      setActiveId(remaining[0].id)
    }
  }

  const [search, setSearch] = useState('')
  const [mods, setMods] = useState<MoruMod[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [downloadTarget, setDownloadTarget] =
    useState<MoruMod | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] =
    useState('')

  const [downloadFailed, setDownloadFailed] =
    useState(false)

  const [installedFiles, setInstalledFiles] =
    useState<InstalledMod[]>([])

  const [installedError, setInstalledError] =
    useState(false)

  const [installedRefresh, setInstalledRefresh] =
    useState(0)

  const installDialog =
    useRef<HTMLDialogElement>(null)

  const downloadLock = useRef(false)

  useEffect(() => {
    if (
      downloadTarget &&
      !installDialog.current?.open
    ) {
      installDialog.current?.showModal()
    }

    if (!downloadTarget) {
      installDialog.current?.close()
    }
  }, [downloadTarget])

  useEffect(() => {
    let cancelled = false

    setInstalledFiles([])
    setInstalledError(false)

    void window.api
      .listInstalled(activeProfile)
      .then(files => {
        if (!cancelled) setInstalledFiles(files)
      })
      .catch(() => {
        if (!cancelled) setInstalledError(true)
      })

    return () => {
      cancelled = true
    }
  }, [activeProfile.id, page, installedRefresh])

  async function downloadMod(
    mod: MoruMod,
    profile: GameProfile
  ) {
    if (downloadLock.current) return

    setDownloadTarget(null)

    if (profile.loader !== 'fabric') {
      setDownloadFailed(true)
      setDownloadMessage(
        language === 'ko'
          ? 'Fabric 프로필을 선택해 주세요.'
          : 'Select a Fabric profile.'
      )
      return
    }

    downloadLock.current = true
    setDownloading(true)
    setDownloadFailed(false)

    setDownloadMessage(
      language === 'ko'
        ? `${profile.name}에 다운로드 중…`
        : `Downloading to ${profile.name}…`
    )

    try {
      const result = await window.api.installMod(
        profile,
        mod.id
      )

      setInstalledRefresh(value => value + 1)

      setDownloadMessage(
        result.added === 0
          ? language === 'ko'
            ? `${profile.name}에 이미 설치되어 있어요.`
            : `Already installed in ${profile.name}.`
          : language === 'ko'
            ? `${profile.name}: ${mod.name} 설치 완료 · ${result.added}개 파일`
            : `${profile.name}: ${mod.name} installed · ${result.added} files`
      )
    } catch (error) {
      setDownloadFailed(true)

      const detail =
        error instanceof Error
          ? error.message
          : String(error)

      setDownloadMessage(
        `${
          language === 'ko'
            ? '다운로드 실패'
            : 'Download failed'
        }: ${detail}`
      )
    } finally {
      downloadLock.current = false
      setDownloading(false)
    }
  }

  function requestDownload(mod: MoruMod) {
    if (downloadLock.current) return

    if (profiles.length === 1) {
      void downloadMod(mod, profiles[0])
    } else {
      setDownloadTarget(mod)
    }
  }

  const [listMode, setListMode] =
    useState<ListMode>('recommended')

  const [ram, setRam] = useState(6)
  const [fontName, setFontName] =
    useState<string | null>(null)

  const [fontBusy, setFontBusy] = useState(false)

  const [fontError, setFontError] =
    useState<TranslationKey | null>(null)

  const fontInput = useRef<HTMLInputElement>(null)
  const currentFont = useRef<FontFace | null>(null)
  const requestId = useRef(0)

  function activateFont(face: FontFace): void {
    if (currentFont.current) {
      document.fonts.delete(currentFont.current)
    }

    document.fonts.add(face)
    currentFont.current = face

    document.documentElement.style.setProperty(
      '--moru-selected-font',
      '"MORU User Font", "Segoe UI", "Malgun Gothic", sans-serif'
    )
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const saved = await readSavedFont()

        if (!saved || cancelled) return

        const face = await prepareFont(saved.file)

        if (cancelled) return

        activateFont(face)
        setFontName(saved.name)
      } catch {
        if (!cancelled) {
          setFontError('fontLoadError')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function onFontFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (!file) return

    setFontError(null)

    if (!file.name.toLowerCase().endsWith('.ttf')) {
      setFontError('fontInvalidFile')
      return
    }

    if (
      file.size === 0 ||
      file.size > MAX_FONT_BYTES
    ) {
      setFontError('fontTooLarge')
      return
    }

    setFontBusy(true)

    try {
      const face = await prepareFont(file)

      await saveSelectedFont({
        name: file.name,
        file
      })

      activateFont(face)
      setFontName(file.name)
    } catch (error) {
      setFontError(
        error instanceof Error &&
        error.message === 'font-format'
          ? 'fontInvalidFile'
          : 'fontSaveError'
      )
    } finally {
      setFontBusy(false)
    }
  }

  async function resetFont() {
    setFontBusy(true)
    setFontError(null)

    try {
      await clearSelectedFont()

      if (currentFont.current) {
        document.fonts.delete(currentFont.current)
      }

      currentFont.current = null

      document.documentElement.style.removeProperty(
        '--moru-selected-font'
      )

      setFontName(null)
    } catch {
      setFontError('fontResetError')
    } finally {
      setFontBusy(false)
    }
  }

  const navigation: {
    id: Page
    label: string
    icon: string
  }[] = [
    {
      id: 'home',
      label: t('navHome'),
      icon: '⌂'
    },
    {
      id: 'profiles',
      label: t('navProfiles'),
      icon: '▤'
    },
    {
      id: 'discover',
      label: t('navDiscover'),
      icon: '▦'
    },
    {
      id: 'installed',
      label: t('navInstalled'),
      icon: '▣'
    },
    {
      id: 'settings',
      label: t('navSettings'),
      icon: '⚙'
    }
  ]

  const titles: Record<Page, string> = {
    home: t('navHome'),
    profiles: t('navProfiles'),
    discover: t('navDiscover'),
    installed: t('navInstalled'),
    settings: t('navSettings')
  }

  const loadMods = useCallback(
    async (keyword: string) => {
      const currentRequest = ++requestId.current
      const normalized = keyword.trim()

      setListMode(
        normalized ? 'search' : 'recommended'
      )

      setLoading(true)
      setLoaded(false)
      setSearchError('')
      setMods([])

      try {
        const results = await window.api.searchMods(
          normalized,
          activeProfile.version
        )

        if (currentRequest !== requestId.current) {
          return
        }

        setMods(results)
      } catch {
        if (currentRequest !== requestId.current) {
          return
        }

        setSearchError('failed')
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false)
          setLoaded(true)
        }
      }
    },
    [activeProfile.version]
  )

  useEffect(() => {
    if (page !== 'discover') return

    setSearch('')

    if (activeProfile.loader === 'fabric') {
      void loadMods('')
    } else {
      requestId.current += 1
      setMods([])
      setLoading(false)
      setLoaded(false)
      setSearchError('')
    }
  }, [page, loadMods, activeProfile.loader])

  return (
    <div className="moru">
      <style>{styles}</style>

      <dialog
        ref={installDialog}
        className="install-dialog"
        aria-labelledby="install-title"
        onCancel={() => setDownloadTarget(null)}
        onClick={event => {
          if (
            event.target !== event.currentTarget
          ) {
            return
          }

          const rect =
            event.currentTarget.getBoundingClientRect()

          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          ) {
            setDownloadTarget(null)
          }
        }}
      >
        <h2 id="install-title">
          {language === 'ko'
            ? '다운로드할 구동기 프로필 선택'
            : 'Choose a launcher profile'}
        </h2>

        <p>{downloadTarget?.name}</p>

        <p className="muted">
          {language === 'ko'
            ? '선택한 프로필 버전에 맞는 모드를 다운로드합니다.'
            : 'Downloads a mod version compatible with the selected profile.'}
        </p>

        <div className="install-profile-list">
          {profiles.map(profile => (
            <button
              key={profile.id}
              type="button"
              className="secondary-button"
              disabled={
                profile.loader !== 'fabric' ||
                downloading
              }
              onClick={() => {
                if (downloadTarget) {
                  void downloadMod(
                    downloadTarget,
                    profile
                  )
                }
              }}
            >
              <strong>{profile.name}</strong>
              <br />
              Minecraft {profile.version} ·{' '}
              {profile.loader === 'fabric'
                ? 'Fabric'
                : language === 'ko'
                  ? 'Vanilla · 모드 설치 불가'
                  : 'Vanilla · Mods unavailable'}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setDownloadTarget(null)}
        >
          {language === 'ko' ? '취소' : 'Cancel'}
        </button>
      </dialog>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">◆</div>
          MORU
        </div>

        <div className="nav-label">
          {t('menu')}
        </div>

        {navigation.map(item => (
          <button
            key={item.id}
            type="button"
            className={`nav-button ${
              page === item.id ? 'active' : ''
            }`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-symbol">
              {item.icon}
            </span>
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

          <button
            className="microsoft-account"
            type="button"
            disabled
            title={t('microsoftAccountHelp')}
            aria-label={t('microsoftSignIn')}
          >
            <span
              className="microsoft-mark"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>{t('microsoftSignIn')}</span>
          </button>
        </header>

        {downloadMessage && (
          <p
            role="status"
            className={
              downloadFailed
                ? 'error'
                : 'inline-note'
            }
          >
            {downloadMessage}
          </p>
        )}

        {page === 'home' && (
          <>
            <section className="hero">
              <div className="eyebrow">
                MINECRAFT JAVA EDITION
              </div>

              <h1>
                Minecraft {activeProfile.version}
              </h1>

              <div className="muted">
                {activeProfile.name} ·{' '}
                {activeProfile.loader === 'fabric'
                  ? 'Fabric'
                  : 'Vanilla'}
              </div>

              <div className="home-profile-picker">
                <label htmlFor="moru-home-profile">
                  {t('homeProfileSelect')}
                </label>

                <MoruSelect
                  id="moru-home-profile"
                  variant="hero"
                  value={activeProfile.id}
                  ariaLabel={t('homeProfileSelect')}
                  onChange={setActiveId}
                  options={profiles.map(profile => ({
                    value: profile.id,
                    label:
                      `${profile.name} · ${profile.version} · ` +
                      (
                        profile.loader === 'fabric'
                          ? 'Fabric'
                          : 'Vanilla'
                      )
                  }))}
                />
              </div>

              <button
                className="play"
                type="button"
                disabled
              >
                ▶ {t('play')}
              </button>
            </section>

            <h3 className="section-title">
              {t('environment')}
            </h3>

            <div className="cards">
              <div className="card">
                <div className="card-label">
                  {t('minecraft')}
                </div>
                <div className="card-value">
                  {activeProfile.version}
                </div>
              </div>

              <div className="card">
                <div className="card-label">
                  {t('modLoader')}
                </div>
                <div className="card-value">
                  {activeProfile.loader === 'fabric'
                    ? 'Fabric'
                    : 'Vanilla'}
                </div>
              </div>

              <div className="card">
                <div className="card-label">
                  {t('modCount')}
                </div>
                <div className="card-value">
                  {installedError
                    ? '—'
                    : installedFiles.length}
                </div>
              </div>
            </div>
          </>
        )}

        {page === 'profiles' && (
          <section className="panel">
            <div className="eyebrow">
              MINECRAFT RELEASES
            </div>

            <h2>{t('profilesTitle')}</h2>
            <p className="muted">
              {t('profilesHelp')}
            </p>

            <div className="profile-list">
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  className={`profile-card ${
                    profile.id === activeProfile.id
                      ? 'is-active'
                      : ''
                  }`}
                >
                  <div>
                    <strong>{profile.name}</strong>
                    <div className="muted">
                      Minecraft {profile.version} ·{' '}
                      {profile.loader === 'fabric'
                        ? 'Fabric'
                        : 'Vanilla'}
                    </div>
                  </div>

                  <div className="profile-buttons">
                    {profile.id === activeProfile.id ? (
                      <span className="eyebrow">
                        {t('activeProfile')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setActiveId(profile.id)
                        }
                      >
                        {t('selectProfile')}
                      </button>
                    )}

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        profiles.length <= 1 ||
                        downloading
                      }
                      onClick={() =>
                        removeProfile(profile.id)
                      }
                    >
                      {t('deleteProfile')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title">
              {t('createProfile')}
            </h3>

            <div className="new-profile">
              <div className="profile-field">
                <label htmlFor="moru-profile-name">
                  {t('profileName')}
                </label>

                <input
                  id="moru-profile-name"
                  maxLength={40}
                  value={newName}
                  onChange={event =>
                    setNewName(event.target.value)
                  }
                  placeholder={t('profileNameExample')}
                />
              </div>

              <div className="profile-field">
                <label htmlFor="moru-version">
                  {t('gameVersion')}
                </label>

                <MoruSelect
                  id="moru-version"
                  ariaLabel={t('gameVersion')}
                  disabled={!catalog}
                  value={newVersion}
                  options={
                    catalog?.releases.map(version => ({
                      value: version,
                      label: version
                    })) ?? []
                  }
                  onChange={version => {
                    setNewVersion(version)

                    if (
                      newLoader === 'fabric' &&
                      !catalog?.fabric.includes(version)
                    ) {
                      setNewLoader('vanilla')
                    }
                  }}
                />
              </div>

              <div className="profile-field">
                <label htmlFor="moru-loader">
                  {t('modLoader')}
                </label>

                <MoruSelect
                  id="moru-loader"
                  ariaLabel={t('modLoader')}
                  value={newLoader}
                  onChange={value =>
                    setNewLoader(value as ModLoader)
                  }
                  options={[
                    {
                      value: 'vanilla',
                      label: 'Vanilla'
                    },
                    {
                      value: 'fabric',
                      label: 'Fabric',
                      disabled:
                        !catalog?.fabric.includes(
                          newVersion
                        )
                    }
                  ]}
                />
              </div>

              <div
                className="profile-field"
                style={{ justifyContent: 'flex-end' }}
              >
                <button
                  className="action-button"
                  type="button"
                  disabled={
                    !newName.trim() ||
                    !catalog?.releases.includes(
                      newVersion
                    ) ||
                    profiles.length >= 40 ||
                    (
                      newLoader === 'fabric' &&
                      !catalog.fabric.includes(
                        newVersion
                      )
                    )
                  }
                  onClick={createProfile}
                >
                  {t('createProfile')}
                </button>
              </div>
            </div>

            {catalogLoading && (
              <p className="inline-note">
                {t('loadingVersions')}
              </p>
            )}

            {catalogError && (
              <p className="error">
                {t('failedVersions')}
              </p>
            )}

            <p className="inline-note">
              {t('releaseOnlyNote')}
            </p>

            {!catalogLoading &&
              !catalogError &&
              !catalog?.fabricAvailable && (
                <p className="inline-note">
                  {t('fabricUnavailable')}
                </p>
              )}
          </section>
        )}

        {page === 'discover' && (
          <section className="panel">
            <div className="eyebrow">MODRINTH</div>

            <h2>{t('discoverTitle')}</h2>

            <p className="muted">
              Minecraft {activeProfile.version} ·{' '}
              {activeProfile.loader === 'fabric'
                ? 'Fabric'
                : 'Vanilla'}
            </p>

            {activeProfile.loader !== 'fabric' ? (
              <div className="empty">
                <p>{t('fabricProfileRequired')}</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setPage('profiles')}
                >
                  {t('navProfiles')}
                </button>
              </div>
            ) : (
              <>
                <form
                  className="search-row"
                  onSubmit={event => {
                    event.preventDefault()
                    void loadMods(search)
                  }}
                >
                  <input
                    className="search"
                    type="search"
                    placeholder={t('searchPlaceholder')}
                    value={search}
                    onChange={event =>
                      setSearch(event.target.value)
                    }
                  />

                  <button
                    className="action-button"
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? t('searching')
                      : t('search')}
                  </button>
                </form>

                <div className="list-heading">
                  <h3>
                    {listMode === 'recommended'
                      ? t('recommended')
                      : t('searchResults')}
                  </h3>
                  <span>
                    {listMode === 'recommended'
                      ? t('sortedByDownloads')
                      : `${mods.length} ${t('shownCount')}`}
                  </span>
                </div>

                {searchError && (
                  <div className="error">
                    {t('failedSearch')}
                  </div>
                )}

                {loading && (
                  <div className="empty">
                    {t('loadingMods')}
                  </div>
                )}

                {!loading &&
                  !searchError &&
                  loaded &&
                  mods.length === 0 && (
                    <div className="empty">
                      {t('emptySearch')}
                    </div>
                  )}

                {!loading && (
                  <div className="mod-list">
                    {mods.map(mod => {
                      const safeIcon =
                        mod.icon?.startsWith(
                          'https://cdn.modrinth.com/'
                        )
                          ? mod.icon
                          : null

                      return (
                        <div
                          key={mod.id}
                          className="mod-card"
                        >
                          <div className="mod-icon">
                            <span>
                              {mod.name
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            {safeIcon && (
                              <img
                                src={safeIcon}
                                alt=""
                                referrerPolicy="no-referrer"
                                onError={event => {
                                  event.currentTarget
                                    .style.display = 'none'
                                }}
                              />
                            )}
                          </div>

                          <div className="mod-info">
                            <div className="mod-name">
                              {mod.name}
                            </div>
                            <div className="mod-desc">
                              {localizedModDescription(
                                mod,
                                language
                              )}
                            </div>
                          </div>

                          <div className="downloads">
                            ↓{' '}
                            {mod.downloads.toLocaleString(
                              language === 'ko'
                                ? 'ko-KR'
                                : 'en-US'
                            )}{' '}
                            {t('downloadsUnit')}
                          </div>

                          <button
                            type="button"
                            className="secondary-button"
                            disabled={downloading}
                            aria-label={
                              `${mod.name} ` +
                              (
                                language === 'ko'
                                  ? '다운로드'
                                  : 'Download'
                              )
                            }
                            onClick={() =>
                              requestDownload(mod)
                            }
                          >
                            {language === 'ko'
                              ? '다운로드'
                              : 'Download'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {page === 'installed' && (
          <section className="panel">
            <h2>{t('navInstalled')}</h2>

            <p className="muted">
              {activeProfile.name} · Minecraft{' '}
              {activeProfile.version}
            </p>

            {installedError ? (
              <p className="error">
                {language === 'ko'
                  ? '설치 목록을 읽지 못했습니다.'
                  : 'Could not read installed mods.'}
              </p>
            ) : installedFiles.length > 0 ? (
              <div className="mod-list">
                {installedFiles.map(file => (
                  <div
                    className="card"
                    key={file.projectId}
                  >
                    {file.filename}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <p>{t('emptyInstalled')}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPage('discover')}
                >
                  {t('navDiscover')}
                </button>
              </div>
            )}
          </section>
        )}

        {page === 'settings' && (
          <section className="panel">
            <h2>{t('settingsTitle')}</h2>

            <div className="setting-row">
              <div>
                <strong>{t('language')}</strong>
                <p className="muted">
                  {t('languageHelp')}
                </p>
              </div>

              <div
                style={{
                  width: 170,
                  maxWidth: '55%'
                }}
              >
                <MoruSelect
                  id="moru-language"
                  ariaLabel={t('language')}
                  value={language}
                  onChange={value =>
                    setLanguage(value as Language)
                  }
                  options={[
                    {
                      value: 'ko',
                      label: t('languageKorean')
                    },
                    {
                      value: 'en',
                      label: t('languageEnglish')
                    }
                  ]}
                />
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong>{t('font')}</strong>
                <p className="muted">
                  {t('fontHelp')}
                </p>
              </div>

              <div className="font-control">
                <div className="font-name">
                  {fontName ?? t('fontDefault')}
                </div>

                <div className="font-actions">
                  <input
                    ref={fontInput}
                    type="file"
                    accept=".ttf,font/ttf"
                    aria-label={t('fontChooseFile')}
                    style={{ display: 'none' }}
                    onChange={event => {
                      void onFontFileChange(event)
                    }}
                  />

                  <button
                    type="button"
                    className="font-button"
                    disabled={fontBusy}
                    onClick={() =>
                      fontInput.current?.click()
                    }
                  >
                    {t('fontChooseFile')}
                  </button>

                  {fontName && (
                    <button
                      type="button"
                      className="font-button"
                      disabled={fontBusy}
                      onClick={() => {
                        void resetFont()
                      }}
                    >
                      {t('fontReset')}
                    </button>
                  )}
                </div>

                {fontError && (
                  <div className="font-error">
                    {t(fontError)}
                  </div>
                )}
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong>{t('gameVersion')}</strong>
                <p className="muted">
                  Minecraft Java Edition
                </p>
              </div>

              <strong>
                {activeProfile.version}
              </strong>
            </div>

            <div className="setting-row">
              <div>
                <strong>
                  {t('memoryAllocation')}
                </strong>
                <p className="muted">
                  {t('memoryHelp')}
                </p>
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
                    onChange={event =>
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