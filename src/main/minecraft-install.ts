import {
  MinecraftFolder,
  Version,
  type ResolvedVersion
} from '@xmcl/core'
import {
  createDefaultNodeInstallRuntime,
  createFabricInstallWorkflow,
  createModernForgeInstallWorkflow,
  createLegacyForgeInstallWorkflow,
  executeInstallManifest,
  executeInstallWorkflow,
  resolveLibraryInstallFiles,
  resolveAssetMetadataInstallFiles,
  resolveAssetObjectInstallFiles,
  resolveMinecraftJarInstallFile,
  DEFAULT_RUNTIME_ALL_URL,
  parseJavaVersionOutput,
  ProgressTrackerMultiple,
  type InstallFile,
  type InstallWorkflow,
  type JavaRuntimeTarget
} from '@xmcl/installer'
import {
  join,
  resolve,
  dirname,
  sep,
  isAbsolute
} from 'node:path'
import { execFile, spawn } from 'node:child_process'
import {
  readFile,
  mkdir,
  writeFile,
  rename,
  chmod,
  cp,
  stat
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import type { GamePhase, GameProfile } from '../shared/game'
import { loaderVersions } from './loader-catalog'

export class InstallFailure extends Error {
  constructor(
    public readonly code:
      | 'JAVA_REQUIRED'
      | 'JAVA_INVALID'
      | 'DOWNLOAD_FAILED'
      | 'INSTALL_FAILED',
    public readonly javaMajor: number | null = null
  ) {
    super(code)
  }
}

export async function inspectJava(
  path: string
): Promise<number | null> {
  return new Promise(resolve => {
    execFile(
      path,
      ['-version'],
      {
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 128 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null)
          return
        }

        resolve(
          parseJavaVersionOutput(stdout, stderr)?.majorVersion ?? null
        )
      }
    )
  })
}

async function json(
  url: string,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MORU-Client/1.0.0',
      Accept: 'application/json'
    },
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(20000)
    ])
  })

  if (!response.ok) {
    throw new InstallFailure('DOWNLOAD_FAILED')
  }

  return response.json()
}

export async function saveJava(
  userData: string,
  major: number,
  path: string
): Promise<void> {
  let values: Record<string, string> = {}

  try {
    values = JSON.parse(
      await readFile(join(userData, 'java-paths.json'), 'utf8')
    )
  } catch {
    // 첫 Java 선택입니다.
  }

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    values = {}
  }

  values[String(major)] = path

  const temp = join(userData, `java-paths-${randomUUID()}.tmp`)

  await writeFile(temp, JSON.stringify(values), {
    mode: 0o600
  })

  await rename(temp, join(userData, 'java-paths.json'))
}

async function savedJava(
  userData: string,
  major: number
): Promise<string | null> {
  try {
    const values: unknown = JSON.parse(
      await readFile(join(userData, 'java-paths.json'), 'utf8')
    )

    const path = values && typeof values === 'object'
      ? (values as Record<string, unknown>)[String(major)]
      : null

    if (
      typeof path === 'string' &&
      await inspectJava(path) === major
    ) {
      return path
    }
  } catch {
    // 관리 중인 Java와 시스템 Java를 확인합니다.
  }

  return null
}

type Stage = (
  phase: GamePhase,
  tracker?: ProgressTrackerMultiple
) => void

