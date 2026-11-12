import { app } from 'electron'
import { join } from 'node:path'
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'

type Profile = {
  id: string
  version: string
  loader: string
}

type ModFile = {
  filename: string
  url: string
  primary?: boolean
  hashes: {
    sha512?: string
  }
}

type Version = {
  id: string
  project_id: string
  game_versions: string[]
  loaders: string[]
  files: ModFile[]
  dependencies: Array<{
    dependency_type: string
    project_id?: string | null
    version_id?: string | null
  }>
}

export type InstalledMod = {
  projectId: string
  versionId: string
  filename: string
}

const busy = new Set<string>()

function directory(profile: Profile): string {
  if (
    !profile ||
    typeof profile.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(profile.id) ||
    typeof profile.version !== 'string' ||
    !profile.version ||
    profile.version.length > 50
  ) {
    throw new Error('잘못된 프로필입니다. / Invalid profile.')
  }

  return join(
    app.getPath('userData'),
    'profiles',
    profile.id,
    'mods'
  )
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(
    `https://api.modrinth.com/v2/${path}`,
    {
      headers: {
        'User-Agent': 'MORU-Client/1.0.0',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(20000)
    }
  )

  if (!response.ok) {
    throw new Error(`Modrinth HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function listInstalled(
  profile: Profile
): Promise<InstalledMod[]> {
  const dir = directory(profile)

  try {
    const data: unknown = JSON.parse(
      await readFile(join(dir, '.moru-mods.json'), 'utf8')
    )

    if (
      !Array.isArray(data) ||
      !data.every(
        item =>
          item &&
          typeof item.projectId === 'string' &&
          typeof item.versionId === 'string' &&
          typeof item.filename === 'string'
      )
    ) {
      throw new Error(
        '설치 목록 형식 오류 / Invalid installation manifest'
      )
    }

    return data as InstalledMod[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function installMod(
  profile: Profile,
  projectId: string
): Promise<{ added: number }> {
  const dir = directory(profile)

  if (profile.loader !== 'fabric') {
    throw new Error(
      'Fabric 프로필을 선택해 주세요. / Select a Fabric profile.'
    )
  }

  if (
    typeof projectId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)
  ) {
    throw new Error('Invalid project')
  }

  if (busy.has(dir)) {
    throw new Error(
      '다운로드 중입니다. / Download in progress.'
    )
  }

  busy.add(dir)

  const stage = join(dir, `.download-${randomUUID()}`)
  const moved: string[] = []

  try {
    const installed = await listInstalled(profile)
    const plan = new Map<string, Version>()

    async function resolve(
      project?: string | null,
      exact?: string | null
    ): Promise<void> {
      if (
        project &&
        !exact &&
        (
          plan.has(project) ||
          installed.some(item => item.projectId === project)
        )
      ) {
        return
      }

      const params = new URLSearchParams({
        loaders: JSON.stringify(['fabric']),
        game_versions: JSON.stringify([profile.version])
      })

      const version = exact
        ? await api<Version>(
            `version/${encodeURIComponent(exact)}`
          )
        : (
            await api<Version[]>(
              `project/${encodeURIComponent(project ?? '')}/version?${params}`
            )
          ).find(
            item =>
              item.loaders.includes('fabric') &&
              item.game_versions.includes(profile.version)
          )

      if (
        !version ||
        !version.loaders.includes('fabric') ||
        !version.game_versions.includes(profile.version)
      ) {
        throw new Error(
          '호환되는 모드 버전이 없습니다. / No compatible mod version.'
        )
      }

      if (project && version.project_id !== project) {
        throw new Error('Dependency project mismatch')
      }

      const previous = installed.find(
        item => item.projectId === version.project_id
      )

      if (previous) {
        if (exact && previous.versionId !== version.id) {
          throw new Error(
            '설치된 의존성 버전이 다릅니다. / Installed dependency version conflict.'
          )
        }

        return
      }

      const existing = plan.get(version.project_id)

      if (existing) {
        if (exact && existing.id !== version.id) {
          throw new Error('Dependency version conflict')
        }

        return
      }

      if (plan.size >= 80) {
        throw new Error('Too many dependencies')
      }

      plan.set(version.project_id, version)

      for (const dependency of version.dependencies ?? []) {
        if (dependency.dependency_type !== 'required') {
          continue
        }

        if (
          !dependency.project_id &&
          !dependency.version_id
        ) {
          throw new Error('Unresolved dependency')
        }

        await resolve(
          dependency.project_id,
          dependency.version_id
        )
      }
    }

    await resolve(projectId)

    if (!plan.size) {
      return { added: 0 }
    }

    await mkdir(stage, { recursive: true })

    const additions: InstalledMod[] = []

    for (const version of plan.values()) {
      const file =
        version.files.find(item => item.primary) ??
        version.files[0]

      if (
        !file ||
        !/^[a-zA-Z0-9_][a-zA-Z0-9._+() -]*\.jar$/i.test(
          file.filename
        ) ||
        file.filename.length > 180
      ) {
        throw new Error('Invalid mod filename')
      }

      if (
        additions.some(
          item =>
            item.filename.toLowerCase() ===
            file.filename.toLowerCase()
        )
      ) {
        throw new Error('Duplicate filename')
      }

      const url = new URL(file.url)

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'cdn.modrinth.com' ||
        url.port ||
        url.username ||
        url.password
      ) {
        throw new Error('Invalid download URL')
      }

      const hash = file.hashes?.sha512

      if (!hash || !/^[a-f0-9]{128}$/i.test(hash)) {
        throw new Error('Missing SHA-512')
      }

      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(120000)
      })

      if (!response.ok || !response.body) {
        throw new Error('Download failed')
      }

      const chunks: Uint8Array[] = []
      let size = 0

      for await (const chunk of response.body) {
        size += chunk.length

        if (size > 100 * 1024 * 1024) {
          throw new Error('Mod file exceeds 100 MB')
        }

        chunks.push(chunk)
      }

      const data = Buffer.concat(chunks)

      const actualHash = createHash('sha512')
        .update(data)
        .digest('hex')

      if (actualHash !== hash.toLowerCase()) {
        throw new Error(
          '파일 검증 실패 / File verification failed'
        )
      }

      await writeFile(join(stage, file.filename), data)

      additions.push({
        projectId: version.project_id,
        versionId: version.id,
        filename: file.filename
      })
    }

    for (const mod of additions) {
      const destination = join(dir, mod.filename)

      await writeFile(
        destination,
        await readFile(join(stage, mod.filename)),
        { flag: 'wx' }
      )

      moved.push(destination)
    }

    await writeFile(
      join(stage, 'manifest.json'),
      JSON.stringify([...installed, ...additions], null, 2)
    )

    await rename(
      join(stage, 'manifest.json'),
      join(dir, '.moru-mods.json')
    )

    return { added: additions.length }
  } catch (error) {
    for (const file of moved) {
      await rm(file, { force: true }).catch(() => undefined)
    }

    throw error
  } finally {
    try {
      await rm(stage, {
        recursive: true,
        force: true
      })
    } finally {
      busy.delete(dir)
    }
  }
}