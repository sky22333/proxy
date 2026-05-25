### Docker运行xray

```
mkdir -p /etc/xray && touch /etc/xray/config.json
```

```
docker run -d \
  --network host \
  --name xray \
  --restart=always \
  -v /etc/xray:/etc/xray \
  teddysun/xray
```

---

### 官方脚本安装xray
```
# 安装 / 升级 Xray
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 安装指定版本
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install -v v1.8.4

# 完全卸载
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ remove --purge

# 只更新 geoip.dat 和 geosite.dat
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install-geodata

# 开机自启
systemctl enable xray

# 关闭开机自启
systemctl disable xray

# 启动服务
systemctl start xray

# 停止服务
systemctl stop xray

# 重启服务
systemctl restart xray

# 查看服务状态
systemctl status xray

# 查看实时 systemd 日志
journalctl -u xray -o cat -f

# 查看是否运行中
systemctl is-active xray

# 查看 Xray 版本
xray version

# 测试配置文件
xray run -test -config /usr/local/etc/xray/config.json

# 手动运行 Xray
xray run -config /usr/local/etc/xray/config.json
```

##  Reality域名推荐列表

```
addons.mozilla.org
s0.awsstatic.com
d1.awsstatic.com
m.media-amazon.com
www.amazon.com

player.live-video.net
one-piece.com
www.lovelive-anime.jp
www.swift.com
academy.nvidia.com
www.cisco.com
update.microsoft
www.tesla.com
slack.com
www.ibm.com
www.ebay.com
store.steampowered.com
www.riotgames.com
www.xbox.com
www.icloud.com
```
---
#####  [更多配置模板](https://github.com/XTLS/Xray-examples)

#####  [配置文档](https://xtls.github.io/config/)
