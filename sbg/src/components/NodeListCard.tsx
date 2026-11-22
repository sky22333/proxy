import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { transportLayers } from '@/lib/ports'
import { protocolOf } from '@/lib/protocols'
import type { NodeConfig } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

function portLabel(node: NodeConfig): string {
  return `${node.port}/${transportLayers(protocolOf(node.type).transport).join('+')}`
}

export function NodeListCard({ issues }: { issues: Record<string, string> }) {
  const nodes = useStore((s) => s.nodes)
  const selectedId = useStore((s) => s.selectedId)
  const selectNode = useStore((s) => s.selectNode)
  const removeNode = useStore((s) => s.removeNode)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>节点{nodes.length > 0 && <span className="text-muted-foreground"> · {nodes.length}</span>}</CardTitle>
        {nodes.length === 0 && <CardDescription>还没有节点，从上面添加一个</CardDescription>}
      </CardHeader>
      {nodes.length > 0 && (
        <CardContent className="space-y-0.5">
          {nodes.map((node) => {
            const def = protocolOf(node.type)
            const active = node.id === selectedId
            const issue = issues[node.id]
            return (
              <div
                key={node.id}
                className={cn(
                  'flex items-center gap-1 rounded-lg pr-1 transition-colors',
                  active ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => selectNode(node.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{node.tag}</p>
                    <p
                      className={cn(
                        'truncate text-[11px]',
                        issue ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {issue ?? def.summary?.(node) ?? def.label}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground"
                  >
                    {portLabel(node)}
                  </Badge>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`删除 ${node.tag}`}
                  onClick={() => removeNode(node.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
