#!/bin/sh
# Bot Checker Script for Advan CPE V6 Bot (Sederhana)
# File: /opt/advan-bot/bot-checker.sh

BOT_NAME="advan-bot"
LOG_FILE="/var/log/advan-bot/checker.log"
MAX_RETRY=3
RETRY_COUNT_FILE="/tmp/advan-bot-retry.count"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_bot() {
    # Cek status bot
    if /etc/init.d/advan-bot status | grep -q "running"; then
        # Bot berjalan normal
        log_message "✅ Bot berjalan normal"
        echo "0" > "$RETRY_COUNT_FILE"
        return 0
    fi

    # Bot tidak berjalan
    local retry=$(cat "$RETRY_COUNT_FILE" 2>/dev/null || echo "0")
    log_message "❌ Bot tidak berjalan (retry: $retry/$MAX_RETRY)"

    if [ "$retry" -lt "$MAX_RETRY" ]; then
        # Coba restart
        retry=$((retry + 1))
        echo "$retry" > "$RETRY_COUNT_FILE"
        log_message "🔄 Mencoba restart (percobaan ke-$retry)..."

        /etc/init.d/advan-bot restart
        sleep 5

        if /etc/init.d/advan-bot status | grep -q "running"; then
            log_message "✅ Restart berhasil"
            echo "0" > "$RETRY_COUNT_FILE"
        fi
    else
        # Fallback: coba start
        log_message "⚠️ Restart gagal $MAX_RETRY kali, fallback ke START..."

        # Stop dulu
        /etc/init.d/advan-bot stop
        sleep 2

        # Start ulang
        /etc/init.d/advan-bot start
        sleep 5

        if /etc/init.d/advan-bot status | grep -q "running"; then
            log_message "✅ Start berhasil (fallback)"
        else
            log_message "❌ Start gagal! Periksa konfigurasi bot"
        fi

        # Reset retry counter
        echo "0" > "$RETRY_COUNT_FILE"
    fi
}

# Main
log_message "========== Check Bot =========="
check_bot