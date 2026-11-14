import { ipcMain, type IpcMainInvokeEvent } from 'electron'

type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge'
type Entry = { version: string; label: string }

const cache = new Map<string, {
  expires: number
  value: unknown
}>()

const pending = new Map<string, Promise<unknown>>()

async function metadata(url: string, json: boolean): Promise<unknown> {
  const hit = cache.get(url)
  if (hit && hit.expires > Date.now()) return hit.value

  const existing = pending.get(url)
  if (existing) return existing

  const request = (async () => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MORU-Client/1.0.0',
        Accept: json ? 'application/json' : 'application/xml'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      throw new Error(
        `목록 서버 응답 오류 / Metadata HTTP ${response.status}`
      )
    }

    const text = await response.text()

    if (text.length > 4 * 1024 * 1024) {
      throw new Error('목록 응답이 너무 큽니다. / Metadata too large.')
    }

    const value: unknown = json ? JSON.parse(text) : text

    cache.set(url, {
      value,
      expires: Date.now() + 10 * 60 * 1000
    })

    if (cache.size > 80) {
      cache.delete(cache.keys().next().value!)
    }

    return value
  })().finally(() => pending.delete(url))

  pending.set(url, request)
  return request
}

function xmlVersions(value: unknown): string[] {
  if (
    typeof value !== 'string' ||
    !value.includes('<metadata')
  ) {
    throw new Error('목록 형식 오류 / Invalid metadata.')
  }

  return [
    ...value.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)
  ]
    .map(match => match[1])
    .filter(version =>
      /^[a-zA-Z0-9._+\-]{1,150}$/.test(version)
    )
}

function ordered(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => {
    const aPreview = /alpha|beta|rc|snapshot/i.test(a)
    const bPreview = /alpha|beta|rc|snapshot/i.test(b)

    if (aPreview !== bPreview) {
      return aPreview ? 1 : -1
    }

    return b.localeCompare(a, 'en', { numeric: true })
  })
}

export async function loaderVersions(
  game: string,
  loader: Loader
): Promise<Entry[]> {
  if (loader === 'vanilla') return []

  if (loader === 'fabric') {
    const data = await metadata(
      `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(game)}`,
      true
    )

    if (!Array.isArray(data)) {
      throw new Error('Fabric 목록 형식 오류')
    }

    const versions = data
      .map(item => item?.loader?.version)
      .filter((version): version is string =>
        typeof version === 'string' &&
        /^[a-zA-Z0-9._+\-]{1,150}$/.test(version)
      )

    return ordered(versions).map(version => ({
      version,
      label: version
    }))
  }

  if (loader === 'forge') {
    let versions: string[]

    try {
      versions = xmlVersions(await metadata(
        'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
        false
      ))
    } catch {
      const data = await metadata(
        'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json',
        true
      )

      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data)
      ) {
        throw new Error('Forge 목록 형식 오류')
      }

      const values = (data as Record<string, unknown>)[game]

      if (values !== undefined && !Array.isArray(values)) {
        throw new Error('Forge 목록 형식 오류')
      }

      versions = (values ?? []).filter(
        (version: unknown): version is string =>
          typeof version === 'string' &&
          /^[a-zA-Z0-9._+\-]{1,150}$/.test(version)
      )
    }

    return ordered(
      versions.filter(version => version.startsWith(`${game}-`))
    ).map(version => ({
      version,
      label: version.slice(game.length + 1)
    }))
  }

  // 초기 NeoForge는 별도 Maven 좌표를 사용합니다.
  if (game === '1.20.1') {
    const versions = xmlVersions(await metadata(
      'https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml',
      false
    ))

    return ordered(
      versions.filter(version => version.startsWith('1.20.1-'))
    ).map(version => ({
      version,
      label: version.slice('1.20.1-'.length)
    }))
  }

  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(game)
  if (!match) return []

  let prefix: string

  if (+match[1] === 1) {
    if (
      +match[2] < 20 ||
      (+match[2] === 20 && +(match[3] ?? 0) < 2)
    ) return []

    prefix = `${+match[2]}.${+(match[3] ?? 0)}.`
  } else if (+match[1] >= 26) {
    prefix = `${+match[1]}.${+match[2]}.${+(match[3] ?? 0)}.`
  } else {
    return []
  }

  const versions = xmlVersions(await metadata(
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    false
  ))

  return ordered(
    versions.filter(version =>
      version.startsWith(prefix) &&
      !/\+(?:snapshot|pre|rc)(?:[-.]|$)/i.test(version)
    )
  ).map(version => ({
    version,
    label: version
  }))
}

export function registerLoaderCatalog(
  trusted: (event: IpcMainInvokeEvent) => void,
  releases: () => Promise<{ releases: string[] }>
): void {
  ipcMain.handle(
    'profiles:loader-versions',
    async (
      event,
      game: unknown,
      loader: unknown
    ): Promise<Entry[]> => {
      trusted(event)

      if (
        typeof game !== 'string' ||
        typeof loader !== 'string' ||
        !['vanilla', 'fabric', 'forge', 'neoforge'].includes(loader)
      ) {
        throw new Error('잘못된 프로필 조건입니다.')
      }

      const catalog = await releases()

      if (!catalog.releases.includes(game)) {
        throw new Error('정식 릴리즈 버전을 선택해 주세요.')
      }

      return loaderVersions(game, loader as Loader)
    }
  )
}