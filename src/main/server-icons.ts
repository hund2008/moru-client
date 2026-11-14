import {
  ipcMain,
  nativeImage,
  type IpcMainInvokeEvent
} from 'electron'
import { Resolver } from 'node:dns/promises'
import { connect, isIP } from 'node:net'
import { domainToASCII } from 'node:url'

type Address = {
  host: string
  port: number
  srv: boolean
}

const LIMIT = 128 * 1024
const cache = new Map<
  string,
  { icon: string | null; expires: number }
>()
const pending = new Map<string, Promise<string | null>>()

let running = 0
const queue: Array<() => void> = []

async function scheduledQuery(address: Address): Promise<string | null> {
  if (running >= 4) {
    await new Promise<void>(resolve => queue.push(resolve))
  } else {
    running++
  }

  try {
    return await queryIcon(address)
  } finally {
    const next = queue.shift()
    if (next) next()
    else running--
  }
}

function parseAddress(value: unknown): Address | null {
  if (typeof value !== 'string') return null

  const address = value.trim()

  if (
    !address ||
    address.length > 253 ||
    /[\s/@?#\\]/.test(address)
  ) {
    return null
  }

  const match = address.startsWith('[')
    ? /^\[([^\]]+)\](?::([0-9]+))?$/.exec(address)
    : /^([^:]+)(?::([0-9]+))?$/.exec(address)

  if (!match) return null

  const port = match[2] ? Number(match[2]) : 25565

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  const host = isIP(match[1])
    ? match[1]
    : domainToASCII(match[1]).toLowerCase()

  if (!host || host.length > 253) return null

  if (address.startsWith('[') && isIP(host) !== 6) {
    return null
  }

  if (
    !isIP(host) &&
    !host.split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
    )
  ) {
    return null
  }

  return {
    host,
    port,
    srv: !match[2] && !isIP(host)
  }
}

function varInt(value: number): Buffer {
  const bytes: number[] = []
  let n = value >>> 0

  do {
    let byte = n & 127
    n >>>= 7
    if (n) byte |= 128
    bytes.push(byte)
  } while (n)

  return Buffer.from(bytes)
}

function readVarInt(
  bytes: Buffer,
  offset = 0
): { value: number; end: number } | null {
  let value = 0

  for (let i = 0; i < 5; i++) {
    if (offset + i >= bytes.length) return null

    const byte = bytes[offset + i]

    if (i === 4 && (byte & 0xf0)) {
      throw new Error('Invalid VarInt')
    }

    value |= (byte & 127) << (7 * i)

    if (!(byte & 128)) {
      return {
        value: value >>> 0,
        end: offset + i + 1
      }
    }
  }

  throw new Error('Invalid VarInt')
}

function extractIcon(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 64 * 1024 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null
  }

  const bytes = Buffer.from(
    value.slice('data:image/png;base64,'.length),
    'base64'
  )

  const signature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10
  ])

  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== 64 ||
    bytes.readUInt32BE(20) !== 64
  ) {
    return null
  }

  const image = nativeImage.createFromBuffer(bytes)
  const size = image.getSize()

  return (
    !image.isEmpty() &&
    size.width === 64 &&
    size.height === 64
  )
    ? image.toDataURL()
    : null
}

async function destination(
  address: Address
): Promise<{ host: string; port: number }> {
  if (!address.srv) return address

  const resolver = new Resolver({
    timeout: 1000,
    tries: 1
  })

  const timer = setTimeout(() => resolver.cancel(), 1500)

  try {
    const records = await resolver.resolveSrv(
      `_minecraft._tcp.${address.host}`
    )

    records.sort((a, b) => a.priority - b.priority)
    const target = records[0]

    if (
      target?.name &&
      target.name !== '.' &&
      target.port > 0 &&
      target.port <= 65535
    ) {
      return {
        host: target.name,
        port: target.port
      }
    }
  } catch {
    // SRV가 없으면 원래 주소로 조회합니다.
  } finally {
    clearTimeout(timer)
  }

  return address
}

async function queryIcon(address: Address): Promise<string | null> {
  const target = await destination(address)

  return new Promise(resolve => {
    const socket = connect({
      host: target.host,
      port: target.port
    })

    let bytes: Buffer = Buffer.alloc(0)
    let finished = false

    const timer = setTimeout(() => finish(null), 4500)

    function finish(icon: string | null) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.destroy()
      resolve(icon)
    }

    socket.once('error', () => finish(null))
    socket.once('close', () => finish(null))

    socket.once('connect', () => {
      const host = Buffer.from(address.host, 'utf8')
      const port = Buffer.alloc(2)
      port.writeUInt16BE(address.port)

      const handshake = Buffer.concat([
        varInt(0),
        varInt(-1),
        varInt(host.length),
        host,
        port,
        varInt(1)
      ])

      socket.write(Buffer.concat([
        varInt(handshake.length),
        handshake,
        Buffer.from([1, 0])
      ]))
    })

    socket.on('data', chunk => {
      if (finished) return

      if (bytes.length + chunk.length > LIMIT + 5) {
        finish(null)
        return
      }

      bytes = Buffer.concat([bytes, chunk])

      try {
        const packet = readVarInt(bytes)
        if (!packet) return

        if (!packet.value || packet.value > LIMIT) {
          finish(null)
          return
        }

        const end = packet.end + packet.value
        if (bytes.length < end) return

        const payload = bytes.subarray(packet.end, end)
        const id = readVarInt(payload)

        if (!id || id.value !== 0) {
          finish(null)
          return
        }

        const length = readVarInt(payload, id.end)

        if (
          !length ||
          length.value > LIMIT ||
          length.end + length.value !== payload.length
        ) {
          finish(null)
          return
        }

        const result = JSON.parse(
          payload.toString('utf8', length.end)
        ) as { favicon?: unknown }

        finish(extractIcon(result?.favicon))
      } catch {
        finish(null)
      }
    })
  })
}

export function registerServerIcons(
  trusted: (event: IpcMainInvokeEvent) => void
): void {
  ipcMain.handle(
    'servers:icon',
    async (event, value: unknown): Promise<string | null> => {
      trusted(event)

      const address = parseAddress(value)
      if (!address) return null

      const key = `${address.host}|${address.port}|${address.srv}`
      const hit = cache.get(key)

      if (hit && hit.expires > Date.now()) {
        return hit.icon
      }

      const existing = pending.get(key)
      if (existing) return existing

      if (pending.size >= 128) return null

      const request = scheduledQuery(address)
        .catch(() => null)
        .then(icon => {
          cache.delete(key)

          cache.set(key, {
            icon,
            expires: Date.now() + (icon ? 60000 : 15000)
          })

          if (cache.size > 128) {
            cache.delete(cache.keys().next().value!)
          }

          return icon
        })
        .finally(() => pending.delete(key))

      pending.set(key, request)
      return request
    }
  )
}