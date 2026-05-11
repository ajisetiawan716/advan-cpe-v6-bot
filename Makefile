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
  # HANYA dependensi runtime, bukan compile-time
  DEPENDS:=+node +ca-certificates +curl
  PKGARCH:=all
endef

define Package/advan-bot/description
  Telegram Bot untuk manajemen modem Advan CPE V6.
  Fitur lengkap: monitoring, band, WiFi, LED, SMS, network, system.
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
	# Tidak ada yang perlu di-compile (script JavaScript)
	true
endef

define Package/advan-bot/install
	# ===== Direktori bot =====
	$(INSTALL_DIR) $(1)/opt/advan-bot

	# ===== File utama =====
	$(INSTALL_DATA) ./index.js $(1)/opt/advan-bot/
	$(INSTALL_DATA) ./package.json $(1)/opt/advan-bot/

	# ===== Handlers =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/handlers
	$(INSTALL_DATA) ./handlers/actions.js $(1)/opt/advan-bot/handlers/
	$(INSTALL_DATA) ./handlers/commands.js $(1)/opt/advan-bot/handlers/
	$(INSTALL_DATA) ./handlers/messages.js $(1)/opt/advan-bot/handlers/

	# ===== Modem =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/modem
	$(INSTALL_DATA) ./modem/api.js $(1)/opt/advan-bot/modem/
	$(INSTALL_DATA) ./modem/auth.js $(1)/opt/advan-bot/modem/
	$(INSTALL_DATA) ./modem/client.js $(1)/opt/advan-bot/modem/
	$(INSTALL_DATA) ./modem/curl-client.js $(1)/opt/advan-bot/modem/

	# ===== Utils =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/utils
	$(INSTALL_DATA) ./utils/commandRegistry.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/formatter.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/keyboardBuilder.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/logger.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/uci.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/qrcode.js $(1)/opt/advan-bot/utils/
	$(INSTALL_DATA) ./utils/savedNumbers.js $(1)/opt/advan-bot/utils/

	# ===== Bot checker =====
	$(INSTALL_DATA) ./utils/bot-checker.sh $(1)/opt/advan-bot/
	chmod 755 $(1)/opt/advan-bot/bot-checker.sh

	# ===== Sessions =====
	$(INSTALL_DIR) $(1)/opt/advan-bot/sessions
	$(INSTALL_DATA) ./sessions/index.js $(1)/opt/advan-bot/sessions/

	# ===== Init script =====
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DATA) ./files/etc/init.d/advan-bot $(1)/etc/init.d/advan-bot
	chmod 755 $(1)/etc/init.d/advan-bot

	# ===== Config UCI =====
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/etc/config/advan_bot $(1)/etc/config/advan_bot
endef

define Package/advan-bot/postinst
#!/bin/sh
set -e
[ -n "$${IPKG_INSTROOT}" ] && exit 0

echo "================================================"
echo "  🤖 Advan CPE V6 Bot - Post Install"
echo "================================================"

# Buat direktori
mkdir -p /var/log/advan-bot /tmp/advan_bot_cache
chmod 755 /var/log/advan-bot

# Install npm dependencies
if [ -f /opt/advan-bot/package.json ]; then
  echo "📦 Installing dependencies..."
  cd /opt/advan-bot
  npm install --no-optional --production --quiet 2>/dev/null || \
  npm install --no-optional --production --legacy-peer-deps --quiet 2>/dev/null || \
  echo "⚠️  npm install failed, run manually: cd /opt/advan-bot && npm install"
fi

# Enable service
[ -x /etc/init.d/advan-bot ] && /etc/init.d/advan-bot enable 2>/dev/null || true

echo ""
echo "✅ Installation complete!"
echo "   Configure: uci set advan_bot.main.bot_token='TOKEN'"
echo "   Start: /etc/init.d/advan-bot start"
exit 0
endef

define Package/advan-bot/prerm
#!/bin/sh
set -e
[ -x /etc/init.d/advan-bot ] && /etc/init.d/advan-bot stop 2>/dev/null || true
[ -x /etc/init.d/advan-bot ] && /etc/init.d/advan-bot disable 2>/dev/null || true
crontab -l 2>/dev/null | grep -v "bot-checker.sh" | crontab - 2>/dev/null || true
rm -f /var/run/advan-bot.pid /var/run/advan-bot.lock /tmp/advan-bot-retry.count
exit 0
endef

$(eval $(call BuildPackage,advan-bot))