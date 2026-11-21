#!/bin/sh
# ============================================================================
#  sing-box 极简节点管理脚本（个人自用）
#
#  文件（默认在 /etc/sing-box，可用 SB_DIR 指定）：
#    nodes.tsv        节点清单，配置由它渲染而来
#    config.json      实际生效的配置
#    config.json.bak  上一份配置，服务没起来时回滚用
#    cert/<域名>.crt  自签证书
#    cert/<域名>.key  对应私钥
#
#  内核：/usr/local/bin/sing-box（install 时下载，可用 BIN_PATH 改）
#
#  用法：
#    sh singbox.sh             进入菜单
#    sh singbox.sh install     安装内核（已装则跳过）并配置开机自启
#    sh singbox.sh add         添加节点（会询问协议）
#    sh singbox.sh add hy2     直接添加，协议可选 reality / hy2 / anytls
#    sh singbox.sh change      更改节点
#    sh singbox.sh view        查看节点
#    sh singbox.sh del         删除节点
#    sh singbox.sh uninstall   完整卸载（停服务、删程序、删配置目录）
# ============================================================================

export TERM=xterm-256color

GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
CYAN='\033[36m'
PURPLE='\033[35m'
DIM='\033[2m'
NC='\033[0m'

SEP='|'

SB_DIR="${SB_DIR:-/etc/sing-box}"
STATE="$SB_DIR/nodes.tsv"
CONFIG_FILE="$SB_DIR/config.json"
CERT_DIR="$SB_DIR/cert"
SERVICE_NAME="sing-box"

SB_VERSION="${SB_VERSION:-1.14.4}"
BIN_PATH="${BIN_PATH:-/usr/local/bin/$SERVICE_NAME}"
UNIT_FILE="/etc/systemd/system/$SERVICE_NAME.service"

DEFAULT_REALITY_SNI="www.tesla.com"
DEFAULT_TLS_SNI="bing.com"

# DNS 上游：类型 udp / https / tls，境内线路建议改成 https 走 DoH
DNS_TYPE="udp"
DNS_UPSTREAM="1.1.1.1"

# 公网地址缓存，避免重复探测
_ADDR=""

# ════════════ 输出 ════════════

cecho() {
  printf "%b\n" "$1"
}

print_separator() {
  printf "%b\n" "${BLUE}══════════════════════════════════════════${NC}"
}

print_title() {
  printf "\n"
  print_separator
  printf "%b\n" "${BLUE}█ ${CYAN}$1${BLUE} █${NC}"
  print_separator
}

print_kv() {
  local _pad
  case "$1" in
    *[!-~]*) _pad=0 ;;
    *) _pad=$((4 - ${#1})) ;;
  esac
  [ "$_pad" -lt 0 ] && _pad=0
  printf "  ${CYAN}%s%*s${NC}  %s\n" "$1" "$_pad" "" "$2"
}

ok() {
  cecho "  ${GREEN}✓${NC} $1"
}

warn() {
  cecho "  ${YELLOW}!${NC} $1"
}

err() {
  cecho "  ${RED}✗${NC} $1" >&2
}

# ════════════ 交互 ════════════

read_re() {
  if [ "${SB_STDIN:-0}" = "1" ] || [ -t 0 ]; then
    read -r RE || RE=""
  elif [ -r /dev/tty ]; then
    read -r RE < /dev/tty || RE=""
  else
    read -r RE || RE=""
  fi
}

ask() {
  local _def
  _def="$2"
  if [ -n "$_def" ]; then
    printf "%b" "${CYAN}$1${DIM} [$_def]${NC}${CYAN}: ${NC}"
  else
    printf "%b" "${CYAN}$1: ${NC}"
  fi
  read_re
  [ -z "$RE" ] && RE="$_def"
}

ask_choice() {
  local _title _i _opt
  _title="$1"
  shift
  printf "\n"
  cecho "  ${CYAN}${_title}${NC}"
  _i=1
  for _opt in "$@"; do
    printf "  ${CYAN} [${GREEN}%s${CYAN}]${NC} %s\n" "$_i" "$_opt"
    _i=$((_i + 1))
  done
  printf "%b" "  ${CYAN}请选择: ${NC}"
  read_re
}

confirm() {
  ask "$1 (y/n)" "n"
  case "$RE" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# ════════════ 环境 ════════════

find_bin() {
  local _p
  if [ -n "$SB_BIN" ] && [ -x "$SB_BIN" ]; then
    return 0
  fi
  if command -v sing-box >/dev/null 2>&1; then
    SB_BIN=$(command -v sing-box)
    return 0
  fi
  for _p in "$BIN_PATH" /usr/bin/sing-box /usr/local/bin/sing-box "$SB_DIR/sing-box"; do
    if [ -x "$_p" ]; then
      SB_BIN="$_p"
      return 0
    fi
  done
  return 1
}

require_bin() {
  find_bin && return 0
  warn "未检测到 sing-box 内核"
  ask "现在安装 v$SB_VERSION (y/n)" "y"
  case "$RE" in
    y|Y|yes|YES) ;;
    *)
      warn "已取消，没有内核无法继续"
      exit 1
      ;;
  esac
  do_install || exit 1
}

svc_restart() {
  [ "${SB_NO_SERVICE:-0}" = "1" ] && return 0
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" restart
  else
    warn "未检测到 systemctl / rc-service，请手动重启服务"
  fi
}

svc_active() {
  [ "${SB_NO_SERVICE:-0}" = "1" ] && return 1
  if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active --quiet "$SERVICE_NAME"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" status >/dev/null 2>&1
  else
    return 1
  fi
}

detect_addr() {
  if [ -z "$_ADDR" ]; then
    _ADDR="$ADDR"
    if [ -z "$_ADDR" ]; then
      _ADDR=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null)
      [ -z "$_ADDR" ] && _ADDR=$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null)
      [ -z "$_ADDR" ] && _ADDR=$(ip -4 route get 1.1.1.1 2>/dev/null |
        awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
      [ -z "$_ADDR" ] && _ADDR="服务器IP"
    fi
  fi
  printf '%s' "$_ADDR"
}

