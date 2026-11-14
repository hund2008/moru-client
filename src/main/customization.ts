import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { join, basename } from 'node:path'
import {
  mkdir,
  readFile,
  stat
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { MicrosoftAuth } from './microsoft-auth'
import type {
  FolderResult,
  SkinApplyResult,
  SkinPickResult
} from '../shared/customization'

const maximumSkinBytes = 1024 * 1024

const pngSignature = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10
])

type Selected = {
  id: string
  bytes: Buffer
  height: number
}

export function registerCustomization(
  auth: MicrosoftAuth,
  trusted: (event: IpcMainInvokeEvent) => void
): void {
  const selections =
    new WeakMap<WebContents, Selected>()

  const applying = new WeakSet<WebContents>()

  ipcMain.handle(
    'profiles:open-mods',
    async (
      event,
      id: unknown
    ): Promise<FolderResult> => {
      trusted(event)

      if (
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
      ) {
        return {
          ok: false,
          code: 'INVALID_PROFILE'
        }
      }

      try {
        const directory = join(
          app.getPath('userData'),
          'profiles',
          id,
          'mods'
        )

        await mkdir(directory, {
          recursive: true
        })

        const error = await shell.openPath(directory)

        return error
          ? {
              ok: false,
              code: 'OPEN_FAILED'
            }
          : {
              ok: true
            }
      } catch {
        return {
          ok: false,
          code: 'OPEN_FAILED'
        }
      }
    }
  )

  ipcMain.handle(
    'skin:choose',
    async (event): Promise<SkinPickResult> => {
      trusted(event)

      const window =
        BrowserWindow.fromWebContents(event.sender)

      if (!window) {
        return {
          ok: false,
          code: 'FILE_READ_FAILED'
        }
      }

      try {
        const result = await dialog.showOpenDialog(
          window,
          {
            title: 'Minecraft Skin · PNG',
            properties: ['openFile'],
            filters: [
              {
                name: 'Minecraft Skin (PNG)',
                extensions: ['png']
              }
            ]
          }
        )

        if (
          result.canceled ||
          !result.filePaths[0]
        ) {
          return {
            ok: true,
            skin: null
          }
        }

        const file = result.filePaths[0]
        const info = await stat(file)

        if (!info.isFile()) {
          return {
            ok: false,
            code: 'INVALID_PNG'
          }
        }

        if (info.size > maximumSkinBytes) {
          return {
            ok: false,
            code: 'PNG_TOO_LARGE'
          }
        }

        const bytes = await readFile(file)

        if (bytes.length > maximumSkinBytes) {
          return {
            ok: false,
            code: 'PNG_TOO_LARGE'
          }
        }

        if (
          bytes.length < 33 ||
          !bytes.subarray(0, 8).equals(pngSignature) ||
          bytes.readUInt32BE(8) !== 13 ||
          bytes.toString('ascii', 12, 16) !== 'IHDR'
        ) {
          return {
            ok: false,
            code: 'INVALID_PNG'
          }
        }

        const width = bytes.readUInt32BE(16)
        const height = bytes.readUInt32BE(20)

        if (
          width !== 64 ||
          (height !== 64 && height !== 32)
        ) {
          return {
            ok: false,
            code: 'INVALID_PNG'
          }
        }

        const id = randomUUID()

        selections.set(event.sender, {
          id,
          bytes,
          height
        })

        return {
          ok: true,
          skin: {
            id,
            name: basename(file),
            dataUrl:
              `data:image/png;base64,${bytes.toString('base64')}`,
            height
          }
        }
      } catch {
        return {
          ok: false,
          code: 'FILE_READ_FAILED'
        }
      }
    }
  )

  ipcMain.handle(
    'skin:apply',
    async (
      event,
      selectionId: unknown,
      variant: unknown
    ): Promise<SkinApplyResult> => {
      trusted(event)

      if (applying.has(event.sender)) {
        return {
          ok: false,
          code: 'BUSY'
        }
      }

      const selected = selections.get(event.sender)

      if (
        !selected ||
        typeof selectionId !== 'string' ||
        selected.id !== selectionId
      ) {
        return {
          ok: false,
          code: 'NO_SELECTION'
        }
      }

      if (
        variant !== 'classic' &&
        variant !== 'slim'
      ) {
        return {
          ok: false,
          code: 'INVALID_PNG'
        }
      }

      if (
        variant === 'slim' &&
        selected.height === 32
      ) {
        return {
          ok: false,
          code: 'LEGACY_SLIM'
        }
      }

      applying.add(event.sender)

      try {
        let token: string

        try {
          token = (
            await auth.getGameSession()
          ).accessToken
        } catch {
          return {
            ok: false,
            code: 'AUTH_REQUIRED',
            authCode: auth.getState().error?.code
          }
        }

        const form = new FormData()

        form.append('variant', variant)

        form.append(
          'file',
          new Blob(
            [new Uint8Array(selected.bytes)],
            { type: 'image/png' }
          ),
          'skin.png'
        )

        let response: Response

        try {
          response = await fetch(
            'https://api.minecraftservices.com/minecraft/profile/skins',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`
              },
              body: form,
              redirect: 'error',
              signal: AbortSignal.timeout(30000)
            }
          )
        } catch {
          return {
            ok: false,
            code: 'NETWORK'
          }
        }

        if (!response.ok) {
          if (response.status === 401) {
            return {
              ok: false,
              code: 'AUTH_REQUIRED'
            }
          }

          if (response.status === 429) {
            return {
              ok: false,
              code: 'RATE_LIMIT'
            }
          }

          if (response.status === 400) {
            return {
              ok: false,
              code: 'INVALID_PNG'
            }
          }

          if (response.status === 403) {
            const value = await response
              .json()
              .catch(() => ({})) as {
                errorMessage?: string
                message?: string
              }

            const deniedApp =
              /invalid app registration|appreginfo|not.{0,20}approved|allowlist/i.test(
                String(
                  value.errorMessage ??
                  value.message ??
                  ''
                )
              )

            return {
              ok: false,
              code: deniedApp
                ? 'APP_ACCESS_REQUIRED'
                : 'FORBIDDEN'
            }
          }

          return {
            ok: false,
            code: 'UPLOAD_FAILED'
          }
        }

        const refreshed = await auth.refresh()

        return {
          ok: true,
          refreshed: refreshed.status === 'signedIn'
        }
      } finally {
        applying.delete(event.sender)
      }
    }
  )
}