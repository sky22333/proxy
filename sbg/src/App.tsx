import { RefreshCw, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { AddNodeCard } from '@/components/AddNodeCard'
import { CertCard } from '@/components/CertCard'
import { ConfigPanel } from '@/components/ConfigPanel'
import { NodeListCard } from '@/components/NodeListCard'
import { ParamCard } from '@/components/ParamCard'
import { ServerCard } from '@/components/ServerCard'
import { Button } from '@/components/ui/button'
import { findIssues, issueMap } from '@/lib/ports'
import { useStore } from '@/store'

export default function App() {
  const nodes = useStore((s) => s.nodes)
  const rerollAll = useStore((s) => s.rerollAll)
  const reset = useStore((s) => s.reset)
  const issues = useMemo(() => issueMap(findIssues(nodes)), [nodes])

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-medium">sing-box 配置生成器</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              纯静态 · 无后端
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={nodes.length === 0}
            onClick={rerollAll}
          >
            <RefreshCw />
            全部随机
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={nodes.length === 0}
            onClick={reset}
          >
            <Trash2 />
            清空
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] items-start gap-3 px-4 py-3 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <AddNodeCard />
          <ServerCard />
          <CertCard />
          <NodeListCard issues={issues} />
          <ParamCard />
        </div>
        <div className="min-h-[560px] lg:sticky lg:top-[3.75rem] lg:h-[calc(100vh-4.5rem)]">
          <ConfigPanel />
        </div>
      </main>

      <footer className="mx-auto max-w-[1440px] px-4 pb-6 pt-1">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          随机值由 crypto.getRandomValues 生成；REALITY 公钥由私钥实时推导。
          右侧 JSON 可直接编辑，改动能识别的部分会同步回左侧参数与分享链接。
          配置保存在本机浏览器，清除站点数据即可抹除。
        </p>
      </footer>
    </div>
  )
}
