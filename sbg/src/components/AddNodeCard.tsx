import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PROTOCOLS, protocolOf } from '@/lib/protocols'
import type { ProtocolId } from '@/lib/types'
import { useStore } from '@/store'

export function AddNodeCard() {
  const addNode = useStore((s) => s.addNode)
  const [type, setType] = useState<ProtocolId>(PROTOCOLS[0].id)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>协议</CardTitle>
        <CardDescription>先选协议再点 +，密钥、UUID、密码自动随机生成</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Select value={type} onValueChange={(value) => setType(value as ProtocolId)}>
          <SelectTrigger className="h-8 w-full text-xs" aria-label="选择协议">
            <SelectValue>{(value: ProtocolId) => protocolOf(value).label}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {PROTOCOLS.map((protocol) => (
              <SelectItem key={protocol.id} value={protocol.id} className="text-xs">
                {protocol.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="icon"
          title={`添加 ${protocolOf(type).label}`}
          aria-label={`添加 ${protocolOf(type).label}`}
          onClick={() => addNode(type)}
        >
          <Plus />
        </Button>
      </CardContent>
    </Card>
  )
}
