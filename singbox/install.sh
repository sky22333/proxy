#!/bin/bash
set -e -o pipefail

export TERM=xterm-256color

GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
CYAN='\033[36m'
PURPLE='\033[35m'
NC='\033[0m'

V="${V:-1.13.12}"

CONFIG_DIR="/etc/sing-box"
CONFIG_FILE="$CONFIG_DIR/config.json"
CERT_KEY="$CONFIG_DIR/server.key"
CERT_CRT="$CONFIG_DIR/server.crt"
SERVICE_NAME="sing-box"

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

detect_pkg_manager() {
  if command -v apt >/dev/null 2>&1; then
    echo "deb"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  elif command -v apk >/dev/null 2>&1; then
    echo "apk"
  else
    echo -e "${RED}不支持的系统：未检测到 apt / dnf / yum / apk${NC}" >&2
    exit 1
  fi
}

service_enable() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload || true
    systemctl enable "$SERVICE_NAME"
  elif command -v rc-update >/dev/null 2>&1; then
    rc-update add "$SERVICE_NAME" default
  fi
}

service_start() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl start "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" start
  else
    echo -e "${RED}未检测到 systemctl 或 rc-service，无法启动服务${NC}"
    return 1
  fi
}

service_stop() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" stop
  else
    echo -e "${RED}未检测到 systemctl 或 rc-service，无法停止服务${NC}"
    return 1
  fi
}

service_restart() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" restart
  else
    echo -e "${RED}未检测到 systemctl 或 rc-service，无法重启服务${NC}"
    return 1
  fi
}

service_status() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl status "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" status
  else
    echo -e "${RED}未检测到 systemctl 或 rc-service，无法查看状态${NC}"
    return 1
  fi
}

service_logs() {
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -u "$SERVICE_NAME" -o cat -f
  elif [[ -f "/var/log/${SERVICE_NAME}.log" ]]; then
    tail -f "/var/log/${SERVICE_NAME}.log"
  else
    echo -e "${YELLOW}未检测到 journalctl，也未找到 /var/log/${SERVICE_NAME}.log${NC}"
  fi
}

install_dependencies() {
  local pm="$1"

  case "$pm" in
    deb)
      apt install -y curl ca-certificates openssl
      ;;
    dnf)
      dnf install -y curl ca-certificates openssl
      ;;
    yum)
      yum install -y curl ca-certificates openssl
      ;;
    apk)
      apk add --no-cache curl ca-certificates openssl
      ;;
  esac
}

write_config() {
  mkdir -p "$CONFIG_DIR"

  if [[ -f "$CONFIG_FILE" ]]; then
    echo -e "${YELLOW}已检测到配置文件存在，跳过覆盖: ${CONFIG_FILE}${NC}"
    return
  fi

  cat > "$CONFIG_FILE" << EOF
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "127.0.0.1",
      "listen_port": 10808
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "final": "direct"
  }
}
EOF

  chmod 644 "$CONFIG_FILE"
}

