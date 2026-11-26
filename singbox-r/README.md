#### `sing-box` 管理脚本（reF1nd 分支）
```
curl -fsSL https://raw.githubusercontent.com/sky22333/proxy/main/singbox-r/install.sh | sh
```

默认 `V=1.14.4-reF1nd`，自定义时版本号必须带 `-reF1nd` 后缀：
```
V=1.15.0-alpha.13-reF1nd
```

---

#### 内核来源

全部指向 `reF1nd/sing-box-releases`，不是 `SagerNet/sing-box`：

| 包 | 文件 |
|---|---|
| deb | `SFL-<版本>-amd64.deb` / `arm64` / `armv7l` |
| rpm | `SFL-<版本>-x86_64.rpm` / `aarch64` / `armv7l` |
| tar（脚本用） | `sing-box-<版本>-linux-amd64-glibc.tar.gz`，另有 `amd64v3` / `arm64` / `musl` / `purego` |

`amd64` 是 GOAMD64=v1 基线，`amd64v3` 要求 CPU 有 AVX2。脚本按 `/proc/cpuinfo` 自动选，选错了用 `SB_ARCH=amd64` 重跑。


#### 命令

```bash
systemctl start|stop|restart|status sing-box
systemctl enable sing-box
systemctl reload sing-box                              # SIGHUP，先校验再重建，失败保留旧实例
journalctl -u sing-box --output cat -f                 # 实时日志，去 -f 看历史
sing-box generate reality-keypair                      # REALITY 密钥对
cat /proc/sys/kernel/random/uuid                       # uuid
```

配置文件 `/etc/sing-box/config.json`。

---

#### 客户端：节点走分享链接

全部来自 `/etc/sing-box/nodes.txt`，每行一条 `vless:// hysteria2:// anytls:// tuic:// trojan:// ss:// vmess://`：

```bash
mkdir -p /etc/sing-box && cp nodes.txt /etc/sing-box/nodes.txt
```

分流入口两个组：

| tag | 类型 | 作用 |
|---|---|---|
| `proxy` | selector | `default` 写谁就固定走谁，默认指向 `auto` |
| `auto` | loadbalance | `sticky-sessions` 或 `consistent-hashing` |

换节点只改 `nodes.txt` 一行，换策略只改 `auto.strategy`。

#### 服务端：拒绝未知 SNI

TLS 入站写 `server_names` + `reject_unknown_sni`：

```json
"tls": {
  "enabled": true,
  "server_names": ["www.tesla.com", "tesla.com"],
  "reject_unknown_sni": true,
  "reality": { }
}
```

名单外的 SNI 直接断握手，不回落默认证书。`server_name` 与 `server_names` 互斥，多域名只能用后者，且每个名字都要能被 handshake 目标正常应答，否则探测者会看到证书与域名不匹配。


##### [分支文档](https://github.com/reF1nd/sing-box/tree/reF1nd-stable/docs)

---

自用服务端一键脚本
```
curl -fsSL https://raw.githubusercontent.com/sky22333/proxy/main/singbox-r/singbox.sh | sh
```
