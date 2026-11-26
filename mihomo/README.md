- [mihomo文档](https://wiki.metacubex.one/config/)

- [内核地址](https://github.com/MetaCubeX/mihomo/releases)

#### `mihome` 管理脚本
```
bash <(curl -sSL https://cdn.jsdelivr.net/gh/sky22333/proxy@main/mihomo/install.sh)
```

#### `mihome` 安装脚本（指定版本）
```
# 指定版本变量
v="1.19.34"

# 一键安装
bash <(curl -sSL https://raw.githubusercontent.com/sky22333/proxy/main/mihomo/install.sh)
```

#### 申请证书
```
bash <(curl -sSL https://cdn.jsdelivr.net/gh/sky22333/shell@main/dev/acme.sh)
```

#### UUID生成
```
cat /proc/sys/kernel/random/uuid
```

#### 其他用法

| 参数                           | 解释                 |
| ---------------------------- | -------------------- |
| `-age-secret-key <key>`      | 指定 age 密钥，用于解密加密配置   |
| `-config <string>`           | 使用 Base64 编码的完整配置内容    |
| `-d <目录>`                    | 指定配置目录               |
| `-ext-ui <目录>`               | 指定外部 Web UI 目录       |
| `-f <文件>`                    | 指定配置文件路径             |
| `-m`                         | 启用 geodata 模式        |
| `-post-down <命令>`            | 网络关闭后自动执行命令或脚本      |
| `-post-up <命令>`              | 网络启动后自动执行命令或脚本      |
| `-secret <字符串>`              | 设置 API 访问密钥          |
| `-t`                         | 测试配置文件是否正确，然后退出      |
| `-v`                         | 显示 mihomo 版本信息       |


---

[clash-verge-rev下载地址](https://github.com/clash-verge-rev/clash-verge-rev/releases) (gui客户端)
