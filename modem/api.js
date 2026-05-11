const { modemRequest, customRequest, customPost } = require('./client');
const logger = require('../utils/logger');

// PLMN to Operator Name Mapping
const plmnMap = {
  '51010': 'Telkomsel',
  '510010': 'Telkomsel',
  '51011': 'XL Axiata',
  '510011': 'XL Axiata',
  '51001': 'Indosat Ooredoo',
  '510001': 'Indosat Ooredoo',
  '51021': 'Indosat Ooredoo',
  '510021': 'Indosat Ooredoo',
  '51089': 'Tri',
  '510089': 'Tri',
  '51009': 'Smartfren',
  '510009': 'Smartfren',
  '51028': 'Smartfren',
  '510028': 'Smartfren',
  '51008': 'AXIS',
  '510008': 'AXIS',
  '51027': 'Net1',
  '510027': 'Net1',
  '51000': 'STI',
  '510000': 'STI'
};

function getOperatorName(plmn, fallbackName = null) {
  if (!plmn) return fallbackName || 'Unknown';
  
  const plmnStr = String(plmn);
  
  // Langsung cek di map
  if (plmnMap[plmnStr]) return plmnMap[plmnStr];
  
  // Coba dengan 5 digit (tanpa leading zero)
  if (plmnStr.length === 6 && plmnMap[plmnStr.substring(1)]) {
    return plmnMap[plmnStr.substring(1)];
  }
  
  // Coba dengan 6 digit (tambah leading zero)
  if (plmnStr.length === 5 && plmnMap['0' + plmnStr]) {
    return plmnMap['0' + plmnStr];
  }
  
  return fallbackName || 'Unknown';
}

class ModemAPI {
  constructor(authManager) {
    this.auth = authManager;
  }

