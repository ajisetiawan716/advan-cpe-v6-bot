class Formatter {
  // Helper untuk garis pembatas
  static separator() {
    return "───────────────────────";
  }

  static doubleSeparator() {
    return "═══════════════════════";
  }

  static line(count = 40) {
    return "─".repeat(count);
  }

  static doubleLine(count = 40) {
    return "═".repeat(count);
  }  
	
  static getSignalBar(level) {
    const bars = {
      5: '▂▃▅▇█',
      4: '▂▃▅▇',
      3: '▂▃▅',
      2: '▂▃',
      1: '▂',
      0: '❌'
    };
    return bars[level] || '❌';
  }

  static getSignalLevelFromRsrp(rsrp) {
    const rsrpNum = parseInt(rsrp);
    if (rsrpNum > -85) return 5;
    if (rsrpNum > -95) return 4;
    if (rsrpNum > -105) return 3;
    if (rsrpNum > -115) return 2;
    if (rsrpNum > -140) return 1;
    return 0;
  }

  // Get signal description based on signal_lvl
	static getSignalDescriptionFromLevel(level) {
	  const levelNum = parseInt(level);
	  switch(levelNum) {
		case 4: return 'Excellent';
		case 3: return 'Good';
		case 2: return 'Fair';
		case 1: return 'Weak';
		case 0: return 'No Signal';
		default: return 'Unknown';
	  }
}

  static humanizeBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatTraffic(trafficData) {
    const rxBytes = parseInt(trafficData.rx_bytes) || 0;
    const txBytes = parseInt(trafficData.tx_bytes) || 0;
    const totalBytes = rxBytes + txBytes;
    
    return `
📊 TRAFFIC INFO
${this.doubleSeparator()}
📥 Download: ${this.humanizeBytes(rxBytes)}
📤 Upload: ${this.humanizeBytes(txBytes)}
📊 Total: ${this.humanizeBytes(totalBytes)}
`;
  }

	// LOG formatter
	static formatLog(logData) {
	  // Jika logData adalah null atau undefined
	  if (!logData) {
		return '📋 No log data available';
	  }
	  
	  // Cek jika response adalah NO_AUTH object
	  if (typeof logData === 'object' && logData.success === false && logData.message === 'NO_AUTH') {
		return `❌ Authentication failed. Please use /logout and try again.`;
	  }
	  
	  // Jika logData adalah string
	  if (typeof logData === 'string') {
		// Cek jika string adalah NO_AUTH
		if (logData.includes('NO_AUTH')) {
		  return `❌ Authentication failed. Please use /logout and try again.`;
		}
		
		// Log format dari modem: "2026-05-04 08:14:49 - Clear Log"
		const lines = logData.split('\n').filter(l => l.trim());
		const recentLogs = lines.slice(-20); // Last 20 lines
		
		if (recentLogs.length === 0) {
		  return '📋 No log data available';
		}
		
		let result = `📋 SYSTEM LOGS\n${this.doubleSeparator()}\n\n<code>`;
		
		for (let i = 0; i < recentLogs.length; i++) {
		  const line = recentLogs[i];
		  let icon = '📄';
		  if (line.includes('LOGIN SUCCESS')) icon = '✅';
		  else if (line.includes('AUTH FAIL')) icon = '❌';
		  else if (line.includes('Clear Log')) icon = '🗑️';
		  else if (line.includes('ERROR')) icon = '⚠️';
		  else if (line.includes('WARNING')) icon = '⚠️';
		  else if (line.includes('REBOOT')) icon = '🔄';
		  
		  result += `${icon} ${line}\n`;
		}
		
		result += `</code>\n${this.separator()}\n📌 Showing last ${recentLogs.length} of ${lines.length} total entries`;
		
		return result;
	  }
	  
	  // Jika logData adalah object (JSON lain)
	  if (typeof logData === 'object') {
		try {
		  const jsonString = JSON.stringify(logData, null, 2);
		  if (jsonString.length > 0 && jsonString !== '{}') {
			return `📋 SYSTEM LOGS\n${this.doubleSeparator()}\n\n<code>${this.escapeHtml(jsonString)}</code>`;
		  }
		} catch (e) {
		  // Ignore
		}
	  }
	  
	  return '📋 No log data available';
	}
	// LOG formatter


  static formatLimiterMonitor(monitorData) {
    if (!monitorData.traffic || monitorData.traffic.length === 0) {
      return '📊 No active clients connected';
    }
    
    let result = '📊 *ACTIVE CLIENTS*\n\n';
    
    for (const client of monitorData.traffic) {
      result += `┌─ 📱 *${client.name || 'Unknown'}*\n`;
      result += `├─ IP: ${client.ip}\n`;
      result += `├─ MAC: ${client.mac}\n`;
      result += `├─ 📥 Down: ${this.humanizeBytes(client.down_kbps * 1024)}/s\n`;
      result += `├─ 📤 Up: ${this.humanizeBytes(client.up_kbps * 1024)}/s\n`;
      result += `└─ 📊 Total: ${this.humanizeBytes(client.total_down + client.total_up)}\n\n`;
    }
    
    return result;
  }

  static formatTTL(ttlData) {
    const { success, ttl, msg } = ttlData;
    
    if (!success || ttl === '0') {
      return `
🌐 TTL INFO
${this.doubleSeparator()}
Status: ❌ No TTL rule active
Message: ${msg || 'TTL not set'}`;
    }
    
    return `
🌐 TTL INFO
${this.doubleSeparator()}
Status: ✅ Active
TTL Value: ${ttl}
Message: ${msg || 'TTL rule applied'}`;
  }

	static formatDataSwitch(status) {
	  const isEnabled = status === '1' || status === true;
	  return `
	📡 DATA CONNECTION
	${this.doubleSeparator()}
	Status: ${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}
	${this.separator()}
	`;
	}
	
	// /currentband commands
	static formatCurrentBand(bandInfo) {
	  const bandNames = {
		1: 'Band 1',
		3: 'Band 3',
		5: 'Band 5',
		8: 'Band 8',
		40: 'Band 40'
	  };
	  
	  const bandFreqs = {
		1: '2100 MHz',
		3: '1800 MHz',
		5: '850 MHz',
		8: '900 MHz',
		40: '2300 MHz'
	  };
	  
	  const bandName = bandNames[bandInfo.band] || `Band ${bandInfo.band}`;
	  const bandFreq = bandFreqs[bandInfo.band] || bandInfo.bandwidth_mhz || 'N/A';
	  const cellId = bandInfo.cell_id && bandInfo.cell_id !== 'undefined' ? bandInfo.cell_id : 'N/A';
	  const bandwidth = bandInfo.bandwidth || 'N/A';
	  
	  let result = `
	🎵 CURRENT ACTIVE BAND
	${this.doubleSeparator()}
	📡 Band: ${bandName} (${bandFreq})
	🔢 PCI: ${bandInfo.pci || 'N/A'}
	📊 EARFCN: ${bandInfo.earfcn || 'N/A'}
	📶 Bandwidth: ${bandwidth}
	🏢 Cell ID: ${cellId}`;
	  
	  // Add signal quality based on signal_lvl
	  if (bandInfo.signal_lvl !== undefined && bandInfo.signal_lvl !== 'N/A') {
		const level = parseInt(bandInfo.signal_lvl);
		const signalBar = this.getSignalBar(level);
		const signalDesc = this.getSignalDescriptionFromLevel(level);
		result += `

	${this.separator()}
	📶 Signal: ${signalBar} (${signalDesc})`;
	  }
	  
	  // Add detailed signal metrics if available
	  if (bandInfo.rsrp && bandInfo.rsrp !== 'N/A') {
		const rsrp = parseInt(bandInfo.rsrp);
		let qualityIcon = '🟢';
		let qualityText = 'Excellent';
		
		if (rsrp > -85) { qualityIcon = '🟢'; qualityText = 'Excellent'; }
		else if (rsrp > -95) { qualityIcon = '🟡'; qualityText = 'Good'; }
		else if (rsrp > -105) { qualityIcon = '🟠'; qualityText = 'Fair'; }
		else if (rsrp > -115) { qualityIcon = '🔴'; qualityText = 'Weak'; }
		else { qualityIcon = '💀'; qualityText = 'Very Poor'; }
		
		result += `
	   • RSRP: ${bandInfo.rsrp} dBm
	   • RSRQ: ${bandInfo.rsrq || 'N/A'} dB
	   • SINR: ${bandInfo.sinr || 'N/A'} dB
	   • Quality: ${qualityIcon} ${qualityText}`;
	  }
	  
	  // Add network info
	  if (bandInfo.network_type && bandInfo.network_type !== 'N/A') {
		result += `

	${this.separator()}
	🌐 Network: ${bandInfo.network_type}
	📡 Operator: ${bandInfo.operator || 'N/A'}`;
	  }
	  
	  return result;
	}

  // For /signal - detail teknis + signal_lvl
  static formatSignal(signalData) {
    const { 
      RSRP, RSRQ, SINR, RSSI, network_type_str, network_operator, 
      currentband, signal_lvl, wan_ip, wan_ipv6, apn_name, gateway, dns
    } = signalData;
    
    const level = parseInt(signal_lvl);
    const signalBar = this.getSignalBar(level);
    const signalDesc = this.getSignalDescriptionFromLevel(level);
    
    let ipv6Display = wan_ipv6 || 'N/A';
    if (ipv6Display !== 'N/A' && ipv6Display.length > 45) {
      ipv6Display = ipv6Display.substring(0, 40) + '...';
    }

  // Tampilkan PLMN juga (opsional)
  const plmnDisplay = plmn && plmn !== 'N/A' ? ` (PLMN: ${plmn})` : '';  
    
    return `
📡 SIGNAL INFO
${this.doubleSeparator()}

📶 ${signalBar} (${signalDesc})
📊 Signal Metrics:
   • RSRP: ${RSRP || 'N/A'} dBm
   • RSRQ: ${RSRQ || 'N/A'} dB
   • SINR: ${SINR || 'N/A'} dB
   • RSSI: ${RSSI || 'N/A'} dBm
${this.separator()}
🌐 Network:
   • Type: ${network_type_str || 'N/A'}
   • Operator: ${network_operator || 'N/A'}${plmnDisplay}
   • Band: ${currentband || 'N/A'}
${this.separator()}
📡 Connection:
   • APN: ${apn_name || 'N/A'}
   • Gateway: ${gateway || 'N/A'}
   • DNS: ${dns || 'N/A'}
${this.separator()}
🌍 IP Addresses:
   • IPv4: ${wan_ip || 'N/A'}
   • IPv6: ${ipv6Display}  
${this.separator()}   
`;
  }

  // /device commands	
	static formatDeviceFull(deviceData) {
	  const {
		// Hardware Info
		board_type, hwversion, device_sn, idu_dev_type,
		// Firmware Info
		real_fwversion, fake_version, idu_firmware_version, build_date, config_version,
		// Git Info
		git_sha, git_branch,
		// Module Info
		module_type, module_softver, module_hardver, module_imei, module_sn,
		// SIM Info
		IMSI, ICCID, sim_slot,
		// System
		uptime, cpuload, memory, cpu, temp,
		// Other
		device_cmei
	  } = deviceData;
	  
	  // Format uptime
	  let uptimeStr = 'N/A';
	  if (uptime && !isNaN(parseFloat(uptime))) {
		const uptimeSeconds = parseFloat(uptime);
		const days = Math.floor(uptimeSeconds / 86400);
		const hours = Math.floor((uptimeSeconds % 86400) / 3600);
		const minutes = Math.floor((uptimeSeconds % 3600) / 60);
		uptimeStr = `${days}d ${hours}h ${minutes}m`;
	  }
	  
	  // Format CPU load
	  let cpuLoadStr = cpuload || 'N/A';
	  if (cpuLoadStr !== 'N/A') {
		const loads = cpuLoadStr.split(',').map(l => l.trim());
		cpuLoadStr = `${loads[0]} (1m) | ${loads[1]} (5m) | ${loads[2]} (15m)`;
	  }
	  
	  // Format memory (total, used, free)
	  let memoryStr = 'N/A';
	  if (memory && memory !== 'N/A') {
		const parts = memory.split(',').map(p => p.trim());
		if (parts.length >= 3) {
		  const total = this.humanizeBytes(parseInt(parts[0]) * 1024);
		  const used = this.humanizeBytes(parseInt(parts[1]) * 1024);
		  const free = this.humanizeBytes(parseInt(parts[2]) * 1024);
		  memoryStr = `Total: ${total} | Used: ${used} | Free: ${free}`;
		}
	  }
	  
	  // Format temperature
	  let tempDisplay = 'N/A';
	  let tempIcon = '🟢';
	  if (temp && temp !== 'N/A') {
		const tempNum = parseInt(temp);
		if (tempNum >= 65) tempIcon = '🔴';
		else if (tempNum >= 50) tempIcon = '🟡';
		tempDisplay = `${tempIcon} ${tempNum}°C`;
	  }
	  
	  // Format CPU usage
	  let cpuDisplay = cpu || 'N/A';
	  let cpuIcon = '🟢';
	  if (cpuDisplay !== 'N/A') {
		const cpuNum = parseInt(cpu);
		if (cpuNum >= 80) cpuIcon = '🔴';
		else if (cpuNum >= 50) cpuIcon = '🟡';
		cpuDisplay = `${cpuIcon} ${cpuNum}%`;
	  }
	  
	  // Format IMEI with monospace
	  const imeiValue = module_imei || device_cmei || 'N/A';
	  const imsiValue = IMSI || 'N/A';
	  const iccidValue = ICCID || 'N/A';
	  
	  return `
	<b>💻 DEVICE INFO</b>
	${this.doubleSeparator()}

	<b>📱 Modem Info:</b>
	   • IMEI: <code>${imeiValue}</code>
	   • SN: ${module_sn || 'N/A'}
	   • Type: ${module_type || 'N/A'}

	${this.separator()}

	<b>📡 Hardware:</b>
	   • Board: ${board_type || 'N/A'}
	   • HW Version: ${hwversion || 'N/A'}
	   • Device SN: <code>${device_sn}</code>
	   • Device Type: ${idu_dev_type || 'N/A'}

	${this.separator()}

	<b>📦 Firmware:</b>
	   • Version: ${real_fwversion || fake_version || 'N/A'}
	   • IDU Version: ${idu_firmware_version || 'N/A'}
	   • Config Version: ${config_version || 'N/A'}
	   • Build Date: ${build_date || 'N/A'}

	${this.separator()}

	<b>🔧 Module:</b>
	   • Software: ${module_softver || 'N/A'}
	   • Hardware: ${module_hardver || 'N/A'}

	${this.separator()}

	<b>📱 SIM Info:</b>
	   • IMSI: <code>${imsiValue}</code>
	   • ICCID: <code>${iccidValue}</code>
	   • Slot: ${sim_slot || 'N/A'}

	${this.separator()}

	<b>🖥️ System:</b>
	   • Uptime: ${uptimeStr}
	   • CPU Load: ${cpuLoadStr}
	   • Memory: ${memoryStr}
	   • CPU Usage: ${cpuDisplay}
	   • Temperature: ${tempDisplay}

	${this.separator()}

	<b>📝 Git:</b>
	   • Branch: ${git_branch || 'N/A'}
	   • Commit: ${git_sha ? git_sha.substring(0, 7) + '...' : 'N/A'}

	${this.separator()}

	<b>⚙️ Config Version:</b> ${config_version || 'N/A'}
	`;
	}

	static formatStatus(statusData) {
	  const { 
		network_type_str, signal_lvl, sim_status, data_switch, 
		wlan2g_switch_0, wlan5g_switch_0, uptime, network_operator 
	  } = statusData;
	  
	  const simStatus = sim_status === '1' ? '✅ Inserted' : '❌ Not Inserted';
	  const dataStatus = data_switch === '1' ? '✅ Enabled' : '❌ Disabled';
	  
	  // Gunakan nilai yang sudah diperbaiki dari getStatus
	  const wifi2gStatus = wlan2g_switch_0 === '1' ? '✅ On' : '❌ Off';
	  const wifi5gStatus = wlan5g_switch_0 === '1' ? '✅ On' : '❌ Off';
	  
	  // Gunakan signal_lvl dari modem (0-4)
	  const level = parseInt(signal_lvl);
	  const signalBar = this.getSignalBar(level);
	  const signalDesc = this.getSignalDescriptionFromLevel(level);
	  
	  // Handle NaN uptime
	  let uptimeStr = 'N/A (Just rebooted)';
	  if (uptime && !isNaN(parseFloat(uptime))) {
		const uptimeSeconds = parseFloat(uptime);
		const days = Math.floor(uptimeSeconds / 86400);
		const hours = Math.floor((uptimeSeconds % 86400) / 3600);
		const minutes = Math.floor((uptimeSeconds % 3600) / 60);
		uptimeStr = `${days}d ${hours}h ${minutes}m`;
	  }
	  
	   return `
	📊 STATUS INFO
	${this.doubleSeparator()}

	📶 ${signalBar} (${signalDesc})
	🌐 Network: ${network_type_str || 'N/A'} (${network_operator || 'Unknown'})
	📱 SIM Card: ${simStatus}
	📡 Data Connection: ${dataStatus}
	${this.separator()}
	📶 WiFi Status:
	   • 2.4GHz: ${wifi2gStatus}
	   • 5GHz: ${wifi5gStatus}
	${this.separator()}
	⏱️ Uptime: ${uptimeStr}
	${this.separator()}
	`;
	  }

	// Perbaiki juga formatWifiDetail untuk menampilkan SSID dengan benar
	static formatWifiDetail(wifiStatus) {
	  return `
	📶 WIFI DETAIL
	${this.doubleSeparator()}
	📡 2.4GHz WiFi:
	   • Status: ${wifiStatus.wifi24g_enabled ? '✅ On' : '❌ Off'}
	   • SSID: ${wifiStatus.wifi24g_ssid || 'N/A'}
	   • Channel: ${wifiStatus.wifi24g_channel || 'Auto'}
	   • Bandwidth: ${wifiStatus.wifi24g_bandwidth || 'Auto'}
	   • TX Power: ${wifiStatus.wifi24g_txpower || '100'}%
	   • Broadcast: ${wifiStatus.broadcast_24g ? '✅ Visible' : '❌ Hidden'}
	   • Encryption: ${wifiStatus.wifi24g_encryption || 'WPA2-PSK'}
	${this.separator()}
	📡 5GHz WiFi:
	   • Status: ${wifiStatus.wifi5g_enabled ? '✅ On' : '❌ Off'}
	   • SSID: ${wifiStatus.wifi5g_ssid || 'N/A'}
	   • Channel: ${wifiStatus.wifi5g_channel || 'Auto'}
	   • Bandwidth: ${wifiStatus.wifi5g_bandwidth || 'Auto'}
	   • TX Power: ${wifiStatus.wifi5g_txpower || '100'}%
	   • Broadcast: ${wifiStatus.broadcast_5g ? '✅ Visible' : '❌ Hidden'}
	   • Encryption: ${wifiStatus.wifi5g_encryption || 'WPA2-PSK'}
	${this.separator()}
	💡 TX Power 100% = Full power | Use /status for quick status
	`;
	}

static formatSMS(smsData, page, totalPages, total) {
  if (!smsData || smsData.length === 0) {
    return '📭 No SMS messages found.';
  }
  
  let result = `📱 SMS INBOX\n${this.doubleSeparator()}\n`;
  result += `Page ${page}/${totalPages} | Total: ${total} messages\n`;
  result += `${this.separator()}\n\n`;
  
  for (let i = 0; i < smsData.length; i++) {
    const sms = smsData[i];
    result += `${i + 1 + (page - 1) * 5}. From: ${sms.phoneNo || 'Unknown'}\n`;
    result += `   Date: ${sms.datetime || 'Unknown'}\n`;
    const content = sms.content || '';
    const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
    result += `   Msg: ${truncated}`;
    
    if (i < smsData.length - 1) {
      result += `\n${this.separator()}\n`;
    }
  }
  
  return result;
}

static formatBand(bandData, currentBandInfo = null) {
  const { parsedLockedBands, rawMask, band_4g_switch } = bandData;
  
  const supportedBandsInfo = {
    1: 'Band 1 (2100 MHz)',
    3: 'Band 3 (1800 MHz)',
    5: 'Band 5 (850 MHz)',
    8: 'Band 8 (900 MHz)',
    40: 'Band 40 (2300 MHz)'
  };
  
  // Determine mode
  let modeDisplay = 'Auto Selection';
  let lockedBandsDisplay = 'None (Auto)';
  
  if (parsedLockedBands && parsedLockedBands.length > 0 && rawMask !== '0' && rawMask !== '8000000095') {
    modeDisplay = 'Manual Selection';
    const bandNames = parsedLockedBands.map(b => supportedBandsInfo[b] || `Band ${b}`).join(', ');
    lockedBandsDisplay = bandNames;
  }
  
    let result = `
📡 BAND CONFIGURATION
${this.doubleSeparator()}
📡 4G LTE Configuration:
   • Mode: ${modeDisplay}
   • Locked Bands: ${lockedBandsDisplay}
${this.separator()}
📡 Supported Bands: Band 1, 3, 5, 8, 40
${this.separator()}
📡 3G Configuration: Auto Selection`;
    
    if (currentBandInfo && currentBandInfo.band !== 'N/A') {
      result += `

${this.formatCurrentBand(currentBandInfo)}`;
    }
    
    return result;
  }

static parseBandMaskDisplay(mask, is3G = false) {
  if (!mask || mask === 'N/A' || mask === '0') {
    return 'Auto';
  }
  
  if (is3G) {
    // 3G bands: 93 typically means bands 1, 8 (2100MHz and 900MHz)
    if (mask === '93') return 'Band 1 (2100 MHz), Band 8 (900 MHz)';
    return mask;
  }
  
  return 'Auto';
}

// In index.js or formatter.js
  static formatHelp() {
    return `
🤖 ADVAN CPE V6 BOT COMMANDS
${this.doubleSeparator()}
📡 Monitoring:
/signal - Signal info with IP & APN
/status - Modem status
/device - Device info
/sysinfo - CPU & Temperature
/traffic - WAN traffic
/currentband - Current active band
/clients - Active WiFi clients
/log - System logs
${this.separator()}
📱 SMS:
/sms - SMS Manager
/send <phone> <msg> - Send SMS
${this.separator()}
⚙️ Band Control:
/band - Band configuration
/lockband <1,3,40> - Lock to specific bands
/lockband auto - Auto band selection
${this.separator()}
📡 WiFi:
/wifi - WiFi control
/wifi_on - Turn ON all WiFi
/wifi_off - Turn OFF all WiFi
/wifi24_on /wifi24_off - 2.4GHz only
/wifi5_on /wifi5_off - 5GHz only
${this.separator()}
🌐 Network:
/data - Control mobile data
/dataon - Enable mobile data
/dataoff - Disable mobile data
/lockcell - Lock Cell
/ttl - Control TTL
/ttlstatus - TTL status
/setttl <64-255> - Set TTL
${this.separator()}
💡 LED Control:
/led - Open LED control menu with buttons
/led_on /led_off - All LEDs
/led_wifi_on /led_wifi_off - WiFi LED
/led_data_on /led_data_off - Data LED
/led_sig_on /led_sig_off - Signal LED
/led_reset - Reset to auto
${this.separator()}
🔄 System:
/reboot - Reboot modem
/imei - Show IMEI
/logout - Clear session
${this.separator()}
🔐 Admin:
/config - Show config
/setconfig <key> <value> - Set config
/ping - Check connection
/help - This help
${this.doubleSeparator()}
💡 Auto-login using UCI credentials
`;
  }


  static formatSysInfo(sysinfo) {
    const { cpu, temp } = sysinfo;
    
    let tempStatus = '🌡️ ';
    const tempNum = parseInt(temp);
    if (tempNum < 50) tempStatus += '🟢 Normal';
    else if (tempNum < 65) tempStatus += '🟡 Warm';
    else tempStatus += '🔴 Hot';
    
    return `
🖥️ SYSTEM INFO
${this.doubleSeparator()}
🔢 CPU Usage: ${cpu || 'N/A'}%
${tempStatus}: ${temp || 'N/A'}°C
`;
  }
}

module.exports = Formatter;