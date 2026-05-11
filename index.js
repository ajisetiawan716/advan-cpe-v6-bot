const { Telegraf } = require('telegraf');
const logger = require('./utils/logger');
const uci = require('./utils/uci');
const CommandHandlers = require('./handlers/commands');
const ActionHandlers = require('./handlers/actions');
const sessionManager = require('./sessions');
const ModemAuth = require('./modem/auth');
const { registerBotCommands } = require('./utils/commandRegistry');
const { setupMessages } = require('./handlers/messages');
	
class AdvanCPEBot {
  constructor() {
    this.bot = null;
    this.commands = null;
    this.actions = null;		
  }
  
// Di class AdvanCPEBot, tambahkan method:
async checkAuth(ctx) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  const text = ctx.message?.text || '';
  
  // Izinkan /start
  if (text === '/start') return true;
  
  try {
    const isAllowed = await uci.isUserAllowed(chatId);
    return isAllowed;
  } catch (error) {
    return true; // Error = izinkan
  }
}

  async init() {
	
    // Initialize UCI config
    await uci.initUciConfig();
    
    // Get bot token from UCI
    const botToken = await uci.getBotToken();
    
    if (!botToken) {
      logger.error('BOT_TOKEN not set in UCI config!');
      console.log('\n❌ BOT_TOKEN not set!');
      console.log('Please run: uci set advan_bot.main.bot_token="YOUR_BOT_TOKEN" && uci commit advan_bot\n');
      process.exit(1);
    }
    
    // Initialize bot
    this.bot = new Telegraf(botToken);

    // Register commands ke Telegram (SETELAH bot dibuat)
    try {
      await registerBotCommands(this.bot.telegram);
      logger.info('Bot commands registered successfully');
    } catch (err) {
      logger.error(`Failed to register commands: ${err.message}`);
    }
	
    this.commands = new CommandHandlers(this.bot);
    this.actions = new ActionHandlers(this.bot);
    this.actions.setCommands(this.commands);
    
    // ========== HANYA SETUP MIDDLEWARE DAN COMMANDS ==========
    // JANGAN PANGGIL setupMessages dulu, kita coba manual
    
    this.setupMiddleware();
    this.setupCommands();
    this.setupActions();
    this.setupTextInput();
    this.setupErrorHandling();
    
    // ========== TEMPATKAN HANDLER TEXT DI SINI (PALING AKHIR) ==========
    // Dan pastikan tidak ada filter yang memblokir
    /*
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const chatId = ctx.chat.id;
      
      // Log dengan emoji berbeda agar mudah dilihat
      console.log(`\n🔴🔴🔴 RAW TEXT RECEIVED: "${text}" from ${chatId}\n`);
      logger.info(`🔴🔴🔴 RAW TEXT: "${text}" from ${chatId}`);
      
      // Cek apakah itu tombol reply keyboard
      if (text === '📡 Monitor') {
        console.log(`🔴🔴🔴 MATCH! Showing monitor submenu`);
        const KeyboardBuilder = require('./utils/keyboardBuilder');
        await ctx.reply('📁 Monitor Menu:', KeyboardBuilder.getMonitorSubmenu());
        return;
      }
      
      // Coba tangani semua text
      await ctx.reply(`You said: "${text}"`);
    });
    */
    return this;
  }

  setupMiddleware() {
    // Log all updates - TAPI TIDAK BOLEH MEMBLOKIR
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const chatId = ctx.chat?.id || ctx.from?.id;
      const username = ctx.from?.username || ctx.from?.first_name;
      
      // Log semua update termasuk text
      console.log(`\n📢 UPDATE: type=${ctx.updateType}, text=${ctx.message?.text || 'no text'}`);
      logger.info(`[${chatId}] ${username}: ${ctx.message?.text || ctx.callbackQuery?.data || 'no text'}`);
      
      await next();
      
      const ms = Date.now() - start;
      if (ms > 1000) {
        logger.debug(`Slow response: ${ms}ms`);
      }
    });
    
	  // ========== AUTH UNTUK COMMAND (kecuali /start) ==========
	  this.bot.use(async (ctx, next) => {
		const chatId = ctx.chat?.id || ctx.from?.id;
		const text = ctx.message?.text || '';
		
		// Izinkan /start
		if (text === '/start') {
		  return next();
		}
		
		// Hanya cek untuk command (text yang diawali /)
		if (text.startsWith('/')) {
		  try {
			const isAllowed = await uci.isUserAllowed(chatId);
			
			if (!isAllowed) {
			  logger.warn(`Unauthorized command from ${chatId}: ${text}`);
			  await ctx.reply(
				'⛔ <b>ACCESS DENIED</b>\n\n' +
				'❌ You are not authorized to use this bot.\n\n' +
				'📌 Use /start to check access.',
				{ parse_mode: 'HTML' }
			  ).catch(() => {});
			  return; // STOP
			}
		  } catch (error) {
			logger.error(`Auth error: ${error.message}`);
			// Error = izinkan (fallback)
		  }
		}
		
		await next();
	  });
	  // ========== END AUTH COMMAND ==========
  }

  setupCommands() {
    // Public commands
    this.bot.command('start', (ctx) => this.commands.handleStart(ctx));
    this.bot.command('help', (ctx) => this.commands.handleHelp(ctx));
    
    // Auth commands
    this.bot.command('logout', (ctx) => this.commands.handleLogout(ctx));
    
    // Monitoring commands
    this.bot.command('signal', (ctx) => this.commands.handleSignal(ctx));
    this.bot.command('status', (ctx) => this.commands.handleStatus(ctx));
    this.bot.command('device', (ctx) => this.commands.handleDevice(ctx));
    this.bot.command('sysinfo', (ctx) => this.commands.handleSysInfo(ctx));
    this.bot.command('all', (ctx) => this.commands.handleAll(ctx));
    this.bot.command('traffic', (ctx) => this.commands.handleTraffic(ctx));
    this.bot.command('currentband', (ctx) => this.commands.handleCurrentBand(ctx));
    this.bot.command('clients', (ctx) => this.commands.handleClients(ctx));
    this.bot.command('log', (ctx) => this.commands.handleLog(ctx));
    
    // SMS commands
    this.bot.command('sms', (ctx) => this.commands.handleSMS(ctx));
    this.bot.command('send', (ctx) => this.commands.handleSendSMS(ctx));
    
    // Band commands
    this.bot.command('band', (ctx) => this.commands.handleBand(ctx));
    this.bot.command('lockband', (ctx) => this.commands.handleLockBand(ctx));
    
    // WiFi commands
    this.bot.command('wifi', (ctx) => this.commands.handleWifiDetail(ctx));
    this.bot.command('wifi_on', (ctx) => this.commands.handleWifiOn(ctx));
    this.bot.command('wifi_off', (ctx) => this.commands.handleWifiOff(ctx));
    this.bot.command('wifi24_on', (ctx) => this.commands.handleWifi24On(ctx));
    this.bot.command('wifi24_off', (ctx) => this.commands.handleWifi24Off(ctx));
    this.bot.command('wifi5_on', (ctx) => this.commands.handleWifi5On(ctx));
    this.bot.command('wifi5_off', (ctx) => this.commands.handleWifi5Off(ctx));
	this.bot.command('wifishare', (ctx) => this.commands.handleWifiShare(ctx));	
    
    // Network commands
    this.bot.command('data', (ctx) => this.commands.handleDataMenu(ctx));
    this.bot.command('dataon', (ctx) => this.commands.handleDataOn(ctx));
    this.bot.command('dataoff', (ctx) => this.commands.handleDataOff(ctx));
    this.bot.command('ttl', (ctx) => this.commands.handleTTLMenu(ctx));
    this.bot.command('ttlstatus', (ctx) => this.commands.handleTTLStatus(ctx));
    this.bot.command('setttl', (ctx) => this.commands.handleSetTTL(ctx));
    this.bot.command('resetttl', (ctx) => this.commands.handleResetTTL(ctx));

    // Lock cell commands
    this.bot.command('lockcell', (ctx) => this.commands.handleLockCell(ctx));
    
    // LED commands
    this.bot.command('led', (ctx) => this.commands.handleLEDMenu(ctx));
    this.bot.command('led_on', (ctx) => this.commands.handleLEDOn(ctx));
    this.bot.command('led_off', (ctx) => this.commands.handleLEDOff(ctx));
    this.bot.command('led_wifi_on', (ctx) => this.commands.handleLEDWifiOn(ctx));
    this.bot.command('led_wifi_off', (ctx) => this.commands.handleLEDWifiOff(ctx));
    this.bot.command('led_data_on', (ctx) => this.commands.handleLEDDataOn(ctx));
    this.bot.command('led_data_off', (ctx) => this.commands.handleLEDDataOff(ctx));
    this.bot.command('led_sig_on', (ctx) => this.commands.handleLEDSigOn(ctx));
    this.bot.command('led_sig_off', (ctx) => this.commands.handleLEDSigOff(ctx));
    this.bot.command('led_reset', (ctx) => this.commands.handleLEDReset(ctx));
    
    // System commands
    this.bot.command('reboot', (ctx) => this.commands.handleReboot(ctx));
    this.bot.command('imei', (ctx) => this.commands.handleIMEI(ctx));
    
    // Admin commands
    this.bot.command('config', (ctx) => this.commands.handleConfig(ctx));
    this.bot.command('setconfig', (ctx) => this.commands.handleSetConfig(ctx));
    this.bot.command('ping', (ctx) => this.commands.handlePing(ctx));
  }

  setupActions() {
  // ========== AUTH MIDDLEWARE UNTUK CALLBACK ==========
  this.bot.use(async (ctx, next) => {
    // Hanya proses callback_query
    if (ctx.updateType === 'callback_query') {
      const chatId = ctx.chat?.id || ctx.from?.id;
      
      const isAllowed = await uci.isUserAllowed(chatId);
      
      if (!isAllowed) {
        logger.warn(`Unauthorized callback from ${chatId}`);
        await ctx.answerCbQuery('⛔ Access Denied').catch(() => {});
        return; // STOP
      }
    }
    
    await next();
  });
  // ========== END AUTH CALLBACK ==========	  
    // Quick start...
    this.bot.action('quick_status', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_signal', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_device', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_sysinfo', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_sms', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_wifi', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_led', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('quick_data', (ctx) => this.actions.handleQuickCallback(ctx));
    this.bot.action('start_close', (ctx) => this.actions.handleQuickCallback(ctx));
    
    this.bot.action('reboot_confirm', (ctx) => this.actions.handleRebootConfirm(ctx));
    this.bot.action('reboot_cancel', (ctx) => this.actions.handleRebootCancel(ctx));
    this.bot.action('help_close', (ctx) => this.actions.handleHelpClose(ctx));

    // Device callbacks
    this.bot.action('device_refresh', (ctx) => this.actions.handleDeviceCallback(ctx));
    this.bot.action('device_close', (ctx) => this.actions.handleDeviceCallback(ctx));
    this.bot.action('device_back', (ctx) => this.actions.handleDeviceCallback(ctx));
    this.bot.action('device_processing', (ctx) => this.actions.handleDeviceCallback(ctx));
    
    // SMS navigation
    this.bot.action(/sms_page_\d+/, (ctx) => this.commands.handleSMSPageCallback(ctx));
    this.bot.action('sms_close', (ctx) => this.commands.handleSMSPageCallback(ctx));
    this.bot.action('sms_current', (ctx) => this.commands.handleSMSPageCallback(ctx));
    this.bot.action('sms_back_to_menu', (ctx) => this.commands.handleSMSPageCallback(ctx));

    // SMS actions
    this.bot.action('sms_view_inbox', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_send_new', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_refresh', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_clear_numbers', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_cancel', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_sep', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action('sms_processing', (ctx) => this.actions.handleSMSCallback(ctx));
	this.bot.action(/sms_delete_.+/, (ctx) => this.actions.handleSMSCallback(ctx));
	this.bot.action('sms_clear_inbox', (ctx) => this.actions.handleSMSCallback(ctx));
	this.bot.action('sms_clear_confirm', (ctx) => this.actions.handleSMSCallback(ctx));
    this.bot.action(/sms_send_saved_.+/, (ctx) => this.actions.handleSMSCallback(ctx));
    
    // IMEI
    this.bot.action('imei_change', (ctx) => this.actions.handleIMEICallback(ctx));
    this.bot.action('imei_cancel', (ctx) => this.actions.handleIMEICallback(ctx));
    this.bot.action('imei_close', (ctx) => this.actions.handleIMEICallback(ctx));
    this.bot.action('imei_back', (ctx) => this.actions.handleIMEICallback(ctx));
    
    // SYSINFO
    this.bot.action('sysinfo_live_start', (ctx) => this.actions.handleSysInfoCallback(ctx));
    this.bot.action('sysinfo_live_stop', (ctx) => this.actions.handleSysInfoCallback(ctx));
    this.bot.action('sysinfo_refresh', (ctx) => this.actions.handleSysInfoCallback(ctx));
    this.bot.action('sysinfo_close', (ctx) => this.actions.handleSysInfoCallback(ctx));
    
    // SIGNAL
    this.bot.action('signal_live_start', (ctx) => this.actions.handleSignalCallback(ctx));
    this.bot.action('signal_live_stop', (ctx) => this.actions.handleSignalCallback(ctx));
    this.bot.action('signal_refresh', (ctx) => this.actions.handleSignalCallback(ctx));
    this.bot.action('signal_close', (ctx) => this.actions.handleSignalCallback(ctx));
    
    // LED
    this.bot.action('led_all_toggle', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_wifi_toggle', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_data_toggle', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_sig_toggle', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_reset', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_refresh', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_back', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_close', (ctx) => this.actions.handleLEDCallback(ctx));
    this.bot.action('led_processing', (ctx) => this.actions.handleLEDCallback(ctx));
    
	// WIFI CALLBACKS
	this.bot.action('wifi_both_toggle', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24_toggle', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5_toggle', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_advanced', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_settings', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_settings', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_back_to_main', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_refresh', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_close', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_processing', (ctx) => this.actions.handleWifiCallback(ctx));

	// Edit callbacks
	this.bot.action('wifi_24g_edit_ssid', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_edit_password', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_edit_encryption', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_edit_ssid', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_edit_password', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_edit_encryption', (ctx) => this.actions.handleWifiCallback(ctx));

	// Encryption selection
	this.bot.action('wifi_24g_enc_0', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_enc_2', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_enc_3', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_enc_4', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_24g_enc_5', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_enc_0', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_enc_2', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_enc_3', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_enc_4', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_enc_5', (ctx) => this.actions.handleWifiCallback(ctx));

	// Toggle
	this.bot.action('wifi_24g_toggle', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_toggle', (ctx) => this.actions.handleWifiCallback(ctx));

    // Config
    this.bot.action('config_refresh', (ctx) => this.actions.handleConfigCallback(ctx));
    this.bot.action('config_close', (ctx) => this.actions.handleConfigCallback(ctx));
    this.bot.action('config_back', (ctx) => this.actions.handleConfigCallback(ctx));
    this.bot.action('config_processing', (ctx) => this.actions.handleConfigCallback(ctx));
	// Tambahkan callback untuk cancel
	this.bot.action('wifi_24g_cancel', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_5g_cancel', (ctx) => this.actions.handleWifiCallback(ctx));

	// callback untuk share WiFi
	this.bot.action('wifi_share', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_share_qr_24', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_share_qr_5', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_share_qr_both', (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action(/wifi_share_qr_refresh_.+/, (ctx) => this.actions.handleWifiCallback(ctx));
	this.bot.action('wifi_share_back', (ctx) => this.actions.handleWifiCallback(ctx));	
    
    // Band
    this.bot.action(/band_toggle_\d+/, (ctx) => this.actions.handleBandCallback(ctx));
    this.bot.action(/band_preset_.+/, (ctx) => this.actions.handleBandCallback(ctx));
    this.bot.action('band_refresh', (ctx) => this.actions.handleBandCallback(ctx));
    this.bot.action('band_close', (ctx) => this.actions.handleBandCallback(ctx));
    this.bot.action('band_sep', (ctx) => this.actions.handleBandCallback(ctx));
    this.bot.action('band_processing', (ctx) => this.actions.handleBandCallback(ctx));
    
    // Data
    this.bot.action('data_on', (ctx) => this.actions.handleDataCallback(ctx));
    this.bot.action('data_off', (ctx) => this.actions.handleDataCallback(ctx));
    this.bot.action('data_refresh_ip', (ctx) => this.actions.handleDataCallback(ctx));
    this.bot.action('data_refresh', (ctx) => this.actions.handleDataCallback(ctx));
    this.bot.action('data_close', (ctx) => this.actions.handleDataCallback(ctx));
    this.bot.action('data_processing', (ctx) => this.actions.handleDataCallback(ctx));

    // TTL
    this.bot.action(/ttl_set_\d+/, (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_custom', (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_reset', (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_refresh', (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_close', (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_cancel', (ctx) => this.actions.handleTTLCallback(ctx));
    this.bot.action('ttl_processing', (ctx) => this.actions.handleTTLCallback(ctx));

    // Lock Cell
    this.bot.action('lockcell_lock', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_unlock', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_refresh', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_close', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_processing', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_manual', (ctx) => this.actions.handleLockCellCallback(ctx));
    this.bot.action('lockcell_cancel', (ctx) => this.actions.handleLockCellCallback(ctx));

    // Log
    this.bot.action('log_view', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_clear', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_clear_confirm', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_cancel', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_back', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_close', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_processing', (ctx) => this.actions.handleLogCallback(ctx));
    this.bot.action('log_refresh', (ctx) => this.actions.handleLogCallback(ctx));
  }

	setupTextInput() {
	  this.bot.on('text', async (ctx) => {
		const chatId = ctx.chat.id;
		const text = ctx.message.text;

		// ========== AUTH CHECK ==========
		// Izinkan /start untuk semua
		if (text !== '/start') {
		  const isAllowed = await this.checkAuth(ctx);
		  
		  if (!isAllowed) {
			logger.warn(`Unauthorized access from ${chatId}: "${text}"`);
			await ctx.reply(
			  '⛔ <b>ACCESS DENIED</b>\n\n' +
			  '❌ You are not authorized to use this bot.\n\n' +
			  '📌 Your Chat ID: <code>' + chatId + '</code>\n\n' +
			  '💡 Please contact admin to get access.',
			  { parse_mode: 'HTML' }
			).catch(() => {});
			return;
		  }
		}
		// ========== END AUTH CHECK ==========
		
		const state = sessionManager.getState(chatId);
		
		console.log(`\n🟢 TEXT INPUT HANDLER: text="${text}", state=${state}`);
		logger.debug(`Text received: ${text}, state: ${state}`);

		// ========== HANDLE WIFI SSID INPUT ==========
		if (state === 'waiting_wifi_ssid') {
		  console.log('🟢 Processing WiFi SSID input...');
		  try {
			await this.commands.handleWifiSSIDInput(ctx, text);
		  } catch (err) {
			console.error(`Error in handleWifiSSIDInput: ${err.message}`);
			await this.autoDelete(ctx, `❌ Error: ${err.message}`, 30000);
		  }
		  return;
		}
		
		// ========== HANDLE WIFI PASSWORD INPUT ==========
		if (state === 'waiting_wifi_password') {
		  console.log('🟢 Processing WiFi password input...');
		  try {
			await this.commands.handleWifiPasswordInput(ctx, text);
		  } catch (err) {
			console.error(`Error in handleWifiPasswordInput: ${err.message}`);
			await this.autoDelete(ctx, `❌ Error: ${err.message}`, 30000);
		  }
		  return;
		}

		// Handle lockcell manual input
		if (state === 'waiting_lockcell') {
		  if (text === '/cancel') {
			await this.commands.handleLockCellCancel(ctx);
		  } else {
			await this.commands.handleLockCellManualInput(ctx, text);
		  }
		  return;
		}

		// Handle cancel command
		if (text === '/cancel') {
		  if (state === 'waiting_sms') {
			await this.commands.handleSMSCancel(ctx);
		  } else {
			const msg = await ctx.reply('No active operation to cancel.');
			setTimeout(() => {
			  ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
			}, 2000);
		  }
		  return;
		}
		
		// Handle SMS input
		if (state === 'waiting_sms') {
		  const handled = await this.commands.handleSMSUserInput(ctx, text);
		  if (handled) return;
		}
		
		// Handle IMEI input
		if (state === 'waiting_imei') {
		  await this.commands.handleIMEISet(ctx, text);
		  return;
		}
		
		// Handle TTL input
		if (state === 'waiting_ttl') {
		  await this.commands.handleTTLSetCustom(ctx, text);
		  return;
		}	  
		
		// Jika tidak dalam state waiting, dan bukan command, coba handle reply keyboard
		if (!text.startsWith('/')) {
		  console.log(`🟢 No state, processing as reply keyboard: "${text}"`);
		  const KeyboardBuilder = require('./utils/keyboardBuilder');
		  
		  // Handle Back to Main Menu
		  if (text === '🔙 Back to Main Menu') {
			await ctx.reply('Returning to main menu...', KeyboardBuilder.getMainMenuKeyboard());
			return;
		  }
		  
		  // Handle Close Keyboard
		  if (text === '❌ Close Keyboard') {
			await ctx.reply('Keyboard closed. Type /start to show again.', KeyboardBuilder.getCloseKeyboard());
			return;
		  }
		  
		  // Handle submenu navigation
		  const submenu = KeyboardBuilder.getSubmenuForKey(text);
		  if (submenu) {
			await ctx.reply(`📁 ${text} Menu:`, submenu);
			return;
		  }
		  
		  // Handle command mapping
		  const command = KeyboardBuilder.menuCommandMap[text];
		  if (command) {
			console.log(`🟢 Executing command: ${command}`);
			
			// Buat fake context
			const fakeCtx = {
			  ...ctx,
			  chat: { id: ctx.chat.id },
			  from: { 
				id: ctx.from.id, 
				username: ctx.from.username, 
				first_name: ctx.from.first_name 
			  },
			  message: { 
				...ctx.message,
				text: command,
				chat: { id: ctx.chat.id },
				from: { id: ctx.from.id }
			  },
			  reply: ctx.reply.bind(ctx),
			  deleteMessage: ctx.deleteMessage.bind(ctx),
			  telegram: ctx.telegram
			};

			
			// Dispatch berdasarkan command
			switch(command) {
			  // SMS khusus
			  case '/sms_view_inbox':
				await this.commands.handleSMSViewInbox(fakeCtx);
				break;
			  case '/sms_send_new':
				await this.commands.handleSMSSendNew(fakeCtx);
				break;
			  case '/sms_clear_inbox':
				await this.commands.handleSMSClearInbox(fakeCtx);
				break;
			  case '/sms_saved':
				await fakeCtx.reply('📋 Saved numbers are managed automatically. Use /sms to view and send SMS.');
				break;
			  case '/sms_clear_numbers':
				await this.commands.handleSMSClearNumbers(fakeCtx);
				break;
				
			  // Lock Cell khusus
			  case '/lockcell_lock':
				await this.commands.handleLockCellFromReplyKeyboard(fakeCtx, 'lock');
				break;
			  case '/lockcell_unlock':
				await this.commands.handleLockCellFromReplyKeyboard(fakeCtx, 'unlock');
				break;
			  case '/lockcell_manual':
				await this.commands.handleLockCellManual(fakeCtx);
				break;
			  case '/lockcell_status':
				await this.commands.handleLockCell(fakeCtx);
				break;
				
			  // Log khusus
			  case '/log_view':
				await this.commands.handleLogView(fakeCtx);
				break;
			  case '/log_clear':
				await this.commands.handleLogClear(fakeCtx);
				break;
				
			  // Traffic khusus
			  case '/traffic_refresh':
			  case '/traffic':
				await this.commands.handleTraffic(fakeCtx);
				break;
				
			  // Default
			  default:
				await this.dispatchCommand(command, fakeCtx);
			}
			return;
		  }
		  
		  // Default untuk unknown text
		  await ctx.reply(`❓ Unknown: "${text}"\n\nType /help to see available commands.`);
		  return;
		}
	  });
	}

	// Tambahkan method dispatchCommand
	async dispatchCommand(command, fakeCtx) {

	  // Handle lockband dengan parameter
	  if (command.startsWith('/lockband')) {
		// Ekstrak parameter jika ada
		const parts = command.split(' ');
		if (parts.length > 1) {
		  // Ada parameter, misal: /lockband 1,3 atau /lockband auto
		  const bandArg = parts[1];
		  const lockbandCtx = {
			...fakeCtx,
			message: { ...fakeCtx.message, text: `/lockband ${bandArg}` }
		  };
		  await this.commands.handleLockBand(lockbandCtx);
		} else {
		  // Tidak ada parameter
		  await this.commands.handleLockBand(fakeCtx);
		}
		return;
	  }
	  
	  // Handle setttl dengan parameter
	  if (command.startsWith('/setttl')) {
		const parts = command.split(' ');
		if (parts.length > 1) {
		  const ttlValue = parts[1];
		  const ttlCtx = {
			...fakeCtx,
			message: { ...fakeCtx.message, text: `/setttl ${ttlValue}` }
		  };
		  await this.commands.handleSetTTL(ttlCtx);
		} else {
		  await this.commands.handleSetTTL(fakeCtx);
		}
		return;
	  }
		
	  const cmdHandlers = {
		'/signal': () => this.commands.handleSignal(fakeCtx),
		'/status': () => this.commands.handleStatus(fakeCtx),
		'/device': () => this.commands.handleDevice(fakeCtx),
		'/sysinfo': () => this.commands.handleSysInfo(fakeCtx),
		'/all': () => this.commands.handleAll(fakeCtx),
		'/band': () => this.commands.handleBand(fakeCtx),
		'/wifi': () => this.commands.handleWifiDetail(fakeCtx),
		'/led': () => this.commands.handleLEDMenu(fakeCtx),
		'/data': () => this.commands.handleDataMenu(fakeCtx),
		'/ttl': () => this.commands.handleTTLMenu(fakeCtx),
		'/lockcell': () => this.commands.handleLockCell(fakeCtx),
		'/log': () => this.commands.handleLog(fakeCtx),
		'/config': () => this.commands.handleConfig(fakeCtx),
		'/setconfig': () => this.commands.handleSetConfig(fakeCtx),
		'/ping': () => this.commands.handlePing(fakeCtx),
		'/imei': () => this.commands.handleIMEI(fakeCtx),
		'/reboot': () => this.commands.handleReboot(fakeCtx),
		'/logout': () => this.commands.handleLogout(fakeCtx),
		'/help': () => this.commands.handleHelp(fakeCtx),
		'/currentband': () => this.commands.handleCurrentBand(fakeCtx),
		'/clients': () => this.commands.handleClients(fakeCtx),
		'/wifi_on': () => this.commands.handleWifiOn(fakeCtx),
		'/wifi_off': () => this.commands.handleWifiOff(fakeCtx),
		'/wifi24_on': () => this.commands.handleWifi24On(fakeCtx),
		'/wifi24_off': () => this.commands.handleWifi24Off(fakeCtx),
		'/wifi5_on': () => this.commands.handleWifi5On(fakeCtx),
		'/wifi5_off': () => this.commands.handleWifi5Off(fakeCtx),
		'/wifi_toggle': () => this.commands.handleWifiToggle(fakeCtx),
		'/led_on': () => this.commands.handleLEDOn(fakeCtx),
		'/led_off': () => this.commands.handleLEDOff(fakeCtx),
		'/led_reset': () => this.commands.handleLEDReset(fakeCtx),
		// ========== LED COMMANDS (PER INDIVIDU) ==========
		'/led_wifi_on': () => this.commands.handleLEDWifiOn(fakeCtx),
		'/led_wifi_off': () => this.commands.handleLEDWifiOff(fakeCtx),
		'/led_data_on': () => this.commands.handleLEDDataOn(fakeCtx),
		'/led_data_off': () => this.commands.handleLEDDataOff(fakeCtx),
		'/led_sig_on': () => this.commands.handleLEDSigOn(fakeCtx),
		'/led_sig_off': () => this.commands.handleLEDSigOff(fakeCtx),
				
		'/dataon': () => this.commands.handleDataOn(fakeCtx),
		'/dataoff': () => this.commands.handleDataOff(fakeCtx),
		'/ttlstatus': () => this.commands.handleTTLStatus(fakeCtx),
		'/setttl': () => this.commands.handleSetTTL(fakeCtx),
		'/resetttl': () => this.commands.handleResetTTL(fakeCtx),
		'/sms': () => this.commands.handleSMS(fakeCtx),
		'/send': () => this.commands.handleSendSMS(fakeCtx),
		'/lockband': () => this.commands.handleLockBand(fakeCtx)
	  };
	  
	  const handler = cmdHandlers[command];
	  if (handler) {
		await handler();
	  } else {
		await fakeCtx.reply(`⚠️ Command not implemented: ${command}`);
	  }
	}

  setupErrorHandling() {
    this.bot.catch((err, ctx) => {
      logger.error(`Bot error: ${err.message}`);
      console.error(`Bot error: ${err.message}`);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled Rejection: ${reason}`);
    });
    
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught Exception: ${error.message}`);
    });
  }

  async start() {
    await this.init();
    
    await this.bot.launch();
    logger.info('🤖 Advan CPE V6 Bot started!');
    
    process.once('SIGINT', () => {
      logger.info('SIGINT received, stopping bot...');
      this.bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      logger.info('SIGTERM received, stopping bot...');
      this.bot.stop('SIGTERM');
    });
  }
}

const bot = new AdvanCPEBot();
bot.start().catch(err => {
  logger.error(`Failed to start bot: ${err.message}`);
});