#!/bin/sh
# ============================================================
# Advan CPE V6 Telegram Bot - Installer (OpenWrt)
# (c) 2025-2026 github.com/ajisetiawan716
# ============================================================

set -e
PATH="/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# ===== Konfigurasi =====
BOT_NAME="advan-bot"
BOT_DIR="/opt/${BOT_NAME}"
BOT_SERVICE="/etc/init.d/${BOT_NAME}"
TEMP_DIR="/tmp/${BOT_NAME}"
LOG_DIR="/var/log/${BOT_NAME}"

# GitHub API
GH_OWNER="ajisetiawan716"
GH_REPO="advan-cpe-v6-bot"
GH_API="https://api.github.com/repos/${GH_OWNER}/${GH_REPO}"
GH_RAW="https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}"

# ===== Warna (OUTPUT KE STDERR AGAR TIDAK TERCAMPUR DENGAN RETURN VALUE) =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}📦${NC} $*" >&2; }
ok()    { echo -e "${GREEN}✅${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}⚠️${NC}  $*" >&2; }
err()   { echo -e "${RED}❌${NC} $*" >&2; }
title() { echo -e "${CYAN}$*${NC}" >&2; }

# ===== Cek root =====
is_root() { [ "$(id -u)" -eq 0 ]; }
is_root || { err "Jalankan sebagai root!"; exit 1; }

# ===== Deteksi dependensi =====
check_deps() {
  for cmd in curl wget node npm uci opkg crontab; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      warn "$cmd tidak ditemukan, install..."
      opkg update 2>/dev/null || true
      case "$cmd" in
        node|npm) opkg install node node-npm 2>/dev/null || warn "Gagal install node" ;;
        *) opkg install "$cmd" 2>/dev/null || warn "Gagal install $cmd" ;;
      esac
    fi
  done
  ok "Dependensi OK"
}

