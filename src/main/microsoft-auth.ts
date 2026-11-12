import { app, safeStorage, shell } from 'electron'
import {
  PublicClientApplication,
  InteractionRequiredAuthError
} from '@azure/msal-node'
import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm
} from 'node:fs/promises'
import type {
  AuthCode,
  AuthStage,
  AuthState
} from '../shared/auth'

declare const __MORU_MICROSOFT_CLIENT_ID__: string

const scopes = ['XboxLive.signin', 'offline_access']
const authority = 'https://login.microsoftonline.com/consumers'

class Failure extends Error {
  constructor(
    readonly code: AuthCode,
    readonly stage: AuthStage,
    readonly httpStatus?: number,
    readonly xboxCode?: number
  ) {
    super(code)
  }
}

const signedOut = (): AuthState => ({
  status: 'signedOut',
  stage: 'idle',
  profile: null,
  error: null
})

export class MicrosoftAuth {
  private state: AuthState = signedOut()
  private client: PublicClientApplication | null = null
  private selectedAccount = ''
  private running: Promise<AuthState> | null = null
  private signingOut = false
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private session: {
    accessToken: string
    expiresAt: number
  } | null = null

  private readonly cacheFile = join(
    app.getPath('userData'),
    'auth',
    'microsoft.bin'
  )

  private readonly clientId = (
    process.env.MORU_MICROSOFT_CLIENT_ID ||
    (
      typeof __MORU_MICROSOFT_CLIENT_ID__ === 'string'
        ? __MORU_MICROSOFT_CLIENT_ID__
        : ''
    )
  ).trim()

  constructor(
    private readonly notify: (state: AuthState) => void
  ) {}

  getState(): AuthState {
    return structuredClone(this.state)
  }

  private publish(state: AuthState): AuthState {
    this.state = state
    this.notify(this.getState())
    return this.getState()
  }

  private stage(stage: AuthStage): void {
    this.publish({
      status: 'signingIn',
      stage,
      profile: null,
      error: null
    })
  }

