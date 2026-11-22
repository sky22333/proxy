import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { parseConfig } from './lib/parse'
import { getProtocol, protocolOf } from './lib/protocols'
import { nextFreePort } from './lib/ports'
import type { NodeConfig, ParamValue, ProtocolId, ServerConfig } from './lib/types'

const DEFAULT_SERVER: ServerConfig = {
  host: '',
  domain: 'bing.com',
  certDir: '/etc/sing-box/cert',
  dns: '1.1.1.1',
  certMode: 'self',
  acmeEmail: '',
  acmeDir: '/etc/sing-box/acme',
}

interface State {
  server: ServerConfig
  nodes: NodeConfig[]
  selectedId: string | null
  /** 右侧配置的手改内容；null 表示跟随左侧表单自动生成 */
  manual: string | null
  setServer: (patch: Partial<ServerConfig>) => void
  /** 手改：写入文本，并把能映射的部分反同步回左侧与分享链接 */
  setManual: (text: string | null) => void
  addNode: (type: ProtocolId) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  setTag: (id: string, tag: string) => void
  setPort: (id: string, port: number) => void
  setParam: (id: string, key: string, value: ParamValue) => void
  rerollParam: (id: string, key: string) => void
  rerollNode: (id: string) => void
  rerollAll: () => void
  reset: () => void
}

function uniqueTag(nodes: NodeConfig[], base: string): string {
  if (!nodes.some((n) => n.tag === base)) return base
  let i = 2
  while (nodes.some((n) => n.tag === `${base}-${i}`)) i++
  return `${base}-${i}`
}

function normalize(node: NodeConfig): NodeConfig {
  const def = protocolOf(node.type)
  return def.normalize ? def.normalize(node) : node
}

/**
 * 手改 JSON 时每次按键都会 set，同步写 localStorage 会拖慢输入。
 * 这里合并 250ms 内的写入，页面隐藏/卸载时立即落盘。
 */
function deferredStorage(): StateStorage {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: [string, string] | null = null

  const flush = () => {
    if (!pending) return
    try {
      localStorage.setItem(pending[0], pending[1])
    } catch {
      // 配额满或隐私模式：放弃本次持久化，内存里的状态仍然可用
    }
    pending = null
  }

  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending = [name, value]
      clearTimeout(timer)
      timer = setTimeout(flush, 250)
    },
    removeItem: (name) => {
      clearTimeout(timer)
      pending = null
      localStorage.removeItem(name)
    },
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      server: DEFAULT_SERVER,
      nodes: [],
      selectedId: null,
      manual: null,

      setServer(patch) {
        set((state) => ({ manual: null, server: { ...state.server, ...patch } }))
      },

      setManual(text) {
        if (text === null) {
          set({ manual: null })
          return
        }
        const { nodes, server } = get()
        const synced = parseConfig(text, { nodes, server })
        if (!synced) {
          set({ manual: text })
          return
        }
        set((state) => {
          const selectedId = synced.nodes.some((n) => n.id === state.selectedId)
            ? state.selectedId
            : (synced.nodes[0]?.id ?? null)
          return {
            manual: text,
            server: { ...state.server, ...synced.server },
            nodes: synced.nodes,
            selectedId,
          }
        })
      },

      addNode(type) {
        const { nodes, server } = get()
        const def = protocolOf(type)
        const fresh = def.create(server, nodes.length + 1)
        const node = normalize({
          ...fresh,
          tag: uniqueTag(nodes, fresh.tag),
          port: nextFreePort(nodes, def.defaultPort, def.transport),
        })
        set({ manual: null, nodes: [...nodes, node], selectedId: node.id })
      },

      removeNode(id) {
        set((state) => {
          const nodes = state.nodes.filter((n) => n.id !== id)
          const selectedId =
            state.selectedId === id ? (nodes[0]?.id ?? null) : state.selectedId
          return { manual: null, nodes, selectedId }
        })
      },

      selectNode(id) {
        set({ selectedId: id })
      },

      setTag(id, tag) {
        set((state) => ({
          manual: null,
          nodes: state.nodes.map((n) => (n.id === id ? { ...n, tag } : n)),
        }))
      },

      setPort(id, port) {
        set((state) => ({
          manual: null,
          nodes: state.nodes.map((n) => (n.id === id ? { ...n, port } : n)),
        }))
      },

      setParam(id, key, value) {
        set((state) => ({
          manual: null,
          nodes: state.nodes.map((n) =>
            n.id === id ? normalize({ ...n, params: { ...n.params, [key]: value } }) : n,
          ),
        }))
      },

      /** 单字段重新随机：复用 create 的随机源，新增协议无需额外实现 */
      rerollParam(id, key) {
        const { nodes, server } = get()
        set({
          manual: null,
          nodes: nodes.map((n) => {
            if (n.id !== id) return n
            const fresh = protocolOf(n.type).create(server, 1)
            const value = fresh.params[key]
            if (value === undefined) return n
            return normalize({ ...n, params: { ...n.params, [key]: value } })
          }),
        })
      },

      rerollNode(id) {
        const { nodes, server } = get()
        set({
          manual: null,
          nodes: nodes.map((n) =>
            n.id === id ? normalize({ ...n, params: protocolOf(n.type).create(server, 1).params }) : n,
          ),
        })
      },

      rerollAll() {
        const { nodes, server } = get()
        set({
          manual: null,
          nodes: nodes.map((n) =>
            normalize({ ...n, params: protocolOf(n.type).create(server, 1).params }),
          ),
        })
      },

      reset() {
        set({ manual: null, nodes: [], selectedId: null })
      },
    }),
    {
      name: 'sbg.state.v1',
      version: 1,
      storage: createJSONStorage(deferredStorage),
      partialize: (state) => ({
        server: state.server,
        nodes: state.nodes,
        selectedId: state.selectedId,
        manual: state.manual,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<State> | undefined
        if (!data) return current
        const nodes = (data.nodes ?? []).filter(
          (node): node is NodeConfig => Boolean(node?.id && getProtocol(node.type)),
        )
        const selectedId =
          data.selectedId && nodes.some((n) => n.id === data.selectedId)
            ? data.selectedId
            : (nodes[0]?.id ?? null)
        const saved: Partial<ServerConfig> = data.server ?? {}
        return {
          ...current,
          server: {
            ...current.server,
            ...saved,
            certMode: saved.certMode === 'acme' ? 'acme' : 'self',
          },
          nodes,
          selectedId,
          manual: typeof data.manual === 'string' ? data.manual : null,
        }
      },
    },
  ),
)
