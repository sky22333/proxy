#!/bin/sh
set -e

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

cecho() {
  printf "%b\n" "$1"
}

print_separator() {
  printf "%b\n" "${BLUE}══════════════════════════════════════════${NC}"
}

print_title() {
  title="$1"
  print_separator
  printf "%b\n" "${BLUE}█ ${CYAN}${title}${BLUE} █${NC}"
  print_separator
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      echo "amd64"
      ;;
    aarch64|arm64)
      echo "arm64"
      ;;
    armv7l|armv7)
      echo "armv7"
      ;;
    i386|i686)
      echo "386"
      ;;
    *)
      cecho "${RED}不支持的架构: $(uname -m)${NC}" >&2
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
    cecho "${RED}不支持的系统：未检测到 apt / dnf / yum / apk${NC}" >&2
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
    cecho "${RED}未检测到 systemctl 或 rc-service，无法启动服务${NC}"
    return 1
  fi
}

service_stop() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" stop
  else
    cecho "${RED}未检测到 systemctl 或 rc-service，无法停止服务${NC}"
    return 1
  fi
}

service_restart() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" restart
  else
    cecho "${RED}未检测到 systemctl 或 rc-service，无法重启服务${NC}"
    return 1
  fi
}

service_status() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl status "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" status
  else
    cecho "${RED}未检测到 systemctl 或 rc-service，无法查看状态${NC}"
    return 1
  fi
}

service_logs() {
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -u "$SERVICE_NAME" -o cat -f
  elif [ -f "/var/log/${SERVICE_NAME}.log" ]; then
    tail -f "/var/log/${SERVICE_NAME}.log"
  else
    cecho "${YELLOW}未检测到 journalctl，也未找到 /var/log/${SERVICE_NAME}.log${NC}"
  fi
}

install_dependencies() {
  pm="$1"

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

install_singbox() {
  if command -v sing-box >/dev/null 2>&1; then
    cecho "${YELLOW}已检测到 sing-box 已安装，跳过安装。${NC}"
    return
  fi

  print_title "开始安装 sing-box"

  arch="$(detect_arch)"
  pm="$(detect_pkg_manager)"

  cecho "${CYAN}版本: v${V}${NC}"
  cecho "${CYAN}架构: ${arch}${NC}"
  cecho "${CYAN}包管理器: ${pm}${NC}"

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

  service_enable

  cecho "${GREEN}安装完成${NC}"
  cecho "${GREEN}版本: v${V}${NC}"
  cecho "${GREEN}配置目录: ${CONFIG_DIR}${NC}"
}

uninstall_singbox() {
  print_title "卸载 sing-box"

  cecho "${RED}确定要卸载 sing-box？这将删除配置目录 ${CONFIG_DIR}！(y/n)${NC}"
  printf "请输入: "
  read confirm

  if [ "$confirm" != "y" ]; then
    cecho "${YELLOW}已取消卸载${NC}"
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

  cecho "${GREEN}已彻底卸载 sing-box${NC}"
}

generate_self_signed_cert() {
  print_title "生成自签名证书"

  printf "请输入要签发证书的域名: "
  read domain

  if [ -z "$domain" ]; then
    cecho "${RED}域名不能为空。${NC}"
    return
  fi

  mkdir -p "$CONFIG_DIR"

  openssl ecparam -genkey -name prime256v1 -out "$CERT_KEY"
  openssl req -new -x509 \
    -key "$CERT_KEY" \
    -out "$CERT_CRT" \
    -subj "/CN=$domain" \
    -days 3650

  chmod 600 "$CERT_KEY"
  chmod 644 "$CERT_CRT"

  cecho "${GREEN}自签名证书生成成功！${NC}"
  cecho "${GREEN}证书路径: ${CERT_CRT}${NC}"
  cecho "${GREEN}私钥路径: ${CERT_KEY}${NC}"
}

show_config_path() {
  cecho "${CYAN}配置目录:${NC} $CONFIG_DIR"
  cecho "${CYAN}配置文件:${NC} $CONFIG_FILE"
  cecho "${CYAN}证书文件:${NC} $CERT_CRT"
  cecho "${CYAN}私钥文件:${NC} $CERT_KEY"

  if [ -d "$CONFIG_DIR" ]; then
    printf "\n"
    ls -la "$CONFIG_DIR"
  fi
}

menu() {
  while true; do
    printf "\n"
    print_title "sing-box 服务管理工具"

    cecho "${CYAN} [${GREEN}1${CYAN}] ${GREEN}安装 sing-box${NC}"
    cecho "${CYAN} [${GREEN}2${CYAN}] ${GREEN}启动服务${NC}"
    cecho "${CYAN} [${GREEN}3${CYAN}] ${GREEN}停止服务${NC}"
    cecho "${CYAN} [${GREEN}4${CYAN}] ${GREEN}重启服务${NC}"
    cecho "${CYAN} [${GREEN}5${CYAN}] ${GREEN}查看状态${NC}"
    cecho "${CYAN} [${GREEN}6${CYAN}] ${GREEN}查看日志${NC}"
    cecho "${CYAN} [${GREEN}7${CYAN}] ${GREEN}自签证书生成${NC}"
    cecho "${CYAN} [${GREEN}8${CYAN}] ${GREEN}查看配置路径${NC}"
    cecho "${CYAN} [${RED}9${CYAN}] ${RED}卸载 sing-box${NC}"
    cecho "${CYAN} [${PURPLE}0${CYAN}] ${PURPLE}退出${NC}"

    print_separator
    printf "请输入选项编号: "
    read choice

    case "$choice" in
      1) install_singbox ;;
      2) service_start && cecho "${GREEN}服务已启动${NC}" ;;
      3) service_stop && cecho "${YELLOW}服务已停止${NC}" ;;
      4) service_restart && cecho "${GREEN}服务已重启${NC}" ;;
      5) service_status ;;
      6) service_logs ;;
      7) generate_self_signed_cert ;;
      8) show_config_path ;;
      9) uninstall_singbox ;;
      0) cecho "${PURPLE}再见！${NC}"; exit 0 ;;
      *) cecho "${RED}无效选项，请重新输入。${NC}" ;;
    esac
  done
}

clear 2>/dev/null || true
menu
