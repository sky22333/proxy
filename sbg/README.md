# sing-box 服务端配置生成器

纯静态的 sing-box 服务端配置生成器：选协议 → 点 `+`，密钥自动随机生成，右侧实时产出 `config.json` 和分享链接。没有后端。

## 支持的协议

| 协议 | 传输 | 证书 | 默认端口 |
|---|---|---|---|
| VLESS-REALITY | TCP | 不需要（借用目标站点） | 443 |
| Hysteria2 | UDP | 需要 | 443 |
| TUIC v5 | UDP | 需要 | 8443 |
| AnyTLS | TCP | 需要 | 8443 |
| Shadowsocks 2022 | TCP + UDP | 不需要 | 8388 |

多节点共存，端口冲突按「传输层 + 端口」二元组判定（SS2022 同端口同时占 TCP/UDP，不会和只占 TCP 的 REALITY 冲突）。

## 版本要求

- **服务端与客户端最低 sing-box 1.12.0**：配置使用新版 DNS 服务器格式（`type` + `server`）与 `route.default_domain_resolver`，这两项在 1.12 引入。
- **ACME 模式最低 sing-box 1.14.0**：证书走 `certificate_providers`，1.12 / 1.13 不认这个字段。自签模式没有这个限制。
- 生成的路由使用 `action: "reject"`（1.11 起的新写法），不再依赖已弃用的 `block` outbound。

## 使用

```bash
npm install
npm run dev      # 开发
npm run build    # 产出 dist/
```

`dist/` 可以放在任意静态托管的任意子路径（构建用的是相对路径 `base: './'`）。但 `type="module"` 受 CORS 限制，**不能直接双击 `dist/index.html`**，本地预览请用 `npm run preview` 或任意静态服务器。

## 生成的内容

- `log`：`warn` 级别
- `dns`：显式 UDP 上游（默认 `1.1.1.1`），`strategy: prefer_ipv4`
- `route`：`ip_is_private` 直接 `reject`，避免节点被当作访问内网或云 metadata 的跳板
- 证书：自签给 `openssl` 命令；ACME 自动写 `certificate_providers`，所有 TLS 入站共用一个 tag，证书只申请一次

自签证书必须是 `prime256v1`（ECDSA P-256）。1.14 起 hy2 客户端默认模仿 Chrome 的 QUIC 指纹，Ed25519 证书会握手失败。

## 右侧配置可以手改

编辑 `config.json` 后，能识别的部分会同步回左侧表单和分享链接：

- 入站的 `tag` / 端口 / 凭证 / SNI 等参数
- `dns.servers` 中的 UDP 上游
- 证书方式与域名（从 `certificate_providers` 或 `certificate_path` 反推）

`log`、`route`、自定义字段只保留在文本里。再改左侧任一字段会重新生成，这些字段随之丢弃。手改把入站改坏时不会清空左侧节点列表。

## 状态存储

所有状态存在浏览器 `localStorage`（键 `sbg.state.v1`），包括手改后的配置文本。清除站点数据即可抹除。写入做了 250ms 合并，避免手改长文本时阻塞输入。

## 开发脚本

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # oxlint
npm run smoke       # 生成/反解往返、手改同步、空配置边界
```