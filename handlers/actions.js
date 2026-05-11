const ModemAuth = require('../modem/auth');
const ModemAPI = require('../modem/api');
const logger = require('../utils/logger');
const uci = require('../utils/uci');

const modemAPI = new ModemAPI(ModemAuth);

class ActionHandlers {
  constructor(bot) {
    this.bot = bot;
	this.commands = null;
  }
	// /start quick commands
	async handleQuickCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan welcome (pesan /start) terlebih dahulu
	  try {
		await ctx.deleteMessage();
		logger.debug(`Deleted welcome message for chat ${chatId}`);
	  } catch (e) {
		logger.debug(`Failed to delete welcome message: ${e.message}`);
	  }
	  
	  switch(data) {
		case 'quick_status':
		  await this.commands.handleStatus(ctx);
		  break;
		case 'quick_signal':
		  await this.commands.handleSignal(ctx);
		  break;
		case 'quick_device':
		  await this.commands.handleDevice(ctx);
		  break;
		case 'quick_sysinfo':
		  await this.commands.handleSysInfo(ctx);
		  break;
		case 'quick_sms':
		  await this.commands.handleSMS(ctx);
		  break;
		case 'quick_wifi':
		  await this.commands.handleWifiDetail(ctx);
		  break;
		case 'quick_led':
		  await this.commands.handleLEDMenu(ctx);
		  break;
		case 'quick_data':
		  await this.commands.handleDataMenu(ctx);
		  break;
		case 'start_close':
		  // Just close, no need to call any command
		  await ctx.answerCbQuery('Closed');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	} 
 
