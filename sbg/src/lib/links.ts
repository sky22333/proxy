import { fromBase64Url } from './crypto'

export interface ParsedLink {
  scheme: string
  host: string
  port: string
  identity: string
  params: Array<[string, string]>
  name: string
}

const KNOWN = new Set(['vless', 'hysteria2', 'hy2', 'tuic', 'anytls', 'ss'])

/** 把链接反解回字段，用于「生成的链接和表单是否一致」的自检 */
export function parseLink(raw: string): ParsedLink | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const scheme = url.protocol.replace(':', '')
  if (!KNOWN.has(scheme)) return null

  let identity = decodeURIComponent(url.username)
  if (url.password) identity += `:${decodeURIComponent(url.password)}`
  if (scheme === 'ss') identity = decodeSsIdentity(identity)

  return {
    scheme,
    host: url.hostname,
    port: url.port,
    identity,
    params: Array.from(url.searchParams.entries()),
    name: url.hash ? decodeURIComponent(url.hash.slice(1)) : '',
  }
}

function decodeSsIdentity(value: string): string {
  try {
    return new TextDecoder().decode(fromBase64Url(value))
  } catch {
    return value
  }
}