# ===== Get latest version dari GitHub API =====
get_latest_version() {
  info "Cek latest version dari GitHub..." >&2
  
  local api_url="${GH_API}/releases/latest"
  local version
  
  # Coba dari release dulu
  if command -v curl >/dev/null 2>&1; then
    version=$(curl -fsSL "$api_url" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/' | sed 's/^v//')
  else
    version=$(wget -qO- "$api_url" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/' | sed 's/^v//')
  fi
  
  # Fallback: dari package branch
  if [ -z "$version" ]; then
    warn "Release tidak ada, coba dari package branch..." >&2
    version=$(wget -qO- "${GH_RAW}/package/dev/version" 2>/dev/null | head -1 | sed 's/^v//')
  fi
  
  if [ -z "$version" ]; then
    err "Gagal mendapatkan version!" >&2
    return 1
  fi
  
  echo "$version"
}

# ===== Get download URL =====
get_download_url() {
  local version="$1"
  
  info "Mencari URL download untuk v${version}..." >&2
  
  # Coba dari branch dev dulu (paling baru)
  local download_url=$(curl -fsSL "https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/dev?ref=package" 2>/dev/null | \
    grep '"download_url"' | grep 'advan-bot_.*\.ipk' | \
    sed -E 's/.*"download_url": *"([^"]+)".*/\1/' | head -1)
  
  # Fallback ke branch main
  if [ -z "$download_url" ]; then
    download_url=$(curl -fsSL "https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/main?ref=package" 2>/dev/null | \
      grep '"download_url"' | grep 'advan-bot_.*\.ipk' | \
      sed -E 's/.*"download_url": *"([^"]+)".*/\1/' | head -1)
  fi
  
  # Fallback: URL langsung
  if [ -z "$download_url" ]; then
    download_url="${GH_RAW}/package/dev/advan-bot_${version}_all.ipk"
  fi
  
  echo "$download_url"
}

# ===== Download IPK =====
download_ipk() {
  local url="$1"
  local dest="$2"
  
  info "Download $(basename "$url")..." >&2
  
  if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$dest" "$url" || { err "Gagal download" >&2; return 1; }
  elif command -v curl >/dev/null 2>&1; then
    curl -#L -o "$dest" "$url" || { err "Gagal download" >&2; return 1; }
  else
    err "Butuh wget atau curl!" >&2
    return 1
  fi
  
  [ -s "$dest" ] || { err "File kosong!" >&2; return 1; }
  ok "Download selesai: $(basename "$dest") ($(du -h "$dest" | cut -f1))" >&2
}

# ===== Install dari IPK =====
install_from_ipk() {
  local ipk_file="$1"
  
  info "Install ${BOT_NAME}..." >&2
  
  # Stop service jika berjalan
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} stop 2>/dev/null || true
  fi
  
  # Install IPK
  opkg install --force-reinstall "$ipk_file" || {
    err "Gagal install IPK" >&2
    return 1
  }
  
  ok "IPK terinstall" >&2
}

# ===== Install npm dependencies =====
install_npm_deps() {
  if [ ! -f "${BOT_DIR}/package.json" ]; then
    return 0
  fi
  
  info "Install npm dependencies..." >&2
  cd "${BOT_DIR}"
  
  npm install --no-optional --production --quiet 2>/dev/null && return 0
  npm install --no-optional --production --legacy-peer-deps --quiet 2>/dev/null && return 0
  
  warn "npm install gagal, coba manual: cd ${BOT_DIR} && npm install" >&2
}

# ===== Konfigurasi UCI =====
configure_uci() {
  echo "" >&2
  title "================================================" >&2
  title "  ⚙️  KONFIGURASI BOT" >&2
  title "================================================" >&2
  echo "" >&2
  
  # Bot Token
  echo "" >&2
  info "BOT TOKEN (dari @BotFather)" >&2
  printf "   Masukkan Bot Token: " >&2
  read -r bot_token
  
  if [ -n "$bot_token" ]; then
    uci set advan_bot.main.bot_token="$bot_token"
    ok "Bot Token disimpan" >&2
  fi
  
  # Allowed Users
  echo "" >&2
  info "ALLOWED USERS (Chat ID, pisah koma)" >&2
  echo "   Contoh: 1006163955,1234567890" >&2
  printf "   Masukkan Chat ID: " >&2
  read -r allowed_users
  
  if [ -n "$allowed_users" ]; then
    uci set advan_bot.main.allowed_users="$allowed_users"
    ok "Allowed Users disimpan" >&2
  fi
  
  # Commit
  uci commit advan_bot
  ok "Konfigurasi selesai" >&2
}

# ===== Start bot =====
start_bot() {
  info "Start ${BOT_NAME}..." >&2
  
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} enable 2>/dev/null || true
    ${BOT_SERVICE} start
    sleep 2
    if ${BOT_SERVICE} status 2>/dev/null | grep -q "running"; then
      ok "${BOT_NAME} running!" >&2
    else
      warn "Cek log: ${LOG_DIR}/bot.log" >&2
    fi
  else
    mkdir -p "${LOG_DIR}"
    cd "${BOT_DIR}"
    nohup node index.js > "${LOG_DIR}/bot.log" 2>&1 &
    echo $! > /var/run/${BOT_NAME}.pid
    ok "${BOT_NAME} started (PID: $!)" >&2
  fi
}

# ===== Status bot =====
status_bot() {
  echo "" >&2
  title "================================================" >&2
  title "  📋 STATUS BOT" >&2
  title "================================================" >&2
  
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} status 2>/dev/null || echo "❌ Bot tidak berjalan" >&2
  elif [ -f "/var/run/${BOT_NAME}.pid" ]; then
    local pid=$(cat /var/run/${BOT_NAME}.pid)
    if kill -0 "$pid" 2>/dev/null; then
      ok "Bot running (PID: $pid)" >&2
    else
      warn "Bot tidak berjalan" >&2
    fi
  else
    warn "Bot tidak berjalan" >&2
  fi
}

