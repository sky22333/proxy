import { deriveRealityPublicKey, randomHex, randomUuid, realityKeypair } from '../crypto'
import { pStr, type NodeConfig, type ParsedNode, type ProtocolDef } from '../types'
import { arrOf, boolOf, linkHost, numOf, objOf, strOf } from './_shared'

const DEFAULT_SNI = 'www.tesla.com'
const DEFAULT_PORT = 443

export const reality: ProtocolDef = {
  id: 'reality',
  prefix: 'reality',
  label: 'VLESS-REALITY',
  short: 'REALITY',
  transport: 'tcp',
  defaultPort: DEFAULT_PORT,
  needsCert: false,
  create(_server, seq) {
    const keys = realityKeypair()
    return {
      id: randomUuid(),
      type: 'reality',
      tag: `reality-${seq}`,
      port: DEFAULT_PORT,
      params: {
        uuid: randomUuid(),
        sni: DEFAULT_SNI,
        shortId: randomHex(8),
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
      },
    }
  },
  render(node, _server) {
    const sni = pStr(node, 'sni') || DEFAULT_SNI
    return {
      type: 'vless',
      tag: node.tag,
      listen: '::',
      listen_port: node.port,
      users: [
        {
          name: 'user',
          uuid: pStr(node, 'uuid'),
          flow: 'xtls-rprx-vision',
        },
      ],
      tls: {
        enabled: true,
        server_name: sni,
        reality: {
          enabled: true,
          handshake: { server: sni, server_port: DEFAULT_PORT },
          private_key: pStr(node, 'privateKey'),
          short_id: [pStr(node, 'shortId')],
        },
      },
    }
  },
  link(node, server) {
    const query = new URLSearchParams({
      encryption: 'none',
      security: 'reality',
      sni: pStr(node, 'sni') || DEFAULT_SNI,
      fp: 'chrome',
      pbk: pStr(node, 'publicKey'),
      sid: pStr(node, 'shortId'),
      type: 'tcp',
      flow: 'xtls-rprx-vision',
    })
    return `vless://${pStr(node, 'uuid')}@${linkHost(server)}:${node.port}?${query.toString()}#${encodeURIComponent(node.tag)}`
  },
  parse(inbound): ParsedNode | null {
    if (inbound.type !== 'vless') return null
    const tls = objOf(inbound.tls)
    const realityOptions = objOf(tls?.reality)
    if (!realityOptions || !boolOf(realityOptions.enabled)) return null

    const user = objOf(arrOf(inbound.users)[0])
    const handshake = objOf(realityOptions.handshake)
    const shortId = Array.isArray(realityOptions.short_id)
      ? strOf(realityOptions.short_id[0])
      : strOf(realityOptions.short_id)
    const privateKey = strOf(realityOptions.private_key)

    return {
      tag: strOf(inbound.tag) || 'reality',
      port: numOf(inbound.listen_port),
      params: {
        uuid: strOf(user?.uuid),
        sni: strOf(handshake?.server) || strOf(tls?.server_name) || DEFAULT_SNI,
        shortId,
        privateKey,
        publicKey: deriveRealityPublicKey(privateKey) ?? '',
      },
    }
  },
  fields: [
    { key: 'port', label: '端口', kind: 'number', min: 1, max: 65535, hint: 'TCP', target: 'port' },
    { key: 'uuid', label: 'UUID', kind: 'text', mono: true, regen: true },
    { key: 'sni', label: '目标域名', kind: 'text', hint: '同时作为 REALITY 握手目标' },
    { key: 'shortId', label: 'Short ID', kind: 'text', mono: true, regen: true, hint: '16 位 hex' },
    { key: 'privateKey', label: '私钥', kind: 'text', mono: true, regen: true },
    {
      key: 'publicKey',
      label: '公钥',
      kind: 'text',
      mono: true,
      derived: (node) => deriveRealityPublicKey(pStr(node, 'privateKey')) ?? '私钥无效',
    },
  ],
  normalize(node: NodeConfig): NodeConfig {
    const publicKey = deriveRealityPublicKey(pStr(node, 'privateKey'))
    if (!publicKey || publicKey === pStr(node, 'publicKey')) return node
    return { ...node, params: { ...node.params, publicKey } }
  },
  summary(node) {
    return `${pStr(node, 'sni')} · vision`
  },
}
