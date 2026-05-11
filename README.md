# 🤖 Advan CPE V6 Telegram Bot

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ajisetiawan716/advan-cpe-v6-bot-bot/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-OpenWrt-orange.svg)](https://openwrt.org)

Telegram Bot untuk manajemen dan monitoring modem **Advan CPE V6** secara remote melalui Telegram. Bot ini memungkinkan Anda mengontrol hampir semua fitur modem langsung dari chat Telegram.

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Screenshot](#-screenshot)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
  - [Via IPK (OpenWrt)](#via-ipk-openwrt)
  - [Via Installer Script](#via-installer-script)
  - [Manual Install](#manual-install)
- [Konfigurasi](#-konfigurasi)
- [Commands](#-commands)
- [Struktur Menu](#-struktur-menu)
- [Keamanan](#-keamanan)
- [Pengembangan](#-pengembangan)
- [Troubleshooting](#-troubleshooting)
- [Lisensi](#-lisensi)

---

## ✨ Fitur

### 📡 Monitoring
- **Signal Info** - RSRP, RSRQ, SINR, RSSI, band, operator
- **Status** - Koneksi, SIM, data switch, WiFi status
- **Device Info** - Model, firmware, IMEI, uptime
- **System Info** - CPU, memory, suhu (live update)
- **Traffic** - RX/TX bytes real-time
- **Current Band** - Band aktif, PCI, EARFCN, Cell ID

### ⚙️ Manajemen Band
- Lock/unlock band individu (1, 3, 5, 8, 40)
- Preset kombinasi band
- Auto mode (modem pilih terbaik)
- Tampilan checkbox interaktif

### 📶 Manajemen WiFi
- On/off 2.4GHz & 5GHz
- Edit SSID, password, enkripsi
- Share WiFi via QR code
- Advanced settings

### 💡 Manajemen LED
- Kontrol per LED (WiFi, Data, Signal)
- All LEDs on/off
- Reset ke auto mode

### 📱 SMS Manager
- View inbox dengan pagination
- Send SMS ke nomor baru
- Send ke nomor tersimpan
- Delete SMS per ID
- Clear all inbox
- Auto-save nomor

### 🌐 Network
- Data on/off (mobile data switch)
- Refresh IP (toggle data)
- TTL control (preset & custom)
- Cell lock (PCI & EARFCN)
- Lock current cell / unlock

### 🔧 System
- Reboot modem
- IMEI read & change
- Log viewer & clear
- Configuration manager

### 🔐 Security
- **Authorization berbasis Chat ID**
- Hanya user terdaftar yang bisa akses
- Konfigurasi via UCI
- `/start` tidak auto-register

---

## 📸 Screenshot
![Screenshot_1](https://raw.githubusercontent.com/ajisetiawan716/advan-cpe-v6-bot/main/assets/screenshot/1.png)

![Screenshot_2](https://raw.githubusercontent.com/ajisetiawan716/advan-cpe-v6-bot/main/assets/screenshot/2.png)

![Screenshot_3](https://raw.githubusercontent.com/ajisetiawan716/advan-cpe-v6-bot/main/assets/screenshot/3.png)


---

## 📦 Prasyarat

### OpenWrt
- **OpenWrt 21.02+ / 22.03+ / 24.10+**
- **Node.js >= 16** (`opkg install node node-npm`)
- **curl** (`opkg install curl`)
- **ca-certificates** (`opkg install ca-bundle`)
- **Modem Advan CPE V6** dalam jaringan yang sama
- **Bot Token** dari [@BotFather](https://t.me/BotFather)

### Linux (Development)
- **Node.js >= 16**
- **npm >= 8**
- Git

---

## 🚀 Instalasi

### Via IPK (OpenWrt)


# Download IPK dari GitHub Releases
```bash
wget https://github.com/ajisetiawan716/advan-cpe-v6-bot-bot/releases/latest/download/advan-bot_1.0.0-1_all.ipk
```

# Install
```bash
opkg install advan-bot_1.0.0-1_all.ipk
```

# Konfigurasi
```bash
uci set advan_bot.main.bot_token='YOUR_BOT_TOKEN'
uci set advan_bot.main.allowed_users='YOUR_CHAT_ID'
uci set advan_bot.main.modem_ip='192.168.0.1'
uci set advan_bot.main.modem_password='admin'
uci commit advan_bot
```
# Start bot
```bash
/etc/init.d/advan-bot start
/etc/init.d/advan-bot status
```
---

### Via Installer Script

# Download installer
```bash
curl -fsSL https://raw.githubusercontent.com/ajisetiawan716/advan-cpe-v6-bot/main/install.sh -o /tmp/install.sh
chmod +x /tmp/install.sh
/tmp/install.sh
```

# Menu Installer
```
===========================================
   🤖 ADVAN CPE V6 TELEGRAM BOT
===========================================

 1) 📥 Install/Update Bot
 2) ⚙️  Konfigurasi UCI
 3) 🚀 Start Bot
 4) 🛑 Stop Bot
 5) 🔄 Restart Bot
 6) 📋 Status Bot
 7) 📝 Lihat Log
 8) 🗑️  Uninstall Bot
 9) ❌ Keluar
 ```
 
 ### Manual Install

```bash
git clone https://github.com/ajisetiawan716/advan-cpe-v6-bot.git /opt/advan-bot
cd /opt/advan-bot
```

# Install dependencies
```bash
npm install --production
```

# Konfigurasi via UCI (OpenWrt)
```bash
uci set advan_bot.main.bot_token='YOUR_BOT_TOKEN'
uci set advan_bot.main.allowed_users='YOUR_CHAT_ID'
uci commit advan_bot
```

# Jalankan
```bash
node index.js
```

---

## ⚙️ Konfigurasi

### UCI Config (OpenWrt)


# Set konfigurasi
```bash
uci set advan_bot.main.modem_ip='192.168.0.1'
uci set advan_bot.main.modem_user='root'
uci set advan_bot.main.modem_password='admin'
uci set advan_bot.main.bot_token='8618077060:AAHu6N5o7cOeH10x6rRWVr3Pzv8Qj7bWKPU'
uci set advan_bot.main.allowed_users='1006163955,123456789'
uci set advan_bot.main.log_level='info'
```

# Simpan
```bash
uci commit advan_bot
```

# Lihat konfigurasi
```bash
uci show advan_bot
```

---

## 📋 Commands

### Bot Commands (via Telegram)

| Command | Fungsi |
|---------|--------|
| `/start` | Tampilkan menu utama |
| `/help` | Bantuan commands |
| `/signal` | Info sinyal |
| `/status` | Status koneksi |
| `/device` | Info perangkat |
| `/sysinfo` | System info (live) |
| `/all` | Semua info |
| `/traffic` | Traffic data |
| `/currentband` | Band aktif |
| `/clients` | Daftar client |
| `/sms` | SMS Manager |
| `/send` | Kirim SMS langsung |
| `/wifi` | WiFi Manager |
| `/wifi_on` | Nyalakan WiFi |
| `/wifi_off` | Matikan WiFi |
| `/wifi24_on` | 2.4GHz ON |
| `/wifi24_off` | 2.4GHz OFF |
| `/wifi5_on` | 5GHz ON |
| `/wifi5_off` | 5GHz OFF |
| `/wifishare` | Share WiFi QR |
| `/band` | Band Manager |
| `/lockband` | Lock band |
| `/led` | LED Manager |
| `/led_on` | All LEDs ON |
| `/led_off` | All LEDs OFF |
| `/led_wifi_on` | WiFi LED ON |
| `/led_wifi_off` | WiFi LED OFF |
| `/led_data_on` | Data LED ON |
| `/led_data_off` | Data LED OFF |
| `/led_sig_on` | Signal LED ON |
| `/led_sig_off` | Signal LED OFF |
| `/led_reset` | Reset LED auto |
| `/data` | Data Manager |
| `/dataon` | Data ON |
| `/dataoff` | Data OFF |
| `/ttl` | TTL Manager |
| `/ttlstatus` | TTL Status |
| `/setttl` | Set TTL |
| `/resetttl` | Reset TTL |
| `/lockcell` | Cell Lock Manager |
| `/reboot` | Reboot modem |
| `/imei` | IMEI Manager |
| `/log` | Log Manager |
| `/config` | Lihat konfigurasi |
| `/setconfig` | Ubah konfigurasi |
| `/ping` | Ping modem |
| `/logout` | Clear session |

### Service Commands (OpenWrt)

```bash
/etc/init.d/advan-bot start        # Start bot
/etc/init.d/advan-bot stop         # Stop bot
/etc/init.d/advan-bot restart      # Restart bot
/etc/init.d/advan-bot status       # Status bot
/etc/init.d/advan-bot log          # Lihat log (50 baris)
/etc/init.d/advan-bot follow       # Follow log real-time
/etc/init.d/advan-bot enable       # Auto-start on boot
/etc/init.d/advan-bot disable      # Disable auto-start
```

---

## 🔐 Keamanan

### Authorization System

Bot menggunakan sistem otorisasi berbasis **Chat ID**. Hanya user yang terdaftar di config `allowed_users` yang bisa mengakses bot.

```bash
# Hanya user ini yang bisa akses
uci set advan_bot.main.allowed_users='1006163955'
uci commit advan_bot
```

### Akses Ditolak

User tidak terdaftar akan mendapat pesan:

```
⛔ ACCESS DENIED

❌ You are not authorized to use this bot.

📌 Your Chat ID: 1234567890

💡 Please contact admin to get access.
```

### Catatan Keamanan

- **JANGAN** bagikan Bot Token Anda
- Gunakan `/setconfig modem_password` untuk update password modem
- Password modem tidak ditampilkan di `/config` (hanya bintang)
- Session auto-expire setelah 1 jam

---

## 🔧 Pengembangan

### Struktur Project

```
advan-cpe-v6-bot/
├── .github/workflows/    # GitHub Actions CI/CD
├── handlers/             # Command & action handlers
│   ├── actions.js        # Callback query handlers
│   ├── commands.js       # Command handlers
│   └── messages.js       # Reply keyboard handlers
├── modem/                # Modem API
│   ├── api.js            # API methods
│   ├── auth.js           # Authentication
│   ├── client.js         # HTTP client
│   └── curl-client.js    # Curl-based client
├── sessions/             # Session manager
│   └── index.js
├── utils/                # Utilities
│   ├── bot-checker.sh    # Cron checker
│   ├── commandRegistry.js
│   ├── formatter.js      # Message formatter
│   ├── keyboardBuilder.js # Reply keyboard builder
│   ├── logger.js         # Winston logger
│   ├── qrcode.js         # QR code generator
│   ├── savedNumbers.js   # Saved numbers DB
│   └── uci.js            # UCI config manager
├── files/                # OpenWrt package files
│   └── etc/
│       ├── config/advan_bot
│       └── init.d/advan-bot
├── index.js              # Entry point
├── Makefile              # OpenWrt package Makefile
├── package.json
├── install.sh            # Manual installer
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "telegraf": "^4.15.3",
    "axios": "^1.6.0",
    "winston": "^3.11.0",
    "node-cron": "^3.0.3",
    "qrcode": "^1.5.3"
  }
}
```

### Build IPK via GitHub Actions

Push ke branch `main` atau `dev` akan memicu workflow:
1. Compile dengan OpenWrt SDK
2. Hasilkan file `.ipk`
3. Upload ke GitHub Release
4. Publish ke `package/main` branch

### Manual Build

```bash
# Download OpenWrt SDK
wget https://downloads.openwrt.org/releases/24.10.2/targets/x86/64/openwrt-sdk-24.10.2-x86-64_gcc-13.3.0_musl.Linux-x86_64.tar.zst

# Extract
tar --zstd -xf openwrt-sdk-*.tar.zst
cd openwrt-sdk-*

# Copy package
cp -r /path/to/advan-cpe-v6-bot package/advan-bot

# Compile
make package/advan-bot/compile -j$(nproc)
```

---

## 🔍 Troubleshooting

### Bot tidak start

```bash
# Cek log
/etc/init.d/advan-bot log

# Cek konfigurasi
uci show advan_bot

# Test koneksi modem
curl -s http://192.168.0.1/cgi-bin/custom.cgi?action=sysinfo

# Cek Node.js
node -v
npm -v

# Cek dependencies
cd /opt/advan-bot && npm list --depth=0
```

### Session expired terus

```bash
# Clear session & restart
/etc/init.d/advan-bot restart
# Atau via Telegram: /logout
```

### Modem tidak terjangkau

```bash
# Ping modem
ping 192.168.0.1

# Cek IP modem
uci get advan_bot.main.modem_ip
```
---

## 🤝 Kontribusi

Kontribusi selalu diterima! Silakan:

1. Fork repository
2. Buat branch fitur (`git checkout -b fitur-keren`)
3. Commit perubahan (`git commit -m 'Tambah fitur keren'`)
4. Push ke branch (`git push origin fitur-keren`)
5. Buat Pull Request

---

## 📝 Lisensi

MIT License - Copyright (c) 2026 Aji Setiawan

---

## 👨‍💻 Author

**Aji Setiawan**
- GitHub: [@ajisetiawan716](https://github.com/ajisetiawan716)
- Telegram: [@ajisetiawan716](https://t.me/ajisetiawan716)

---

## ⭐ Terimakasih

Jika bot ini bermanfaat, berikan ⭐ di repository ini!

[![Star History Chart](https://api.star-history.com/svg?repos=ajisetiawan716/advan-cpe-v6-bot&type=Date)](https://star-history.com/#ajisetiawan716/advan-cpe-v6-bot&Date)
```