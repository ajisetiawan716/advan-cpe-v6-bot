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

# ===== Warna =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}📦${NC} $*"; }
ok()    { echo -e "${GREEN}✅${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠️${NC}  $*"; }
err()   { echo -e "${RED}❌${NC} $*"; }
title() { echo -e "${CYAN}$*${NC}"; }

# ===== Cek root =====
is_root() { [ "$(id -u)" -eq 0 ]; }
is_root || { err "Jalankan sebagai root!"; exit 1; }

# ===== Deteksi dependensi =====
check_deps() {
  local missing=""
  
  for cmd in curl wget node npm uci opkg crontab; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing="$missing $cmd"
    fi
  done
  
  if [ -n "$missing" ]; then
    warn "Dependensi tidak ditemukan:$missing"
    info "Install dependensi terlebih dahulu..."
    
    opkg update
    
    for pkg in curl wget node node-npm ca-certificates; do
      if ! opkg list-installed | grep -q "^$pkg "; then
        info "Install $pkg..."
        opkg install "$pkg" || warn "Gagal install $pkg"
      fi
    done
  fi
  
  ok "Dependensi OK"
}

# ===== Get latest version dari GitHub API =====
get_latest_version() {
  info "Cek latest version dari GitHub..."
  
  local api_url="${GH_API}/releases/latest"
  local version
  
  if command -v curl >/dev/null 2>&1; then
    version=$(curl -fsSL "$api_url" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/' | sed 's/^v//')
  elif command -v wget >/dev/null 2>&1; then
    version=$(wget -qO- "$api_url" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/' | sed 's/^v//')
  fi
  
  if [ -z "$version" ]; then
    warn "Tidak bisa mendapatkan latest version, coba dari package branch..."
    version=$(wget -qO- "${GH_RAW}/package/main/version" 2>/dev/null | head -1 | sed 's/^v//')
  fi
  
  if [ -z "$version" ]; then
    err "Gagal mendapatkan version!"
    exit 1
  fi
  
  echo "$version"
}

# ===== Get download URL dari GitHub API =====
get_download_url() {
  local version="$1"
  local api_url="${GH_API}/releases/tags/v${version}"
  local download_url
  
  info "Mencari URL download untuk v${version}..."
  
  if command -v curl >/dev/null 2>&1; then
    download_url=$(curl -fsSL "$api_url" 2>/dev/null | \
      grep '"browser_download_url"' | \
      grep 'advan-bot_.*\.ipk' | \
      sed -E 's/.*"browser_download_url": *"([^"]+)".*/\1/' | \
      head -1)
  elif command -v wget >/dev/null 2>&1; then
    download_url=$(wget -qO- "$api_url" 2>/dev/null | \
      grep '"browser_download_url"' | \
      grep 'advan-bot_.*\.ipk' | \
      sed -E 's/.*"browser_download_url": *"([^"]+)".*/\1/' | \
      head -1)
  fi
  
  # Fallback: ambil dari package branch
  if [ -z "$download_url" ]; then
    warn "Release tidak ditemukan, coba dari package branch..."
    
    # Coba main dulu, lalu dev
    for branch in main dev; do
      local pkg_list=$(curl -fsSL "https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${branch}?ref=package" 2>/dev/null | \
        grep '"download_url"' | \
        grep 'advan-bot_.*\.ipk' | \
        sed -E 's/.*"download_url": *"([^"]+)".*/\1/' | \
        head -1)
      
      if [ -n "$pkg_list" ]; then
        download_url="$pkg_list"
        break
      fi
    done
  fi
  
  if [ -z "$download_url" ]; then
    err "Tidak bisa menemukan URL download!"
    exit 1
  fi
  
  echo "$download_url"
}

# ===== Download IPK =====
download_ipk() {
  local url="$1"
  local dest="$2"
  
  info "Download $(basename "$url")..."
  
  if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$dest" "$url" || {
      err "Gagal download"
      return 1
    }
  elif command -v curl >/dev/null 2>&1; then
    curl -#L -o "$dest" "$url" || {
      err "Gagal download"
      return 1
    }
  else
    err "Butuh wget atau curl!"
    return 1
  fi
  
  [ -s "$dest" ] || { err "File kosong!"; return 1; }
  ok "Download selesai: $(basename "$dest") ($(du -h "$dest" | cut -f1))"
}

