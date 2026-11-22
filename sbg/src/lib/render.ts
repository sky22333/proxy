import { acmeProvider } from './protocols/_shared'
import { protocolOf } from './protocols'
import type { NodeConfig, ServerConfig, ProtocolId } from './types'

export interface ShareLink {
  id: string
  tag: string
  type: ProtocolId
  url: string
}

/** 是否有任一入站依赖真实 TLS 证书 */
export function anyNeedsCert(nodes: NodeConfig[]): boolean {
  return nodes.some((node) => protocolOf(node.type).needsCert)
}

export function buildConfig(nodes: NodeConfig[], server: ServerConfig) {
  return {
    log: { level: 'warn', timestamp: true },
    dns: {
      servers: [{ tag: 'cf', type: 'udp', server: server.dns.trim() || '1.1.1.1' }],
      final: 'cf',
      strategy: 'prefer_ipv4',
    },
    // 只有 ACME 模式且确实存在 TLS 入站时才写证书提供者
    ...(anyNeedsCert(nodes) && server.certMode === 'acme'
      ? { certificate_providers: [acmeProvider(server)] }
      : {}),
    inbounds: nodes.map((node) => protocolOf(node.type).render(node, server)),
    outbounds: [{ type: 'direct', tag: 'direct' }],
    // 私网与保留地址一律拦掉，避免节点被当作访问内网 / 云 metadata 的跳板
    route: {
      default_domain_resolver: { server: 'cf' },
      rules: [{ ip_is_private: true, action: 'reject' }],
    },
  }
}

export function buildLinks(nodes: NodeConfig[], server: ServerConfig): ShareLink[] {
  return nodes.map((node) => ({
    id: node.id,
    tag: node.tag,
    type: node.type,
    url: protocolOf(node.type).link(node, server),
  }))
}