# ════════════ 生成 / 校验 ════════════

gen_uuid() {
  "$SB_BIN" generate uuid
}

gen_password() {
  "$SB_BIN" generate rand 12 --hex
}

gen_short_id() {
  "$SB_BIN" generate rand 4 --hex
}

gen_reality_keypair() {
  local _kp
  _kp=$("$SB_BIN" generate reality-keypair) || return 1
  PVK=$(printf '%s\n' "$_kp" | sed -n 's/^PrivateKey: //p')
  PBK=$(printf '%s\n' "$_kp" | sed -n 's/^PublicKey: //p')
  [ -n "$PVK" ] && [ -n "$PBK" ]
}

rand_port() {
  local _p
  _p=$(od -An -N2 -tu2 /dev/urandom 2>/dev/null | tr -d ' \n')
  case "$_p" in
    ''|*[!0-9]*) _p=$$ ;;
  esac
  # 落在 20000-39999，被占用就往后找
  _p=$(( _p % 20000 + 20000 ))
  while port_used "$_p"; do
    _p=$(( _p + 1 ))
    [ "$_p" -gt 39999 ] && _p=20000
  done
  printf '%s' "$_p"
}

valid_port() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

valid_domain() {
  case "$1" in
    ''|.*|*..*|*[!a-zA-Z0-9.-]*) return 1 ;;
    *.*) return 0 ;;
  esac
  return 1
}

# ════════════ 节点状态（nodes.tsv） ════════════

state_init() {
  mkdir -p "$SB_DIR"
  if [ ! -f "$STATE" ]; then
    if [ -f "$CONFIG_FILE" ]; then
      warn "检测到已有 $CONFIG_FILE，首次接管前会备份为 config.json.bak"
    fi
    {
      printf '# sing-box 节点清单，由 singbox.sh 维护，请勿手工编辑\n'
      printf '# type|tag|port|secret|sni|pbk|pvk|sid\n'
    } > "$STATE"
  fi
}

node_count() {
  local _n _l
  _n=0
  while IFS= read -r _l; do
    case "$_l" in
      ''|'#'*) continue ;;
    esac
    _n=$((_n + 1))
  done < "$STATE"
  printf '%s' "$_n"
}

port_used() {
  local _t _tag _port _rest _l
  [ -f "$STATE" ] || return 1
  while IFS="$SEP" read -r _t _tag _port _rest; do
    case "$_t" in
      ''|'#'*) continue ;;
    esac
    [ "$_port" = "$1" ] && return 0
  done < "$STATE"
  return 1
}

node_line() {
  local _i _l
  _i=0
  while IFS= read -r _l; do
    case "$_l" in
      ''|'#'*) continue ;;
    esac
    _i=$((_i + 1))
    if [ "$_i" -eq "$1" ]; then
      printf '%s\n' "$_l"
      return 0
    fi
  done < "$STATE"
  return 1
}

node_add() {
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" >> "$STATE"
}

pick_node() {
  local _total _i _t _tag _port _rest _line
  _total=$(node_count)
  if [ "$_total" -eq 0 ]; then
    warn "还没有任何节点"
    return 1
  fi

  _i=0
  while IFS="$SEP" read -r _t _tag _port _rest; do
    case "$_t" in
      ''|'#'*) continue ;;
    esac
    _i=$((_i + 1))
    printf "  ${CYAN} [${GREEN}%s${CYAN}]${NC} %-12s %-14s :%s\n" \
      "$_i" "$_tag" "$(proto_label "$_t")" "$_port"
  done < "$STATE"

  ask "选择要$1的节点序号" ""
  case "$RE" in
    ''|*[!0-9]*) err "无效序号"; return 1 ;;
  esac
  if [ "$RE" -lt 1 ] || [ "$RE" -gt "$_total" ]; then
    err "序号超出范围"
    return 1
  fi
  N_IDX="$RE"

  _line=$(node_line "$N_IDX") || return 1
  IFS="$SEP" read -r N_TYPE N_TAG N_PORT N_SEC N_SNI N_PBK N_PVK N_SID <<EOF
$_line
EOF
}

