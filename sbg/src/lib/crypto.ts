import { x25519 } from '@noble/curves/ed25519.js'

const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function randomHex(byteLength: number): string {
  return Array.from(randomBytes(byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomUuid(): string {
  const b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 字母表内随机串，用于 AnyTLS / Hysteria2 密码 */
export function randomToken(length = 24): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]
  return out
}

function encode(input: Uint8Array, alphabet: string, pad: boolean): string {
  let out = ''
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input[i]
    const has1 = i + 1 < input.length
    const has2 = i + 2 < input.length
    const b1 = has1 ? input[i + 1] : 0
    const b2 = has2 ? input[i + 2] : 0
    out += alphabet[b0 >> 2]
    out += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)]
    out += has1 ? alphabet[((b1 & 0x0f) << 2) | (b2 >> 6)] : pad ? '=' : ''
    out += has2 ? alphabet[b2 & 0x3f] : pad ? '=' : ''
  }
  return out
}

function decode(text: string, alphabet: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const v = alphabet.indexOf(ch)
    if (v < 0) continue
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** 标准 base64，带 = 填充 */
export function toBase64(input: Uint8Array): string {
  return encode(input, B64_STD, true)
}

/** URL 安全 base64，无填充 —— REALITY 密钥与 SIP002 都用这个 */
export function toBase64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return encode(bytes, B64_URL, false)
}

export function fromBase64Url(text: string): Uint8Array {
  return decode(text, B64_URL)
}

/** SS2022 密码：标准 base64，长度与加密方法强绑定 */
export function randomBase64Key(byteLength: 16 | 32): string {
  return toBase64(randomBytes(byteLength))
}

export function realityKeypair(): { privateKey: string; publicKey: string } {
  const secret = x25519.utils.randomSecretKey()
  return {
    privateKey: toBase64Url(secret),
    publicKey: toBase64Url(x25519.getPublicKey(secret)),
  }
}

/** 改了私钥就自动同步公钥 */
export function deriveRealityPublicKey(privateKey: string): string | null {
  try {
    const bytes = fromBase64Url(privateKey)
    if (bytes.length !== 32) return null
    return toBase64Url(x25519.getPublicKey(bytes))
  } catch {
    return null
  }
}