export async function installMinecraft(
  profile: GameProfile,
  userData: string,
  signal: AbortSignal,
  stage: Stage
): Promise<{
  version: ResolvedVersion
  java: string
  resources: string
  game: string
}> {
  const resources = join(userData, 'minecraft')
  const game = join(userData, 'profiles', profile.id)
  const folder = new MinecraftFolder(resources)

  await mkdir(game, { recursive: true })
  await mkdir(resources, { recursive: true })

  const check = () => signal.throwIfAborted()

  const fetched: typeof fetch = (url, init) =>
    fetch(url, {
      ...init,
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(30000)
      ])
    })

  let java: string | undefined

  function runtime(phase: GamePhase) {
    const tracker = new ProgressTrackerMultiple()
    stage(phase, tracker)

    return createDefaultNodeInstallRuntime({
      signal,
      maxConcurrency: 6,
      tracker,
      runJava: async command => {
        check()

        if (!java) {
          throw new InstallFailure('JAVA_REQUIRED')
        }

        await new Promise<void>((resolve, reject) => {
          const child = spawn(java!, command.args, {
            cwd: command.cwd,
            env: { ...process.env, ...command.env },
            windowsHide: true,
            stdio: 'ignore',
            signal
          })

          child.once('error', reject)
          child.once('exit', code => {
            if (code === 0) resolve()
            else reject(new InstallFailure('INSTALL_FAILED'))
          })
        })
      }
    })
  }

  async function files(
    values: InstallFile[],
    phase: GamePhase
  ) {
    check()
    if (!values.length) return

    await executeInstallManifest(
      {
        schemaVersion: 1,
        tasks: [{
          id: phase,
          type: 'files',
          files: values
        }]
      },
      runtime(phase),
      { signal, attempts: 3 }
    )

    check()
  }

  async function workflow<T>(
    value: InstallWorkflow<T>,
    phase: GamePhase
  ): Promise<T> {
    check()

    const result = await executeInstallWorkflow(
      value,
      runtime(phase),
      { signal, attempts: 3 }
    )

    check()
    return result
  }

  stage('metadata')

  const manifest = await json(
    'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    signal
  ) as {
    versions?: Array<{
      id: string
      type: string
      url: string
      sha1: string
    }>
  }

  const entry = manifest.versions?.find(item =>
    item.id === profile.version &&
    item.type === 'release'
  )

  if (!entry || !/^[a-f0-9]{40}$/i.test(entry.sha1)) {
    throw new InstallFailure('INSTALL_FAILED')
  }

  const metadataUrl = new URL(entry.url)

  if (
    metadataUrl.protocol !== 'https:' ||
    ![
      'piston-meta.mojang.com',
      'launchermeta.mojang.com'
    ].includes(metadataUrl.hostname)
  ) {
    throw new InstallFailure('INSTALL_FAILED')
  }

  await files([{
    path: folder.getVersionJson(entry.id),
    urls: [entry.url],
    checksum: {
      algorithm: 'sha1',
      value: entry.sha1
    },
    validator: 'json'
  }], 'metadata')

  let resolved = await Version.parse(folder, profile.version)
  const major = resolved.javaVersion?.majorVersion ?? 8

  if (!Number.isInteger(major) || major < 8 || major > 100) {
    throw new InstallFailure('JAVA_REQUIRED', major)
  }

  stage('java')

  const managed = join(
    userData,
    'java',
    `${major}-${process.platform}-${process.arch}`
  )

  const executable =
    process.platform === 'win32' ? 'java.exe' : 'java'

  const candidates = [
    join(managed, 'bin', executable),
    join(
      managed,
      'jre.bundle',
      'Contents',
      'Home',
      'bin',
      executable
    ),
    join(managed, 'Contents', 'Home', 'bin', executable)
  ]

  java = await savedJava(userData, major) ?? undefined

  for (const candidate of [
    ...candidates,
    ...(process.env.JAVA_HOME
      ? [join(process.env.JAVA_HOME, 'bin', executable)]
      : []),
    'java'
  ]) {
    if (java) break

    if (await inspectJava(candidate) === major) {
      java = candidate
    }

    check()
  }

  if (!java) {
    const platform = process.platform === 'win32'
      ? `windows-${process.arch === 'ia32' ? 'x86' : process.arch}`
      : process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? 'mac-os-arm64'
          : 'mac-os'
        : process.platform === 'linux' && process.arch === 'x64'
          ? 'linux'
          : ''

    const component =
      resolved.javaVersion?.component ||
      (major === 8 ? 'jre-legacy' : '')

    if (!platform || !component) {
      throw new InstallFailure('JAVA_REQUIRED', major)
    }

    const index = await json(
      DEFAULT_RUNTIME_ALL_URL,
      signal
    ) as Record<string, Record<string, JavaRuntimeTarget[]>>

    const target = index[platform]?.[component]?.find(value => {
      const match = /^(?:1\.)?(\d+)/.exec(value.version.name)
      return match && Number(match[1]) === major
    })

    if (!target) {
      throw new InstallFailure('JAVA_REQUIRED', major)
    }

    try {
      const manifestFile = join(managed, '.moru-runtime.json')

      await files([{
        path: manifestFile,
        urls: [target.manifest.url],
        checksum: {
          algorithm: 'sha1',
          value: target.manifest.sha1
        },
        validator: 'json'
      }], 'java')

      const runtimeManifest = JSON.parse(
        await readFile(manifestFile, 'utf8')
      ) as {
        files: Record<string, {
          type: string
          target?: string
          executable?: boolean
          downloads?: {
            raw: {
              url: string
              sha1: string
              size: number
            }
          }
        }>
      }

      const base = resolve(managed)

      const confined = (path: string) => {
        const result = resolve(base, path)

        if (
          isAbsolute(path) ||
          path.includes('\\') ||
          (result !== base && !result.startsWith(base + sep))
        ) {
          throw new InstallFailure('JAVA_REQUIRED', major)
        }

        return result
      }

      const downloads: InstallFile[] = []
      const executables: string[] = []
      const links: Array<{
        source: string
        target: string
      }> = []

      for (const [name, entry] of Object.entries(runtimeManifest.files)) {
        check()
        const path = confined(name)

        if (entry.type === 'directory') {
          await mkdir(path, { recursive: true })
        } else if (entry.type === 'file' && entry.downloads?.raw) {
          const raw = entry.downloads.raw

          if (!/^[a-f0-9]{40}$/i.test(raw.sha1)) {
            throw new InstallFailure('JAVA_REQUIRED', major)
          }

          downloads.push({
            path,
            urls: [raw.url],
            size: raw.size,
            checksum: {
              algorithm: 'sha1',
              value: raw.sha1
            }
          })

          if (entry.executable) executables.push(path)
        } else if (
          entry.type === 'link' &&
          typeof entry.target === 'string'
        ) {
          const source = resolve(dirname(path), entry.target)

          if (
            source !== base &&
            !source.startsWith(base + sep)
          ) {
            throw new InstallFailure('JAVA_REQUIRED', major)
          }

          links.push({ source, target: path })
        } else {
          throw new InstallFailure('JAVA_REQUIRED', major)
        }
      }

      await files(downloads, 'java')

      if (process.platform !== 'win32') {
        for (const path of executables) {
          await chmod(path, 0o755)
        }
      }

      // 디렉터리 링크도 Windows 권한 문제 없이 사용할 수 있도록 복사합니다.
      for (let pass = 0; links.length && pass < 50; pass++) {
        let copied = 0

        for (let i = links.length - 1; i >= 0; i--) {
          const item = links[i]

          try {
            const info = await stat(item.source)

            if (
              info.isDirectory() &&
              item.target.startsWith(item.source + sep)
            ) {
              throw new InstallFailure('JAVA_REQUIRED', major)
            }

            await mkdir(dirname(item.target), { recursive: true })
            await cp(item.source, item.target, {
              recursive: true,
              force: true
            })

            links.splice(i, 1)
            copied++
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
          }
        }

        if (!copied) break
      }

      if (links.length) {
        throw new InstallFailure('JAVA_REQUIRED', major)
      }
    } catch (error) {
      if (signal.aborted) throw error
      throw new InstallFailure('JAVA_REQUIRED', major)
    }

    for (const candidate of candidates) {
      if (await inspectJava(candidate) === major) {
        java = candidate
        break
      }
    }

    if (!java) {
      throw new InstallFailure('JAVA_REQUIRED', major)
    }
  }

  const jar = resolveMinecraftJarInstallFile(resolved)

  if (!jar) {
    throw new InstallFailure('INSTALL_FAILED')
  }

  await files([
    jar,
    ...resolveLibraryInstallFiles(resolved.libraries, folder)
  ], 'game')

  if (profile.loader !== 'vanilla') {
    stage('loader')

    const supported = await loaderVersions(
      profile.version,
      profile.loader
    )

    check()

    let previous: {
      game?: string
      loader?: string
      version?: string
    } = {}

    const choiceFile = join(game, '.moru-loader-choice.json')

    try {
      previous = JSON.parse(await readFile(choiceFile, 'utf8'))
    } catch {
      // 이 프로필의 첫 설치입니다.
    }

    const remembered =
      previous?.game === profile.version &&
      previous?.loader === profile.loader
        ? previous.version
        : undefined

    const selected =
      profile.loaderVersion ||
      remembered ||
      supported[0]?.version

    if (
      !selected ||
      !supported.some(item => item.version === selected)
    ) {
      throw new InstallFailure('INSTALL_FAILED')
    }

    await writeFile(
      choiceFile,
      JSON.stringify({
        game: profile.version,
        loader: profile.loader,
        version: selected
      }),
      { mode: 0o600 }
    )

    const id =
      `moru-${profile.version}-${profile.loader}-` +
      createHash('sha256')
        .update(selected)
        .digest('hex')
        .slice(0, 16)

    if (profile.loader === 'fabric') {
      await workflow(
        createFabricInstallWorkflow({
          minecraftVersion: profile.version,
          version: selected,
          minecraft: folder,
          side: 'client',
          versionId: id,
          fetch: fetched,
          signal
        }),
        'loader'
      )
    } else {
      const legacyNeo =
        profile.loader === 'neoforge' &&
        profile.version === '1.20.1'

      const project =
        profile.loader === 'forge' || legacyNeo
          ? 'forge'
          : 'neoforge'

      const groupPath = profile.loader === 'forge'
        ? 'net/minecraftforge/forge'
        : `net/neoforged/${project}`

      const origin = profile.loader === 'forge'
        ? 'https://maven.minecraftforge.net'
        : 'https://maven.neoforged.net/releases'

      const base =
        `${origin}/${groupPath}/${encodeURIComponent(selected)}/` +
        `${project}-${encodeURIComponent(selected)}`

      let artifact: InstallFile | undefined
      let universal = false

      const suffixes = profile.loader === 'forge'
        ? ['installer.jar', 'universal.jar', 'universal.zip']
        : ['installer.jar']

      for (const suffix of suffixes) {
        const url = `${base}-${suffix}`
        const response = await fetched(`${url}.sha1`)

        if (response.status === 404) continue

        if (!response.ok) {
          throw new InstallFailure('DOWNLOAD_FAILED')
        }

        const hash = /^[a-f0-9]{40}/i.exec(
          (await response.text()).trim()
        )?.[0]

        if (!hash) {
          throw new InstallFailure('DOWNLOAD_FAILED')
        }

        artifact = {
          path: join(
            resources,
            'moru-installers',
            `${id}-${suffix}`
          ),
          urls: [url],
          checksum: {
            algorithm: 'sha1',
            value: hash
          },
          validator: 'zip'
        }

        universal = suffix !== 'installer.jar'
        break
      }

      if (!artifact) {
        throw new InstallFailure('INSTALL_FAILED')
      }

      if (universal) {
        await workflow(
          createLegacyForgeInstallWorkflow({
            id,
            minecraft: folder,
            minecraftVersion: profile.version,
            artifactVersion: selected,
            universal: artifact,
            installOptions: {
              versionId: id,
              inheritsFrom: profile.version
            }
          }),
          'loader'
        )
      } else {
        await workflow(
          createModernForgeInstallWorkflow({
            id,
            minecraft: folder,
            minecraftVersion: profile.version,
            artifactVersion: selected,
            installer: artifact,
            java,
            side: 'client',
            installOptions: {
              java,
              versionId: id,
              inheritsFrom: profile.version
            }
          }),
          'loader'
        )
      }
    }

    resolved = await Version.parse(folder, id)

    await files(
      resolveLibraryInstallFiles(resolved.libraries, folder),
      'loader'
    )
  }

  await files(
    resolveAssetMetadataInstallFiles(resolved, folder),
    'assets'
  )

  await files(
    await resolveAssetObjectInstallFiles(resolved, folder),
    'assets'
  )

  check()

  return {
    version: resolved,
    java,
    resources,
    game
  }
}