# ===== Install dari IPK =====
install_from_ipk() {
  local ipk_file="$1"
  
  info "Install ${BOT_NAME}..."
  
  # Stop service jika berjalan
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} stop 2>/dev/null || true
  fi
  
  # Install IPK
  opkg install --force-reinstall "$ipk_file" || {
    err "Gagal install IPK"
    return 1
  }
  
  ok "IPK terinstall"
}

# ===== Install npm dependencies =====
install_npm_deps() {
  if [ ! -f "${BOT_DIR}/package.json" ]; then
    warn "package.json tidak ditemukan, skip npm install"
    return 0
  fi
  
  info "Install npm dependencies..."
  cd "${BOT_DIR}"
  
  # Coba beberapa metode
  npm install --no-optional --production --quiet 2>/dev/null && return 0
  npm install --no-optional --production --legacy-peer-deps --quiet 2>/dev/null && return 0
  
  warn "npm install gagal, coba manual: cd ${BOT_DIR} && npm install"
}

# ===== Konfigurasi UCI =====
configure_uci() {
  echo ""
  title "================================================"
  title "  ⚙️  KONFIGURASI BOT"
  title "================================================"
  echo ""
  
  # Cek existing config
  local current_token=""
  local current_users=""
  
  if uci get advan_bot.main.bot_token >/dev/null 2>&1; then
    current_token=$(uci get advan_bot.main.bot_token 2>/dev/null || echo "")
    current_users=$(uci get advan_bot.main.allowed_users 2>/dev/null || echo "")
  fi
  
  # Bot Token
  echo ""
  info "BOT TOKEN (dari @BotFather)"
  if [ -n "$current_token" ]; then
    echo "   Current: ${current_token:0:15}..."
  fi
  printf "   Masukkan Bot Token: "
  read -r bot_token
  
  if [ -n "$bot_token" ]; then
    uci set advan_bot.main.bot_token="$bot_token"
    ok "Bot Token disimpan"
  else
    warn "Bot Token tidak diubah"
  fi
  
  # Allowed Users
  echo ""
  info "ALLOWED USERS (Chat ID yang diizinkan)"
  if [ -n "$current_users" ]; then
    echo "   Current: $current_users"
  fi
  echo "   Contoh: 1006163955,1234567890"
  printf "   Masukkan Chat ID (pisah koma): "
  read -r allowed_users
  
  if [ -n "$allowed_users" ]; then
    uci set advan_bot.main.allowed_users="$allowed_users"
    ok "Allowed Users disimpan"
  else
    warn "Allowed Users tidak diubah"
  fi
  
  # Modem config
  echo ""
  info "MODEM CONFIG (default: 192.168.0.1 / root / admin)"
  
  printf "   Modem IP [192.168.0.1]: "
  read -r modem_ip
  modem_ip=${modem_ip:-192.168.0.1}
  uci set advan_bot.main.modem_ip="$modem_ip"
  
  printf "   Modem User [root]: "
  read -r modem_user
  modem_user=${modem_user:-root}
  uci set advan_bot.main.modem_user="$modem_user"
  
  printf "   Modem Password [admin]: "
  read -r modem_password
  modem_password=${modem_password:-admin}
  uci set advan_bot.main.modem_password="$modem_password"
  
  # Log level
  printf "   Log Level [info]: "
  read -r log_level
  log_level=${log_level:-info}
  uci set advan_bot.main.log_level="$log_level"
  
  # Commit
  uci commit advan_bot
  ok "Konfigurasi UCI selesai"
}

# ===== Start bot =====
start_bot() {
  echo ""
  info "Start ${BOT_NAME}..."
  
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} enable 2>/dev/null || true
    ${BOT_SERVICE} start
    
    sleep 2
    if ${BOT_SERVICE} status | grep -q "running"; then
      ok "${BOT_NAME} running!"
    else
      warn "Bot mungkin tidak berjalan, cek log: ${LOG_DIR}/bot.log"
    fi
  else
    # Start manual
    cd "${BOT_DIR}"
    nohup node index.js > "${LOG_DIR}/bot.log" 2>&1 &
    echo $! > /var/run/${BOT_NAME}.pid
    ok "${BOT_NAME} started (PID: $(cat /var/run/${BOT_NAME}.pid))"
  fi
}