node_rewrite() {
  local _idx _i _l
  _idx="$1"
  shift
  _i=0
  : > "$STATE.tmp"
  while IFS= read -r _l; do
    case "$_l" in
      '#'*)
        printf '%s\n' "$_l" >> "$STATE.tmp"
        continue
        ;;
      '')
        continue
        ;;
    esac
    _i=$((_i + 1))
    if [ "$_i" -ne "$_idx" ]; then
      printf '%s\n' "$_l" >> "$STATE.tmp"
    elif [ $# -gt 0 ]; then
      printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
        "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" >> "$STATE.tmp"
    fi
  done < "$STATE"
  mv -f "$STATE.tmp" "$STATE"
}

proto_label() {
  case "$1" in
    reality) printf 'VLESS-REALITY' ;;
    hy2) printf 'Hysteria2' ;;
    anytls) printf 'AnyTLS' ;;
    *) printf '%s' "$1" ;;
  esac
}

# ════════════ 证书 ════════════

ensure_cert() {
  local _crt _key
  mkdir -p "$CERT_DIR"
  _crt="$CERT_DIR/$1.crt"
  _key="$CERT_DIR/$1.key"
  if [ ! -f "$_crt" ] || [ ! -f "$_key" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      err "缺少 openssl，无法生成自签证书"
      return 1
    fi
    openssl ecparam -genkey -name prime256v1 -out "$_key" >/dev/null 2>&1 &&
      openssl req -new -x509 -key "$_key" -out "$_crt" \
        -subj "/CN=$1" -days 3650 >/dev/null 2>&1 || return 1
    chmod 600 "$_key"
    chmod 644 "$_crt"
  fi
  printf '%s' "$_crt"
}

cleanup_cert() {
  local _refs
  [ -n "$1" ] || return 0
  [ -f "$CERT_DIR/$1.crt" ] || return 0
  _refs=$(awk -F'|' -v d="$1" \
    '$0 !~ /^#/ && $5 == d { n++ } END { print n + 0 }' "$STATE")
  if [ "$_refs" -eq 0 ]; then
    rm -f "$CERT_DIR/$1.crt" "$CERT_DIR/$1.key"
  fi
  return 0
}

# ════════════ 渲染 config.json ════════════

render_inbound() {
  local _type _tag _port _secret _sni _pbk _pvk _sid _head _alpn _masq
  _type="$1"; _tag="$2"; _port="$3"; _secret="$4"; _sni="$5"
  _pbk="$6"; _pvk="$7"; _sid="$8"

  if [ "$_type" = "reality" ]; then
    cat <<EOF
    {
      "type": "vless",
      "tag": "$_tag",
      "listen": "::",
      "listen_port": $_port,
      "users": [
        {
          "name": "$_tag",
          "uuid": "$_secret",
          "flow": "xtls-rprx-vision"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "$_sni",
        "reality": {
          "enabled": true,
          "handshake": {
            "server": "$_sni",
            "server_port": 443
          },
          "private_key": "$_pvk",
          "short_id": ["$_sid"]
        }
      }
    }
EOF
    return 0
  fi

  if [ "$_type" = "hy2" ]; then
    _head="      \"type\": \"hysteria2\","
    _alpn='
        "alpn": ["h3"],'
    # 被 HTTP/3 探测时返回普通 404
    _masq='
      "masquerade": {
        "type": "string",
        "status_code": 404,
        "content": "Not Found"
      },'
  else
    _head="      \"type\": \"anytls\","
    _alpn='
        "alpn": ["h2", "http/1.1"],'
    _masq=''
  fi

  cat <<EOF
    {
$_head
      "tag": "$_tag",
      "listen": "::",
      "listen_port": $_port,
      "users": [
        {
          "name": "$_tag",
          "password": "$_secret"
        }
      ],$_masq
      "tls": {
        "enabled": true,$_alpn
        "certificate_path": "$CERT_DIR/$_sni.crt",
        "key_path": "$CERT_DIR/$_sni.key"
      }
    }
EOF
}

render_config() {
  local _first _body _t _tag _port _sec _sni _pbk _pvk _sid
  printf '{\n'
  printf '  "log": {\n    "level": "warn",\n    "timestamp": true\n  },\n'

  # 显式上游：不依赖 /etc/resolv.conf，prefer_ipv4 规避 v6 不通导致的超时
  printf '  "dns": {\n'
  printf '    "servers": [\n'
  printf '      {\n        "tag": "cf",\n        "type": "%s",\n        "server": "%s"\n      }\n' "$DNS_TYPE" "$DNS_UPSTREAM"
  printf '    ],\n'
  printf '    "final": "cf",\n'
  printf '    "strategy": "prefer_ipv4"\n'
  printf '  },\n'

  printf '  "inbounds": [\n'
  _first=1
  while IFS="$SEP" read -r _t _tag _port _sec _sni _pbk _pvk _sid; do
    case "$_t" in
      ''|'#'*) continue ;;
    esac
    if [ "$_first" -eq 1 ]; then
      _first=0
    else
      printf ',\n'
    fi
    _body=$(render_inbound "$_t" "$_tag" "$_port" "$_sec" "$_sni" "$_pbk" "$_pvk" "$_sid")
    printf '%s' "$_body"
  done < "$STATE"
  printf '\n  ],\n'

  printf '  "outbounds": [\n'
  printf '    {\n      "type": "direct",\n      "tag": "direct"\n    },\n'
  printf '    {\n      "type": "block",\n      "tag": "block"\n    }\n'
  printf '  ],\n'

  # 私网与保留地址一律拦掉
  printf '  "route": {\n'
  printf '    "default_domain_resolver": {\n      "server": "cf"\n    },\n'
  printf '    "rules": [\n'
  printf '      {\n        "ip_is_private": true,\n        "outbound": "block"\n      }\n'
  printf '    ]\n'
  printf '  }\n'
  printf '}\n'
}

# ════════════ 应用配置（校验 → 备份 → 替换 → 重启 → 回滚） ════════════

apply_config() {
  local _tmp _out
  mkdir -p "$SB_DIR"
  _tmp="$CONFIG_FILE.tmp"

  render_config > "$_tmp" || {
    rm -f "$_tmp"
    err "渲染配置失败"
    return 1
  }

  if ! _out=$("$SB_BIN" check -c "$_tmp" 2>&1); then
    rm -f "$_tmp"
    err "配置校验未通过，已放弃写入"
    printf '%s\n' "$_out" | sed 's/^/    /'
    return 1
  fi

  if [ -f "$CONFIG_FILE" ]; then
    cp -f "$CONFIG_FILE" "$CONFIG_FILE.bak"
  fi
  mv -f "$_tmp" "$CONFIG_FILE"

  if [ "${SB_NO_SERVICE:-0}" = "1" ]; then
    ok "配置已写入 $CONFIG_FILE"
    return 0
  fi

  if svc_restart >/dev/null 2>&1; then
    sleep 1
    if svc_active; then
      ok "服务已重启"
      return 0
    fi
  fi

  warn "服务未起来，回滚到上一份配置"
  if [ -f "$CONFIG_FILE.bak" ]; then
    mv -f "$CONFIG_FILE.bak" "$CONFIG_FILE"
    svc_restart >/dev/null 2>&1
  fi
  err "已回滚，请检查 journalctl -u $SERVICE_NAME -n 30"
  return 1
}

# ════════════ 分享链接 ════════════

node_url() {
  local _type _tag _port _sec _sni _pbk _sid _addr _scheme
  _type="$1"; _tag="$2"; _port="$3"; _sec="$4"; _sni="$5"; _pbk="$6"; _sid="$7"
  _addr=$(detect_addr)

  case "$_type" in
    reality)
      printf 'vless://%s@%s:%s?encryption=none&flow=xtls-rprx-vision&security=reality&sni=%s&fp=chrome&pbk=%s&sid=%s&type=tcp#%s' \
        "$_sec" "$_addr" "$_port" "$_sni" "$_pbk" "$_sid" "$_tag"
      ;;
    *)
      # hy2 / anytls 只差协议名；自签证书所以要 insecure=1
      _scheme=hysteria2
      [ "$_type" = "anytls" ] && _scheme=anytls
      printf '%s://%s@%s:%s?sni=%s&insecure=1#%s' \
        "$_scheme" "$_sec" "$_addr" "$_port" "$_sni" "$_tag"
      ;;
  esac
}

