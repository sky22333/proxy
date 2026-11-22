import type { ServerConfig } from '../types'

export type Json = Record<string, unknown>

/** 反解配置时的窄类型读取，认不出来就返回安全默认值 */
export function objOf(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined
}

export function arrOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function strOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function numOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function boolOf(value: unknown): boolean {
  return value === true
}

export function certDirOf(server: ServerConfig): string {
  return server.certDir.trim().replace(/\/+$/, '') || '/etc/sing-box/cert'
}

export function certPaths(server: ServerConfig): { crt: string; key: string } {
  const dir = certDirOf(server)
  const domain = server.domain.trim() || 'example.com'
  return { crt: `${dir}/${domain}.crt`, key: `${dir}/${domain}.key` }
}

export function hostOf(server: ServerConfig): string {
  return server.host.trim() || 'YOUR_SERVER_IP'
}

export function domainOf(server: ServerConfig): string {
  return server.domain.trim() || 'example.com'
}

export const ACME_TAG = 'acme'

/** ACME 走证书提供者（1.14+），三个 TLS 入站共用一个 tag，证书只申请一次 */
export function acmeProvider(server: ServerConfig) {
  const dir = server.acmeDir.trim().replace(/\/+$/, '') || '/etc/sing-box/acme'
  const email = server.acmeEmail.trim()
  return {
    tag: ACME_TAG,
    type: 'acme',
    domain: [domainOf(server)],
    ...(email ? { email } : {}),
    data_directory: dir,
  }
}

/** Hysteria2 / TUIC / AnyTLS 共用的服务端 TLS 段 */
export function serverTls(server: ServerConfig, alpn: string[]) {
  const base = { enabled: true, server_name: domainOf(server), alpn }
  if (server.certMode === 'acme') {
    return { ...base, certificate_provider: ACME_TAG }
  }
  const { crt, key } = certPaths(server)
  return { ...base, certificate_path: crt, key_path: key }
}

/** 自签证书客户端必须跳过校验；ACME 签发的是受信任证书，不应再带 insecure */
export function trustCert(server: ServerConfig): boolean {
  return server.certMode === 'acme'
}

/** 链接里的 IPv6 需要方括号 */
export function linkHost(server: ServerConfig): string {
  const host = hostOf(server)
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}