# ===== Status bot =====
status_bot() {
  echo ""
  title "================================================"
  title "  📋 STATUS BOT"
  title "================================================"
  echo ""
  
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} status 2>/dev/null || echo "❌ Bot tidak berjalan"
  elif [ -f "/var/run/${BOT_NAME}.pid" ]; then
    local pid=$(cat /var/run/${BOT_NAME}.pid)
    if kill -0 "$pid" 2>/dev/null; then
      ok "Bot running (PID: $pid)"
    else
      warn "Bot tidak berjalan (stale PID)"
    fi
  else
    warn "Bot tidak berjalan"
  fi
  
  echo ""
  
  # Cek konfigurasi
  if uci get advan_bot.main.bot_token >/dev/null 2>&1; then
    echo "=== KONFIGURASI UCI ==="
    uci show advan_bot 2>/dev/null | grep -v "password\|token" || true
  fi
  
  # Cek log
  if [ -f "${LOG_DIR}/bot.log" ]; then
    echo ""
    echo "=== LOG TERAKHIR ==="
    tail -n 5 "${LOG_DIR}/bot.log"
  fi
}

# ===== Main install flow =====
main_install() {
  echo ""
  title "================================================"
  title "  🤖 ADVAN CPE V6 BOT - INSTALLER"
  title "================================================"
  echo ""
  
  # 1. Check dependensi
  info "1/5 Cek dependensi..."
  check_deps
  
  # 2. Get latest version
  echo ""
  info "2/5 Cek latest version..."
  VERSION=$(get_latest_version)
  ok "Latest version: v${VERSION}"
  
  # Cek versi terinstall
  if [ -f "${BOT_DIR}/package.json" ]; then
    INSTALLED_VER=$(grep '"version"' "${BOT_DIR}/package.json" 2>/dev/null | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "0")
    if [ "$INSTALLED_VER" = "$VERSION" ]; then
      warn "Versi sama (v${VERSION}), install ulang? (y/n)"
      read -r confirm
      [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && {
        info "Dibatalkan"
        return 0
      }
    fi
  fi
  
  # 3. Download IPK
  echo ""
  info "3/5 Download IPK..."
  DOWNLOAD_URL=$(get_download_url "$VERSION")
  IPK_FILE="${TEMP_DIR}/advan-bot_${VERSION}_all.ipk"
  mkdir -p "$TEMP_DIR"
  download_ipk "$DOWNLOAD_URL" "$IPK_FILE"
  
  # 4. Install IPK
  echo ""
  info "4/5 Install IPK..."
  install_from_ipk "$IPK_FILE"
  install_npm_deps
  
  # 5. Konfigurasi
  echo ""
  info "5/5 Konfigurasi..."
  
  # Cek apakah sudah dikonfigurasi
  if ! uci get advan_bot.main.bot_token >/dev/null 2>&1 || \
     [ -z "$(uci get advan_bot.main.bot_token 2>/dev/null)" ]; then
    warn "Bot Token belum dikonfigurasi!"
    printf "   Konfigurasi sekarang? (y/n): "
    read -r do_config
    [ "$do_config" = "y" ] || [ "$do_config" = "Y" ] && configure_uci
  else
    echo ""
    info "Konfigurasi sudah ada:"
    uci show advan_bot 2>/dev/null | grep -v "password\|token" || true
    echo ""
    printf "   Ubah konfigurasi? (y/n): "
    read -r do_config
    [ "$do_config" = "y" ] || [ "$do_config" = "Y" ] && configure_uci
  fi
  
  # Start bot
  echo ""
  printf "   Start bot sekarang? (y/n): "
  read -r do_start
  if [ "$do_start" = "y" ] || [ "$do_start" = "Y" ]; then
    start_bot
  fi
  
  # Cleanup
  rm -f "$IPK_FILE"
  rm -rf "$TEMP_DIR"
  
  echo ""
  title "================================================"
  title "  ✅ INSTALLASI SELESAI!"
  title "================================================"
  echo ""
  echo "  Perintah penting:"
  echo "  ${BOT_SERVICE} start     - Start bot"
  echo "  ${BOT_SERVICE} stop      - Stop bot"
  echo "  ${BOT_SERVICE} restart   - Restart bot"
  echo "  ${BOT_SERVICE} status    - Cek status"
  echo "  ${BOT_SERVICE} log       - Lihat log (50 baris)"
  echo "  ${BOT_SERVICE} follow    - Follow log (real-time)"
  echo ""
}

# ===== Uninstall =====
uninstall_bot() {
  echo ""
  warn "⚠️  Ini akan menghapus bot sepenuhnya!"
  printf "   Lanjutkan? (y/n): "
  read -r confirm
  [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && return
  
  # Stop service
  if [ -x "${BOT_SERVICE}" ]; then
    ${BOT_SERVICE} stop 2>/dev/null || true
    ${BOT_SERVICE} disable 2>/dev/null || true
  fi
  
  # Kill process
  pkill -f "node.*advan-bot" 2>/dev/null || true
  
  # Remove via opkg
  if opkg list-installed | grep -q "^advan-bot "; then
    opkg remove --autoremove advan-bot || true
  fi
  
  # Cleanup
  rm -rf "${BOT_DIR}"
  rm -f /var/run/advan-bot.pid /var/run/advan-bot.lock /tmp/advan-bot-retry.count
  crontab -l 2>/dev/null | grep -v "bot-checker.sh" | crontab - 2>/dev/null || true
  
  echo ""
  printf "   Hapus UCI config? (y/n): "
  read -r del_uci
  if [ "$del_uci" = "y" ] || [ "$del_uci" = "Y" ]; then
    uci delete advan_bot.main 2>/dev/null || true
    uci commit advan_bot
  fi
  
  ok "Uninstall selesai"
}

# ===== Menu (jika dijalankan tanpa argumen) =====
show_menu() {
  echo ""
  title "================================================"
  title "  🤖 ADVAN CPE V6 BOT INSTALLER"
  title "================================================"
  echo ""
  echo "  1) 📥 Install/Update Bot (latest version)"
  echo "  2) ⚙️  Konfigurasi UCI"
  echo "  3) 🚀 Start Bot"
  echo "  4) 🛑 Stop Bot"
  echo "  5) 🔄 Restart Bot"
  echo "  6) 📋 Status Bot"
  echo "  7) 📝 Lihat Log"
  echo "  8) 🗑️  Uninstall Bot"
  echo "  9) ❌ Keluar"
  echo ""
  printf "  Pilih [1-9]: "
}

# ===== Main =====
case "${1:-}" in
  install|update)
    main_install
    ;;
  config|configure)
    configure_uci
    ;;
  start)
    start_bot
    ;;
  stop)
    if [ -x "${BOT_SERVICE}" ]; then
      ${BOT_SERVICE} stop
    else
      pkill -f "node.*advan-bot" 2>/dev/null || true
      rm -f /var/run/advan-bot.pid
      ok "Bot stopped"
    fi
    ;;
  restart)
    if [ -x "${BOT_SERVICE}" ]; then
      ${BOT_SERVICE} restart
    else
      pkill -f "node.*advan-bot" 2>/dev/null || true
      sleep 2
      start_bot
    fi
    ;;
  status)
    status_bot
    ;;
  log|logs)
    if [ -f "${LOG_DIR}/bot.log" ]; then
      tail -f "${LOG_DIR}/bot.log"
    else
      warn "Log tidak ditemukan"
    fi
    ;;
  uninstall|remove)
    uninstall_bot
    ;;
  *)
    # Menu interaktif
    while true; do
      show_menu
      read -r choice
      case "$choice" in
        1) main_install ;;
        2) configure_uci ;;
        3) start_bot ;;
        4)
          if [ -x "${BOT_SERVICE}" ]; then
            ${BOT_SERVICE} stop
          else
            pkill -f "node.*advan-bot" 2>/dev/null || true
          fi
          ok "Bot stopped"
          ;;
        5)
          if [ -x "${BOT_SERVICE}" ]; then
            ${BOT_SERVICE} restart
          else
            pkill -f "node.*advan-bot" 2>/dev/null || true
            sleep 2
            start_bot
          fi
          ;;
        6) status_bot ;;
        7)
          if [ -f "${LOG_DIR}/bot.log" ]; then
            tail -f "${LOG_DIR}/bot.log"
          fi
          ;;
        8) uninstall_bot ;;
        9|q|Q) echo ""; ok "Terimakasih.. :)"; exit 0 ;;
        *) warn "Pilihan tidak valid" ;;
      esac
      echo ""
      printf "Tekan Enter untuk lanjut..."; read -r
    done
    ;;
esac