show_qr() {
  if command -v qrencode >/dev/null 2>&1; then
    printf '%s' "$1" | qrencode -t ANSIUTF8
  else
    printf "  ${DIM}（安装 qrencode 可显示二维码）${NC}\n"
  fi
}

# ════════════ 业务：查看 ════════════

# print_node_detail <type> <tag> <port> <secret> <sni> <pbk> <sid>
print_node_detail() {
  local _type _tag _port _sec _sni _pbk _sid _url
  _type="$1"; _tag="$2"; _port="$3"; _sec="$4"; _sni="$5"; _pbk="$6"; _sid="$7"

  print_kv "协议" "$(proto_label "$_type")"
  print_kv "名称" "$_tag"
  print_kv "端口" "$_port"
  if [ "$_type" = "reality" ]; then
    print_kv "UUID" "$_sec"
    print_kv "SNI" "$_sni"
    print_kv "公钥" "$_pbk"
    print_kv "短ID" "$_sid"
  else
    print_kv "密码" "$_sec"
    print_kv "SNI" "$_sni"
    print_kv "证书" "自签（$_sni）"
  fi

  _url=$(node_url "$_type" "$_tag" "$_port" "$_sec" "$_sni" "$_pbk" "$_sid")
  print_kv "链接" "$_url"
  show_qr "$_url"
}

do_view() {
  local _i _t _tag _port _sec _sni _pbk _pvk _sid
  require_bin
  state_init
  print_title "查看节点"

  if [ "$(node_count)" -eq 0 ]; then
    warn "还没有任何节点，先执行添加"
    return 0
  fi

  detect_addr >/dev/null

  _i=0
  while IFS="$SEP" read -r _t _tag _port _sec _sni _pbk _pvk _sid; do
    case "$_t" in
      ''|'#'*) continue ;;
    esac
    _i=$((_i + 1))
    printf "\n  ${GREEN}[%s]${NC} ${CYAN}%s${NC}  ${DIM}%s  :%s${NC}\n" \
      "$_i" "$_tag" "$(proto_label "$_t")" "$_port"
    print_separator
    print_node_detail "$_t" "$_tag" "$_port" "$_sec" "$_sni" "$_pbk" "$_sid"
  done < "$STATE"

  printf "\n"
  print_separator
  if svc_active; then
    ok "$SERVICE_NAME 运行中"
  else
    warn "$SERVICE_NAME 未运行（或未安装服务）"
  fi
  printf "  ${DIM}内核 %s  配置 %s${NC}\n" "$(kernel_version)" "$CONFIG_FILE"
}