	async getSignal(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 205,
		  method: 'GET'
		}, sessionId);
		
		// Get device info for IP and APN
		const deviceInfo = await this.getDeviceInfo(ip, sessionId);
		
		// Ambil nama operator dari PLMN
		const operatorName = getOperatorName(response.PLMN, response.network_operator);
				
		return {
		  ...response,
		  signal_lvl: response.signal_lvl || '0',
		  RSRP: response.RSRP || 'N/A',
		  RSRQ: response.RSRQ || 'N/A',
		  SINR: response.SINR || 'N/A',
		  RSSI: response.RSSI || 'N/A',
		  currentband: response.currentband || 'N/A',
		  network_type_str: response.network_type_str || 'N/A',
		  network_operator: operatorName || 'N/A',
		  plmn: response.PLMN || 'N/A',
		  bandwidth: response.bandwidth || 'N/A',
		  // Add IP and APN info from device
		  wan_ip: deviceInfo.wan_ip || 'N/A',
		  wan_ipv6: deviceInfo.wan_ipv6_ip || 'N/A',
		  apn_name: deviceInfo.apn_name || 'N/A',
		  gateway: deviceInfo.wan_gateway || 'N/A',
		  dns: deviceInfo.wan_dns || 'N/A'
		};
	  } catch (error) {
		logger.error(`getSignal error: ${error.message}`);
		throw error;
	  }
	}

	async getDeviceInfo(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 133,
		  method: 'GET'
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`getDeviceInfo error: ${error.message}`);
		return {
		  wan_ip: 'N/A',
		  wan_ipv6_ip: 'N/A',
		  apn_name: 'N/A',
		  wan_gateway: 'N/A',
		  wan_dns: 'N/A'
		};
	  }
	}	

	async getStatus(ip, sessionId) {
	  try {
		// Ambil status WiFi yang akurat dari CMD 2 dan CMD 211
		const [response, wifi24g, wifi5g] = await Promise.all([
		  modemRequest(ip, { cmd: 113, method: 'GET' }, sessionId),
		  modemRequest(ip, { cmd: 2, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId),
		  modemRequest(ip, { cmd: 211, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId)
		]);
		
		// wifiOpen = "1" berarti ON, "0" berarti OFF
		const wifi24gEnabled = wifi24g.wifiOpen === '1';
		const wifi5gEnabled = wifi5g.wifiOpen === '1';
		
		// ========== TAMBAHKAN: Ambil PLMN untuk mapping operator ==========
		let operatorName = response.network_operator;
		let plmnValue = null;
		
		try {
		  // Ambil signal untuk mendapatkan PLMN
		  const signal = await modemRequest(ip, { cmd: 205, method: 'GET' }, sessionId);
		  plmnValue = signal.PLMN;
		  
		  // Mapping PLMN ke nama operator
		  if (plmnValue) {
			const mappedName = getOperatorName(plmnValue, response.network_operator);
			if (mappedName) {
			  operatorName = mappedName;
			}
		  }
		} catch (e) {
		  logger.debug(`Failed to get PLMN for status: ${e.message}`);
		}
		// ========== SAMPAI SINI ==========
		
		return {
		  ...response,
		  signal_lvl: response.signal_lvl || '0',
		  network_type_str: response.network_type_str || 'N/A',
		  network_operator: operatorName,  // ← Gunakan hasil mapping
		  plmn: plmnValue,                  // ← Tambahkan field plmn
		  sim_status: response.sim_status || '0',
		  data_switch: response.data_switch || '0',
		  // Gunakan dari CMD 2 dan CMD 211 untuk akurasi
		  wlan2g_switch: wifi24gEnabled ? '1' : '0',
		  wlan5g_switch: wifi5gEnabled ? '1' : '0',
		  // Simpan juga data mentah untuk keperluan lain
		  wifi24g_detail: wifi24g,
		  wifi5g_detail: wifi5g
		};
	  } catch (error) {
		logger.error(`getStatus error: ${error.message}`);
		throw error;
	  }
	}

  async getDeviceInfo(ip, sessionId) {
    try {
      const response = await modemRequest(ip, {
        cmd: 133,
        method: 'GET'
      }, sessionId);
      return response;
    } catch (error) {
      logger.error(`getDeviceInfo error: ${error.message}`);
      throw error;
    }
  }

  async getSysInfo(ip) {
    try {
      const response = await customRequest(ip, 'sysinfo');
      return response;
    } catch (error) {
      logger.error(`getSysInfo error: ${error.message}`);
      return { cpu: '0', temp: '0' };
    }
  }

  async getSMSList(ip) {
    try {
      const response = await customRequest(ip, 'read_sms');
      return response;
    } catch (error) {
      logger.error(`getSMSList error: ${error.message}`);
      return { datas: [] };
    }
  }

  async sendSMS(ip, phoneNo, content) {
    try {
      const response = await customPost(ip, 'send_sms', `phoneNo=${encodeURIComponent(phoneNo)}&content=${encodeURIComponent(content)}`);
      return response;
    } catch (error) {
      logger.error(`sendSMS error: ${error.message}`);
      throw error;
    }
  }
 
/**
 * Delete single SMS by ID
 * @param {string} modemIp - Modem IP address
 * @param {string} smsId - SMS ID to delete
 * @returns {Promise<Object>} Response
 */
async deleteSMS(modemIp, smsId) {
  try {
    const response = await customRequest(modemIp, 'delete_sms', { smsId: smsId });
    
    // Response bisa berupa object atau string
    if (response && typeof response === 'object') {
      return {
        success: response.success !== undefined ? response.success : true,
        message: response.message || 'SMS deleted successfully'
      };
    }
    
    return { success: true, message: 'SMS deleted successfully' };
  } catch (error) {
    logger.error(`Delete SMS error: ${error.message}`);
    throw error;
  }
}

/**
 * Clear all SMS inbox
 * @param {string} modemIp - Modem IP address
 * @returns {Promise<Object>} Response
 */
async clearAllSMS(modemIp) {
  try {
    const response = await customRequest(modemIp, 'delete_sms', { clear: '1' });
    
    if (response && typeof response === 'object') {
      return {
        success: response.success !== undefined ? response.success : true,
        message: response.message || 'All SMS cleared successfully'
      };
    }
    
    return { success: true, message: 'All SMS cleared successfully' };
  } catch (error) {
    logger.error(`Clear all SMS error: ${error.message}`);
    throw error;
  }
} 

  async reboot(ip, sessionId) {
    try {
      const response = await modemRequest(ip, {
        cmd: 6,
        rebootType: 1,
        method: 'POST'
      }, sessionId);
      return response;
    } catch (error) {
      logger.error(`reboot error: ${error.message}`);
      throw error;
    }
  }

	async getBandConfig(ip, sessionId) {
  try {
    const response = await modemRequest(ip, {
      cmd: 161,
      method: 'GET'
    }, sessionId);
    
    // Parse band mask to readable bands
    const bandMask = response.lock_band_4g || response.band_4g_mask || response.all_band_4g;
    let parsedBands = [];
    
    if (bandMask && bandMask !== '0' && bandMask !== '8000000095') {
      parsedBands = this.parseMaskToBands(bandMask);
    }
    
    return {
      ...response,
      parsedLockedBands: parsedBands,
      rawMask: bandMask
    };
  } catch (error) {
    logger.error(`getBandConfig error: ${error.message}`);
    throw error;
  }
}

parseMaskToBands(mask) {
  const bandMap = {
    1: 1,
    4: 3,
    16: 5,
    128: 8,
    549755813888: 40
  };
  
  const bands = [];
  const maskNum = typeof mask === 'string' ? parseInt(mask) : mask;
  
  for (const [maskValue, bandNum] of Object.entries(bandMap)) {
    if (maskNum & parseInt(maskValue)) {
      bands.push(bandNum);
    }
  }
  
  return bands.sort((a, b) => a - b);
}

  async setBand4G(ip, sessionId, bandMask) {
    try {
      const response = await modemRequest(ip, {
        cmd: 161,
        method: 'POST',
        band3gRadio: "0",
        band4gRadio: "1",
        lock3gBand: "93",
        lock4gBand: bandMask
      }, sessionId);
      return response;
    } catch (error) {
      logger.error(`setBand4G error: ${error.message}`);
      throw error;
    }
  }

async lockBand(ip, sessionId, bandNumbers) {
  // Supported bands mapping to mask values
  // Band mask is simple: band 1 = 1, band 3 = 4, band 5 = 16, band 8 = 128, band 40 = 549755813888
  const bandMaskMap = {
    1: 1,
    3: 4,
    5: 16,
    8: 128,
    40: 549755813888
  };
  
  // Calculate combined mask
  let bandMask = 0;
  for (const band of bandNumbers) {
    if (bandMaskMap[band]) {
      bandMask += bandMaskMap[band];
    }
  }
  
  // If only one band, use direct mask
  // If multiple bands, combine them
  const maskValue = bandMask.toString();
  
  logger.info(`Locking to bands: ${bandNumbers.join(', ')}, mask: ${maskValue}`);
  
  const response = await modemRequest(ip, {
    cmd: 161,
    method: 'POST',
    band3gRadio: "0",
    band4gRadio: "1",
    lock3gBand: "93",
    lock4gBand: maskValue
  }, sessionId);
  
  return response;
}

async unlockAllBands(ip, sessionId) {
  const response = await modemRequest(ip, {
    cmd: 161,
    method: 'POST',
    band3gRadio: "0",
    band4gRadio: "1",
    lock3gBand: "93",
    lock4gBand: "0"
  }, sessionId);
  
  return response;
}

async forceRefreshSession(ip, sessionId) {
  // Send a dummy command to refresh session
  try {
    await modemRequest(ip, {
      cmd: 205,
      method: 'GET'
    }, sessionId);
    return true;
  } catch (error) {
    return false;
  }
}  

  async lockSingleBand(ip, sessionId, bandNumber) {
    // Band mask: 1=band1, 2=band2, 4=band3, 8=band4, 16=band5, etc
    const bandMask = Math.pow(2, bandNumber - 1).toString();
    return this.setBand4G(ip, sessionId, bandMask);
  }

  async lockMultipleBands(ip, sessionId, bandNumbers) {
    let bandMask = 0;
    for (const band of bandNumbers) {
      bandMask += Math.pow(2, band - 1);
    }
    return this.setBand4G(ip, sessionId, bandMask.toString());
  }

  async getIMEI(ip) {
    try {
      const response = await customRequest(ip, 'read_imei');
      return response;
    } catch (error) {
      logger.error(`getIMEI error: ${error.message}`);
      return { imei: 'N/A' };
    }
  }

  async setTTL(ip, value) {
    try {
      const response = await customRequest(ip, 'set_ttl', { value: value });
      return response;
    } catch (error) {
      logger.error(`setTTL error: ${error.message}`);
      throw error;
    }
  }

  async readTTL(ip) {
    try {
      const response = await customRequest(ip, 'read_ttl');
      return response;
    } catch (error) {
      logger.error(`readTTL error: ${error.message}`);
      return { success: false, ttl: '0', msg: 'Error reading TTL' };
    }
  }

  async resetTTL(ip) {
    try {
      const response = await customRequest(ip, 'reset_ttl');
      return response;
    } catch (error) {
      logger.error(`resetTTL error: ${error.message}`);
      throw error;
    }
  }

	async ledControl(ip, target, state) {
	  try {
		const response = await customRequest(ip, 'led_control', { target: target, state: state });
		return response;
	  } catch (error) {
		logger.error(`ledControl error: ${error.message}`);
		throw error;
	  }
	}

	async ledReset(ip) {
	  try {
		const response = await customRequest(ip, 'led_control', { state: 'restore' });
		return response;
	  } catch (error) {
		logger.error(`ledReset error: ${error.message}`);
		throw error;
	  }
	}

  async getUptime(ip, sessionId) {
    try {
      const response = await modemRequest(ip, {
        cmd: 104,
        method: 'GET'
      }, sessionId);
      return response;
    } catch (error) {
      logger.error(`getUptime error: ${error.message}`);
      return { uptime: '0' };
    }
  }
	
	// LOG API
	async getLogInfo(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 17,
		  method: 'GET'
		}, sessionId);
		
		// Cek jika response adalah NO_AUTH
		if (response && typeof response === 'object' && response.success === false && response.message === 'NO_AUTH') {
		  logger.warn(`getLogInfo returned NO_AUTH`);
		  return response;
		}
		
		// Response bisa berupa string (plain text log) atau object
		if (typeof response === 'string') {
		  return response;
		}
		
		// Jika response adalah object, coba stringify untuk debug
		if (response && typeof response === 'object') {
		  // Jika ada field 'log' atau 'data', ambil nilainya
		  if (response.log && typeof response.log === 'string') {
			return response.log;
		  }
		  if (response.data && typeof response.data === 'string') {
			return response.data;
		  }
		  return JSON.stringify(response, null, 2);
		}
		
		return response;
	  } catch (error) {
		logger.error(`getLogInfo error: ${error.message}`);
		return null;
	  }
	}

	async clearLog(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 17,
		  method: 'POST'
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`clearLog error: ${error.message}`);
		throw error;
	  }
	}
	// LOG API

  async getLimiterMonitor(ip) {
    try {
      const response = await customRequest(ip, 'limiter_monitor');
      return response;
    } catch (error) {
      logger.error(`getLimiterMonitor error: ${error.message}`);
      return { traffic: [] };
    }
  }

  async setDataSwitch(ip, sessionId, enabled) {
    try {
      const dialMode = enabled ? "1" : "0";
      const response = await modemRequest(ip, {
        cmd: 222,
        method: 'POST',
        dialMode: dialMode
      }, sessionId);
      return response;
    } catch (error) {
      logger.error(`setDataSwitch error: ${error.message}`);
      throw error;
    }
  }

  async getTrafficInfo(ip, sessionId) {
    try {
      // Get traffic from device info (cmd 133)
      const deviceInfo = await this.getDeviceInfo(ip, sessionId);
      return {
        rx_bytes: deviceInfo.wan_rx_bytes || '0',
        tx_bytes: deviceInfo.wan_tx_bytes || '0',
        rx_packets: deviceInfo.wan_rx_packets || '0',
        tx_packets: deviceInfo.wan_tx_packets || '0'
      };
    } catch (error) {
      logger.error(`getTrafficInfo error: ${error.message}`);
      return { rx_bytes: '0', tx_bytes: '0', rx_packets: '0', tx_packets: '0' };
    }
  }

	// Get current active band from signal info
	async getCurrentBand(ip, sessionId) {
	  try {
		const [signal, device] = await Promise.all([
		  this.getSignal(ip, sessionId),
		  this.getDeviceInfo(ip, sessionId)
		]);
		
		const currentBand = signal.currentband;
		
		// Ambil nama operator dari PLMN
		const operatorName = getOperatorName(signal.PLMN, signal.network_operator);
		
		// ========== PERBAIKI: HAPUS semua logika bandwidth dari FREQ ==========
		// Langsung gunakan nilai bandwidth dari endpoint
		const bandwidth = signal.bandwidth || 'N/A';
		const bandwidthDisplay = bandwidth !== 'N/A' ? `${bandwidth} MHz` : 'N/A';
		
		// Frekuensi band untuk display
		const bandFreqs = {
		  1: '2100 MHz', 3: '1800 MHz', 5: '850 MHz',
		  8: '900 MHz', 40: '2300 MHz'
		};
		// ========== SAMPAI SINI ==========
		
		// Get cell_id dari berbagai sumber
		let cellId = signal.CELL_ID || device.CELL_ID || 'N/A';
		if (cellId === 'undefined' || cellId === 'null' || cellId === '') {
		  cellId = 'N/A';
		}
		
		return {
		  band: currentBand || 'N/A',
		  pci: signal.PCI || 'N/A',
		  earfcn: signal.FREQ || 'N/A',
		  cell_id: cellId,
		  signal_lvl: signal.signal_lvl || 'N/A',
		  rsrp: signal.RSRP || 'N/A',
		  rsrq: signal.RSRQ || 'N/A',
		  sinr: signal.SINR || 'N/A',
		  bandwidth: bandwidthDisplay,
		  bandwidth_mhz: bandFreqs[currentBand] || 'N/A',
		  network_type: signal.network_type_str || 'N/A',
		  operator: operatorName || 'N/A'
		};
	  } catch (error) {
		logger.error(`getCurrentBand error: ${error.message}`);
		return { 
		  band: 'N/A', pci: 'N/A', earfcn: 'N/A', cell_id: 'N/A',
		  signal_lvl: 'N/A', rsrp: 'N/A', rsrq: 'N/A', sinr: 'N/A',
		  bandwidth: 'N/A', bandwidth_mhz: 'N/A',
		  network_type: 'N/A', operator: 'N/A'
		};
	  }
	}
	
	// Wifi status
	async getWifiStatus(ip, sessionId) {
	  try {
		// Get WiFi 2.4GHz status
		const wifi24g = await modemRequest(ip, {
		  cmd: 2,
		  method: 'GET',
		  wifi_advance: 1,
		  subcmd: 0
		}, sessionId);
		
		// Get WiFi 5GHz status
		const wifi5g = await modemRequest(ip, {
		  cmd: 211,
		  method: 'GET',
		  wifi_advance: 1,
		  subcmd: 0
		}, sessionId);
		
		// Decode SSID dari Base64 dengan benar
		const decodeBase64 = (encoded) => {
		  if (!encoded || encoded === 'N/A') return 'N/A';
		  try {
			// Decode from base64
			const decoded = Buffer.from(encoded, 'base64').toString('utf8');
			return decoded;
		  } catch (e) {
			logger.error(`Failed to decode SSID: ${e.message}`);
			return encoded;
		  }
		};
		
		return {
		  wifi24g_enabled: wifi24g.wifiOpen === '1',
		  wifi24g_ssid: decodeBase64(wifi24g.ssid),
		  wifi24g_channel: wifi24g.channel === 'auto' ? 'Auto' : wifi24g.channel,
		  wifi24g_encryption: this.getEncryptionType(wifi24g.authenticationType),
		  broadcast_24g: wifi24g.broadcast === '1',
		  wifi24g_txpower: wifi24g.txPower || '100',
		  wifi24g_bandwidth: this.getBandwidthType(wifi24g.bandWidth),
		  
		  wifi5g_enabled: wifi5g.wifiOpen === '1',
		  wifi5g_ssid: decodeBase64(wifi5g.ssid),
		  wifi5g_channel: wifi5g.channel === 'auto' ? 'Auto' : wifi5g.channel,
		  wifi5g_encryption: this.getEncryptionType(wifi5g.authenticationType),
		  broadcast_5g: wifi5g.broadcast === '1',
		  wifi5g_txpower: wifi5g.txPower || '100',
		  wifi5g_bandwidth: this.getBandwidthType(wifi5g.bandWidth)
		};
	  } catch (error) {
		logger.error(`getWifiStatus error: ${error.message}`);
		return {
		  wifi24g_enabled: false,
		  wifi5g_enabled: false,
		  wifi24g_ssid: 'N/A',
		  wifi5g_ssid: 'N/A',
		  broadcast_24g: false,
		  broadcast_5g: false,
		  wifi24g_encryption: 'N/A',
		  wifi5g_encryption: 'N/A',
		  wifi24g_channel: 'Auto',
		  wifi5g_channel: 'Auto',
		  wifi24g_txpower: '100',
		  wifi5g_txpower: '100',
		  wifi24g_bandwidth: 'Auto',
		  wifi5g_bandwidth: 'Auto'
		};
	  }
	}

	getEncryptionType(authType) {
	  const types = {
		'0': '🔓 Open (No Encryption)',
		'1': '🔐 WEP',
		'2': '🔐 WPA-PSK',
		'3': '🔐 WPA2-PSK',
		'4': '🔐 WPA/WPA2 Mixed',
		'5': '🔐 WPA3'
	  };
	  return types[authType] || '🔐 WPA2-PSK';
	}

	getBandwidthType(bandwidth) {
	  const types = {
		'0': '20 MHz',
		'1': '40 MHz',
		'2': '20/40 MHz',
		'3': '80 MHz',
		'4': '20/40/80 MHz'
	  };
	  return types[bandwidth] || 'Auto';
	}

	async getIMEI(ip) {
	  try {
		const response = await customRequest(ip, 'read_imei');
		return response;
	  } catch (error) {
		logger.error(`getIMEI error: ${error.message}`);
		return { imei: 'N/A' };
	  }
	}

	async setIMEI(ip, newImei) {
	  try {
		const response = await customRequest(ip, 'set_imei', { imei: newImei });
		return response;
	  } catch (error) {
		logger.error(`setIMEI error: ${error.message}`);
		throw error;
	  }
	}	

	async getDeviceFullInfo(ip, sessionId) {
	  try {
		const [deviceInfo, sysInfo] = await Promise.all([
		  modemRequest(ip, {
			cmd: 207,
			method: 'GET'
		  }, sessionId),
		  this.getSysInfo(ip)
		]);
    
		// Ambil nama operator dari PLMN
		let operatorName = null;
		try {
		  const signal = await this.getSignal(ip, sessionId);
		  operatorName = getOperatorName(signal.PLMN);
		} catch (e) {
		  // Ignore
		}		
		
		return {
		  ...deviceInfo,
		  cpu: sysInfo.cpu || 'N/A',
		  temp: sysInfo.temp || 'N/A',
		  network_operator: operatorName
		};
	  } catch (error) {
		logger.error(`getDeviceFullInfo error: ${error.message}`);
		throw error;
	  }
	}

	async getNetworkUptime(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 104,
		  method: 'GET'
		}, sessionId);
		return response.uptime || '0';
	  } catch (error) {
		logger.error(`getNetworkUptime error: ${error.message}`);
		return '0';
	  }
	}

	async getCurrentBandwidth(ip, sessionId) {
	  try {
		const signal = await this.getSignal(ip, sessionId);
		const currentBand = signal.currentband;
		const freq = signal.FREQ;
		
		let bandwidth = signal.bandwidth || 'N/A';
		let bandwidthMHz = 'N/A';
		
		// Frekuensi band untuk display
		const bandFreqs = {
		  1: '2100 MHz',
		  3: '1800 MHz',
		  5: '850 MHz',
		  8: '900 MHz',
		  40: '2300 MHz'
		};
		
		return { 
		  bandwidth: bandwidth !== 'N/A' ? `${bandwidth} MHz` : 'N/A', 
		  bandwidth_mhz: bandFreqs[currentBand] || 'N/A', 
		  earfcn: signal.FREQ || 'N/A' 
		};
	  } catch (error) {
		logger.error(`getCurrentBandwidth error: ${error.message}`);
		return { bandwidth: 'N/A', bandwidth_mhz: 'N/A', earfcn: 'N/A' };
	  }
	}

	// Lock Cell methods
	async getLockCellInfo(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 160,
		  method: 'GET'
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`getLockCellInfo error: ${error.message}`);
		throw error;
	  }
	}

	async lockCell(ip, sessionId, freq, pci) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 160,
		  method: 'POST',
		  subcmd: 0,
		  lte_lock_sw: "1",
		  lte_lock_freq: freq,
		  lte_lock_pci: pci
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`lockCell error: ${error.message}`);
		throw error;
	  }
	}

	async unlockCell(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 160,
		  method: 'POST',
		  subcmd: 0,
		  lte_lock_sw: "0",
		  lte_lock_freq: "",
		  lte_lock_pci: ""
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`unlockCell error: ${error.message}`);
		throw error;
	  }
	}

	// WiFi Management methods
	async getWifi24gConfig(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 2,
		  method: 'GET',
		  subcmd: 0,
		  wifi_advance: 1
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`getWifi24gConfig error: ${error.message}`);
		throw error;
	  }
	}

	async getWifi5gConfig(ip, sessionId) {
	  try {
		const response = await modemRequest(ip, {
		  cmd: 211,
		  method: 'GET',
		  subcmd: 0,
		  wifi_advance: 1
		}, sessionId);
		return response;
	  } catch (error) {
		logger.error(`getWifi5gConfig error: ${error.message}`);
		throw error;
	  }
	}

	async setWifi24gConfig(ip, sessionId, config) {
	  try {
		const payload = {
		  cmd: 2,
		  method: 'POST',
		  subcmd: 0,
		  wifiOpen: config.wifiOpen ? '1' : '0',
		  broadcast: config.broadcast ? '1' : '0',
		  wifiwmm: config.wifiwmm ? '1' : '0',
		  ssid: Buffer.from(config.ssid).toString('base64'),
		  key: config.key,
		  wifi24g_maxNum_0: config.maxNum || '32',
		  authenticationType: config.authenticationType,
		  wifi_advance: 1
		};
		
		const response = await modemRequest(ip, payload, sessionId);
		return response;
	  } catch (error) {
		logger.error(`setWifi24gConfig error: ${error.message}`);
		throw error;
	  }
	}

	async setWifi5gConfig(ip, sessionId, config) {
	  try {
		const payload = {
		  cmd: 211,
		  method: 'POST',
		  subcmd: 0,
		  wifiOpen: config.wifiOpen ? '1' : '0',
		  broadcast: config.broadcast ? '1' : '0',
		  wifiwmm: config.wifiwmm ? '1' : '0',
		  ssid: Buffer.from(config.ssid).toString('base64'),
		  key: config.key,
		  wifi58g_maxNum_0: config.maxNum || '32',
		  authenticationType: config.authenticationType,
		  wifi_advance: 1
		};
		
		const response = await modemRequest(ip, payload, sessionId);
		return response;
	  } catch (error) {
		logger.error(`setWifi5gConfig error: ${error.message}`);
		throw error;
	  }
	}

	// Decode base64 SSID
	decodeBase64Ssid(encoded) {
	  try {
		return Buffer.from(encoded, 'base64').toString('utf8');
	  } catch (e) {
		return encoded;
	  }
	}	
	
}

module.exports = ModemAPI;
module.exports.getOperatorName = getOperatorName;
module.exports.plmnMap = plmnMap;