  private check(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Failure('CANCELLED', this.state.stage)
    }
  }

  private secure(): void {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text'
      )
    ) {
      throw new Failure('STORAGE_UNAVAILABLE', 'storage')
    }
  }

  private createClient(): PublicClientApplication {
    return new PublicClientApplication({
      auth: {
        clientId: this.clientId,
        authority
      },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          loggerCallback: () => undefined
        }
      }
    })
  }

  private async load(): Promise<boolean> {
    this.secure()

    try {
      const encrypted = await readFile(this.cacheFile)

      if (encrypted.length > 8 * 1024 * 1024) {
        throw new Error('cache too large')
      }

      const value = JSON.parse(
        safeStorage.decryptString(encrypted)
      ) as {
        clientId: string
        account: string
        cache: string
      }

      if (value.clientId !== this.clientId) return false

      if (
        typeof value.account !== 'string' ||
        typeof value.cache !== 'string'
      ) {
        throw new Error('invalid cache')
      }

      this.client!.getTokenCache().deserialize(value.cache)
      this.selectedAccount = value.account

      return true
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return false
      }

      throw new Failure('CACHE_INVALID', 'storage')
    }
  }

  private async save(signal: AbortSignal): Promise<void> {
    this.check(signal)
    this.secure()

    const temporary = `${this.cacheFile}.tmp`

    try {
      const encrypted = safeStorage.encryptString(
        JSON.stringify({
          clientId: this.clientId,
          account: this.selectedAccount,
          cache: this.client!.getTokenCache().serialize()
        })
      )

      await mkdir(
        join(app.getPath('userData'), 'auth'),
        { recursive: true }
      )

      await writeFile(temporary, encrypted, {
        mode: 0o600
      })

      this.check(signal)
      await rename(temporary, this.cacheFile)
    } catch (error) {
      await rm(temporary, { force: true })
        .catch(() => undefined)

      if (error instanceof Failure) throw error

      throw new Failure('STORAGE_FAILED', 'storage')
    }
  }

  private async browserToken(signal: AbortSignal) {
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const nonce = randomBytes(32).toString('base64url')

    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url')

    let accept: (code: string) => void = () => undefined
    let reject: (error: Error) => void = () => undefined

    const codePromise = new Promise<string>(
      (resolve, fail) => {
        accept = resolve
        reject = fail
      }
    )

    void codePromise.catch(() => undefined)

    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'"
      )
      response.setHeader('Referrer-Policy', 'no-referrer')

      const address = server.address()
      const port =
        typeof address === 'object' && address
          ? address.port
          : 0

      let url: URL

      try {
        url = new URL(
          request.url || '/',
          `http://localhost:${port}`
        )
      } catch {
        response.writeHead(400).end('Invalid response.')
        return
      }

      if (
        request.method !== 'GET' ||
        request.headers.host !== `localhost:${port}` ||
        url.pathname !== '/' ||
        url.searchParams.getAll('state').length !== 1 ||
        url.searchParams.get('state') !== state
      ) {
        response
          .writeHead(400)
          .end('Invalid sign-in response.')
        return
      }

      if (url.searchParams.has('error')) {
        response
          .writeHead(200)
          .end('Sign-in was not completed. Return to MORU.')

        reject(new Failure('OAUTH_DENIED', 'microsoft'))
        return
      }

      const codes = url.searchParams.getAll('code')

      if (codes.length !== 1 || !codes[0]) {
        response.writeHead(400).end('Invalid response.')
        return
      }

      response
        .writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8'
        })
        .end(
          'Microsoft sign-in received. Return to MORU to finish Minecraft verification.'
        )

      accept(codes[0])
    })

    const abort = () =>
      reject(new Failure('CANCELLED', 'microsoft'))

    signal.addEventListener('abort', abort, {
      once: true
    })

    const timeout = setTimeout(
      () => reject(new Failure('TIMEOUT', 'microsoft')),
      5 * 60 * 1000
    )

    try {
      await new Promise<void>((resolve, fail) => {
        server.once('error', fail)
        server.listen(0, '127.0.0.1', () => resolve())
      })

      this.check(signal)

      const address = server.address()

      if (!address || typeof address === 'string') {
        throw new Failure('SERVICE_ERROR', 'microsoft')
      }

      const redirectUri =
        `http://localhost:${address.port}`

      const url = await this.client!.getAuthCodeUrl({
        scopes,
        redirectUri,
        state,
        nonce,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        responseMode: 'query',
        prompt: 'select_account'
      })

      this.check(signal)

      const parsed = new URL(url)

      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'login.microsoftonline.com'
      ) {
        throw new Failure('OAUTH_CONFIG', 'microsoft')
      }

      await shell.openExternal(url)

      const code = await codePromise
      this.check(signal)

      return await this.client!.acquireTokenByCode({
        scopes,
        redirectUri,
        code,
        codeVerifier: verifier,
        nonce
      })
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      server.close()
      server.closeAllConnections()
    }
  }

  private async request<T>(
    stage: AuthStage,
    url: string,
    signal: AbortSignal,
    body?: unknown,
    token?: string
  ): Promise<T> {
    this.check(signal)

    let response: Response

    try {
      response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          ...(body
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(20000)
        ])
      })
    } catch {
      this.check(signal)
      throw new Failure('NETWORK', stage)
    }

    let value: Record<string, unknown>

    try {
      value = await response.json() as Record<string, unknown>
    } catch {
      throw new Failure(
        'SERVICE_ERROR',
        stage,
        response.status
      )
    }

    if (!response.ok) {
      const xboxCode =
        typeof value.XErr === 'number'
          ? value.XErr
          : undefined

      if (
        stage === 'xsts' &&
        xboxCode === 2148916233
      ) {
        throw new Failure(
          'XBOX_PROFILE_REQUIRED',
          stage,
          response.status,
          xboxCode
        )
      }

      if (
        stage === 'xsts' &&
        xboxCode === 2148916238
      ) {
        throw new Failure(
          'XBOX_CHILD_ACCOUNT',
          stage,
          response.status,
          xboxCode
        )
      }

      if (stage === 'xsts' && xboxCode) {
        throw new Failure(
          'XBOX_RESTRICTED',
          stage,
          response.status,
          xboxCode
        )
      }

      const message = String(
        value.errorMessage ??
        value.message ??
        value.error ??
        ''
      )

      if (
        stage === 'minecraft' &&
        response.status === 403 &&
        /invalid app registration|appreginfo|not.{0,20}approved|allowlist/i.test(
          message
        )
      ) {
        throw new Failure(
          'APP_ACCESS_REQUIRED',
          stage,
          response.status
        )
      }

      if (
        stage === 'profile' &&
        response.status === 404
      ) {
        throw new Failure(
          'PROFILE_MISSING',
          stage,
          response.status
        )
      }

      if (response.status === 403) {
        throw new Failure(
          'SERVICE_FORBIDDEN',
          stage,
          response.status
        )
      }

      if (response.status === 401) {
        throw new Failure(
          'REAUTH_REQUIRED',
          stage,
          response.status
        )
      }

      throw new Failure(
        'SERVICE_ERROR',
        stage,
        response.status
      )
    }

    return value as T
  }

  private async minecraft(
    msToken: string,
    signal: AbortSignal
  ): Promise<{
    profile: NonNullable<AuthState['profile']>
    accessToken: string
    expiresAt: number
  }> {
    type Xbox = {
      Token: string
      DisplayClaims: {
        xui: Array<{ uhs: string }>
      }
    }

    this.stage('xbox')

    const xbox = await this.request<Xbox>(
      'xbox',
      'https://user.auth.xboxlive.com/user/authenticate',
      signal,
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${msToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      }
    )

    if (!xbox.Token) {
      throw new Failure('SERVICE_ERROR', 'xbox')
    }

    this.stage('xsts')

    const xsts = await this.request<Xbox>(
      'xsts',
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      signal,
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xbox.Token]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      }
    )

    const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs

    if (!xsts.Token || !uhs) {
      throw new Failure('SERVICE_ERROR', 'xsts')
    }

    this.stage('minecraft')

    const minecraft = await this.request<{
      access_token: string
      expires_in: number
    }>(
      'minecraft',
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      signal,
      {
        identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
      }
    )

    if (
      !minecraft.access_token ||
      !Number.isFinite(minecraft.expires_in) ||
      minecraft.expires_in <= 0
    ) {
      throw new Failure('SERVICE_ERROR', 'minecraft')
    }

    this.stage('ownership')

    const ownership = await this.request<{
      items: Array<{ name: string }>
    }>(
      'ownership',
      'https://api.minecraftservices.com/entitlements/mcstore',
      signal,
      undefined,
      minecraft.access_token
    )

    if (!Array.isArray(ownership.items)) {
      throw new Failure('SERVICE_ERROR', 'ownership')
    }

    if (
      !ownership.items.some(
        item =>
          item.name === 'game_minecraft' ||
          item.name === 'product_minecraft'
      )
    ) {
      throw new Failure('NOT_OWNED', 'ownership')
    }

    this.stage('profile')

    const profile = await this.request<{
      id: string
      name: string
      skins?: Array<{
        state: string
        url: string
      }>
    }>(
      'profile',
      'https://api.minecraftservices.com/minecraft/profile',
      signal,
      undefined,
      minecraft.access_token
    )

    if (
      !/^[0-9a-f]{32}$/i.test(profile.id) ||
      !/^[a-zA-Z0-9_]{1,16}$/.test(profile.name)
    ) {
      throw new Failure('SERVICE_ERROR', 'profile')
    }

    let skin: string | null = null

    const activeSkin = profile.skins?.find(
      item => item.state === 'ACTIVE'
    )

    if (activeSkin) {
      try {
        const url = new URL(activeSkin.url)

        if (
          (
            url.protocol === 'https:' ||
            url.protocol === 'http:'
          ) &&
          url.hostname === 'textures.minecraft.net' &&
          /^\/texture\/[0-9a-f]+$/i.test(url.pathname) &&
          !url.port &&
          !url.username &&
          !url.password
        ) {
          url.protocol = 'https:'

          const response = await fetch(url, {
            redirect: 'error',
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(10000)
            ])
          })

          if (response.ok && response.body) {
            const parts: Uint8Array[] = []
            let length = 0

            for await (const chunk of response.body) {
              length += chunk.length

              if (length > 512 * 1024) {
                throw new Error('skin too large')
              }

              parts.push(chunk)
            }

            const data = Buffer.concat(parts)

            if (
              data.subarray(0, 8).equals(
                Buffer.from([
                  137, 80, 78, 71, 13, 10, 26, 10
                ])
              )
            ) {
              skin =
                `data:image/png;base64,${data.toString('base64')}`
            }
          }
        }
      } catch {
        // 스킨 미리보기 실패는 계정 인증 성공에 영향을 주지 않습니다.
      }
    }

    this.check(signal)

    return {
      profile: {
        id: profile.id,
        name: profile.name,
        skin
      },
      accessToken: minecraft.access_token,
      expiresAt:
        Date.now() + minecraft.expires_in * 1000
    }
  }

  private failure(error: unknown): AuthState {
    let failure =
      error instanceof Failure ? error : null

    if (!failure) {
      const code = String(
        (error as { errorCode?: string })?.errorCode ?? ''
      )

      if (
        error instanceof InteractionRequiredAuthError ||
        /interaction_required|invalid_grant|no_tokens_found|no_account/.test(
          code
        )
      ) {
        failure = new Failure(
          'REAUTH_REQUIRED',
          'microsoft'
        )
      } else if (
        /invalid_client|unauthorized_client|invalid_scope|invalid_request|redirect_uri/.test(
          code
        )
      ) {
        failure = new Failure(
          'OAUTH_CONFIG',
          'microsoft'
        )
      } else if (/access_denied|user_cancel/.test(code)) {
        failure = new Failure(
          'OAUTH_DENIED',
          'microsoft'
        )
      } else if (
        /network|timeout|request_cannot/.test(code)
      ) {
        failure = new Failure('NETWORK', 'microsoft')
      } else {
        failure = new Failure(
          'SERVICE_ERROR',
          this.state.stage
        )
      }
    }

    this.session = null

    return this.publish({
      status: 'error',
      stage: failure.stage,
      profile: null,
      error: {
        code: failure.code,
        stage: failure.stage,
        ...(failure.httpStatus
          ? { httpStatus: failure.httpStatus }
          : {}),
        ...(failure.xboxCode
          ? { xboxCode: failure.xboxCode }
          : {})
      }
    })
  }

  initialize(): Promise<AuthState> {
    return this.run(false, true)
  }

  login(): Promise<AuthState> {
    return this.run(true, false)
  }

  refresh(): Promise<AuthState> {
    return this.run(false, false)
  }

  private run(
    interactive: boolean,
    startup: boolean
  ): Promise<AuthState> {
    if (this.signingOut) {
      return Promise.resolve(this.getState())
    }

    if (this.running) return this.running

    if (this.timer) clearTimeout(this.timer)

    this.session = null

    const controller = new AbortController()
    this.controller = controller

    this.running = (async () => {
      try {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            this.clientId
          )
        ) {
          if (startup) {
            return this.publish(signedOut())
          }

          throw new Failure(
            'CLIENT_ID_MISSING',
            'microsoft'
          )
        }

        this.secure()

        if (!this.client) {
          this.client = this.createClient()
          await this.load()
        }

        this.check(controller.signal)
        this.stage('microsoft')

        let result

        if (interactive) {
          result = await this.browserToken(
            controller.signal
          )
        } else {
          const account = await this.client
            .getTokenCache()
            .getAccountByHomeId(this.selectedAccount)

          if (!account) {
            if (startup) {
              return this.publish(signedOut())
            }

            throw new Failure(
              'REAUTH_REQUIRED',
              'microsoft'
            )
          }

          result = await this.client.acquireTokenSilent({
            scopes,
            account
          })
        }

        this.check(controller.signal)

        if (!result?.accessToken || !result.account) {
          throw new Failure(
            'REAUTH_REQUIRED',
            'microsoft'
          )
        }

        this.selectedAccount =
          result.account.homeAccountId

        await this.save(controller.signal)

        const verified = await this.minecraft(
          result.accessToken,
          controller.signal
        )

        this.check(controller.signal)

        this.session = {
          accessToken: verified.accessToken,
          expiresAt: verified.expiresAt
        }

        this.timer = setTimeout(
          () => {
            void this.refresh()
          },
          Math.max(
            30000,
            verified.expiresAt - Date.now() - 120000
          )
        )

        this.timer.unref()

        return this.publish({
          status: 'signedIn',
          stage: 'idle',
          profile: verified.profile,
          error: null
        })
      } catch (error) {
        return this.failure(
          controller.signal.aborted
            ? new Failure(
                'CANCELLED',
                this.state.stage
              )
            : error
        )
      }
    })().finally(() => {
      this.running = null
      this.controller = null
    })

    return this.running
  }

  async logout(): Promise<AuthState> {
    this.signingOut = true

    try {
      this.controller?.abort()

      if (this.running) await this.running

      if (this.timer) clearTimeout(this.timer)

      this.timer = null
      this.session = null
      this.client = null
      this.selectedAccount = ''

      try {
        await rm(this.cacheFile, { force: true })
      } catch {
        return this.failure(
          new Failure('STORAGE_FAILED', 'storage')
        )
      }

      return this.publish(signedOut())
    } finally {
      this.signingOut = false
    }
  }

  // 메인 프로세스의 게임 실행 엔진에서만 사용합니다.
  // 이 메서드는 IPC나 preload에 노출하지 않습니다.
  async getGameSession(): Promise<{
    accessToken: string
    expiresAt: number
  }> {
    if (
      !this.session ||
      this.session.expiresAt <= Date.now() + 60000
    ) {
      await this.refresh()
    }

    if (
      !this.session ||
      this.state.status !== 'signedIn'
    ) {
      throw new Failure(
        'REAUTH_REQUIRED',
        'microsoft'
      )
    }

    return { ...this.session }
  }

  dispose(): void {
    this.controller?.abort()

    if (this.timer) clearTimeout(this.timer)

    this.session = null
  }
}