# ════════════ 业务：添加 ════════════

choose_proto() {
  ask_choice "请选择协议" "VLESS-REALITY" "Hysteria2" "AnyTLS"
  case "$RE" in
    1) PROTO="reality" ;;
    2) PROTO="hy2" ;;
    3) PROTO="anytls" ;;
    *) PROTO="" ;;
  esac
}

ask_port() {
  local _def
  _def="$1"
  while true; do
    ask "端口" "$_def"
    if ! valid_port "$RE"; then
      err "端口必须是 1-65535 的数字"
      continue
    fi
    if port_used "$RE"; then
      err "端口 $RE 已被其他节点占用"
      continue
    fi
    break
  done
  PORT="$RE"
}

ask_tag() {
  local _def _cur
  _def="$1"
  _cur="$2"
  while true; do
    ask "节点名称" "$_def"
    case "$RE" in
      *'"'*|*'\'*|*'|'*)
        err "名称不能包含引号、反斜杠或竖线"
        continue
        ;;
    esac
    if [ "$RE" != "$_cur" ] && tag_used "$RE"; then
      err "名称 $RE 已被其他节点占用"
      continue
    fi
    break
  done
  TAG="$RE"
}

tag_used() {
  awk -F'|' -v t="$1" '$0 !~ /^#/ && $2 == t { n++ } END { exit !n }' "$STATE"
}

# 生成不撞名的默认名，如 reality-2
default_tag() {
  local _n
  _n=$(( $(node_count) + 1 ))
  while tag_used "$1-$_n"; do
    _n=$((_n + 1))
  done
  printf '%s-%s' "$1" "$_n"
}

ask_domain() {
  local _def
  _def="$1"
  while true; do
    ask "域名 (SNI)" "$_def"
    if ! valid_domain "$RE"; then
      err "域名格式不对，例如 www.example.com"
      continue
    fi
    break
  done
  DOMAIN="$RE"
}

do_add() {
  local _proto _sec
  require_bin
  state_init

  _proto="$1"
  if [ -z "$_proto" ]; then
    choose_proto
    _proto="$PROTO"
    [ -z "$_proto" ] && {
      err "无效选择"
      return 1
    }
  fi
  case "$_proto" in
    reality|vless|vless-reality) _proto="reality" ;;
    hy2|hysteria2) _proto="hy2" ;;
    anytls) _proto="anytls" ;;
    *)
      err "不支持的协议：$_proto（可选 reality / hy2 / anytls）"
      return 1
      ;;
  esac

  print_title "添加 $(proto_label "$_proto") 节点"

  ask_port "$(rand_port)"
  ask_tag "$(default_tag "$_proto")" ""

  UUID=""; PBK=""; PVK=""; SID=""; PASSWORD=""

  if [ "$_proto" = "reality" ]; then
    ask_domain "$DEFAULT_REALITY_SNI"
    gen_reality_keypair || {
      err "REALITY 密钥生成失败"
      return 1
    }
    UUID=$(gen_uuid)
    SID=$(gen_short_id)
  else
    ask_domain "$DEFAULT_TLS_SNI"
    PASSWORD=$(gen_password)
    ensure_cert "$DOMAIN" >/dev/null || {
      err "自签证书生成失败"
      return 1
    }
  fi

  _sec="${UUID:-$PASSWORD}"
  node_add "$_proto" "$TAG" "$PORT" "$_sec" "$DOMAIN" "${PBK:-}" "${PVK:-}" "${SID:-}"

  if ! apply_config; then
    node_rewrite "$(node_count)"
    warn "已撤销这次添加"
    return 1
  fi

  print_title "节点已就绪"
  print_node_detail "$_proto" "$TAG" "$PORT" "$_sec" "$DOMAIN" "${PBK:-}" "${SID:-}"
}

# ════════════ 业务：更改 ════════════

