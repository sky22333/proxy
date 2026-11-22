import { mkdirSync, writeFileSync } from 'node:fs'
import { parseLink } from '../src/lib/links'
import { parseConfig } from '../src/lib/parse'
import { findIssues } from '../src/lib/ports'
import { PROTOCOLS } from '../src/lib/protocols'
import { buildConfig, buildLinks } from '../src/lib/render'
import type { NodeConfig, ServerConfig } from '../src/lib/types'

const server: ServerConfig = {
  host: '203.0.113.24',
  domain: 'vps.example.com',
  certDir: '/etc/sing-box/cert',
  dns: '1.1.1.1',
  certMode: 'self',
  acmeEmail: 'me@example.com',
  acmeDir: '/etc/sing-box/acme',
}

/** 与界面默认端口一致：443/tcp + 443/udp、8443/udp + 8443/tcp、8388/tcp+udp */
const PORTS = [443, 443, 8443, 8443, 8388]

const nodes: NodeConfig[] = PROTOCOLS.map((protocol, index) => {
  const fresh = protocol.create(server, index + 1)
  const withPort = { ...fresh, port: PORTS[index] }
  return protocol.normalize ? protocol.normalize(withPort) : withPort
})

const selfConfig = buildConfig(nodes, server)
const acmeConfig = buildConfig(nodes, { ...server, certMode: 'acme' })
mkdirSync('node_modules/.tmp', { recursive: true })
writeFileSync(process.argv[2] ?? 'node_modules/.tmp/self.json', JSON.stringify(selfConfig, null, 2))
writeFileSync(process.argv[3] ?? 'node_modules/.tmp/acme.json', JSON.stringify(acmeConfig, null, 2))

console.log('=== 入站 ===')
for (const node of nodes) {
  const def = PROTOCOLS.find((p) => p.id === node.type)!
  console.log(
    `${node.tag.padEnd(12)} ${node.port}/${def.transport}  ${def.label}  需证书=${def.needsCert}`,
  )
}

console.log('\n=== 自签链接 ===')
for (const link of buildLinks(nodes, server)) {
  const parsed = parseLink(link.url)
  console.log(`${link.tag.padEnd(12)} host=${parsed?.host} port=${parsed?.port}`)
}

console.log('\n=== ACME 链接（不应出现 insecure）===')
for (const link of buildLinks(nodes, { ...server, certMode: 'acme' })) {
  const insecure = /insecure/i.test(link.url)
  console.log(`${link.tag.padEnd(12)} 含 insecure=${insecure}`)
}

console.log('\n=== 端口冲突（预期为空）===')
console.log(findIssues(nodes))

console.log('\n=== 往返：自签配置反解 ===')
const back = parseConfig(JSON.stringify(selfConfig), { nodes, server })
if (!back) throw new Error('往返解析失败')
const paramsEqual = back.nodes.every(
  (node, index) => JSON.stringify(node.params) === JSON.stringify(nodes[index].params),
)
const idsKept = back.nodes.every((node) => nodes.some((old) => old.id === node.id))
console.log(`nodes=${back.nodes.length} params一致=${paramsEqual} id保留=${idsKept}`)
console.log(`server=${JSON.stringify(back.server)}`)

console.log('\n=== 往返：ACME 配置反解 ===')
const acmeBack = parseConfig(JSON.stringify(acmeConfig), { nodes, server })
console.log(`server=${JSON.stringify(acmeBack?.server)}`)

console.log('\n=== 手改后同步（改端口 / 密码 / 名称 / DNS，log 应被忽略）===')
const edited = JSON.parse(JSON.stringify(selfConfig)) as {
  log: { level: string }
  dns: { servers: Array<{ server: string }> }
  inbounds: Array<Record<string, unknown>>
}
edited.inbounds[1].listen_port = 2053
;(edited.inbounds[1] as { users: Array<{ password: string }> }).users[0].password = 'changed-pass'
edited.inbounds[3].tag = 'anytls-renamed'
edited.dns.servers[0].server = '9.9.9.9'
edited.log.level = 'debug'

const synced = parseConfig(JSON.stringify(edited), { nodes, server })
if (!synced) throw new Error('手改解析失败')
const byTag = new Map(synced.nodes.map((node) => [node.tag, node]))
console.log(`hy2 端口=${byTag.get('hy2-2')?.port} 密码=${byTag.get('hy2-2')?.params.password}`)
console.log(`改名节点存在=${byTag.has('anytls-renamed')} 顺序=${synced.nodes.map((n) => n.tag).join(',')}`)
console.log(`dns=${synced.server.dns}  certMode=${synced.server.certMode}`)
console.log(`节点数=${synced.nodes.length}（log 改动不产生节点）`)
const idKept = byTag.get('anytls-renamed')?.id === nodes[3].id
console.log(`改名后 id 仍复用=${idKept}`)

console.log('\n=== 往返差异明细 ===')
for (const [index, node] of back.nodes.entries()) {
  const old = nodes[index]
  for (const key of new Set([...Object.keys(old.params), ...Object.keys(node.params)])) {
    const a = String(old.params[key])
    const b = String(node.params[key])
    if (a !== b) console.log(`${node.tag}.${key}: 原=${a} 反解=${b}`)
  }
}

console.log('\n=== 空节点 + ACME：不应残留 certificate_providers ===')
const emptyAcme = buildConfig([], { ...server, certMode: 'acme' })
console.log(JSON.stringify(emptyAcme))
mkdirSync('node_modules/.tmp', { recursive: true })
writeFileSync('node_modules/.tmp/empty-acme.json', JSON.stringify(emptyAcme, null, 2))

console.log('\n=== 手改把全部 type 写错：不应清空左栏 ===')
const broken = JSON.parse(JSON.stringify(selfConfig)) as { inbounds: Array<{ type: string }> }
for (const inbound of broken.inbounds) inbound.type = 'not-a-protocol'
console.log(
  `parseConfig 返回=${parseConfig(JSON.stringify(broken), { nodes, server }) === null ? 'null（拒绝覆盖）' : '对象（会清空）'}`,
)
