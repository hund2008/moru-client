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
  translate,
  type Language,
  type TranslationKey
} from './locales'

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
      reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () =>
      reject(new Error('IndexedDB is blocked'))
  })
}

async function readSavedFont(): Promise<SavedFont | null> {
  const database = await openFontDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readonly')
      const request = transaction.objectStore(FONT_STORE).get(FONT_KEY)

      request.onsuccess = () =>
        resolve((request.result as SavedFont | undefined) ?? null)
      request.onerror = () =>
        reject(request.error ?? new Error('Font read failed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Font read aborted'))
    })
  } finally {
    database.close()
  }
}

async function saveSelectedFont(value: SavedFont): Promise<void> {
  const database = await openFontDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readwrite')
      transaction.objectStore(FONT_STORE).put(value, FONT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Font save failed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Font save aborted'))
    })
  } finally {
    database.close()
  }
}

async function clearSelectedFont(): Promise<void> {
  const database = await openFontDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FONT_STORE, 'readwrite')
      transaction.objectStore(FONT_STORE).delete(FONT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Font remove failed'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Font remove aborted'))
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
  if (!isTrueTypeFont(buffer)) throw new Error('font-format')
  return new FontFace('MORU User Font', buffer).load()
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

export function MoruSelect({
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
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const chosen = options.find(option => option.value === value)

  const updatePosition = useCallback(() => {
    const target = triggerRef.current
    if (!target) return

    const rect = target.getBoundingClientRect()
    const visibleHeight = Math.min(284, options.length * 46 + 12)
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const showAbove = below < visibleHeight && above > below
    const maxHeight = Math.max(
      60,
      Math.min(284, (showAbove ? above : below) - 8)
    )
    const top = showAbove
      ? Math.max(8, rect.top - maxHeight - 7)
      : rect.bottom + 7
    const width = Math.min(rect.width, window.innerWidth - 16)
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8)
    )

    setPosition({ top, left, width, maxHeight, above: showAbove })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const reposition = () => updatePosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
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
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function openMenu() {
    if (disabled) return

    const selectedIndex = options.findIndex(
      option => option.value === value && !option.disabled
    )

    setHighlighted(
      selectedIndex >= 0
        ? selectedIndex
        : Math.max(0, options.findIndex(option => !option.disabled))
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

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      if (open) event.preventDefault()
      setOpen(false)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()

      if (!open) {
        openMenu()
        return
      }

      if (!options.some(option => !option.disabled)) return

      const direction = event.key === 'ArrowDown' ? 1 : -1
      let next = highlighted

      for (let i = 0; i < options.length; i++) {
        next = (next + direction + options.length) % options.length
        if (!options[next].disabled) {
          setHighlighted(next)
          break
        }
      }

      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && open) {
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
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={
          open ? `${id}-option-${highlighted}` : undefined
        }
        disabled={disabled || options.length === 0}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
      >
        <span className="moru-select-value">
          {variant === 'hero' && (
            <span className="moru-select-dot" aria-hidden="true" />
          )}
          <span className="moru-select-text">
            {chosen?.label ?? '—'}
          </span>
        </span>
        <span className="moru-select-arrow" aria-hidden="true" />
      </button>

      {open && position && createPortal(
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
                option.value === value ? 'is-selected' : '',
                index === highlighted ? 'is-highlighted' : ''
              ].join(' ')}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => selectOption(option)}
            >
              <span className="moru-select-option-label">
                {option.label}
              </span>
              {option.value === value && (
                <span className="moru-select-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>,
        triggerRef.current?.closest('dialog') ?? document.body
      )}
    </div>
  )
}

export function useLauncherPreferences() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('moru-language') === 'en' ? 'en' : 'ko'
    } catch {
      return 'ko'
    }
  })

  const [fontName, setFontName] = useState<string | null>(null)
  const [fontBusy, setFontBusy] = useState(false)
  const [fontError, setFontError] = useState<TranslationKey | null>(null)
  const fontInput = useRef<HTMLInputElement>(null)
  const currentFont = useRef<FontFace | null>(null)
  const t = (key: TranslationKey) => translate(language, key)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem('moru-language', language)
    } catch {
      // 저장할 수 없으면 현재 실행에서만 유지합니다.
    }
  }, [language])

  function activate(face: FontFace) {
    if (currentFont.current) document.fonts.delete(currentFont.current)
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

        if (!cancelled) {
          activate(face)
          setFontName(saved.name)
        }
      } catch {
        if (!cancelled) setFontError('fontLoadError')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function onFontChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setFontError(null)

    if (!file.name.toLowerCase().endsWith('.ttf')) {
      setFontError('fontInvalidFile')
      return
    }

    if (!file.size || file.size > MAX_FONT_BYTES) {
      setFontError('fontTooLarge')
      return
    }

    setFontBusy(true)

    try {
      const face = await prepareFont(file)
      await saveSelectedFont({ name: file.name, file })
      activate(face)
      setFontName(file.name)
    } catch (error) {
      setFontError(
        error instanceof Error && error.message === 'font-format'
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
      if (currentFont.current) document.fonts.delete(currentFont.current)
      currentFont.current = null
      document.documentElement.style.removeProperty('--moru-selected-font')
      setFontName(null)
    } catch {
      setFontError('fontResetError')
    } finally {
      setFontBusy(false)
    }
  }

  return {
    language,
    setLanguage,
    t,
    fontName,
    fontBusy,
    fontError,
    fontInput,
    onFontChange,
    resetFont
  }
}

export type LauncherPreferences =
  ReturnType<typeof useLauncherPreferences>