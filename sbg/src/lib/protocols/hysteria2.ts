import { randomToken, randomUuid } from '../crypto'
import { pBool, pStr, type ParsedNode, type ProtocolDef } from '../types'
import { arrOf, domainOf, linkHost, numOf, objOf, serverTls, strOf, trustCert } from './_shared'

const DEFAULT_PORT = 443

export const hysteria2: ProtocolDef = {
  id: 'hysteria2',
  prefix: 'hy2',
  label: 'Hysteria2',
  short: 'HY2',
  transport: 'udp',
  defaultPort: DEFAULT_PORT,
  needsCert: true,
  create(_server, seq) {
    return {
      id: randomUuid(),
      type: 'hysteria2',
      tag: `hy2-${seq}`,
      port: DEFAULT_PORT,
      params: {
        password: randomToken(24),
        obfs: false,
        obfsPassword: randomToken(24),
      },
    }
  },
  render(node, server) {
    const obfs = pBool(node, 'obfs')
    return {
      type: 'hysteria2',
      tag: node.tag,
      listen: '::',
      listen_port: node.port,
      users: [{ name: 'user', password: pStr(node, 'password') }],
      ...(obfs
        ? { obfs: { type: 'salamander', password: pStr(node, 'obfsPassword') } }
        : {}),
      masquerade: { type: 'string', status_code: 404, content: 'Not Found' },
      tls: serverTls(server, ['h3']),
    }
  },
  link(node, server) {
    const query = new URLSearchParams({ sni: domainOf(server) })
    if (!trustCert(server)) query.set('insecure', '1')
    if (pBool(node, 'obfs')) {
      query.set('obfs', 'salamander')
      query.set('obfs-password', pStr(node, 'obfsPassword'))
    }
    const user = encodeURIComponent(pStr(node, 'password'))
    return `hysteria2://${user}@${linkHost(server)}:${node.port}?${query.toString()}#${encodeURIComponent(node.tag)}`
  },
  parse(inbound): ParsedNode | null {
    if (inbound.type !== 'hysteria2') return null
    const user = objOf(arrOf(inbound.users)[0])
    const obfs = objOf(inbound.obfs)
    return {
      tag: strOf(inbound.tag) || 'hy2',
      port: numOf(inbound.listen_port),
      params: {
        password: strOf(user?.password),
        obfs: Boolean(obfs?.type),
        // 没开混淆时配置里没有这个值，交给同步层沿用旧值
        ...(obfs ? { obfsPassword: strOf(obfs.password) } : {}),
      },
    }
  },
  fields: [
    { key: 'port', label: '端口', kind: 'number', min: 1, max: 65535, hint: 'UDP', target: 'port' },
    { key: 'password', label: '密码', kind: 'text', mono: true, regen: true },
    {
      key: 'obfs',
      label: '混淆',
      kind: 'switch',
      hint: 'Salamander 协议；仅当网络专门封 QUIC 时才开',
    },
    {
      key: 'obfsPassword',
      label: '混淆密码',
      kind: 'text',
      mono: true,
      regen: true,
      visible: (node) => pBool(node, 'obfs'),
    },
  ],
  summary(node) {
    return pBool(node, 'obfs') ? 'salamander 混淆' : 'QUIC · masquerade 404'
  },
}
