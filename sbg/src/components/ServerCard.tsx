import { FormRow } from '@/components/FormRow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store'

export function ServerCard() {
  const server = useStore((s) => s.server)
  const setServer = useStore((s) => s.setServer)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>服务器</CardTitle>
        <CardDescription>地址只用于生成链接</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormRow label="公网地址" hint="必填；填域名也可以，链接里会原样使用">
          <Input
            value={server.host}
            spellCheck={false}
            autoComplete="off"
            placeholder="1.2.3.4 或 vps.example.com"
            onChange={(event) => setServer({ host: event.target.value })}
            className="h-8 font-mono text-xs"
          />
        </FormRow>
        <FormRow label="DNS 上游" hint="DoH 请在右侧配置里改（本字段只认 UDP）">
          <Input
            value={server.dns}
            spellCheck={false}
            autoComplete="off"
            placeholder="1.1.1.1"
            onChange={(event) => setServer({ dns: event.target.value })}
            className="h-8 font-mono text-xs"
          />
        </FormRow>
      </CardContent>
    </Card>
  )
}