do_change() {
  local _type _tag _port _sec _sni _pbk _pvk _sid _idx _field
  local _o_type _o_tag _o_port _o_sec _o_sni _o_pbk _o_pvk _o_sid
  require_bin
  state_init
  print_title "更改节点"
  pick_node "更改" || return 1

  _idx="$N_IDX"
  _type="$N_TYPE"; _tag="$N_TAG"; _port="$N_PORT"; _sec="$N_SEC"
  _sni="$N_SNI"; _pbk="$N_PBK"; _pvk="$N_PVK"; _sid="$N_SID"

  # 留一份原始值，写入失败时原样退回
  _o_type="$_type"; _o_tag="$_tag"; _o_port="$_port"; _o_sec="$_sec"
  _o_sni="$_sni"; _o_pbk="$_pbk"; _o_pvk="$_pvk"; _o_sid="$_sid"

  if [ "$_type" = "reality" ]; then
    ask_choice "更改什么" "端口" "名称" "SNI (伪装域名)" "UUID" "重置 REALITY 密钥"
  else
    ask_choice "更改什么" "端口" "名称" "SNI (证书域名)" "密码" "重建自签证书"
  fi
  _field="$RE"

  case "$_field" in
    1)
      ask_port "$_port"
      _port="$PORT"
      ;;
    2)
      ask_tag "$_tag" "$_tag"
      _tag="$TAG"
      ;;
    3)
      ask_domain "$_sni"
      if [ "$_type" != "reality" ]; then
        ensure_cert "$DOMAIN" >/dev/null || {
          err "证书生成失败"
          return 1
        }
      fi
      _sni="$DOMAIN"
      ;;
    4)
      if [ "$_type" = "reality" ]; then
        _sec=$(gen_uuid)
      else
        _sec=$(gen_password)
      fi
      ;;
    5)
      if [ "$_type" = "reality" ]; then
        gen_reality_keypair || return 1
        _pbk="$PBK"
        _pvk="$PVK"
        _sid=$(gen_short_id)
      else
        rm -f "$CERT_DIR/$_sni.crt" "$CERT_DIR/$_sni.key"
        ensure_cert "$_sni" >/dev/null || return 1
        ok "已重新签发 $_sni 的自签证书"
      fi
      ;;
    *)
      err "无效选择"
      return 1
      ;;
  esac

  node_rewrite "$_idx" "$_type" "$_tag" "$_port" "$_sec" "$_sni" "$_pbk" "$_pvk" "$_sid"

  if ! apply_config; then
    node_rewrite "$_idx" "$_o_type" "$_o_tag" "$_o_port" "$_o_sec" "$_o_sni" "$_o_pbk" "$_o_pvk" "$_o_sid"
    err "改动未生效，已恢复原值"
    return 1
  fi

  # 换域名后旧证书可能已无人引用
  cleanup_cert "$_o_sni"

  print_title "更改完成"
  print_node_detail "$_type" "$_tag" "$_port" "$_sec" "$_sni" "$_pbk" "$_sid"
}

# ════════════ 业务：删除 ════════════

do_del() {
  require_bin
  state_init
  print_title "删除节点"
  pick_node "删除" || return 1

  if ! confirm "确认删除 $N_TAG（$(proto_label "$N_TYPE") :$N_PORT）"; then
    warn "已取消"
    return 0
  fi

  node_rewrite "$N_IDX"

  if ! apply_config; then
    node_add "$N_TYPE" "$N_TAG" "$N_PORT" "$N_SEC" "$N_SNI" "$N_PBK" "$N_PVK" "$N_SID"
    err "删除未生效，已恢复该节点"
    return 1
  fi

  cleanup_cert "$N_SNI"

  ok "已删除 $N_TAG"
}

# ════════════ 业务：安装 ════════════

# 第一行形如 "sing-box version 1.14.4"，取最后一个字段
kernel_version() {
  [ -x "$SB_BIN" ] || return 1
  "$SB_BIN" version 2>/dev/null | awk 'NR == 1 { print $NF }'
}

arch_tag() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    aarch64|arm64) printf 'arm64' ;;
    armv7l|armv7) printf 'armv7' ;;
    i386|i686) printf '386' ;;
    *) return 1 ;;
  esac
}

# 下载和签证书要用的命令，缺了就交给包管理器补
ensure_tools() {
  local _need _c
  _need=""
  for _c in curl tar openssl; do
    command -v "$_c" >/dev/null 2>&1 || _need="$_need $_c"
  done
  [ -z "$_need" ] && return 0

  warn "缺少$_need，尝试安装"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y $_need >/dev/null 2>&1
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y $_need >/dev/null 2>&1
  elif command -v yum >/dev/null 2>&1; then
    yum install -y $_need >/dev/null 2>&1
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache $_need >/dev/null 2>&1
  fi

  for _c in $_need; do
    if ! command -v "$_c" >/dev/null 2>&1; then
      err "安装 $_c 失败，请手动装好后重试"
      return 1
    fi
  done
}

install_bin() {
  local _arch _url _pkg _dir _src _v
  _arch=$(arch_tag) || {
    err "不支持的架构：$(uname -m)"
    return 1
  }
  _url="https://github.com/SagerNet/sing-box/releases/download/v$SB_VERSION/sing-box-$SB_VERSION-linux-$_arch.tar.gz"
  _pkg="/tmp/sing-box-$SB_VERSION-$_arch.tar.gz"
  _dir="/tmp/sb-install-$$"

  print_kv "版本" "v$SB_VERSION"
  print_kv "架构" "$_arch"
  printf "  ${DIM}下载中（约 30MB）...${NC}\n"
  if ! curl -fsSL --retry 2 --retry-delay 1 --connect-timeout 10 -o "$_pkg" "$_url"; then
    rm -f "$_pkg"
    err "下载失败，可用 SB_VERSION=版本号 换个版本再试"
    return 1
  fi

  rm -rf "$_dir"
  mkdir -p "$_dir"
  _src="$_dir/sing-box-$SB_VERSION-linux-$_arch/sing-box"
  if ! tar -xzf "$_pkg" -C "$_dir" || [ ! -f "$_src" ]; then
    rm -rf "$_dir" "$_pkg"
    err "解压失败或包内找不到 sing-box"
    return 1
  fi

  mkdir -p "$(dirname "$BIN_PATH")"
  if ! cp -f "$_src" "$BIN_PATH"; then
    rm -rf "$_dir" "$_pkg"
    err "写入 $BIN_PATH 失败"
    return 1
  fi
  chmod 755 "$BIN_PATH"
  rm -rf "$_dir" "$_pkg"

  SB_BIN="$BIN_PATH"
  _v=$(kernel_version)
  if [ -z "$_v" ]; then
    err "$BIN_PATH 无法执行：检查分区是否 noexec，或架构是否匹配"
    return 1
  fi
  ok "已安装 $BIN_PATH ($_v)"
}

