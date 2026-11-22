import { randomBase64Key, randomUuid, toBase64Url } from '../crypto'
import { pStr, type NodeConfig, type ParsedNode, type ProtocolDef } from '../types'
import { linkHost, numOf, strOf } from './_shared'

const DEFAULT_PORT = 8388

const METHODS = [
  { value: '2022-blake3-aes-128-gcm', label: '2022-blake3-aes-128-gcm（16 字节）' },
  { value: '2022-blake3-aes-256-gcm', label: '2022-blake3-aes-256-gcm（32 字节）' },
  { value: '2022-blake3-chacha20-poly1305', label: '2022-blake3-chacha20-poly1305（32 字节）' },
] as const

function keyBytes(method: string): 16 | 32 {
  return method === '2022-blake3-aes-128-gcm' ? 16 : 32
}

export const ss2022: ProtocolDef = {
  id: 'ss2022',
  prefix: 'ss',
  label: 'Shadowsocks 2022',
  short: 'SS22',
  transport: 'both',
  defaultPort: DEFAULT_PORT,
  needsCert: false,
  create(_server, seq) {
    const method = '2022-blake3-aes-128-gcm'
    return {
      id: randomUuid(),
      type: 'ss2022',
      tag: `ss-${seq}`,
      port: DEFAULT_PORT,
      params: {
        method,
        password: randomBase64Key(keyBytes(method)),
      },
    }
  },
  render(node, _server) {
    return {
      type: 'shadowsocks',
      tag: node.tag,
      listen: '::',
      listen_port: node.port,
      method: pStr(node, 'method'),
      password: pStr(node, 'password'),
    }
  },
  link(node, server) {
    const userinfo = toBase64Url(`${pStr(node, 'method')}:${pStr(node, 'password')}`)
    return `ss://${userinfo}@${linkHost(server)}:${node.port}#${encodeURIComponent(node.tag)}`
  },
  parse(inbound): ParsedNode | null {
    if (inbound.type !== 'shadowsocks') return null
    return {
      tag: strOf(inbound.tag) || 'ss',
      port: numOf(inbound.listen_port),
      params: {
        method: strOf(inbound.method),
        password: strOf(inbound.password),
      },
    }
  },
  fields: [
    { key: 'port', label: '端口', kind: 'number', min: 1, max: 65535, hint: 'TCP + UDP 同端口', target: 'port' },
    {
      key: 'method',
      label: '加密方法',
      kind: 'select',
      options: METHODS,
      hint: '换方法会自动重算密钥长度',
    },
    {
      key: 'password',
      label: '密钥',
      kind: 'text',
      mono: true,
      regen: true,
      hint: '标准 base64，长度必须与加密方法匹配',
    },
  ],
  normalize(node: NodeConfig): NodeConfig {
    const method = pStr(node, 'method')
    // 标准 base64 的长度：16 字节 → 24 字符，32 字节 → 44 字符
    const expected = keyBytes(method) === 16 ? 24 : 44
    if (pStr(node, 'password').length === expected) return node
    return { ...node, params: { ...node.params, password: randomBase64Key(keyBytes(method)) } }
  },
  summary(node) {
    return pStr(node, 'method').replace('2022-blake3-', '')
  },
}