# ===== Main install flow =====
main_install() {
  title "================================================" >&2
  title "  🤖 ADVAN CPE V6 BOT - INSTALLER" >&2
  title "================================================" >&2
  echo "" >&2
  
  # 1. Check dependensi
  info "1/4 Cek dependensi..." >&2
  check_deps
  
  # 2. Get version & download
  echo "" >&2
  info "2/4 Get latest version..." >&2
  VERSION=$(get_latest_version)
  ok "Version: v${VERSION}" >&2
  
  echo "" >&2
  info "3/4 Download IPK..." >&2
  DOWNLOAD_URL=$(get_download_url "$VERSION")
  IPK_FILE="${TEMP_DIR}/advan-bot_${VERSION}_all.ipk"
  mkdir -p "$TEMP_DIR"
  download_ipk "$DOWNLOAD_URL" "$IPK_FILE"
  
  # 3. Install
  echo "" >&2
  info "4/4 Install & configure..." >&2
  install_from_ipk "$IPK_FILE"
  install_npm_deps
  
  # Konfigurasi
  if ! uci get advan_bot.main.bot_token >/dev/null 2>&1 || \
     [ -z "$(uci get advan_bot.main.bot_token 2>/dev/null)" ]; then
    warn "Bot Token belum dikonfigurasi!" >&2
    printf "   Konfigurasi sekarang? (y/n): " >&2
    read -r do_config
    [ "$do_config" = "y" ] || [ "$do_config" = "Y" ] && configure_uci
  fi
  
  # Start
  printf "   Start bot? (y/n): " >&2
  read -r do_start
  [ "$do_start" = "y" ] || [ "$do_start" = "Y" ] && start_bot
  
  # Cleanup
  rm -f "$IPK_FILE"
  
  echo "" >&2
  ok "✅ INSTALLASI SELESAI!" >&2
}

# ===== Uninstall =====
uninstall_bot() {
  warn "⚠️  Hapus bot sepenuhnya? (y/n): " >&2
  read -r confirm
  [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && return
  
  [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} stop 2>/dev/null || true
  [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} disable 2>/dev/null || true
  pkill -f "node.*advan-bot" 2>/dev/null || true
  
  opkg list-installed | grep -q "^advan-bot " && opkg remove --autoremove advan-bot || true
  
  rm -rf "${BOT_DIR}"
  rm -f /var/run/advan-bot.pid /var/run/advan-bot.lock
  crontab -l 2>/dev/null | grep -v "bot-checker.sh" | crontab - 2>/dev/null || true
  
  ok "Uninstall selesai" >&2
}

# ===== Menu =====
show_menu() {
  echo "" >&2
  title "================================================" >&2
  title "  🤖 ADVAN CPE V6 BOT INSTALLER" >&2
  title "================================================" >&2
  echo "  1) 📥 Install/Update" >&2
  echo "  2) ⚙️  Konfigurasi UCI" >&2
  echo "  3) 🚀 Start Bot" >&2
  echo "  4) 🛑 Stop Bot" >&2
  echo "  5) 🔄 Restart Bot" >&2
  echo "  6) 📋 Status" >&2
  echo "  7) 🗑️  Uninstall" >&2
  echo "  8) ❌ Keluar" >&2
  printf "  Pilih [1-8]: " >&2
}

# ===== Main =====
case "${1:-}" in
  install|update) main_install ;;
  config) configure_uci ;;
  start) start_bot ;;
  stop)
    [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} stop || pkill -f "node.*advan-bot" 2>/dev/null || true
    ok "Stopped" >&2 ;;
  restart)
    [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} restart || { pkill -f "node.*advan-bot" 2>/dev/null || true; sleep 2; start_bot; } ;;
  status) status_bot ;;
  uninstall) uninstall_bot ;;
  *)
    while true; do
      show_menu
      read -r choice
      case "$choice" in
        1) main_install ;;
        2) configure_uci ;;
        3) start_bot ;;
        4) [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} stop || pkill -f "node.*advan-bot" 2>/dev/null || true ;;
        5) [ -x "${BOT_SERVICE}" ] && ${BOT_SERVICE} restart || { pkill -f "node.*advan-bot" 2>/dev/null || true; sleep 2; start_bot; } ;;
        6) status_bot ;;
        7) uninstall_bot ;;
        8|q) exit 0 ;;
      esac
      printf "\nTekan Enter..." >&2; read -r
    done
    ;;
esac