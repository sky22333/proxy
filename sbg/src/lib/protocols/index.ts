import type { ProtocolDef, ProtocolId } from '../types'
import { anytls } from './anytls'
import { hysteria2 } from './hysteria2'
import { reality } from './reality'
import { ss2022 } from './ss2022'
import { tuic } from './tuic'

/**
 * 新增协议只需要两步：
 *   1. 在本目录新建一个 ProtocolDef 文件（含 create / render / link / fields）
 *   2. 在这里注册
 * 表单、列表、配置生成、分享链接都会自动跟上，不需要改任何组件。
 */
export const PROTOCOLS: readonly ProtocolDef[] = [reality, hysteria2, tuic, anytls, ss2022]

const MAP = new Map<ProtocolId, ProtocolDef>(PROTOCOLS.map((p) => [p.id, p]))

export function protocolOf(id: ProtocolId): ProtocolDef {
  const def = MAP.get(id)
  if (!def) throw new Error(`未知协议: ${id}`)
  return def
}

export function getProtocol(id: string): ProtocolDef | undefined {
  return MAP.get(id as ProtocolId)
}
