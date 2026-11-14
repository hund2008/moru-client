export const themes = [
  {
    id: 'mint',
    ko: '포레스트 민트',
    en: 'Forest Mint',
    background: '#0D1512',
    panel: '#17271F',
    accent: '#49D9A0'
  },
  {
    id: 'blue',
    ko: '미드나잇 블루',
    en: 'Midnight Blue',
    background: '#0D1420',
    panel: '#19263A',
    accent: '#73AEFF'
  },
  {
    id: 'lavender',
    ko: '슬레이트 라벤더',
    en: 'Slate Lavender',
    background: '#14151C',
    panel: '#232532',
    accent: '#B7A4EC'
  },
  {
    id: 'amber',
    ko: '웜 앰버',
    en: 'Warm Amber',
    background: '#181512',
    panel: '#2A231B',
    accent: '#E9B66D'
  },
  {
    id: 'ice',
    ko: '차콜 아이스',
    en: 'Charcoal Ice',
    background: '#121619',
    panel: '#20292E',
    accent: '#9FE5EF'
  }
] as const

export type ThemeId = typeof themes[number]['id']

const key = 'moru-theme-v1'
const event = 'moru-theme-changed'

function valid(value: unknown): value is ThemeId {
  return themes.some(theme => theme.id === value)
}

function render(id: ThemeId): void {
  const theme =
    themes.find(value => value.id === id) ?? themes[0]

  const root = document.documentElement

  root.dataset.moruTheme = theme.id
  root.style.setProperty('--moru-bg', theme.background)
  root.style.setProperty('--moru-panel', theme.panel)
  root.style.setProperty('--moru-accent', theme.accent)
}

export function currentTheme(): ThemeId {
  const value = document.documentElement.dataset.moruTheme
  return valid(value) ? value : 'mint'
}

export function setTheme(id: ThemeId): boolean {
  if (!valid(id)) return false

  render(id)

  let saved = true

  try {
    localStorage.setItem(key, id)
  } catch {
    saved = false
  }

  window.dispatchEvent(new Event(event))

  return saved
}

export function subscribeTheme(
  listener: () => void
): () => void {
  window.addEventListener(event, listener)

  return () => {
    window.removeEventListener(event, listener)
  }
}

let initialized = false

export function initializeTheme(): void {
  if (initialized) return
  initialized = true

  let value: string | null = null

  try {
    value = localStorage.getItem(key)
  } catch {
    // 저장된 값을 읽지 못하면 기본 테마를 사용합니다.
  }

  render(valid(value) ? value : 'mint')

  window.addEventListener('storage', changed => {
    if (changed.key !== key && changed.key !== null) return

    render(
      valid(changed.newValue)
        ? changed.newValue
        : 'mint'
    )

    window.dispatchEvent(new Event(event))
  })
}