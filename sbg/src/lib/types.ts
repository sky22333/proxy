export type ProtocolId = 'reality' | 'hysteria2' | 'tuic' | 'anytls' | 'ss2022'

export type Transport = 'tcp' | 'udp' | 'both'

/** 证书来源：自签（openssl）或 ACME（Let's Encrypt 自动签发） */
export type CertMode = 'self' | 'acme'

export type ParamValue = string | number | boolean

export interface NodeConfig {
  id: string
  type: ProtocolId
  tag: string
  port: number
  params: Record<string, ParamValue>
}

export interface ServerConfig {
  host: string
  domain: string
  certDir: string
  dns: string
  certMode: CertMode
  /** ACME 账号邮箱，可留空 */
  acmeEmail: string
  /** ACME 账户与证书缓存目录 */
  acmeDir: string
}

/** 从 config.json 反解出来的节点，不含 id（由同步层匹配或新生成） */
export interface ParsedNode {
  tag: string
  port: number
  params: Record<string, ParamValue>
}

export type FieldKind = 'text' | 'number' | 'select' | 'switch'

export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  hint?: string
  mono?: boolean
  /** 提供「重新生成」按钮 */
  regen?: boolean
  options?: readonly { value: string; label: string }[]
  min?: number
  max?: number
  /** 条件显示 */
  visible?: (node: NodeConfig) => boolean
  /** 只读派生值，例如由私钥推出的公钥 */
  derived?: (node: NodeConfig) => string
  /** 值落在 node 的哪个字段上；默认 params，端口必须显式标 port */
  target?: 'param' | 'port'
}

export interface ExposureInfo {
  level: 'strong' | 'medium' | 'weak'
  label: string
  note: string
}

export interface ProtocolDef {
  id: ProtocolId
  /** tag 前缀，如 reality-1 */
  prefix: string
  label: string
  short: string
  transport: Transport
  defaultPort: number
  /** 是否依赖一张真实 TLS 证书；REALITY 与 SS2022 为 false */
  needsCert: boolean
  exposure: ExposureInfo
  create: (server: ServerConfig, seq: number) => NodeConfig
  render: (node: NodeConfig, server: ServerConfig) => Record<string, unknown>
  link: (node: NodeConfig, server: ServerConfig) => string
  fields: readonly FieldSpec[]
  /** 参数变更后的自愈钩子：改了方法就重算密钥、改了私钥就同步公钥 */
  normalize?: (node: NodeConfig) => NodeConfig
  /** 从配置里的 inbound 反解回节点，用于右侧手改后同步左侧 */
  parse?: (inbound: Record<string, unknown>) => ParsedNode | null
  /** 列表行里的补充信息 */
  summary?: (node: NodeConfig) => string
}

export const pStr = (node: NodeConfig, key: string): string => String(node.params[key] ?? '')
export const pBool = (node: NodeConfig, key: string): boolean => node.params[key] === true
