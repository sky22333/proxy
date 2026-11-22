import { randomToken, randomUuid } from '../crypto'
import { pStr, type ParsedNode, type ProtocolDef } from '../types'
import { arrOf, domainOf, linkHost, numOf, objOf, serverTls, strOf, trustCert } from './_shared'

const DEFAULT_PORT = 8443

const CONGESTION = [
  { value: 'cubic', label: 'cubic（保守）' },
  { value: 'bbr', label: 'bbr（跨境更积极）' },
  { value: 'new_reno', label: 'new_reno' },
] as const

export const tuic: ProtocolDef = {
  id: 'tuic',
  prefix: 'tuic',
  label: 'TUIC',
  short: 'TUIC',
  transport: 'udp',
  defaultPort: DEFAULT_PORT,
  needsCert: true,
  exposure: {
    level: 'medium',
    label: '需证书',
    note: '基于 QUIC，握手特征明显，依赖同一张域名证书',
  },
  create(_server, seq) {
    return {
      id: randomUuid(),
      type: 'tuic',
      tag: `tuic-${seq}`,
      port: DEFAULT_PORT,
      params: {
        uuid: randomUuid(),
        password: randomToken(24),
        congestionControl: 'cubic',
      },
    }
  },
  render(node, server) {
    return {
      type: 'tuic',
      tag: node.tag,
      listen: '::',
      listen_port: node.port,
      users: [
        {
          name: 'user',
          uuid: pStr(node, 'uuid'),
          password: pStr(node, 'password'),
        },
      ],
      congestion_control: pStr(node, 'congestionControl') || 'cubic',
      zero_rtt_handshake: false,
      tls: serverTls(server, ['h3']),
    }
  },
  link(node, server) {
    const query = new URLSearchParams({
      congestion_control: pStr(node, 'congestionControl') || 'cubic',
      udp_relay_mode: 'native',
      alpn: 'h3',
      sni: domainOf(server),
    })
    if (!trustCert(server)) query.set('allow_insecure', '1')
    const user = `${pStr(node, 'uuid')}:${encodeURIComponent(pStr(node, 'password'))}`
    return `tuic://${user}@${linkHost(server)}:${node.port}?${query.toString()}#${encodeURIComponent(node.tag)}`
  },
  parse(inbound): ParsedNode | null {
    if (inbound.type !== 'tuic') return null
    const user = objOf(arrOf(inbound.users)[0])
    return {
      tag: strOf(inbound.tag) || 'tuic',
      port: numOf(inbound.listen_port),
      params: {
        uuid: strOf(user?.uuid),
        password: strOf(user?.password),
        congestionControl: strOf(inbound.congestion_control, 'cubic'),
      },
    }
  },
  fields: [
    { key: 'port', label: '端口', kind: 'number', min: 1, max: 65535, hint: 'UDP', target: 'port' },
    { key: 'uuid', label: 'UUID', kind: 'text', mono: true, regen: true },
    { key: 'password', label: '密码', kind: 'text', mono: true, regen: true },
    {
      key: 'congestionControl',
      label: '拥塞控制',
      kind: 'select',
      options: CONGESTION,
      hint: 'zero-RTT 已关闭，避免重放',
    },
  ],
  summary(node) {
    return `QUIC · ${pStr(node, 'congestionControl') || 'cubic'}`
  },
}
