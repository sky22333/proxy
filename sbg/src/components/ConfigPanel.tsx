import {
  Check,
  Download,
  FileJson,
  Link2,
  RotateCcw,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { JsonEditor } from '@/components/JsonEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseLink } from '@/lib/links'
import { acmeProvider, certDirOf, certPaths, domainOf } from '@/lib/protocols/_shared'
import { protocolOf } from '@/lib/protocols'
import { anyNeedsCert, buildConfig, buildLinks, type ShareLink } from '@/lib/render'
import type { ServerConfig } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function CommandBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2.5 py-1">
        <span className="text-[11px] text-muted-foreground">{title}</span>
        <CopyButton value={code} iconOnly size="icon-xs" variant="ghost" />
      </div>
      <pre className="overflow-auto p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  )
}

function LinkItem({ link, server }: { link: ShareLink; server: ServerConfig }) {
  const parsed = parseLink(link.url)
  const expectedHost = server.host.trim().replace(/^\[|\]$/g, '')
  const hasHost = expectedHost.length > 0
  const hostOk = hasHost && parsed?.host === expectedHost
  const params = parsed?.params.map(([key, value]) => `${key}=${value}`).join('  ') ?? ''

  return (
    <div className="space-y-2 rounded-lg border p-2.5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px] font-normal">
          {protocolOf(link.type).short}
        </Badge>
        <span className="truncate text-xs font-medium">{link.tag}</span>
        <span className="flex-1" />
        <CopyButton value={link.url} iconOnly size="icon-xs" variant="ghost" />
      </div>

      <p className="font-mono text-[11px] leading-snug break-all text-muted-foreground">
        {link.url}
      </p>

      {parsed && (
        <div className="space-y-0.5 border-t pt-2 text-[11px]">
          <div className="flex gap-2">
            <span className="w-8 shrink-0 text-muted-foreground">地址</span>
            <span className="font-mono break-all">
              {parsed.host}:{parsed.port}
            </span>
            <span
              className={cn(
                'ml-auto flex shrink-0 items-center gap-1',
                !hasHost
                  ? 'text-amber-600'
                  : hostOk
                    ? 'text-emerald-600'
                    : 'text-destructive',
              )}
            >
              {!hasHost ? (
                <>
                  <TriangleAlert className="size-3" />
                  未填地址
                </>
              ) : hostOk ? (
                <>
                  <Check className="size-3" />
                  一致
                </>
              ) : (
                <>
                  <TriangleAlert className="size-3" />
                  不一致
                </>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-8 shrink-0 text-muted-foreground">凭据</span>
            <span className="font-mono break-all">{parsed.identity}</span>
          </div>
          {params && (
            <div className="flex gap-2">
              <span className="w-8 shrink-0 text-muted-foreground">参数</span>
              <span className="font-mono break-all text-muted-foreground">{params}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

export function ConfigPanel() {
  const nodes = useStore((s) => s.nodes)
  const server = useStore((s) => s.server)
  const manual = useStore((s) => s.manual)
  const setManual = useStore((s) => s.setManual)

  const needsCert = anyNeedsCert(nodes)
  const acme = server.certMode === 'acme'

  const [tab, setTab] = useState('config')
  /** 证书页随最后一个 TLS 节点一起消失，别把用户留在空面板上 */
  const activeTab = needsCert ? tab : 'config'

  const auto = useMemo(
    () => JSON.stringify(buildConfig(nodes, server), null, 2),
    [nodes, server],
  )
  const text = manual ?? auto
  const links = useMemo(() => buildLinks(nodes, server), [nodes, server])

  const jsonError = useMemo(() => {
    try {
      JSON.parse(text)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [text])

  const { crt, key, commands, acmeSnippet, acmeDir } = useMemo(() => {
    const paths = certPaths(server)
    const provider = acmeProvider(server)
    return {
      crt: paths.crt,
      key: paths.key,
      commands: [
        `mkdir -p ${certDirOf(server)}`,
        `openssl ecparam -genkey -name prime256v1 -out ${paths.key}`,
        `openssl req -new -x509 -key ${paths.key} -out ${paths.crt} -subj "/CN=${domainOf(server)}" -days 3650`,
        `chmod 600 ${paths.key}`,
      ].join('\n'),
      acmeSnippet: JSON.stringify(provider, null, 2),
      acmeDir: provider.data_directory,
    }
  }, [server])

  const sizeKb = (new TextEncoder().encode(text).length / 1024).toFixed(1)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(String(value))}
        className="flex h-full min-h-0 flex-col gap-0"
      >
        <div className="border-b px-2 pt-2">
          <TabsList variant="line" className="h-8 w-full justify-start">
            <TabsTrigger value="config" className="flex-none px-2.5">
              <FileJson className="size-3.5" />
              服务端配置
            </TabsTrigger>
            <TabsTrigger value="links" className="flex-none px-2.5">
              <Link2 className="size-3.5" />
              分享链接{links.length > 0 && ` ${links.length}`}
            </TabsTrigger>
            {needsCert && (
              <TabsTrigger value="cert" className="flex-none px-2.5">
                <ShieldCheck className="size-3.5" />
                证书
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="config" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {nodes.length} 个入站 · {sizeKb} KB · 需 sing-box ≥ 1.12
              {acme && needsCert && '（ACME 需 ≥ 1.14）'}
              {manual === null ? (
                ' · 实时生成'
              ) : (
                <>
                  ·
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-[10px] font-normal text-amber-600"
                  >
                    已手改
                  </Badge>
                </>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {manual !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setManual(null)}
                >
                  <RotateCcw />
                  还原
                </Button>
              )}
              <CopyButton value={text} size="xs" />
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => downloadFile('config.json', text)}
              >
                <Download />
                下载
              </Button>
            </div>
          </div>

          {nodes.length === 0 && manual === null && (
            <p className="mx-3 mb-2 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              还没有节点。也可以把已有的 config.json 直接粘贴到下面，能识别出的入站、DNS 与证书方式会同步到左侧。
            </p>
          )}

          {manual !== null && (
            <p className="mx-3 mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400">
              手改会同步回左侧参数与分享链接；log、route 等无法映射的字段只保留在这份文本里。
              再改左侧任一字段会重新生成，那些字段随之丢弃。
            </p>
          )}

          {jsonError && (
            <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
              <TriangleAlert className="mt-px size-3 shrink-0" />
              <span className="break-all">JSON 语法错误：{jsonError}</span>
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <JsonEditor value={text} onChange={setManual} />
          </div>
        </TabsContent>

        <TabsContent value="links" className="min-h-0 flex-1 overflow-auto p-3">
          {nodes.length === 0 ? (
            <EmptyHint text="添加节点后，这里会给出每个节点的分享链接，并自动反解回字段做一致性校验" />
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <LinkItem key={link.id} link={link} server={server} />
              ))}
            </div>
          )}
        </TabsContent>

        {needsCert && (
          <TabsContent value="cert" className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {acme ? (
              <>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  证书由 Let’s Encrypt 自动签发并续期，首次启动时完成（需 sing-box ≥ 1.14）。
                  所有 TLS 入站共用同一个 certificate_provider，不会重复申请。
                </p>
                <CommandBlock title="certificate_providers（已写入配置）" code={acmeSnippet} />
                <div className="space-y-1.5 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <Terminal className="mt-px size-3 shrink-0" />
                    <span>
                      需要域名已解析到本机，且 80/TCP 可达（HTTP-01）。REALITY 占用 443/TCP
                      时走不了 TLS-ALPN，可改用自签证书。
                    </span>
                  </p>
                  <p>
                    缓存目录：<span className="font-mono break-all">{acmeDir}</span>
                  </p>
                  <p>ACME 证书受信任，分享链接不再附带 insecure / allow_insecure。</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  所有 TLS 入站共用同一张自签证书，配置需要 sing-box ≥ 1.12。
                  密钥必须用 <span className="font-mono">prime256v1</span>，不要换成 Ed25519 ——
                  1.14 起 hy2 客户端默认模仿 Chrome 的 QUIC 指纹，Ed25519 会导致握手失败。
                </p>
                <CommandBlock title="生成自签证书" code={commands} />
                <div className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <Terminal className="size-3" />
                    证书路径（与配置中的 certificate_path 保持一致）
                  </p>
                  <p className="font-mono break-all">
                    {crt}
                    <br />
                    {key}
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
