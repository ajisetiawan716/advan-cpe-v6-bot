include $(TOPDIR)/rules.mk

PKG_NAME:=advan-bot
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Aji Setiawan <ajisetiawan716@gmail.com>
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/advan-bot
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Advan CPE V6 Telegram Bot
  DEPENDS:=+node +node-npm +ca-certificates +curl +wget
  PKGARCH:=all
endef

define Package/advan-bot/description
  Telegram Bot untuk manajemen modem Advan CPE V6.
  
  Fitur Lengkap:
  - Monitoring: sinyal, status, device, sysinfo, traffic
  - Manajemen Band: lock/unlock, preset, auto mode
  - Manajemen WiFi: on/off, edit SSID/password/encryption, QR share
  - Manajemen LED: per LED control, reset auto
  - SMS Manager: view inbox, send, delete per ID, clear all
  - Network: data on/off, TTL control, cell lock
  - System: reboot, IMEI read/change, log viewer
  - Security: UCI-based user authorization
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/advan-bot/install
	# ===== Direktori bot =====
	$(INSTALL_DIR) $(1)/opt/advan-bot

	# ===== File utama =====
	$(INSTALL_DATA) ./index.js $(1)/opt/advan-bot/index.js
	$(INSTALL_DATA) ./package.json $(1)/opt/advan-bot/package.json
	$(INSTALL_DATA) ./install.sh $(1)/opt/advan-bot/install.sh

	# ===== Handlers =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/handlers
	$(INSTALL_DATA) ./handlers/actions.js $(1)/opt/advan-bot/handlers/actions.js
	$(INSTALL_DATA) ./handlers/commands.js $(1)/opt/advan-bot/handlers/commands.js
	$(INSTALL_DATA) ./handlers/messages.js $(1)/opt/advan-bot/handlers/messages.js

	# ===== Modem =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/modem
	$(INSTALL_DATA) ./modem/api.js $(1)/opt/advan-bot/modem/api.js
	$(INSTALL_DATA) ./modem/auth.js $(1)/opt/advan-bot/modem/auth.js
	$(INSTALL_DATA) ./modem/client.js $(1)/opt/advan-bot/modem/client.js
	$(INSTALL_DATA) ./modem/curl-client.js $(1)/opt/advan-bot/modem/curl-client.js

	# ===== Utils =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/utils
	$(INSTALL_DATA) ./utils/commandRegistry.js $(1)/opt/advan-bot/utils/commandRegistry.js
	$(INSTALL_DATA) ./utils/formatter.js $(1)/opt/advan-bot/utils/formatter.js
	$(INSTALL_DATA) ./utils/keyboardBuilder.js $(1)/opt/advan-bot/utils/keyboardBuilder.js
	$(INSTALL_DATA) ./utils/logger.js $(1)/opt/advan-bot/utils/logger.js
	$(INSTALL_DATA) ./utils/uci.js $(1)/opt/advan-bot/utils/uci.js
	$(INSTALL_DATA) ./utils/qrcode.js $(1)/opt/advan-bot/utils/qrcode.js
	$(INSTALL_DATA) ./utils/savedNumbers.js $(1)/opt/advan-bot/utils/savedNumbers.js

	# ===== Bot checker =====
	$(INSTALL_DATA) ./utils/bot-checker.sh $(1)/opt/advan-bot/bot-checker.sh
	chmod 755 $(1)/opt/advan-bot/bot-checker.sh

	# ===== Sessions =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/sessions
	$(INSTALL_DATA) ./sessions/index.js $(1)/opt/advan-bot/sessions/index.js

	# ===== Init script =====
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DATA) ./files/etc/init.d/advan-bot $(1)/etc/init.d/advan-bot
	chmod 755 $(1)/etc/init.d/advan-bot

	# ===== Config UCI =====
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/etc/config/advan_bot $(1)/etc/config/advan_bot

	# ===== Set permissions =====
	chmod 755 $(1)/opt/advan-bot/index.js
	chmod 755 $(1)/opt/advan-bot/install.sh
endef

define Package/advan-bot/postinst
#!/bin/sh
set -e

[ -n "$${IPKG_INSTROOT}" ] && exit 0

echo ""
echo "================================================"
echo "  🤖 Advan CPE V6 Bot - Post Install"
echo "================================================"
echo ""

# Buat direktori yang diperlukan
mkdir -p /var/log/advan-bot
mkdir -p /tmp/advan_bot_cache
chmod 755 /var/log/advan-bot

# Install npm dependencies
if [ -f /opt/advan-bot/package.json ]; then
  echo "📦 Installing npm dependencies..."
  cd /opt/advan-bot
  npm install --no-optional --production --quiet 2>/dev/null || {
    echo "⚠️  npm install gagal, coba dengan --legacy-peer-deps..."
    npm install --no-optional --production --legacy-peer-deps --quiet 2>/dev/null || {
      echo "❌ npm install gagal total"
      echo "   Jalankan manual: cd /opt/advan-bot && npm install"
    }
  }
  echo "✅ Dependencies installed"
fi

# Enable service
if [ -x /etc/init.d/advan-bot ]; then
  /etc/init.d/advan-bot enable 2>/dev/null || true
  echo "✅ Service enabled"
fi

echo ""
echo "================================================"
echo "  📋 NEXT STEPS:"
echo "================================================"
echo ""
echo "1. Konfigurasi Bot Token:"
echo "   uci set advan_bot.main.bot_token='YOUR_BOT_TOKEN'"
echo ""
echo "2. Set Allowed Users:"
echo "   uci set advan_bot.main.allowed_users='CHAT_ID'"
echo ""
echo "3. Commit & Start:"
echo "   uci commit advan_bot"
echo "   /etc/init.d/advan-bot start"
echo ""
echo "4. Cek Status:"
echo "   /etc/init.d/advan-bot status"
echo "   /etc/init.d/advan-bot log"
echo ""
echo "================================================"
exit 0
endef

define Package/advan-bot/prerm
#!/bin/sh
set -e

echo "🛑 Stopping Advan Bot..."

# Hentikan service
if [ -x /etc/init.d/advan-bot ]; then
  /etc/init.d/advan-bot stop 2>/dev/null || true
  /etc/init.d/advan-bot disable 2>/dev/null || true
fi

# Hapus cron checker
crontab -l 2>/dev/null | grep -v "bot-checker.sh" | crontab - 2>/dev/null || true

# Hapus file sementara
rm -f /var/run/advan-bot.pid 2>/dev/null || true
rm -f /var/run/advan-bot.lock 2>/dev/null || true
rm -f /tmp/advan-bot-retry.count 2>/dev/null || true

echo "✅ Bot stopped"
exit 0
endef

define Package/advan-bot/postrm
#!/bin/sh
set -e

# Hapus direktori log (opsional)
rm -rf /var/log/advan-bot 2>/dev/null || true
rm -rf /tmp/advan_bot_cache 2>/dev/null || true

echo "✅ Cleanup selesai"
exit 0
endef

$(eval $(call BuildPackage,advan-bot))