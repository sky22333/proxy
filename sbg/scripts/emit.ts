/**
 * 生成用于多版本兼容性验证的配置集合：
 *   server-self.json / server-acme.json  服务端
 *   client-<type>.json                   客户端（每个协议一个 outbound）
 *   links.json                           分享链接
 *
 * 用法：npm run emit -- <输出目录>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROTOCOLS } from '../src/lib/protocols'
import { pBool, pStr, type NodeConfig, type ServerConfig } from '../src/lib/types'
import { buildConfig, buildLinks } from '../src/lib/render'

const outDir = process.argv[2] ?? 'node_modules/.tmp/compat'
mkdirSync(outDir, { recursive: true })

const server: ServerConfig = {
  host: '203.0.113.24',
  domain: 'vps.example.com',
  certDir: '/etc/sing-box/cert',
  dns: '1.1.1.1',
  certMode: 'self',
  acmeEmail: 'me@example.com',
  acmeDir: '/etc/sing-box/acme',
}

const PORTS = [443, 443, 8443, 8443, 8388]

const nodes: NodeConfig[] = PROTOCOLS.map((protocol, index) => {
  const fresh = protocol.create(server, index + 1)
  const withPort = { ...fresh, port: PORTS[index] }
  return protocol.normalize ? protocol.normalize(withPort) : withPort
})

const tls = (alpn: string[], insecure: boolean) => ({
  enabled: true,
  server_name: server.domain,
  alpn,
  ...(insecure ? { insecure: true } : {}),
})

/** 每个节点的客户端 outbound；字段与分享链接一一对应 */
function clientOutbound(node: NodeConfig, acme: boolean) {
  const base = { tag: node.tag, server: server.host, server_port: node.port }
  const skip = !acme

  switch (node.type) {
    case 'reality':
      return {
        type: 'vless',
        ...base,
        uuid: pStr(node, 'uuid'),
        flow: 'xtls-rprx-vision',
        tls: {
          enabled: true,
          server_name: pStr(node, 'sni'),
          utls: { enabled: true, fingerprint: 'chrome' },
          reality: {
            enabled: true,
            public_key: pStr(node, 'publicKey'),
            short_id: pStr(node, 'shortId'),
          },
        },
      }
    case 'hysteria2':
      return {
        type: 'hysteria2',
        ...base,
        password: pStr(node, 'password'),
        ...(pBool(node, 'obfs')
          ? { obfs: { type: 'salamander', password: pStr(node, 'obfsPassword') } }
          : {}),
        tls: tls(['h3'], skip),
      }
    case 'tuic':
      return {
        type: 'tuic',
        ...base,
        uuid: pStr(node, 'uuid'),
        password: pStr(node, 'password'),
        congestion_control: pStr(node, 'congestionControl') || 'cubic',
        udp_relay_mode: 'native',
        tls: tls(['h3'], skip),
      }
    case 'anytls':
      return {
        type: 'anytls',
        ...base,
        password: pStr(node, 'password'),
        tls: tls(['h2', 'http/1.1'], skip),
      }
    case 'ss2022':
      return {
        type: 'shadowsocks',
        ...base,
        method: pStr(node, 'method'),
        password: pStr(node, 'password'),
      }
  }
}

const wrap = (outbound: Record<string, unknown>) => ({
  log: { level: 'warn' },
  outbounds: [outbound, { type: 'direct', tag: 'direct' }],
})

const write = (name: string, value: unknown) =>
  writeFileSync(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`)

write('server-self.json', buildConfig(nodes, server))
write('server-acme.json', buildConfig(nodes, { ...server, certMode: 'acme' }))
mkdirSync(join(outDir, 'links'), { recursive: true })
write('links/links.json', buildLinks(nodes, server))

for (const node of nodes) {
  write(`client-${node.type}.json`, wrap(clientOutbound(node, false) as Record<string, unknown>))
}
write(
  'client-all-acme.json',
  {
    log: { level: 'warn' },
    outbounds: [
      ...nodes.map((node) => clientOutbound(node, true) as Record<string, unknown>),
      { type: 'direct', tag: 'direct' },
    ],
  },
)

console.log(`wrote ${nodes.length} nodes -> ${outDir}`)
for (const link of buildLinks(nodes, server)) console.log(`${link.tag.padEnd(12)} ${link.url}`)
