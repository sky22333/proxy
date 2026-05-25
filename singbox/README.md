-  `sing-box`一键安装脚本
```
bash <(curl -Ls https://raw.githubusercontent.com/sky22333/xray-singbox/main/singbox/install.sh)
```

支持环境变量传入版本号
```
V=1.13.12
```

---

#### Dokcer安装
```
mkdir -p /etc/sing-box && touch /etc/sing-box/config.json
```
```
docker run -d \
  --name sing-box \
  --network host \
  --restart always \
  --cap-add NET_ADMIN \
  --device /dev/net/tun \
  -v /etc/sing-box:/etc/sing-box \
  gzxhwq/sing-box
```

#### 命令

配置文件              `/etc/sing-box/config.json`

启动	             `systemctl start sing-box`

停止	             `systemctl stop sing-box`

开机自启	             `systemctl enable sing-box`

重新启动	             `systemctl restart sing-box`

运行状态              `systemctl status sing-box`

查看日志	             `journalctl -u sing-box --output cat -e`

实时日志	             `journalctl -u sing-box --output cat -f`

生成uuid             `cat /proc/sys/kernel/random/uuid`

生成reality-key      `sing-box generate reality-keypair`


#### 自签证书
```
openssl req -x509 -nodes -newkey ec:<(openssl ecparam -name prime256v1) \
-keyout /etc/sing-box/key.pem \
-out /etc/sing-box/cert.pem \
-subj "/CN=bing.com" \
-days 3650 && \
chmod 600 /etc/sing-box/key.pem && chmod 644 /etc/sing-box/cert.pem
```

##### [配置文件示例](https://github.com/chika0801/sing-box-examples)   

##### [官方文档](https://sing-box.sagernet.org/zh/configuration/)
