#!/bin/bash
set -e

# 确保颜色代码可以正常工作
export TERM=xterm-256color

# 颜色定义
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
CYAN='\033[36m'
PURPLE='\033[35m'
NC='\033[0m' # 无色

# 可以通过环境变量替换下载地址
V="${V:-1.19.25}"
BIN_PATH="/usr/local/bin/mihomo"
CONFIG_DIR="/etc/mihomo"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
SERVICE_FILE="/etc/systemd/system/mihomo.service"
CERT_KEY="$CONFIG_DIR/server.key"
CERT_CRT="$CONFIG_DIR/server.crt"
PASSWORD="$(cat /proc/sys/kernel/random/uuid)"

# 美化函数，用于输出分隔线
print_separator() {
  echo -e "${BLUE}══════════════════════════════════════════${NC}"
}

# 输出标题
print_title() {
  local title="$1"
  print_separator
  echo -e "${BLUE}█ ${CYAN}$title${BLUE} █${NC}"
  print_separator
}

install_mihomo() {
  if [ -f "$BIN_PATH" ]; then
    echo -e "${YELLOW}已检测到 $BIN_PATH 存在，Mihomo 可能已安装，跳过安装。${NC}"
    return
  fi

  print_title "开始安装 Mihomo"
  curl -L "https://github.com/MetaCubeX/mihomo/releases/download/v${V}/mihomo-linux-amd64-v${V}.gz" -o /tmp/mihomo.gz
  gunzip -f /tmp/mihomo.gz
  mv /tmp/mihomo "$BIN_PATH"
  chmod +x "$BIN_PATH"
  rm -f /tmp/mihomo.gz
  mkdir -p "$CONFIG_DIR"

  cat > "$CONFIG_FILE" << EOF
log-level: warning

# anytls协议
listeners:
- name: anytls-in
  type: anytls
  port: 8443
  listen: 0.0.0.0
  users:
    user1: ${PASSWORD}
  certificate: ./server.crt
  private-key: ./server.key
  
proxies:
- name: "direct"
  type: direct
rules:
- MATCH,direct
EOF

  echo -e "${CYAN}创建 systemd 服务文件...${NC}"
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=mihomo Daemon, Another Clash Kernel.
After=network.target NetworkManager.service systemd-networkd.service iwd.service

[Service]
Type=simple
LimitNPROC=500
LimitNOFILE=1000000
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE CAP_SYS_TIME CAP_SYS_PTRACE CAP_DAC_READ_SEARCH CAP_DAC_OVERRIDE
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE CAP_SYS_TIME CAP_SYS_PTRACE CAP_DAC_READ_SEARCH CAP_DAC_OVERRIDE
Restart=always
ExecStartPre=/usr/bin/sleep 1s
ExecStart=$BIN_PATH -d $CONFIG_DIR
ExecReload=/bin/kill -HUP \$MAINPID

[Install]
WantedBy=multi-user.target
EOF

  echo -e "${CYAN}重新加载 systemd...${NC}"
  systemctl daemon-reload

  echo -e "${CYAN}设置开机自启...${NC}"
  systemctl enable mihomo

  echo -e "${GREEN}安装完成${NC}"
  echo -e "${GREEN}配置文件路径: ${CONFIG_FILE}${NC}"
  echo -e "${GREEN}可在菜单中启动服务${NC}"
}

uninstall_mihomo() {
  print_title "卸载 Mihomo"
  echo -e "${RED}确定要卸载 Mihomo？这将删除所有相关文件！(y/n)${NC}"
  read -r confirm

  if [[ "$confirm" != "y" ]]; then
    echo -e "${YELLOW}已取消卸载${NC}"
    return
  fi

  systemctl stop mihomo || true
  systemctl disable mihomo || true
  rm -f "$BIN_PATH"
  rm -rf "$CONFIG_DIR"
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload

  echo -e "${GREEN}已彻底卸载 Mihomo${NC}"
}

generate_self_signed_cert() {
  print_title "生成自签名证书"
  read -rp "请输入要签发证书的域名: " domain
  if [[ -z "$domain" ]]; then
    echo -e "${RED}域名不能为空，请重新运行并输入有效域名。${NC}"
    return
  fi
  mkdir -p "$CONFIG_DIR"

  echo -e "${CYAN}正在生成自签名证书，请稍候...${NC}"
  # 使用 openssl 生成证书和私钥
  openssl req -x509 -nodes -newkey ec:<(openssl ecparam -name prime256v1) \
    -keyout "$CERT_KEY" -out "$CERT_CRT" -subj "/CN=$domain" -days 3650

  # 修改证书权限
  chmod 600 /etc/mihomo/server.key && chmod 644 /etc/mihomo/server.crt

  echo -e "${GREEN}自签名证书生成成功！${NC}"
  echo -e "${GREEN}证书路径: ${CERT_CRT}${NC}"
  echo -e "${GREEN}私钥路径: ${CERT_KEY}${NC}"
}

menu() {
  while true; do
    echo ""
    print_title "Mihomo 服务管理工具"

    echo -e "${CYAN} [${GREEN}1${CYAN}] ${GREEN}安装 Mihomo${NC}"
    echo -e "${CYAN} [${GREEN}2${CYAN}] ${GREEN}启动服务${NC}"
    echo -e "${CYAN} [${GREEN}3${CYAN}] ${GREEN}停止服务${NC}"
    echo -e "${CYAN} [${GREEN}4${CYAN}] ${GREEN}重启服务${NC}"
    echo -e "${CYAN} [${GREEN}5${CYAN}] ${GREEN}查看状态${NC}"
    echo -e "${CYAN} [${GREEN}6${CYAN}] ${GREEN}查看日志${NC}"
    echo -e "${CYAN} [${GREEN}7${CYAN}] ${GREEN}自签证书生成${NC}"
    echo -e "${CYAN} [${GREEN}8${CYAN}] ${GREEN}查看配置路径${NC}"
    echo -e "${CYAN} [${RED}9${CYAN}] ${RED}卸载 Mihomo${NC}"
    echo -e "${CYAN} [${PURPLE}0${CYAN}] ${PURPLE}退出${NC}"

    print_separator
    echo -e "请输入选项编号: "
    read -r choice

    case "$choice" in
      1) install_mihomo ;;
      2) systemctl start mihomo && echo -e "${GREEN}服务已启动${NC}" ;;
      3) systemctl stop mihomo && echo -e "${YELLOW}服务已停止${NC}" ;;
      4) systemctl restart mihomo && echo -e "${GREEN}服务已重启${NC}" ;;
      5) systemctl status mihomo ;;
      6) journalctl -u mihomo -o cat -f ;;
      7) generate_self_signed_cert ;;
      8) ls /etc/mihomo && readlink -f /etc/mihomo/config.yaml ;;
      9) uninstall_mihomo ;;
      0) echo -e "${PURPLE}再见！${NC}"; exit 0 ;;
      *) echo -e "${RED}无效选项，请重新输入。${NC}" ;;
    esac
  done
}

# 清屏并启动菜单
clear
menu
