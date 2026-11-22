import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { FormRow } from '@/components/FormRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/store'
import { type FieldSpec, type NodeConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FieldRowProps {
  node: NodeConfig
  field: FieldSpec
}

export function FieldRow({ node, field }: FieldRowProps) {
  const setParam = useStore((s) => s.setParam)
  const rerollParam = useStore((s) => s.rerollParam)
  const setPort = useStore((s) => s.setPort)

  if (field.visible && !field.visible(node)) return null

  const readOnly = Boolean(field.derived)
  const isPort = field.target === 'port' && !readOnly
  const raw = field.derived
    ? field.derived(node)
    : isPort
      ? node.port
      : node.params[field.key]

  const text = typeof raw === 'boolean' ? '' : String(raw ?? '')
  const monoClass = field.mono ? 'font-mono text-[11.5px] tracking-tight' : 'text-xs'

  let control: ReactNode

  if (field.kind === 'switch') {
    control = (
      <div className="flex h-8 items-center">
        <Switch
          checked={raw === true}
          onCheckedChange={(checked) => setParam(node.id, field.key, checked)}
        />
      </div>
    )
  } else if (field.kind === 'select' && field.options) {
    const current = field.options.find((option) => option.value === text)
    control = (
      <Select
        value={text}
        onValueChange={(value) => setParam(node.id, field.key, String(value))}
      >
        <SelectTrigger className="h-8 w-full text-xs" aria-label={field.label}>
          <span className="truncate">{current?.label ?? text}</span>
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (field.kind === 'number') {
    control = (
      <Input
        type="number"
        inputMode="numeric"
        min={field.min}
        max={field.max}
        value={text}
        readOnly={readOnly}
        onChange={(event) => {
          const next = event.target.value
          if (next === '') {
            // 端口允许清空后重输：0 会被 findIssues 立刻标红，不会静默写出非法配置
            if (isPort) setPort(node.id, 0)
            else setParam(node.id, field.key, '')
            return
          }
          const parsed = Number(next)
          if (!Number.isFinite(parsed)) return
          if (isPort) setPort(node.id, parsed)
          else setParam(node.id, field.key, parsed)
        }}
        className={cn('h-8 font-mono text-[11.5px]', readOnly && 'bg-muted/40')}
      />
    )
  } else {
    control = (
      <Input
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setParam(node.id, field.key, event.target.value)}
        className={cn('h-8', monoClass, readOnly && 'bg-muted/40 text-muted-foreground')}
      />
    )
  }

  return (
    <FormRow
      label={field.label}
      hint={field.hint}
      action={
        field.regen && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={`重新生成${field.label}`}
            onClick={() => rerollParam(node.id, field.key)}
          >
            <RefreshCw />
          </Button>
        )
      }
    >
      {control}
    </FormRow>
  )
}
