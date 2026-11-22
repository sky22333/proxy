import { randomUuid } from './crypto'
import { PROTOCOLS } from './protocols'
import { arrOf, objOf, strOf, type Json } from './protocols/_shared'
import type { NodeConfig, ParsedNode, ProtocolId, ServerConfig } from './types'

export interface SyncContext {
  nodes: NodeConfig[]
  server: ServerConfig
}

export interface SyncedState {
  server: Partial<ServerConfig>
  nodes: NodeConfig[]
}

/**
 * 把右侧手改后的配置反解回状态：只认入站与证书/DNS 这几处，
 * log、route、自定义字段一律忽略（它们只存在于文本里）。
 */
export function parseConfig(text: string, ctx: SyncContext): SyncedState | null {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return null
  }
  const cfg = objOf(root)
  if (!cfg) return null

  const inbounds = arrOf(cfg.inbounds)
    .map(objOf)
    .filter((item): item is Json => Boolean(item))

  const nodes = Array.isArray(cfg.inbounds) ? reconcile(inbounds, ctx.nodes) : ctx.nodes
  // 全部 inbound 都认不出来时不拿空结果覆盖左栏（否则节点会被持久化清空）；
  // 只有部分认不出时，未识别的入站仅从左侧列表消失，配置文本本身不受影响。
  if (ctx.nodes.length > 0 && nodes.length === 0) return null

  return {
    server: serverPatch(cfg, inbounds),
    nodes,
  }
}

function serverPatch(cfg: Json, inbounds: Json[]): Partial<ServerConfig> {
  const patch: Partial<ServerConfig> = {}

  // DNS：只认同 UDP 上游，DoH/DoT 的地址形态不同，回填会生成非法配置
  const dnsServers = arrOf(objOf(cfg.dns)?.servers)
    .map(objOf)
    .filter((item): item is Json => Boolean(item))
  const udpServers = dnsServers.filter(
    (item) => typeof item.server === 'string' && (item.type ?? 'udp') === 'udp',
  )
  const dns = udpServers.find((item) => item.tag === 'cf') ?? udpServers[0]
  if (dns) patch.dns = strOf(dns.server)

  Object.assign(patch, certPatch(cfg, inbounds))
  return patch
}

function certPatch(cfg: Json, inbounds: Json[]): Partial<ServerConfig> {
  const providers = arrOf(cfg.certificate_providers)
    .map(objOf)
    .filter((item): item is Json => Boolean(item))
  const provider = providers.find((item) => item.type === 'acme')

  if (provider) {
    const domain = strOf(arrOf(provider.domain)[0]) || serverNameOf(inbounds)
    const email = strOf(provider.email)
    const dir = strOf(provider.data_directory)
    return {
      certMode: 'acme',
      ...(domain ? { domain } : {}),
      ...(email ? { acmeEmail: email } : {}),
      ...(dir ? { acmeDir: dir } : {}),
    }
  }

  // 证书文件路径能同时还原目录与域名
  for (const inbound of inbounds) {
    const crt = strOf(objOf(inbound.tls)?.certificate_path)
    if (!crt) continue
    const slash = crt.lastIndexOf('/')
    const domain = crt
      .slice(slash + 1)
      .replace(/\.(crt|pem|cer)$/i, '')
      .trim()
    return {
      certMode: 'self',
      ...(slash > 0 ? { certDir: crt.slice(0, slash) } : {}),
      ...(domain ? { domain } : {}),
    }
  }

  return {}
}

/** ACME 提供者没写 domain 时，用某个 TLS 入站的 server_name 兜底 */
function serverNameOf(inbounds: Json[]): string {
  for (const inbound of inbounds) {
    const tls = objOf(inbound.tls)
    if (!tls || !tls.certificate_provider) continue
    const name = strOf(tls.server_name)
    if (name) return name
  }
  return ''
}

/** 用 tag / 位置 / 类型三级匹配复用旧 id，避免手改时选中项乱跳 */
function reconcile(inbounds: Json[], prev: NodeConfig[]): NodeConfig[] {
  const used = new Set<string>()

  return inbounds.flatMap((inbound, index) => {
    const match = parseInbound(inbound)
    if (!match) return []

    const preferred =
      prev.find((node) => node.tag === match.node.tag && !used.has(node.id)) ??
      (prev[index] && !used.has(prev[index].id) && prev[index].type === match.type
        ? prev[index]
        : undefined) ??
      prev.find((node) => node.type === match.type && !used.has(node.id))

    const id = preferred?.id ?? randomUuid()
    used.add(id)

    return [
      {
        id,
        type: match.type,
        tag: match.node.tag.trim() || defaultPrefix(match.type),
        port:
          match.node.port >= 1 && match.node.port <= 65535
            ? match.node.port
            : defaultPort(match.type),
        // 配置里没有的字段（例如关掉混淆后不写 obfs-password）沿用旧值，避免下次开启时空密码
        params: { ...preferred?.params, ...match.node.params },
      },
    ]
  })
}

function parseInbound(inbound: Json): { type: ProtocolId; node: ParsedNode } | null {
  for (const def of PROTOCOLS) {
    const node = def.parse?.(inbound)
    if (node) return { type: def.id, node }
  }
  return null
}

function defaultPort(type: ProtocolId): number {
  return PROTOCOLS.find((def) => def.id === type)?.defaultPort ?? 443
}

function defaultPrefix(type: ProtocolId): string {
  return PROTOCOLS.find((def) => def.id === type)?.prefix ?? type
}