 // change imei action helper
  setCommands(commands) {
    this.commands = commands;
  }
		// callback help close
	async handleHelpClose(ctx) {
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore if already deleted
	  }
	  await ctx.answerCbQuery('Closed');
	}
	
	// IMEI CALLBACK
	async handleIMEICallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'imei_change':
		  await this.commands.handleIMEIChange(ctx);
		  break;
		case 'imei_cancel':
		  await this.commands.handleIMEICancel(ctx);
		  break;
		case 'imei_close':
		  await this.commands.handleIMEIClose(ctx);
		  break;
		case 'imei_back':
		  await this.commands.handleIMEIBack(ctx);
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	} 

  async handleRebootConfirm(ctx) {
    const chatId = ctx.callbackQuery.from.id;
    
    try {
      const sessionId = await ModemAuth.ensureSession(chatId);
      const modemIp = ModemAuth.getModemIp(chatId);
      
      await ctx.answerCbQuery('Rebooting modem...');
      await ctx.editMessageText('🔄 Reboot initiated... Modem will restart shortly.\n\n⏱️ Please wait 2-3 minutes for modem to come back online.');
      
      // Send reboot command (don't wait for response as modem will reboot)
      try {
        await modemAPI.reboot(modemIp, sessionId);
      } catch (rebootError) {
        // Ignore error because modem reboots and connection drops
        logger.info(`Reboot command sent (expected disconnect): ${rebootError.message}`);
      }
      
      logger.info(`Modem reboot triggered by user ${chatId}`);
      
      // Clear session immediately
      ModemAuth.clearSession(chatId);
      
      // Notify user after delay
      setTimeout(async () => {
        try {
          await ctx.reply('✅ Modem reboot command sent successfully!\n\n📡 Modem is restarting. Please wait 2-3 minutes before using other commands.\n\n🔄 New session will be created automatically when you use any command.');
        } catch (e) {
          logger.error(`Failed to send reboot confirmation: ${e.message}`);
        }
      }, 2000);
      
    } catch (error) {
      logger.error(`Reboot error: ${error.message}`);
      await ctx.reply(`❌ Failed to reboot: ${error.message}\n\nYou can try manually rebooting via web interface.`);
    }
  }

  async handleRebootCancel(ctx) {
    await ctx.answerCbQuery('Reboot cancelled');
    await ctx.editMessageText('✅ Reboot cancelled.');
  }
	
	// /SYSINFO CALLBACK
	async handleSysInfoCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'sysinfo_live_start':
		  await this.commands.startSysInfoLive(ctx);
		  break;
		case 'sysinfo_live_stop':
		  await this.commands.stopSysInfoLive(ctx);
		  break;
		case 'sysinfo_refresh':
		  await this.commands.refreshSysInfo(ctx);
		  break;
		case 'sysinfo_close':
		  await this.commands.closeSysInfo(ctx);
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// /SIGNAL CALLBACK
	async handleSignalCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'signal_live_start':
		  await this.commands.startSignalLive(ctx);
		  break;
		case 'signal_live_stop':
		  await this.commands.stopSignalLive(ctx);
		  break;
		case 'signal_refresh':
		  await this.commands.refreshSignal(ctx);
		  break;
		case 'signal_close':
		  await this.commands.closeSignal(ctx);
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// LED CALLBACK
	async handleLEDCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'led_all_toggle':
		  await this.commands.handleLEDToggleFromMenu(ctx, 'all');
		  break;
		case 'led_wifi_toggle':
		  await this.commands.handleLEDToggleFromMenu(ctx, 'wifi');
		  break;
		case 'led_data_toggle':
		  await this.commands.handleLEDToggleFromMenu(ctx, 'data');
		  break;
		case 'led_sig_toggle':
		  await this.commands.handleLEDToggleFromMenu(ctx, 'sig');
		  break;
		case 'led_reset':
		  await this.commands.handleLEDResetFromMenu(ctx);
		  break;
		case 'led_refresh':
		  await this.commands.handleLEDRefresh(ctx);
		  break;
		case 'led_back':
		  await this.commands.handleLEDBack(ctx);
		  break;
		case 'led_close':
		  await this.commands.handleLEDClose(ctx);
		  break;
		case 'led_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// WIFI CALLBACK
	async handleWifiCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		// Main menu
		case 'wifi_both_toggle': await this.commands.handleWifiBothToggle(ctx); break;
		case 'wifi_24_toggle': await this.commands.handleWifi24gToggle(ctx); break;
		case 'wifi_5_toggle': await this.commands.handleWifi5gToggle(ctx); break;
		case 'wifi_advanced': await this.commands.handleWifiAdvanced(ctx); break;
		case 'wifi_back_to_main': await this.commands.handleWifiBackToMain(ctx); break;
		case 'wifi_refresh': await this.commands.handleWifiRefresh(ctx); break;
		case 'wifi_close': await this.commands.handleWifiClose(ctx); break;
		
		// 2.4GHz settings
		case 'wifi_24g_settings': await this.commands.handleWifi24gSettings(ctx); break;
		case 'wifi_24g_edit_ssid': await this.commands.handleWifi24gEditSsid(ctx); break;
		case 'wifi_24g_edit_password': await this.commands.handleWifi24gEditPassword(ctx); break;
		case 'wifi_24g_edit_encryption': await this.commands.handleWifi24gEditEncryption(ctx); break;
		case 'wifi_24g_toggle': await this.commands.handleWifi24gToggle(ctx); break;
		case 'wifi_24g_cancel': await this.commands.handleWifiCancel(ctx, '2.4'); break;
		
		// 5GHz settings
		case 'wifi_5g_settings': await this.commands.handleWifi5gSettings(ctx); break;
		case 'wifi_5g_edit_ssid': await this.commands.handleWifi5gEditSsid(ctx); break;
		case 'wifi_5g_edit_password': await this.commands.handleWifi5gEditPassword(ctx); break;
		case 'wifi_5g_edit_encryption': await this.commands.handleWifi5gEditEncryption(ctx); break;
		case 'wifi_5g_toggle': await this.commands.handleWifi5gToggle(ctx); break;
		case 'wifi_5g_cancel': await this.commands.handleWifi5gCancel(ctx);
		
		// Encryption selection
		case 'wifi_24g_enc_0': await this.commands.handleWifi24gSetEncryption(ctx, '0'); break;
		case 'wifi_24g_enc_2': await this.commands.handleWifi24gSetEncryption(ctx, '2'); break;
		case 'wifi_24g_enc_3': await this.commands.handleWifi24gSetEncryption(ctx, '3'); break;
		case 'wifi_24g_enc_4': await this.commands.handleWifi24gSetEncryption(ctx, '4'); break;
		case 'wifi_24g_enc_5': await this.commands.handleWifi24gSetEncryption(ctx, '5'); break;
		case 'wifi_5g_enc_0': await this.commands.handleWifi5gSetEncryption(ctx, '0'); break;
		case 'wifi_5g_enc_2': await this.commands.handleWifi5gSetEncryption(ctx, '2'); break;
		case 'wifi_5g_enc_3': await this.commands.handleWifi5gSetEncryption(ctx, '3'); break;
		case 'wifi_5g_enc_4': await this.commands.handleWifi5gSetEncryption(ctx, '4'); break;
		case 'wifi_5g_enc_5': await this.commands.handleWifi5gSetEncryption(ctx, '5'); break;
		
		case 'wifi_processing': await ctx.answerCbQuery('Please wait...'); break;
		case 'wifi_share':
		  await this.commands.handleWifiShare(ctx);
		  break;
		case 'wifi_share_qr_24':
		  await this.commands.handleWifiShareQr(ctx, '24');
		  break;
		case 'wifi_share_qr_5':
		  await this.commands.handleWifiShareQr(ctx, '5');
		  break;
		case 'wifi_share_qr_both':
		  await this.commands.handleWifiShareQr(ctx, 'both');
		  break;
		case 'wifi_share_qr_refresh_24':
		  await this.commands.handleWifiShareQrRefresh(ctx, '24');
		  break;
		case 'wifi_share_qr_refresh_5':
		  await this.commands.handleWifiShareQrRefresh(ctx, '5');
		  break;
		case 'wifi_share_qr_refresh_both':
		  await this.commands.handleWifiShareQrRefresh(ctx, 'both');
		  break;
		case 'wifi_share_back':
		  await this.commands.handleWifiShareBack(ctx);
		  break;		
		default: await ctx.answerCbQuery();
	  }
	}
	
	// CONFIG CALLBACK
	async handleConfigCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'config_refresh':
		  await this.commands.handleConfigRefresh(ctx);
		  break;
		case 'config_close':
		  await this.commands.handleConfigClose(ctx);
		  break;
		case 'config_back':
		  await this.commands.handleConfigBack(ctx);
		  break;
		case 'config_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// BAND CALLBACK
	async handleBandCallback(ctx) {
	  const data = ctx.callbackQuery.data;
		  
	  logger.debug(`Band callback received: ${data}`);
	  
	  if (data.startsWith('band_toggle_')) {
		const bandNumber = parseInt(data.split('_')[2]);
		await this.commands.handleBandToggle(ctx, bandNumber);
	  } else if (data.startsWith('band_preset_')) {
		const mask = data.replace('band_preset_', '');
		await this.commands.handleBandPreset(ctx, mask);
	  } else if (data === 'band_refresh') {
		await this.commands.handleBandRefresh(ctx);
	  } else if (data === 'band_close') {
		await this.commands.handleBandClose(ctx);
	  } else if (data === 'band_sep') {
		await this.commands.handleBandSep(ctx);
	  } else if (data === 'band_processing') {
		await ctx.answerCbQuery('Please wait...');
	  } else {
		await ctx.answerCbQuery();
	  }
	}
	
	// DATA CALLBACK
	async handleDataCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'data_on':
		  await this.commands.handleDataOnFromMenu(ctx);
		  break;
		case 'data_off':
		  await this.commands.handleDataOffFromMenu(ctx);
		  break;
		case 'data_refresh_ip':
		  await this.commands.handleDataRefreshIP(ctx);
		  break;
		case 'data_refresh':
		  await this.commands.handleDataRefresh(ctx);
		  break;
		case 'data_close':
		  await this.commands.handleDataClose(ctx);
		  break;
		case 'data_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// TTL CALLBACK
	async handleTTLCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  if (data.startsWith('ttl_set_')) {
		const ttlValue = parseInt(data.split('_')[2]);
		await this.commands.handleTTLSetPreset(ctx, ttlValue);
	  } else if (data === 'ttl_custom') {
		await this.commands.handleTTLCustom(ctx);
	  } else if (data === 'ttl_reset') {
		await this.commands.handleTTLReset(ctx);
	  } else if (data === 'ttl_refresh') {
		await this.commands.handleTTLRefresh(ctx);
	  } else if (data === 'ttl_close') {
		await this.commands.handleTTLClose(ctx);
	  } else if (data === 'ttl_cancel') {
		await this.commands.handleTTLCancel(ctx);
	  } else if (data === 'ttl_processing') {
		await ctx.answerCbQuery('Please wait...');
	  } else {
		await ctx.answerCbQuery();
	  }
	}
	
	// SMS CALLBACK
	async handleSMSCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  // Navigasi halaman SMS
	  if (data === 'sms_close' || data === 'sms_current' || data.startsWith('sms_page_')) {
		if (this.commands && this.commands.handleSMSPageCallback) {
		  await this.commands.handleSMSPageCallback(ctx);
		}
		return;
	  }
	  
	  // Handle delete SMS per ID (format: sms_delete_<id>)
	  if (data.startsWith('sms_delete_')) {
		const smsId = data.replace('sms_delete_', '');
		await this.commands.handleSMSDelete(ctx, smsId);
		return;
	  }
	  
	  // Handle actions
	  switch(data) {
		case 'sms_view_inbox':
		  await this.commands.handleSMSViewInbox(ctx);
		  break;
		case 'sms_back_to_menu':
		  await this.commands.handleSMSBackToMenu(ctx);
		  break;
		case 'sms_send_new':
		  await this.commands.handleSMSSendNew(ctx);
		  break;
		case 'sms_refresh':
		  await this.commands.handleSMSRefresh(ctx);
		  break;
		case 'sms_clear_numbers':
		  await this.commands.handleSMSClearNumbers(ctx);
		  break;
		case 'sms_cancel':
		  await this.commands.handleSMSCancel(ctx);
		  break;
		// ========== FITUR BARU ==========
		case 'sms_clear_inbox':
		  await this.commands.handleSMSClearInbox(ctx);
		  break;
		case 'sms_clear_confirm':
		  await this.commands.handleSMSClearInboxConfirm(ctx);
		  break;
		// ========== END FITUR BARU ==========
		case 'sms_sep':
		  await ctx.answerCbQuery();
		  break;
		case 'sms_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  if (data.startsWith('sms_send_saved_')) {
			const phoneNumber = data.replace('sms_send_saved_', '');
			await this.commands.handleSMSSendSaved(ctx, phoneNumber);
		  } else if (data.startsWith('sms_delete_')) {
			// Fallback untuk delete (seharusnya sudah ditangani di atas)
			const smsId = data.replace('sms_delete_', '');
			await this.commands.handleSMSDelete(ctx, smsId);
		  } else {
			await ctx.answerCbQuery();
		  }
	  }
	}
	
	// LOCK CELL CALLBACK
	async handleLockCellCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'lockcell_lock':
		  await this.commands.handleLockCellAction(ctx, 'lock');
		  break;
		case 'lockcell_unlock':
		  await this.commands.handleLockCellAction(ctx, 'unlock');
		  break;
		case 'lockcell_manual':
		  await this.commands.handleLockCellManual(ctx);
		  break;
		case 'lockcell_refresh':
		  await this.commands.handleLockCellRefresh(ctx);
		  break;
		case 'lockcell_close':
		  await this.commands.handleLockCellClose(ctx);
		  break;
		case 'lockcell_cancel':
		  await this.commands.handleLockCellCancel(ctx);
		  break;
		case 'lockcell_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}
	
	// LOG CALLBACK
	async handleLogCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'log_view':
		  await this.commands.handleLogView(ctx);
		  break;
		case 'log_clear':
		  await this.commands.handleLogClear(ctx);
		  break;
		case 'log_clear_confirm':
		  await this.commands.handleLogClearConfirm(ctx);
		  break;
		case 'log_cancel':
		  await this.commands.handleLogCancel(ctx);
		  break;
		case 'log_back':
		  await this.commands.handleLogBack(ctx);
		  break;
		case 'log_refresh':
		  await this.commands.handleLogRefresh(ctx);
		  break;
		case 'log_close':
		  await this.commands.handleLogClose(ctx);
		  break;
		case 'log_processing':
		  await ctx.answerCbQuery('Please wait...');
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}

	// Device callback
	async handleDeviceCallback(ctx) {
	  const data = ctx.callbackQuery.data;
	  
	  switch(data) {
		case 'device_refresh':
		  await this.commands.handleDeviceRefresh(ctx);
		  break;
		case 'device_close':
		  await this.commands.handleDeviceClose(ctx);
		  break;
		case 'device_back':
		  await this.commands.handleDeviceBack(ctx);
		  break;
		case 'device_processing':
		  await this.commands.handleDeviceProcessing(ctx);
		  break;
		default:
		  await ctx.answerCbQuery();
	  }
	}	
 
}

module.exports = ActionHandlers;