install_mihomo_style_singbox() {
  if command -v sing-box >/dev/null 2>&1; then
    echo -e "${YELLOW}已检测到 sing-box 已安装，跳过安装。${NC}"
    return
  fi

  print_title "开始安装 sing-box"

  local arch pm pkg url
  arch="$(detect_arch)"
  pm="$(detect_pkg_manager)"

  echo -e "${CYAN}版本: v${V}${NC}"
  echo -e "${CYAN}架构: ${arch}${NC}"
  echo -e "${CYAN}包管理器: ${pm}${NC}"

  install_dependencies "$pm"

  case "$pm" in
    deb)
      pkg="/tmp/sing-box.deb"
      url="https://github.com/SagerNet/sing-box/releases/download/v${V}/sing-box_${V}_linux_${arch}.deb"
      curl -fL "$url" -o "$pkg"
      apt install -y "$pkg"
      rm -f "$pkg"
      ;;

    dnf)
      pkg="/tmp/sing-box.rpm"
      url="https://github.com/SagerNet/sing-box/releases/download/v${V}/sing-box_${V}_linux_${arch}.rpm"
      curl -fL "$url" -o "$pkg"
      dnf install -y "$pkg"
      rm -f "$pkg"
      ;;

    yum)
      pkg="/tmp/sing-box.rpm"
      url="https://github.com/SagerNet/sing-box/releases/download/v${V}/sing-box_${V}_linux_${arch}.rpm"
      curl -fL "$url" -o "$pkg"
      yum install -y "$pkg"
      rm -f "$pkg"
      ;;

    apk)
      pkg="/tmp/sing-box.apk"
      url="https://github.com/SagerNet/sing-box/releases/download/v${V}/sing-box_${V}_linux_${arch}.apk"
      curl -fL "$url" -o "$pkg"
      apk add --allow-untrusted "$pkg"
      rm -f "$pkg"
      ;;
  esac

  write_config
  service_enable

  echo -e "${GREEN}安装完成${NC}"
  echo -e "${GREEN}版本: v${V}${NC}"
  echo -e "${GREEN}配置文件路径: ${CONFIG_FILE}${NC}"
}

uninstall_singbox() {
  print_title "卸载 sing-box"

  echo -e "${RED}确定要卸载 sing-box？这将删除配置文件！(y/n)${NC}"
  read -r confirm

  if [[ "$confirm" != "y" ]]; then
    echo -e "${YELLOW}已取消卸载${NC}"
    return
  fi

  service_stop || true

  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  elif command -v rc-update >/dev/null 2>&1; then
    rc-update del "$SERVICE_NAME" default 2>/dev/null || true
  fi

  if command -v apt >/dev/null 2>&1; then
    apt purge -y sing-box || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf remove -y sing-box || true
  elif command -v yum >/dev/null 2>&1; then
    yum remove -y sing-box || true
  elif command -v apk >/dev/null 2>&1; then
    apk del sing-box || true
  fi

  rm -rf "$CONFIG_DIR"

  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload || true
    systemctl reset-failed || true
  fi

  echo -e "${GREEN}已彻底卸载 sing-box${NC}"
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
    print_title "sing-box 服务管理工具"

    echo -e "${CYAN} [${GREEN}1${CYAN}] ${GREEN}安装 sing-box${NC}"
    echo -e "${CYAN} [${GREEN}2${CYAN}] ${GREEN}启动服务${NC}"
    echo -e "${CYAN} [${GREEN}3${CYAN}] ${GREEN}停止服务${NC}"
    echo -e "${CYAN} [${GREEN}4${CYAN}] ${GREEN}重启服务${NC}"
    echo -e "${CYAN} [${GREEN}5${CYAN}] ${GREEN}查看状态${NC}"
    echo -e "${CYAN} [${GREEN}6${CYAN}] ${GREEN}查看日志${NC}"
    echo -e "${CYAN} [${GREEN}7${CYAN}] ${GREEN}自签证书生成${NC}"
    echo -e "${CYAN} [${GREEN}8${CYAN}] ${GREEN}查看配置路径${NC}"
    echo -e "${CYAN} [${RED}9${CYAN}] ${RED}卸载 sing-box${NC}"
    echo -e "${CYAN} [${PURPLE}0${CYAN}] ${PURPLE}退出${NC}"

    print_separator
    read -rp "请输入选项编号: " choice

    case "$choice" in
      1) install_mihomo_style_singbox ;;
      2) service_start && echo -e "${GREEN}服务已启动${NC}" ;;
      3) service_stop && echo -e "${YELLOW}服务已停止${NC}" ;;
      4) service_restart && echo -e "${GREEN}服务已重启${NC}" ;;
      5) service_status ;;
      6) service_logs ;;
      7) generate_self_signed_cert ;;
      8) show_config_path ;;
      9) uninstall_singbox ;;
      0) echo -e "${PURPLE}再见！${NC}"; exit 0 ;;
      *) echo -e "${RED}无效选项，请重新输入。${NC}" ;;
    esac
  done
}

clear
menu