# 只用 -c 指向自己的 config.json，不接管整个配置目录
write_unit() {
  local _tmp
  mkdir -p "$(dirname "$UNIT_FILE")"
  _tmp="$UNIT_FILE.new"
  cat > "$_tmp" <<EOF
[Unit]
Description=sing-box service
After=network-online.target nss-lookup.target
Wants=network-online.target
# 还没添加节点时不启动，避免开机反复失败
ConditionPathExists=$CONFIG_FILE

[Service]
Type=simple
ExecStart=$SB_BIN run -c $CONFIG_FILE
Restart=on-failure
RestartSec=3
LimitNOFILE=infinity
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW

[Install]
WantedBy=multi-user.target
EOF
  if [ ! -s "$_tmp" ]; then
    rm -f "$_tmp"
    return 1
  fi

  # 内容没变就不动，避免把手工改过的单元冲掉
  if [ -f "$UNIT_FILE" ] && cmp -s "$_tmp" "$UNIT_FILE"; then
    rm -f "$_tmp"
    return 0
  fi
  mv -f "$_tmp" "$UNIT_FILE"
  systemctl daemon-reload 2>/dev/null
  return 0
}

write_openrc() {
  local _f
  mkdir -p /etc/init.d
  _f="/etc/init.d/$SERVICE_NAME"
  cat > "$_f" <<EOF
#!/sbin/openrc-run
name="$SERVICE_NAME"
command="$SB_BIN"
command_args="run -c $CONFIG_FILE"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
output_log="/var/log/$SERVICE_NAME.log"
error_log="/var/log/$SERVICE_NAME.log"
EOF
  chmod 755 "$_f"
}

# 已装则只补单元和自启，不重复下载
do_install() {
  local _v
  print_title "安装 sing-box"

  if [ "$(id -u)" != "0" ]; then
    err "安装需要 root，请用 root 或 sudo 执行"
    return 1
  fi

  if find_bin; then
    _v=$(kernel_version)
    ok "内核已安装：${_v:-未知版本}  $SB_BIN"
    print_kv "处理" "跳过下载"
  else
    ensure_tools || return 1
    install_bin || return 1
    find_bin || {
      err "安装完仍找不到 sing-box"
      return 1
    }
  fi

  mkdir -p "$SB_DIR" "$CERT_DIR"

  if [ "${SB_NO_SERVICE:-0}" = "1" ]; then
    warn "SB_NO_SERVICE=1，跳过服务配置"
  elif command -v systemctl >/dev/null 2>&1; then
    if write_unit; then
      ok "服务单元 $UNIT_FILE"
    else
      err "服务单元写入失败"
    fi
    systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 && ok "已设置开机自启"
    if [ -f "$CONFIG_FILE" ]; then
      systemctl restart "$SERVICE_NAME" >/dev/null 2>&1
      sleep 1
      if svc_active; then
        ok "服务已启动"
      else
        warn "服务未起来：journalctl -u $SERVICE_NAME -n 30"
      fi
    else
      warn "还没有配置文件，添加第一个节点后自动生效"
    fi
  elif command -v rc-update >/dev/null 2>&1; then
    write_openrc && ok "服务脚本 /etc/init.d/$SERVICE_NAME"
    rc-update add "$SERVICE_NAME" default >/dev/null 2>&1 && ok "已设置开机自启"
    [ -f "$CONFIG_FILE" ] && rc-service "$SERVICE_NAME" restart >/dev/null 2>&1
  else
    warn "未检测到 systemd / openrc，内核已装好，需自行托管服务"
  fi

  printf "\n"
  print_kv "内核" "$SB_BIN"
  print_kv "配置" "$CONFIG_FILE"
}

# ════════════ 业务：卸载 ════════════

# 确认 SB_DIR 真的是本脚本的配置目录，才允许 rm -rf
safe_sb_dir() {
  case "$SB_DIR" in
    ''|/|/etc|/usr|/usr/local|/root|/home|/var|/var/lib|/tmp|/opt|/srv|/boot)
      return 1
      ;;
  esac
  [ -f "$SB_DIR/nodes.tsv" ] || [ -f "$SB_DIR/config.json" ] || [ -d "$SB_DIR/cert" ]
}

