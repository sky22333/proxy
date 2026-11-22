import { randomToken, randomUuid } from '../crypto'
import { pStr, type ParsedNode, type ProtocolDef } from '../types'
import { arrOf, domainOf, linkHost, numOf, objOf, serverTls, strOf, trustCert } from './_shared'

const DEFAULT_PORT = 8443

export const anytls: ProtocolDef = {
  id: 'anytls',
  prefix: 'anytls',
  label: 'AnyTLS',
  short: 'ANYTLS',
  transport: 'tcp',
  defaultPort: DEFAULT_PORT,
  needsCert: true,
  create(_server, seq) {
    return {
      id: randomUuid(),
      type: 'anytls',
      tag: `anytls-${seq}`,
      port: DEFAULT_PORT,
      params: {
        password: randomToken(24),
      },
    }
  },
  render(node, server) {
    return {
      type: 'anytls',
      tag: node.tag,
      listen: '::',
      listen_port: node.port,
      users: [{ name: 'user', password: pStr(node, 'password') }],
      tls: serverTls(server, ['h2', 'http/1.1']),
    }
  },
  link(node, server) {
    const query = new URLSearchParams({ sni: domainOf(server) })
    if (!trustCert(server)) query.set('insecure', '1')
    const user = encodeURIComponent(pStr(node, 'password'))
    return `anytls://${user}@${linkHost(server)}:${node.port}?${query.toString()}#${encodeURIComponent(node.tag)}`
  },
  parse(inbound): ParsedNode | null {
    if (inbound.type !== 'anytls') return null
    const user = objOf(arrOf(inbound.users)[0])
    return {
      tag: strOf(inbound.tag) || 'anytls',
      port: numOf(inbound.listen_port),
      params: { password: strOf(user?.password) },
    }
  },
  fields: [
    { key: 'port', label: '端口', kind: 'number', min: 1, max: 65535, hint: 'TCP', target: 'port' },
    { key: 'password', label: '密码', kind: 'text', mono: true, regen: true },
  ],
  summary() {
    return 'h2 + http/1.1 · 连接复用'
  },
}
