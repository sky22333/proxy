#!/usr/bin/env bash

set -euo pipefail

export TERM="${TERM:-xterm-256color}"

GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
CYAN='\033[36m'
PURPLE='\033[35m'
NC='\033[0m'

V="${V:-2.1.1}"

cecho() { printf '%b\n' "$1"; }

print_title() {
  printf '%b\n' "${BLUE}══════════════════════════════════════════${NC}"
  printf '%b\n' "${BLUE}█ ${CYAN}$1${BLUE} █${NC}"
  printf '%b\n' "${BLUE}══════════════════════════════════════════${NC}"
}

ask() {
  local reply
  printf '%b' "$1"
  read -r reply
  printf -v "$2" '%s' "$reply"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x86_64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) cecho "${RED}不支持的架构: $(uname -m)${NC}" >&2; exit 1 ;;
  esac
}

detect_pm() {
  if command -v apt >/dev/null 2>&1; then echo apt
  elif command -v dnf >/dev/null 2>&1; then echo dnf
  elif command -v yum >/dev/null 2>&1; then echo yum
  else cecho "${RED}不支持的系统：未检测到 apt / dnf / yum${NC}" >&2; exit 1
  fi
}

svc() {
  if ! command -v systemctl >/dev/null 2>&1; then
    cecho "${RED}未检测到 systemctl${NC}"
    return 1
  fi
  case "$1" in
    enable) systemctl daemon-reload || true; systemctl enable --now daed ;;
    status) systemctl status daed || true ;;
    logs)
      if command -v journalctl >/dev/null 2>&1; then
        journalctl -u daed -o cat -f
      else
        cecho "${YELLOW}未检测到 journalctl${NC}"
      fi
      ;;
    *) systemctl "$1" daed ;;
  esac
}

pkg_install_daed() {
  local pm="$1" arch="$2" pkg ext
  command -v curl >/dev/null 2>&1 || { cecho "${RED}未找到 curl，请先安装${NC}"; exit 1; }
  case "$pm" in
    apt) ext=deb ;;
    dnf|yum) ext=rpm ;;
  esac
  pkg="/tmp/installer-daed.${ext}"
  curl -fL "https://github.com/daeuniverse/daed/releases/download/v${V}/installer-daed-linux-${arch}.${ext}" -o "$pkg"
  case "$pm" in
    apt) apt install -y "$pkg" ;;
    dnf) dnf install -y "$pkg" ;;
    yum) yum install -y "$pkg" ;;
  esac
  rm -f "$pkg"
}

pkg_remove_daed() {
  case "$(detect_pm)" in
    apt) apt purge -y daed || true ;;
    dnf) dnf remove -y daed || true ;;
    yum) yum remove -y daed || true ;;
  esac
}

install_daed() {
  if command -v daed >/dev/null 2>&1; then
    cecho "${YELLOW}已检测到 daed 已安装，跳过安装。如需重装，请先卸载。${NC}"
    return
  fi

  print_title "开始安装 daed"
  local arch pm
  arch="$(detect_arch)"
  pm="$(detect_pm)"

  cecho "${CYAN}版本: v${V} | 架构: ${arch} | 包管理器: ${pm}${NC}"
  pkg_install_daed "$pm" "$arch"
  svc enable

  cecho "${GREEN}安装完成，服务已启动${NC}"
  cecho "${GREEN}配置目录: /etc/daed | 面板: http://本机IP:2023${NC}"
}

uninstall_daed() {
  print_title "卸载 daed"
  local confirm
  ask "${RED}确定卸载 daed 并删除 /etc/daed？(y/n): ${NC}" confirm
  [[ "$confirm" == "y" ]] || { cecho "${YELLOW}已取消卸载${NC}"; return; }

  svc stop || true
  systemctl disable daed 2>/dev/null || true
  pkg_remove_daed
  rm -rf /etc/daed
  systemctl daemon-reload 2>/dev/null || true
  systemctl reset-failed 2>/dev/null || true
  cecho "${GREEN}已彻底卸载 daed${NC}"
}

show_config_path() {
  cecho "${CYAN}配置目录:${NC} /etc/daed"
  cecho "${CYAN}二进制:${NC} $(command -v daed 2>/dev/null || echo 未安装)"
  cecho "${CYAN}面板端口:${NC} 2023"
  [[ -d /etc/daed ]] && { echo; ls -la /etc/daed; }
}

menu() {
  local choice
  while true; do
    echo
    print_title "daed 服务管理工具"
    cecho "${CYAN} [${GREEN}1${CYAN}] ${GREEN}安装 daed${NC}"
    cecho "${CYAN} [${GREEN}2${CYAN}] ${GREEN}启动服务${NC}"
    cecho "${CYAN} [${GREEN}3${CYAN}] ${GREEN}停止服务${NC}"
    cecho "${CYAN} [${GREEN}4${CYAN}] ${GREEN}重启服务${NC}"
    cecho "${CYAN} [${GREEN}5${CYAN}] ${GREEN}查看状态${NC}"
    cecho "${CYAN} [${GREEN}6${CYAN}] ${GREEN}查看日志${NC}"
    cecho "${CYAN} [${GREEN}7${CYAN}] ${GREEN}查看配置路径${NC}"
    cecho "${CYAN} [${RED}8${CYAN}] ${RED}卸载 daed${NC}"
    cecho "${CYAN} [${PURPLE}0${CYAN}] ${PURPLE}退出${NC}"
    printf '%b\n' "${BLUE}══════════════════════════════════════════${NC}"
    ask "请输入选项编号: " choice

    case "$choice" in
      1) install_daed ;;
      2) svc start && cecho "${GREEN}服务已启动${NC}" ;;
      3) svc stop && cecho "${YELLOW}服务已停止${NC}" ;;
      4) svc restart && cecho "${GREEN}服务已重启${NC}" ;;
      5) svc status ;;
      6) svc logs ;;
      7) show_config_path ;;
      8) uninstall_daed ;;
      0) cecho "${PURPLE}再见！${NC}"; exit 0 ;;
      *) cecho "${RED}无效选项，请重新输入。${NC}" ;;
    esac
  done
}

clear 2>/dev/null || true
menu
