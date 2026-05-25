#!/bin/bash
set -e

export TERM=xterm-256color

GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
CYAN='\033[36m'
PURPLE='\033[35m'
NC='\033[0m'

V="${V:-1.19.25}"

CONFIG_DIR="/etc/mihomo"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
CERT_KEY="$CONFIG_DIR/server.key"
CERT_CRT="$CONFIG_DIR/server.crt"
PASSWORD="$(cat /proc/sys/kernel/random/uuid)"

print_separator() {
  echo -e "${BLUE}══════════════════════════════════════════${NC}"
}

print_title() {
  local title="$1"
  print_separator
  echo -e "${BLUE}█ ${CYAN}$title${BLUE} █${NC}"
  print_separator
}

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64)
      echo "amd64"
      ;;
    aarch64 | arm64)
      echo "arm64"
      ;;
    armv7l | armv7)
      echo "armv7"
      ;;
    *)
      echo -e "${RED}不支持的架构: $(uname -m)${NC}" >&2
      exit 1
      ;;
  esac
}

install_dependencies() {
  if command -v apt >/dev/null 2>&1; then
    apt update
    apt install -y curl ca-certificates openssl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates openssl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates openssl
  fi
}

write_config() {
  mkdir -p "$CONFIG_DIR"

  cat > "$CONFIG_FILE" << EOF
log-level: warning

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
- name: direct
  type: direct

rules:
- MATCH,direct
EOF
}

install_mihomo() {
  if command -v mihomo >/dev/null 2>&1; then
    echo -e "${YELLOW}已检测到 Mihomo 已安装，跳过安装。${NC}"
    return
  fi

  print_title "开始安装 Mihomo"

  install_dependencies

  ARCH="$(detect_arch)"
  echo -e "${CYAN}检测到架构: ${ARCH}${NC}"

  if command -v apt >/dev/null 2>&1; then
    PKG="/tmp/mihomo.deb"
    URL="https://github.com/MetaCubeX/mihomo/releases/download/v${V}/mihomo-linux-${ARCH}-v${V}.deb"

    curl -L "$URL" -o "$PKG"
    apt install -y "$PKG"
    rm -f "$PKG"

  elif command -v dnf >/dev/null 2>&1; then
    PKG="/tmp/mihomo.rpm"
    URL="https://github.com/MetaCubeX/mihomo/releases/download/v${V}/mihomo-linux-${ARCH}-v${V}.rpm"

    curl -L "$URL" -o "$PKG"
    dnf install -y "$PKG"
    rm -f "$PKG"

  elif command -v yum >/dev/null 2>&1; then
    PKG="/tmp/mihomo.rpm"
    URL="https://github.com/MetaCubeX/mihomo/releases/download/v${V}/mihomo-linux-${ARCH}-v${V}.rpm"

    curl -L "$URL" -o "$PKG"
    yum install -y "$PKG"
    rm -f "$PKG"

  else
    echo -e "${RED}不支持的系统：未检测到 apt / dnf / yum${NC}"
    return 1
  fi

  write_config

  systemctl daemon-reload
  systemctl enable mihomo

  echo -e "${GREEN}安装完成${NC}"
  echo -e "${GREEN}版本: v${V}${NC}"
  echo -e "${GREEN}架构: ${ARCH}${NC}"
  echo -e "${GREEN}配置文件路径: ${CONFIG_FILE}${NC}"
  echo -e "${YELLOW}启动服务前请先生成证书，否则 anytls 可能启动失败。${NC}"
}

uninstall_mihomo() {
  print_title "卸载 Mihomo"
  echo -e "${RED}确定要卸载 Mihomo？这将删除所有相关配置文件！(y/n)${NC}"
  read -r confirm

  if [[ "$confirm" != "y" ]]; then
    echo -e "${YELLOW}已取消卸载${NC}"
    return
  fi

  systemctl stop mihomo || true
  systemctl disable mihomo || true

  if command -v apt >/dev/null 2>&1; then
    apt remove -y mihomo || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf remove -y mihomo || true
  elif command -v yum >/dev/null 2>&1; then
    yum remove -y mihomo || true
  fi

  rm -rf "$CONFIG_DIR"
  systemctl daemon-reload

  echo -e "${GREEN}已彻底卸载 Mihomo${NC}"
}

generate_self_signed_cert() {
  print_title "生成自签名证书"
  read -rp "请输入要签发证书的域名: " domain

  if [[ -z "$domain" ]]; then
    echo -e "${RED}域名不能为空。${NC}"
    return
  fi

  mkdir -p "$CONFIG_DIR"

  openssl req -x509 -nodes -newkey ec:<(openssl ecparam -name prime256v1) \
    -keyout "$CERT_KEY" \
    -out "$CERT_CRT" \
    -subj "/CN=$domain" \
    -days 3650

  chmod 600 "$CERT_KEY"
  chmod 644 "$CERT_CRT"

  echo -e "${GREEN}自签名证书生成成功！${NC}"
  echo -e "${GREEN}证书路径: ${CERT_CRT}${NC}"
  echo -e "${GREEN}私钥路径: ${CERT_KEY}${NC}"
}

show_config_path() {
  echo -e "${CYAN}配置目录:${NC} $CONFIG_DIR"
  echo -e "${CYAN}配置文件:${NC} $CONFIG_FILE"
  echo -e "${CYAN}证书文件:${NC} $CERT_CRT"
  echo -e "${CYAN}私钥文件:${NC} $CERT_KEY"

  if [[ -d "$CONFIG_DIR" ]]; then
    echo ""
    ls -la "$CONFIG_DIR"
  fi
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
    read -rp "请输入选项编号: " choice

    case "$choice" in
      1) install_mihomo ;;
      2) systemctl start mihomo && echo -e "${GREEN}服务已启动${NC}" ;;
      3) systemctl stop mihomo && echo -e "${YELLOW}服务已停止${NC}" ;;
      4) systemctl restart mihomo && echo -e "${GREEN}服务已重启${NC}" ;;
      5) systemctl status mihomo ;;
      6) journalctl -u mihomo -o cat -f ;;
      7) generate_self_signed_cert ;;
      8) show_config_path ;;
      9) uninstall_mihomo ;;
      0) echo -e "${PURPLE}再见！${NC}"; exit 0 ;;
      *) echo -e "${RED}无效选项，请重新输入。${NC}" ;;
    esac
  done
}

clear
menu
