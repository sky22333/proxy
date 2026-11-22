import { RefreshCw } from 'lucide-react'
import { FieldRow } from '@/components/FieldRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { protocolOf } from '@/lib/protocols'
import { useStore } from '@/store'

const EXPOSURE_VARIANT = {
  strong: 'secondary',
  medium: 'outline',
  weak: 'destructive',
} as const

export function ParamCard() {
  const nodes = useStore((s) => s.nodes)
  const selectedId = useStore((s) => s.selectedId)
  const setTag = useStore((s) => s.setTag)
  const rerollNode = useStore((s) => s.rerollNode)

  const node = nodes.find((item) => item.id === selectedId)
  if (!node) return null
  const def = protocolOf(node.type)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {def.label}
          <Badge variant={EXPOSURE_VARIANT[def.exposure.level]} className="font-normal">
            {def.exposure.label}
          </Badge>
        </CardTitle>
        <CardDescription>{def.exposure.note}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
          <Label className="text-xs font-normal text-muted-foreground">名称</Label>
          <Input
            value={node.tag}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTag(node.id, event.target.value)}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
        {def.fields.map((field) => (
          <FieldRow key={field.key} node={node} field={field} />
        ))}
      </CardContent>
      <CardFooter>
        <Button type="button" variant="ghost" size="sm" onClick={() => rerollNode(node.id)}>
          <RefreshCw />
          重新随机全部
        </Button>
      </CardFooter>
    </Card>
  )
}
