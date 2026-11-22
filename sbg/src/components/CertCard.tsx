import { TriangleAlert } from 'lucide-react'
import { FormRow } from '@/components/FormRow'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { protocolOf } from '@/lib/protocols'
import type { CertMode } from '@/lib/types'
import { useStore } from '@/store'

const MODES = [
  { value: 'self', label: '自签（openssl）' },
  { value: 'acme', label: 'ACME（Let’s Encrypt）' },
] as const

const BORROWED_DOMAIN = 'bing.com'

export function CertCard() {
  const server = useStore((s) => s.server)
  const nodes = useStore((s) => s.nodes)
  const setServer = useStore((s) => s.setServer)

  const tlsNodes = nodes.filter((node) => protocolOf(node.type).needsCert)
  /** 没有任何 TLS 入站时，整张卡片不出现 */
  if (tlsNodes.length === 0) return null

  const acme = server.certMode === 'acme'
  const users = Array.from(new Set(tlsNodes.map((node) => protocolOf(node.type).short))).join(' / ')
  const borrowed = acme && server.domain.trim() === BORROWED_DOMAIN

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          证书
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
            {acme ? 'ACME' : '自签'}
          </Badge>
        </CardTitle>
        <CardDescription>{users} 共用这一张证书</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormRow
          label="方式"
          hint={acme ? '受信任证书，分享链接不再带 insecure' : '客户端需要跳过证书校验'}
        >
          <Select
            value={server.certMode}
            onValueChange={(value) => setServer({ certMode: value as CertMode })}
          >
            <SelectTrigger className="h-8 w-full text-xs" aria-label="证书方式">
              <span className="truncate">
                {MODES.find((mode) => mode.value === server.certMode)?.label}
              </span>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value} className="text-xs">
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow
          label="域名"
          hint={acme ? '必须已解析到本机，否则签发失败' : '自签证书的 CN / SAN，同时作为 SNI'}
        >
          <Input
            value={server.domain}
            spellCheck={false}
            autoComplete="off"
            placeholder="example.com"
            onChange={(event) => setServer({ domain: event.target.value })}
            className="h-8 font-mono text-xs"
          />
        </FormRow>

        {acme ? (
          <>
            <FormRow label="邮箱" hint="Let’s Encrypt 账号邮箱，可留空">
              <Input
                value={server.acmeEmail}
                spellCheck={false}
                autoComplete="off"
                placeholder="me@example.com"
                onChange={(event) => setServer({ acmeEmail: event.target.value })}
                className="h-8 font-mono text-xs"
              />
            </FormRow>
            <FormRow label="缓存目录" hint="账户与证书缓存在这里，迁移时一并带走可免重新签发">
              <Input
                value={server.acmeDir}
                spellCheck={false}
                autoComplete="off"
                placeholder="/etc/sing-box/acme"
                onChange={(event) => setServer({ acmeDir: event.target.value })}
                className="h-8 font-mono text-xs"
              />
            </FormRow>
            <p className="flex gap-1.5 rounded-md bg-sky-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-400">
              <TriangleAlert className="mt-px size-3 shrink-0" />
              <span>需 80/TCP 可达，签发细节见右侧「证书」页。</span>
            </p>
            {borrowed && (
              <p className="flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400">
                <TriangleAlert className="mt-px size-3 shrink-0" />
                <span>{BORROWED_DOMAIN} 不是你的域名，ACME 无法为它签发，请改成自己的域名。</span>
              </p>
            )}
          </>
        ) : (
          <FormRow label="证书目录" hint="与配置中的 certificate_path 保持一致">
            <Input
              value={server.certDir}
              spellCheck={false}
              autoComplete="off"
              placeholder="/etc/sing-box/cert"
              onChange={(event) => setServer({ certDir: event.target.value })}
              className="h-8 font-mono text-xs"
            />
          </FormRow>
        )}
      </CardContent>
    </Card>
  )
}
