import { protocolOf } from './protocols'
import type { NodeConfig, Transport } from './types'

/** 一个入站实际占用哪些传输层端口 —— SS2022 同端口同时占 TCP 与 UDP */
export function transportLayers(transport: Transport): Array<'tcp' | 'udp'> {
  if (transport === 'both') return ['tcp', 'udp']
  return [transport]
}

export interface NodeIssue {
  id: string
  message: string
}

export function findIssues(nodes: NodeConfig[]): NodeIssue[] {
  const issues: NodeIssue[] = []
  const seen = new Map<string, number>()

  for (const node of nodes) {
    if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) {
      issues.push({ id: node.id, message: '端口需要是 1–65535 的整数' })
      continue
    }
    for (const layer of transportLayers(protocolOf(node.type).transport)) {
      const key = `${layer}:${node.port}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }

  for (const node of nodes) {
    if (node.port < 1 || node.port > 65535) continue
    for (const layer of transportLayers(protocolOf(node.type).transport)) {
      if ((seen.get(`${layer}:${node.port}`) ?? 0) > 1) {
        issues.push({ id: node.id, message: `${layer.toUpperCase()} ${node.port} 与其他节点冲突` })
      }
    }
  }

  return issues
}

export function issueMap(issues: NodeIssue[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const issue of issues) map[issue.id] = issue.message
  return map
}

/** 添加节点时自动避开已占用端口 */
export function nextFreePort(nodes: NodeConfig[], preferred: number, transport: Transport): number {
  const used = new Set<string>()
  for (const node of nodes) {
    for (const layer of transportLayers(protocolOf(node.type).transport)) {
      used.add(`${layer}:${node.port}`)
    }
  }
  const mine = transportLayers(transport)
  const free = (port: number) => mine.every((layer) => !used.has(`${layer}:${port}`))

  if (free(preferred)) return preferred
  for (let port = preferred + 1; port <= 65535; port++) if (free(port)) return port
  for (let port = 1024; port < preferred; port++) if (free(port)) return port
  return preferred
}