do_uninstall() {
  local _p _self
  print_title "完整卸载"

  print_kv "服务" "停止并取消开机自启"
  print_kv "程序" "移除包与 $BIN_PATH 等残留二进制"
  print_kv "数据" "/var/lib/sing-box 与系统用户 sing-box"
  print_kv "单元" "systemd / openrc 的服务文件"
  print_kv "配置" "$SB_DIR（节点清单、config.json、证书）"

  if ! confirm "确认卸载？删除后无法恢复" "n"; then
    warn "已取消"
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" stop 2>/dev/null || true
    rc-update del "$SERVICE_NAME" default 2>/dev/null || true
  fi

  if command -v apt >/dev/null 2>&1; then
    apt purge -y "$SERVICE_NAME" >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf remove -y "$SERVICE_NAME" >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    yum remove -y "$SERVICE_NAME" >/dev/null 2>&1 || true
  elif command -v apk >/dev/null 2>&1; then
    apk del "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi

  rm -rf /var/lib/"$SERVICE_NAME" /var/lib/"$SERVICE_NAME"-*
  userdel "$SERVICE_NAME" 2>/dev/null || true
  groupdel "$SERVICE_NAME" 2>/dev/null || true

  # 非包管理器安装的二进制
  for _p in "$BIN_PATH" /usr/bin/"$SERVICE_NAME" /usr/local/bin/"$SERVICE_NAME" \
            /usr/sbin/"$SERVICE_NAME" /usr/local/sbin/"$SERVICE_NAME" \
            "$SB_DIR/$SERVICE_NAME"; do
    rm -f "$_p"
  done

  # 手写或残留的单元文件（官方包还会带一个 @.service）
  rm -rf /etc/systemd/system/"$SERVICE_NAME".service \
         /etc/systemd/system/"$SERVICE_NAME".service.d \
         /etc/systemd/system/"$SERVICE_NAME"@.service \
         /lib/systemd/system/"$SERVICE_NAME".service \
         /lib/systemd/system/"$SERVICE_NAME"@.service \
         /usr/lib/systemd/system/"$SERVICE_NAME".service \
         /usr/lib/systemd/system/"$SERVICE_NAME"@.service \
         /etc/init.d/"$SERVICE_NAME"

  # 配置目录：确属本脚本才递归删，否则只删空目录
  if safe_sb_dir; then
    rm -rf "$SB_DIR"
  else
    rmdir "$SB_DIR" 2>/dev/null || true
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed 2>/dev/null || true
  fi

  ok "已卸载"
  command -v "$SERVICE_NAME" >/dev/null 2>&1 && warn "命令仍在：$(command -v "$SERVICE_NAME")"
  [ -e "$SB_DIR" ] && warn "目录仍在：$SB_DIR"
  printf "  ${DIM}journal 里的历史日志未动，会自动轮转，不影响系统${NC}\n"

  # 脚本自己最后删：本次执行靠已打开的句柄，删掉也不影响
  _self=""
  [ -f "$0" ] && _self="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/$(basename "$0")"
  if [ -n "$_self" ] && confirm "同时删除本脚本 $_self" "n"; then
    rm -f "$_self"
  fi
}

# ════════════ 菜单 ════════════

menu() {
  local _c
  while true; do
    print_title "sing-box 节点管理"

    cecho "  ${CYAN} [${GREEN}1${CYAN}]${NC} 添加节点"
    cecho "  ${CYAN} [${GREEN}2${CYAN}]${NC} 更改节点"
    cecho "  ${CYAN} [${GREEN}3${CYAN}]${NC} 查看节点"
    cecho "  ${CYAN} [${RED}4${CYAN}]${NC} 删除节点"
    cecho "  ${CYAN} [${BLUE}5${CYAN}]${NC} 安装 / 更新内核"
    cecho "  ${CYAN} [${RED}6${CYAN}]${NC} 完整卸载"
    cecho "  ${CYAN} [${PURPLE}0${CYAN}]${NC} 退出"

    print_separator
    printf "%b" "  ${CYAN}请输入选项编号: ${NC}"
    read_re
    _c="$RE"

    case "$_c" in
      1) do_add "" ;;
      2) do_change ;;
      3) do_view ;;
      4) do_del ;;
      5) do_install ;;
      6) do_uninstall ;;
      9) config_preview ;;
      0) cecho "${PURPLE}再见${NC}"; exit 0 ;;
      *) err "无效选项" ;;
    esac
  done
}

# 隐藏项：预览渲染结果，不写入不重启
config_preview() {
  state_init
  printf "\n"
  render_config
}

usage() {
  cat <<EOF
sing-box 节点管理脚本

用法: sh singbox.sh [命令]

命令:
  install       安装内核（已装则跳过），并配置好开机自启
  add [协议]    添加节点，协议可选 reality / hy2 / anytls，省略则询问
  change        更改节点（端口 / 名称 / 域名 / 密码或密钥 / 重签证书）
  view          查看节点与分享链接
  del           删除节点
  uninstall     完整卸载（停服务、删程序、删配置目录）
  无参数        进入菜单（菜单里输入 9 可预览渲染出的 config.json，不写入）

环境变量:
  SB_DIR        配置目录，默认 /etc/sing-box
  SB_VERSION    安装的内核版本，默认 1.14.4
  BIN_PATH      内核安装路径，默认 /usr/local/bin/sing-box
  SB_BIN        直接指定已有内核，设置后不再下载
  ADDR          分享链接里的服务器地址，默认自动探测
EOF
}

main() {
  case "$1" in
    install|i)
      do_install
      ;;
    add|a)
      shift
      do_add "${1:-}"
      ;;
    change|c)
      do_change
      ;;
    view|v)
      do_view
      ;;
    del|d)
      do_del
      ;;
    uninstall|remove)
      do_uninstall
      ;;
    '')
      menu
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      err "未知命令：$1"
      usage
      exit 1
      ;;
  esac
}

main "$@"
