const ModemAuth = require('../modem/auth');
const ModemAPI = require('../modem/api');
const Formatter = require('../utils/formatter');
const logger = require('../utils/logger');
const uci = require('../utils/uci');
const sessionManager = require('../sessions');
const { modemRequest } = require('../modem/client');
const savedNumbersDB = require('../utils/savedNumbers');
const KeyboardBuilder = require('../utils/keyboardBuilder');

const modemAPI = new ModemAPI(ModemAuth);

// Store SMS data per user for pagination
const smsCache = new Map();

// Store interval IDs for each chat for update realtime
const liveUpdates = new Map();
const signalLiveUpdates = new Map();

// Store band menu data
const bandMenuData = new Map();

// Store data menu state
const dataMenuData = new Map();

// Store TTL menu state
const ttlMenuData = new Map();

// Store saved phone numbers per user (in memory, bisa diganti dengan database)
// const savedNumbers = new Map();

// Store lockcell menu data
const lockcellMenuData = new Map();

// Store log menu data
const logMenuData = new Map();

// Store wifi data in memory (persistent for the session)
const wifiDataStore = new Map();

// Load QRCode module
const QRCode = require('qrcode');

class CommandHandlers {
  constructor(bot) {
    this.bot = bot;
  }
  
	// Helper method untuk menghapus pesan user
	async deleteUserMessage(ctx, delay = 500) {
	  try {
		// Tunggu sebentar sebelum menghapus
		setTimeout(async () => {
		  try {
			if (ctx.chat && ctx.message) {
			  await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
			  logger.debug(`Deleted user message: ${ctx.message.message_id}`);
			} else if (ctx.update && ctx.update.message) {
			  await ctx.telegram.deleteMessage(ctx.update.message.chat.id, ctx.update.message.message_id);
			  logger.debug(`Deleted user message from update: ${ctx.update.message.message_id}`);
			}
		  } catch (e) {
			// Ignore if message already deleted
			logger.debug(`Failed to delete user message: ${e.message}`);
		  }
		}, delay);
	  } catch (e) {
		logger.debug(`Delete user message error: ${e.message}`);
	  }
	}

	// Helper method untuk menghapus bot message setelah beberapa detik
	async deleteBotMessage(ctx, messageId, delay = 5000) {
	  try {
		setTimeout(async () => {
		  try {
			await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
		  } catch (e) {
			// Ignore
		  }
		}, delay);
	  } catch (e) {
		// Ignore
	  }
	}

	// Helper untuk auto delete message setelah delay tertentu
	async autoDelete(ctx, message, delay = 30000) {
	  try {
		const sentMsg = await ctx.reply(message, { parse_mode: 'HTML' });
		setTimeout(async () => {
		  try {
			await ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id);
		  } catch (e) {}
		}, delay);
		return sentMsg;
	  } catch (e) {
		return null;
	  }
	}

	async autoEditDelete(ctx, message, replyMarkup = null, delay = 30000) {
	  try {
		await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: replyMarkup });
		setTimeout(async () => {
		  try {
			await ctx.deleteMessage();
		  } catch (e) {
			// Ignore
		  }
		}, delay);
	  } catch (e) {
		// Ignore
	  }
	}	
	
	// /start commands
	async handleStart(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const { registerBotCommands, EXPECTED_COMMAND_COUNT } = require('../utils/commandRegistry');
	  const KeyboardBuilder = require('../utils/keyboardBuilder');
	  const messageId = ctx.message?.message_id;
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Register all commands to bot
	  const registerSuccess = await registerBotCommands(ctx.telegram);
	  
	  if (registerSuccess) {
		logger.info(`Commands registered successfully for chat ${chatId}`);
	  } else {
		logger.warn(`Failed to register commands for chat ${chatId}`);
	  }
	  
	  // Cek apakah user sudah terdaftar
	  const isAllowed = await uci.isUserAllowed(chatId);
	  
	  if (!isAllowed) {
		  // User tidak terdaftar - tolak akses
		  await ctx.reply(
			'⛔ <b>ACCESS DENIED</b>\n\n' +
			'❌ You are not authorized to use this bot.\n\n' +
			'📌 Your Chat ID: <code>' + chatId + '</code>\n\n' +
			'💡 Please contact admin to add you to allowed_users.',
			{ parse_mode: 'HTML' }
		  );
		  return; // STOP - jangan lanjutkan
	  }
	  
	  // Get bot info
	  let botName = 'Advan CPE V6 Bot';
	  try {
		const botInfo = await ctx.telegram.getMe();
		botName = botInfo.first_name || botName;
	  } catch (e) {
		// Use default
	  }
	  
	  // Get registered commands count
	  let cmdCount = 0;
	  try {
		const commands = await ctx.telegram.getMyCommands();
		cmdCount = commands.length;
	  } catch (e) {}
	  
	  // Auto-login attempt
	  let autoLoginSuccess = false;
	  let autoLoginError = null;
	  
	  try {
		await ModemAuth.autoLogin(chatId);
		autoLoginSuccess = true;
		logger.info(`Auto-login successful for ${chatId}`);
	  } catch (error) {
		autoLoginError = error.message;
		logger.error(`Auto-login failed for ${chatId}: ${autoLoginError}`);
	  }
	  
	  // Escape HTML special characters
	  const escapeHtml = (str) => {
		if (!str) return '';
		return str
		  .replace(/&/g, '&amp;')
		  .replace(/</g, '&lt;')
		  .replace(/>/g, '&gt;')
		  .replace(/"/g, '&quot;')
		  .replace(/'/g, '&#39;');
	  };
	  
	  // Build welcome message based on auto-login status
	  let authStatus = '';
	  if (autoLoginSuccess) {
		authStatus = `
	✅ <b>Auto-login:</b> Successful
	🔐 You can now use all commands`;
	  } else {
		const escapedError = escapeHtml(autoLoginError || 'Unknown error');
		authStatus = `
	⚠️ <b>Auto-login:</b> Failed
	   Reason: ${escapedError}
	   Please check UCI configuration:
	   • modem_ip
	   • modem_user
	   • modem_password`;
	  }
	  
	  // INLINE KEYBOARD untuk quick commands (di dalam pesan)
	  const inlineKeyboard = {
		inline_keyboard: [
		  [
			{ text: '📡 Status', callback_data: 'quick_status' },
			{ text: '📶 Signal', callback_data: 'quick_signal' }
		  ],
		  [
			{ text: '💻 Device', callback_data: 'quick_device' },
			{ text: '🖥️ Sysinfo', callback_data: 'quick_sysinfo' }
		  ],
		  [
			{ text: '📱 SMS', callback_data: 'quick_sms' },
			{ text: '📡 WiFi', callback_data: 'quick_wifi' }
		  ],
		  [
			{ text: '💡 LED', callback_data: 'quick_led' },
			{ text: '🌐 Data', callback_data: 'quick_data' }
		  ],
		  [
			{ text: '❌ Close', callback_data: 'start_close' }
		  ]
		]
	  };
	  
	  const welcomeMessage = `
	🤖 <b>WELCOME TO ${escapeHtml(botName)}</b>
	${Formatter.doubleSeparator()}

	<b>✅ Bot Status:</b> Online and ready
	<b>👤 User:</b> ${escapeHtml(ctx.from?.first_name || 'User')} (ID: ${chatId})
	<b>🔐 Authorization:</b> ${isAllowed ? '✅ Authorized' : '✅ Now Authorized'}
	<b>📋 Commands Registered:</b> ${cmdCount}/${EXPECTED_COMMAND_COUNT}
	${authStatus}

	${Formatter.separator()}

	<b>📋 Quick Commands (Inline):</b>
	Click buttons below for quick access

	${Formatter.separator()}

	<b>📌 Navigation Menu (Reply Keyboard):</b>
	Use the keyboard buttons below to navigate menus

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Bot auto-login using UCI credentials
	• Session auto-refresh for latest data
	• Use /logout if data seems outdated
	• Click "❌ Close Keyboard" to hide reply keyboard
	`;
	  
	  // Kirim pesan dengan INLINE KEYBOARD + REPLY KEYBOARD
	  const sentMsg = await ctx.reply(welcomeMessage, {
		parse_mode: 'HTML',
		reply_markup: inlineKeyboard  // Inline keyboard di dalam pesan
	  });
	  
	  // Kirim REPLY KEYBOARD (terpisah, di area input)
	  await ctx.reply('📁 Please use the buttons below to navigate:', KeyboardBuilder.getMainMenuKeyboard());
	  
	  // Auto delete welcome message after 5 minutes
	  setTimeout(async () => {
		try {
		  await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
		} catch (e) {}
	  }, 300000);
	  
	  // Delete user's /start command message
	  if (messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, messageId);
		  logger.debug(`Deleted /start command message: ${messageId}`);
		} catch (err) {
		  logger.debug(`Failed to delete command message: ${err.message}`);
		}
	  }
	  
	  logger.info(`User ${chatId} started bot, auto-login: ${autoLoginSuccess ? 'success' : 'failed'}`);
	}

	// Tambahkan fungsi handleStartClose
	async handleStartClose(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan welcome
	  try {
		await ctx.deleteMessage();
		logger.debug(`Closed welcome message for chat ${chatId}`);
	  } catch (e) {
		logger.debug(`Failed to close welcome message: ${e.message}`);
	  }
	  
	  await ctx.answerCbQuery('Closed');
}

	// /help commands
	async handleHelp(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  await this.deleteUserMessage(ctx);
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '❌ Close', callback_data: 'help_close' }]
		]
	  };
	  
	  const sentMsg = await ctx.reply(Formatter.formatHelp(), {
		reply_markup: keyboard
	  });
	  
	  // Auto delete after 5 minutes (300000 ms)
	  setTimeout(async () => {
		try {
		  await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
		} catch (e) {}
	  }, 300000);
	}	

  // Remove /login command - no longer needed
  // Keep /logout for manual session clear
  async handleLogout(ctx) {
    const chatId = ctx.chat.id;
    ModemAuth.clearSession(chatId);
	// Hapus pesan user
	await this.deleteUserMessage(ctx);
    await ctx.reply('✅ Session cleared. Auto-login will happen on next command.');
  }

	async ensureAuth(ctx, forceRefresh = false) {
	  const chatId = ctx.chat.id;
	  
	  try {
		let sessionId = ModemAuth.getSession(chatId);
		
		if (forceRefresh || !sessionId) {
		  logger.info(`Creating new session for chat ${chatId}`);
		  sessionId = await ModemAuth.autoLogin(chatId);
		} else {
		  // Verify session is still valid with a simple command
		  const modemIp = ModemAuth.getModemIp(chatId);
		  try {
			await modemRequest(modemIp, { cmd: 232, method: 'GET' }, sessionId);
		  } catch (error) {
			logger.info(`Session invalid, re-login for chat ${chatId}`);
			sessionId = await ModemAuth.autoLogin(chatId);
		  }
		}
		
		return sessionId;
	  } catch (error) {
		logger.error(`Auth error for ${chatId}: ${error.message}`);		
		await ctx.reply(`❌ Authentication failed: ${error.message}`);
		throw error;
	  }
	}
	
	async checkModemReachable(ip) {
	  try {
		const { customRequest } = require('../modem/client');
		await customRequest(ip, 'sysinfo');
		return true;
	  } catch (error) {
		return false;
	  }
	}
	
	// /SIGNAL LIVE UPDATE
	async handleSignal(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user yang menjalankan command
	  await this.deleteUserMessage(ctx);
		  
	  // Stop any existing live update for this chat
	  if (signalLiveUpdates.has(chatId)) {
		const oldData = signalLiveUpdates.get(chatId);
		if (oldData.interval) {
		  clearInterval(oldData.interval);
		}
		signalLiveUpdates.delete(chatId);
	  }
	  
	  try {
		const sessionId = await ModemAuth.ensureSession(chatId);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		// Get signal info, device info, bandwidth info, and uptime
		const [signal, device, bandwidth, uptime] = await Promise.all([
		  modemAPI.getSignal(modemIp, sessionId),
		  modemAPI.getDeviceInfo(modemIp, sessionId),
		  modemAPI.getCurrentBandwidth(modemIp, sessionId),
		  modemAPI.getNetworkUptime(modemIp, sessionId)
		]);
		
		const combinedData = { 
		  ...signal, 
		  ...device, 
		  ...bandwidth,
		  uptime: uptime
		};
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '▶️ Start Live Update', callback_data: 'signal_live_start' }],
			[{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
			[{ text: '❌ Close', callback_data: 'signal_close' }]
		  ]
		};
		
		const message = this.formatSignalMessage(combinedData);
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Store data
		signalLiveUpdates.set(chatId, {
		  messageId: sentMessage.message_id,
		  chatId: chatId,
		  isLive: false,
		  interval: null
		});
		
	  } catch (error) {
		logger.error(`Signal error for ${chatId}: ${error.message}`);
		await ctx.reply('❌ Failed to get signal info. Please try again.');
	  }
	}

	async startSignalLive(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = signalLiveUpdates.get(chatId);
	  
	  if (!liveData) {
		await this.handleSignal(ctx);
		const newLiveData = signalLiveUpdates.get(chatId);
		if (newLiveData) {
		  newLiveData.isLive = true;
		  this.startSignalLiveInterval(ctx, chatId);
		}
		await ctx.answerCbQuery('Live update started!');
		return;
	  }
	  
	  if (liveData.isLive) {
		await ctx.answerCbQuery('Live update already running!');
		return;
	  }
	  
	  liveData.isLive = true;
	  this.startSignalLiveInterval(ctx, chatId);
	  
	  // Update keyboard to show stop button
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '⏹️ Stop Live Update', callback_data: 'signal_live_stop' }],
		  [{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
		  [{ text: '❌ Close', callback_data: 'signal_close' }]
		]
	  };
	  
	  try {
		await ctx.editMessageReplyMarkup(keyboard);
	  } catch (e) {
		logger.error(`Failed to edit reply markup: ${e.message}`);
	  }
	  
	  await ctx.answerCbQuery('Live update started! Auto-refresh every 3 seconds');
	}

	startSignalLiveInterval(ctx, chatId) {
	  const liveData = signalLiveUpdates.get(chatId);
	  if (!liveData) return;
	  
	  if (liveData.interval) {
		clearInterval(liveData.interval);
	  }
	  
	  liveData.interval = setInterval(async () => {
		const currentLiveData = signalLiveUpdates.get(chatId);
		if (!currentLiveData || !currentLiveData.isLive) return;
		
		try {
		  const sessionId = await ModemAuth.ensureSession(chatId);
		  const modemIp = ModemAuth.getModemIp(chatId);
		  
		  const [signal, device, bandwidth, uptime] = await Promise.all([
			modemAPI.getSignal(modemIp, sessionId),
			modemAPI.getDeviceInfo(modemIp, sessionId),
			modemAPI.getCurrentBandwidth(modemIp, sessionId),
			modemAPI.getNetworkUptime(modemIp, sessionId)
		  ]);
		  
		  const combinedData = { 
			...signal, 
			...device, 
			...bandwidth,
			uptime: uptime
		  };
		  
		  const message = this.formatSignalMessage(combinedData);
		  
		  const keyboard = {
			inline_keyboard: [
			  [{ text: '⏹️ Stop Live Update', callback_data: 'signal_live_stop' }],
			  [{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
			  [{ text: '❌ Close', callback_data: 'signal_close' }]
			]
		  };
		  
		  await ctx.telegram.editMessageText(chatId, currentLiveData.messageId, null, message, {
			parse_mode: 'HTML',
			reply_markup: keyboard
		  });
		  
		} catch (error) {
		  logger.error(`Live signal update error: ${error.message}`);
		  if (error.message.includes('message to edit not found') || error.message.includes('chat not found')) {
			if (currentLiveData.interval) {
			  clearInterval(currentLiveData.interval);
			}
			signalLiveUpdates.delete(chatId);
		  }
		}
	  }, 3000);
	}

	async stopSignalLive(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = signalLiveUpdates.get(chatId);
	  if (!liveData) return;
	  
	  if (liveData.interval) {
		clearInterval(liveData.interval);
		liveData.interval = null;
	  }
	  liveData.isLive = false;
	  
	  // Update keyboard back to start button
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '▶️ Start Live Update', callback_data: 'signal_live_start' }],
		  [{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
		  [{ text: '❌ Close', callback_data: 'signal_close' }]
		]
	  };
	  
	  try {
		await ctx.editMessageReplyMarkup(keyboard);
	  } catch (e) {
		logger.error(`Failed to edit reply markup on stop: ${e.message}`);
	  }
	  
	  await ctx.answerCbQuery('Live update stopped');
	}

	async refreshSignal(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = signalLiveUpdates.get(chatId);
	  
	  if (!liveData) {
		await this.handleSignal(ctx);
		await ctx.answerCbQuery('Refreshed!');
		return;
	  }
	  
	  try {
		const sessionId = await ModemAuth.ensureSession(chatId);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [signal, device] = await Promise.all([
		  modemAPI.getSignal(modemIp, sessionId),
		  modemAPI.getDeviceInfo(modemIp, sessionId)
		]);
		
		const combinedData = { ...signal, ...device };
		const message = this.formatSignalMessage(combinedData);
		
		const keyboard = liveData.isLive ? {
		  inline_keyboard: [
			[{ text: '⏹️ Stop Live Update', callback_data: 'signal_live_stop' }],
			[{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
			[{ text: '❌ Close', callback_data: 'signal_close' }]
		  ]
		} : {
		  inline_keyboard: [
			[{ text: '▶️ Start Live Update', callback_data: 'signal_live_start' }],
			[{ text: '🔄 Refresh', callback_data: 'signal_refresh' }],
			[{ text: '❌ Close', callback_data: 'signal_close' }]
		  ]
		};
		
		await ctx.editMessageText(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		await ctx.answerCbQuery('Refreshed!');
	  } catch (error) {
		logger.error(`Refresh signal error: ${error.message}`);
		await ctx.answerCbQuery('Failed to refresh');
	  }
	}

	async closeSignal(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = signalLiveUpdates.get(chatId);
	  
	  if (liveData) {
		if (liveData.interval) {
		  clearInterval(liveData.interval);
		}
		signalLiveUpdates.delete(chatId);
	  }
	  
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	formatSignalMessage(data) {
	  const Formatter = require('../utils/formatter');
	  
	  const level = parseInt(data.signal_lvl);
	  const signalBar = Formatter.getSignalBar(level);
	  const signalDesc = Formatter.getSignalDescriptionFromLevel(level);
	  
	  // Format IPv6
	  let ipv6Display = data.wan_ipv6_ip || 'N/A';
	  if (ipv6Display !== 'N/A' && ipv6Display.length > 45) {
		ipv6Display = ipv6Display.substring(0, 40) + '...';
	  }
	  
	  // Format traffic bytes
	  const rxBytes = parseInt(data.wan_rx_bytes) || 0;
	  const txBytes = parseInt(data.wan_tx_bytes) || 0;
	  
	  // Format uptime network
	  let uptimeStr = 'N/A';
	  if (data.uptime && !isNaN(parseFloat(data.uptime))) {
		const seconds = parseFloat(data.uptime);
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		uptimeStr = `${days}d ${hours}h ${minutes}m ${secs}s`;
	  }
	  
	  // Get current time
	  const now = new Date();
	  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	  
	  return `
	📡 <b>SIGNAL INFO</b>
	${Formatter.doubleSeparator()}
	<i>Last update: ${timeStr}</i>
	${Formatter.separator()}

	<b>📶 Signal:</b> ${signalBar} (${signalDesc})

	<b>📊 Signal Metrics:</b>
	   • RSRP: ${data.RSRP || data.RSRP || 'N/A'} dBm
	   • RSRQ: ${data.RSRQ || data.RSRQ || 'N/A'} dB
	   • SINR: ${data.SINR || data.SINR || 'N/A'} dB
	   • RSSI: ${data.RSSI || data.RSSI || 'N/A'} dBm

	${Formatter.separator()}

	<b>🌐 Network Info:</b>
	   • Type: ${data.network_type_str || 'N/A'}
	   • Operator: ${data.network_operator || 'N/A'}
	   • Band: ${data.currentband || 'N/A'} ${data.bandwidth_mhz ? `(${data.bandwidth_mhz})` : ''}
	   • Bandwidth: ${data.bandwidth || 'N/A'}
	   • EARFCN: ${data.earfcn || data.FREQ || 'N/A'}
	   • PCI: ${data.PCI || 'N/A'}
	   • Cell ID: ${data.CELL_ID || 'N/A'}

	${Formatter.separator()}

	<b>⏱️ System Uptime:</b> ${uptimeStr}

	${Formatter.separator()}

	<b>📡 Connection:</b>
	   • APN: ${data.apn_name || 'N/A'}
	   • Gateway: ${data.wan_gateway || 'N/A'}
	   • DNS: ${data.wan_dns || 'N/A'}

	${Formatter.separator()}

	<b>📊 Traffic (Session):</b>
	   • Download: ${Formatter.humanizeBytes(rxBytes)}
	   • Upload: ${Formatter.humanizeBytes(txBytes)}

	${Formatter.separator()}

	<b>🌍 IP Addresses:</b>
	   • IPv4: ${data.wan_ip || 'N/A'}
	   • IPv6: ${ipv6Display}

	${Formatter.separator()}
	🔄 Auto-refresh every 3 seconds
	⏹️ Click "Stop Live Update" to stop
	`;
	}
	// END OF /SIGNAL LIVE UPDATE

	async handleStatus(ctx) {
	  const chatId = ctx.chat.id;
	  
	  try {
		const sessionId = await this.ensureAuth(ctx);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const status = await modemAPI.getStatus(modemIp, sessionId);
		
		let uptime = { uptime: '0' };
		try {
		  uptime = await modemAPI.getUptime(modemIp, sessionId);
		} catch (uptimeError) {
		  logger.warn(`Failed to get uptime: ${uptimeError.message}`);
		}
		
		const combinedStatus = { ...status, uptime: uptime.uptime || '0' };
		await ctx.reply(Formatter.formatStatus(combinedStatus), { parse_mode: 'Markdown' });
	  } catch (error) {
		logger.error(`Status error for ${chatId}: ${error.message}`);
		// Don't send extra error message if already sent by ensureAuth
	  }
	}
	
// /device commands
async handleDevice(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');

  // Hapus pesan user
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    
    const device = await modemAPI.getDeviceFullInfo(modemIp, sessionId);
    const formattedMessage = Formatter.formatDeviceFull(device);
    
    // Buat keyboard dengan tombol Refresh dan Close
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: 'device_refresh' },
          { text: '❌ Close', callback_data: 'device_close' }
        ]
      ]
    };
    
    const sentMsg = await ctx.reply(formattedMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
    // Store message ID for refresh
    sessionManager.setState(chatId, 'device_menu', { 
      messageId: sentMsg.message_id,
      sessionId: sessionId,
      modemIp: modemIp
    });
    
    // Auto delete setelah 1 menit (60000 ms)
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
        sessionManager.clearState(chatId);
      } catch (e) {}
    }, 60000);
    
  } catch (error) {
    logger.error(`Device error for ${chatId}: ${error.message}`);
    await this.autoDelete(ctx, `❌ Failed to get device info: ${error.message}`, 30000);
  }
}
	
	// ======= DEVICE COMMANDS ======= 
	// Device refresh handler
	async handleDeviceRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const menuData = sessionManager.getData(chatId);
	  
	  if (!menuData) {
		await this.autoDelete(ctx, `❌ Session expired. Please use /device again.`, 30000);
		await ctx.answerCbQuery();
		return;
	  }
	  
	  // Show refreshing status
	  const refreshKeyboard = {
		inline_keyboard: [[{ text: '⏳ Refreshing...', callback_data: 'device_processing' }]]
	  };
	  
	  await ctx.editMessageText(`🔄 Refreshing device info...`, {
		parse_mode: 'HTML',
		reply_markup: refreshKeyboard
	  });
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const device = await modemAPI.getDeviceFullInfo(modemIp, sessionId);
		const formattedMessage = Formatter.formatDeviceFull(device);
		
		const keyboard = {
		  inline_keyboard: [
			[
			  { text: '🔄 Refresh', callback_data: 'device_refresh' },
			  { text: '❌ Close', callback_data: 'device_close' }
			]
		  ]
		};
		
		await ctx.editMessageText(formattedMessage, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Update stored data
		sessionManager.setState(chatId, 'device_menu', { 
		  messageId: menuData.messageId,
		  sessionId: sessionId,
		  modemIp: modemIp
		});
		
		await ctx.answerCbQuery('Refreshed!');
		
	  } catch (error) {
		logger.error(`Device refresh error: ${error.message}`);
		await ctx.editMessageText(`❌ Failed to refresh: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back', callback_data: 'device_back' }]]
		  }
		});
		await ctx.answerCbQuery();
	  }
	}

	// Device back handler (kembali ke menu awal)
	async handleDeviceBack(ctx) {
	  await this.handleDevice(ctx);
	  await ctx.answerCbQuery();
	}

	// Device close handler
	async handleDeviceClose(ctx) {
	  const chatId = ctx.chat.id;
	  sessionManager.clearState(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {}
	  await ctx.answerCbQuery('Closed');
	}

	// Device processing handler (dummy)
	async handleDeviceProcessing(ctx) {
	  await ctx.answerCbQuery('Please wait...');
	}
	// ======= DEVICE COMMANDS ======= 
	
	// ==== SYS INFO LIVE UPDATE ====
	async handleSysInfo(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user yang menjalankan command
	  await this.deleteUserMessage(ctx, 100);
		  
	  // Stop any existing live update for this chat
	  if (liveUpdates.has(chatId)) {
		const oldData = liveUpdates.get(chatId);
		if (oldData.interval) {
		  clearInterval(oldData.interval);
		}
		liveUpdates.delete(chatId);
	  }
	  
	  try {
		const sessionId = await ModemAuth.ensureSession(chatId);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const device = await modemAPI.getDeviceFullInfo(modemIp, sessionId);
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '▶️ Start Live Update', callback_data: 'sysinfo_live_start' }],
			[{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
			[{ text: '❌ Close', callback_data: 'sysinfo_close' }]
		  ]
		};
		
		const message = this.formatSysInfoMessage(device);
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Store data
		liveUpdates.set(chatId, {
		  messageId: sentMessage.message_id,
		  chatId: chatId,
		  isLive: false,
		  interval: null
		});
		
	  } catch (error) {
		logger.error(`SysInfo error for ${chatId}: ${error.message}`);
	  }
	}

	async startSysInfoLive(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = liveUpdates.get(chatId);
	  
	  if (!liveData) {
		await this.handleSysInfo(ctx);
		const newLiveData = liveUpdates.get(chatId);
		if (newLiveData) {
		  newLiveData.isLive = true;
		  this.startLiveInterval(ctx, chatId);
		}
		await ctx.answerCbQuery('Live update started!');
		return;
	  }
	  
	  if (liveData.isLive) {
		await ctx.answerCbQuery('Live update already running!');
		return;
	  }
	  
	  liveData.isLive = true;
	  this.startLiveInterval(ctx, chatId);
	  
	  // Update keyboard to show stop button
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '⏹️ Stop Live Update', callback_data: 'sysinfo_live_stop' }],
		  [{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
		  [{ text: '❌ Close', callback_data: 'sysinfo_close' }]
		]
	  };
	  
	  try {
		await ctx.editMessageReplyMarkup(keyboard);
	  } catch (e) {
		logger.error(`Failed to edit reply markup: ${e.message}`);
	  }
	  
	  await ctx.answerCbQuery('Live update started! Auto-refresh every 3 seconds');
	}

	startLiveInterval(ctx, chatId) {
	  const liveData = liveUpdates.get(chatId);
	  if (!liveData) return;
	  
	  if (liveData.interval) {
		clearInterval(liveData.interval);
	  }
	  
	  liveData.interval = setInterval(async () => {
		const currentLiveData = liveUpdates.get(chatId);
		if (!currentLiveData || !currentLiveData.isLive) return;
		
		try {
		  const sessionId = await ModemAuth.ensureSession(chatId);
		  const modemIp = ModemAuth.getModemIp(chatId);
		  const device = await modemAPI.getDeviceFullInfo(modemIp, sessionId);
		  
		  const message = this.formatSysInfoMessage(device);
		  
		  const keyboard = {
			inline_keyboard: [
			  [{ text: '⏹️ Stop Live Update', callback_data: 'sysinfo_live_stop' }],
			  [{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
			  [{ text: '❌ Close', callback_data: 'sysinfo_close' }]
			]
		  };
		  
		  // Use ctx.telegram directly with stored messageId
		  await ctx.telegram.editMessageText(chatId, currentLiveData.messageId, null, message, {
			parse_mode: 'HTML',
			reply_markup: keyboard
		  });
		  
		} catch (error) {
		  logger.error(`Live sysinfo update error: ${error.message}`);
		  // If message not found, stop live update
		  if (error.message.includes('message to edit not found') || error.message.includes('chat not found')) {
			if (currentLiveData.interval) {
			  clearInterval(currentLiveData.interval);
			}
			liveUpdates.delete(chatId);
		  }
		}
	  }, 3000);
	}

	async stopSysInfoLive(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = liveUpdates.get(chatId);
	  if (!liveData) return;
	  
	  if (liveData.interval) {
		clearInterval(liveData.interval);
		liveData.interval = null;
	  }
	  liveData.isLive = false;
	  
	  // Update keyboard back to start button
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '▶️ Start Live Update', callback_data: 'sysinfo_live_start' }],
		  [{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
		  [{ text: '❌ Close', callback_data: 'sysinfo_close' }]
		]
	  };
	  
	  try {
		await ctx.editMessageReplyMarkup(keyboard);
	  } catch (e) {
		logger.error(`Failed to edit reply markup on stop: ${e.message}`);
	  }
	  
	  await ctx.answerCbQuery('Live update stopped');
	}

	async refreshSysInfo(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = liveUpdates.get(chatId);
	  
	  if (!liveData) {
		await this.handleSysInfo(ctx);
		await ctx.answerCbQuery('Refreshed!');
		return;
	  }
	  
	  try {
		const sessionId = await ModemAuth.ensureSession(chatId);
		const modemIp = ModemAuth.getModemIp(chatId);
		const device = await modemAPI.getDeviceFullInfo(modemIp, sessionId);
		
		const message = this.formatSysInfoMessage(device);
		
		const keyboard = liveData.isLive ? {
		  inline_keyboard: [
			[{ text: '⏹️ Stop Live Update', callback_data: 'sysinfo_live_stop' }],
			[{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
			[{ text: '❌ Close', callback_data: 'sysinfo_close' }]
		  ]
		} : {
		  inline_keyboard: [
			[{ text: '▶️ Start Live Update', callback_data: 'sysinfo_live_start' }],
			[{ text: '🔄 Refresh', callback_data: 'sysinfo_refresh' }],
			[{ text: '❌ Close', callback_data: 'sysinfo_close' }]
		  ]
		};
		
		await ctx.editMessageText(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		await ctx.answerCbQuery('Refreshed!');
	  } catch (error) {
		logger.error(`Refresh sysinfo error: ${error.message}`);
		await ctx.answerCbQuery('Failed to refresh');
	  }
	}

	async closeSysInfo(ctx) {
	  const chatId = ctx.chat.id;
	  const liveData = liveUpdates.get(chatId);
	  
	  if (liveData) {
		if (liveData.interval) {
		  clearInterval(liveData.interval);
		}
		liveUpdates.delete(chatId);
	  }
	  
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	formatSysInfoMessage(device) {		
	  const Formatter = require('../utils/formatter');
	  
	  // Format uptime with seconds
	  let uptimeStr = 'N/A';
	  if (device.uptime && !isNaN(parseFloat(device.uptime))) {
		const seconds = parseFloat(device.uptime);
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		uptimeStr = `${days}d ${hours}h ${minutes}m ${secs}s`;
	  }
	  
	  // Format CPU load
	  let cpuLoadStr = device.cpuload || 'N/A';
	  if (cpuLoadStr !== 'N/A') {
		const loads = cpuLoadStr.split(',').map(l => parseFloat(l.trim()).toFixed(2));
		cpuLoadStr = `${loads[0]} (1m) | ${loads[1]} (5m) | ${loads[2]} (15m)`;
	  }
	  
	  // Format memory
	  let memoryStr = 'N/A';
	  if (device.memory && device.memory !== 'N/A') {
		const parts = device.memory.split(',').map(p => parseFloat(p.trim()));
		if (parts.length >= 3) {
		  const total = (parts[0] / 1024).toFixed(2);
		  const used = (parts[1] / 1024).toFixed(2);
		  const free = (parts[2] / 1024).toFixed(2);
		  memoryStr = `Total: ${total} MB | Used: ${used} MB | Free: ${free} MB`;
		}
	  }
	  
	  // Format CPU usage
	  let cpuDisplay = device.cpu || '0';
	  let cpuIcon = '🟢';
	  const cpuNum = parseInt(cpuDisplay);
	  if (cpuNum >= 80) cpuIcon = '🔴';
	  else if (cpuNum >= 50) cpuIcon = '🟡';
	  
	  // Format temperature
	  let tempDisplay = 'N/A';
	  let tempIcon = '🟢';
	  if (device.temp && device.temp !== 'N/A') {
		const tempNum = parseInt(device.temp);
		if (tempNum >= 65) tempIcon = '🔴';
		else if (tempNum >= 50) tempIcon = '🟡';
		tempDisplay = `${tempIcon} ${tempNum}°C`;
	  }
	  
	  // Get current time
	  const now = new Date();
	  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	  
	  return `
	🖥️ <b>SYSTEM INFO</b>
	${Formatter.doubleSeparator()}
	<i>Last update: ${timeStr}</i>
	${Formatter.separator()}

	<b>⏱️ Uptime:</b> ${uptimeStr}
	<b>📊 CPU Load:</b> ${cpuLoadStr}
	<b>💾 Memory:</b> ${memoryStr}
	<b>🖥️ CPU Usage:</b> ${cpuIcon} ${cpuNum}%
	<b>🌡️ Temperature:</b> ${tempDisplay}
	${Formatter.separator()}
	🔄 Auto-refresh every 3 seconds
	⏹️ Click "Stop Live Update" to stop
	`;
	}
	// ==== SYS INFO LIVE UPDATE ====

	// /all commands
	async handleAll(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	   
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		await ctx.reply('🔄 Fetching all information...');
		
		const [signal, status, device, sysinfo, uptime, band, currentBand] = await Promise.all([
		  modemAPI.getSignal(modemIp, sessionId),
		  modemAPI.getStatus(modemIp, sessionId),
		  modemAPI.getDeviceInfo(modemIp, sessionId),
		  modemAPI.getSysInfo(modemIp),
		  modemAPI.getUptime(modemIp, sessionId).catch(() => ({ uptime: '0' })),
		  modemAPI.getBandConfig(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		const combinedStatus = { ...status, uptime: uptime.uptime || '0' };
		
		// Send each section separately
		await ctx.reply(Formatter.formatSignal(signal), { parse_mode: 'Markdown' });
		await new Promise(r => setTimeout(r, 500));
		await ctx.reply(Formatter.formatStatus(combinedStatus), { parse_mode: 'Markdown' });
		await new Promise(r => setTimeout(r, 500));
		await ctx.reply(Formatter.formatDevice(device), { parse_mode: 'Markdown' });
		await new Promise(r => setTimeout(r, 500));
		await ctx.reply(Formatter.formatSysInfo(sysinfo), { parse_mode: 'Markdown' });
		await new Promise(r => setTimeout(r, 500));
		await ctx.reply(Formatter.formatBand(band, currentBand), { parse_mode: 'Markdown' });
		
	  } catch (error) {
		logger.error(`All info error for ${chatId}: ${error.message}`);
		await ctx.reply(`⚠️ Some information could not be fetched: ${error.message}

	Try /logout and then /all again.`);
	  }
	}
	
	// ===== SMS COMMANDS =====	
	// /sms handle - LANGSUNG TAMPILKAN MENU
	async handleSMS(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Cek apakah sudah ada pesan SMS yang aktif
	  const existingData = smsCache.get(chatId);
	  if (existingData && existingData.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, existingData.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Langsung tampilkan SMS Manager
	  await this.showSMSMenu(ctx);
	}

	// Tampilkan Menu Utama SMS Manager
	async showSMSMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const userNumbers = await savedNumbersDB.getNumbers(chatId);
	  
	  const keyboard = [];
	  
	  // Tombol View Inbox
	  keyboard.push([{ text: '📥 View Inbox', callback_data: 'sms_view_inbox' }]);
	  
	  // Tombol Send New SMS
	  keyboard.push([{ text: '✏️ Send New SMS', callback_data: 'sms_send_new' }]);
	  
	  // Saved numbers
	  if (userNumbers.length > 0) {
		keyboard.push([{ text: '─ Saved Numbers ─', callback_data: 'sms_sep' }]);
		const numberButtons = [];
		for (const num of userNumbers.slice(0, 8)) {
		  numberButtons.push({ text: `📱 ${num}`, callback_data: `sms_send_saved_${num}` });
		  if (numberButtons.length === 2) {
			keyboard.push([...numberButtons]);
			numberButtons.length = 0;
		  }
		}
		if (numberButtons.length > 0) {
		  keyboard.push(numberButtons);
		}
		keyboard.push([{ text: '🗑️ Clear Saved Numbers', callback_data: 'sms_clear_numbers' }]);
	  }
	  
	  keyboard.push([{ text: '❌ Close', callback_data: 'sms_close' }]);
	  
	  const message = `
	📱 <b>SMS MANAGER</b>
	${Formatter.doubleSeparator()}

	<b>📌 Quick Actions:</b>
	• View Inbox - Read your SMS messages
	• Send New SMS - Send to new number
	• Click saved number below - Quick send

	${Formatter.separator()}
	<b>🖱️ Choose an option:</b>
	`;
	  
	  // Hapus pesan lama jika ada di cache
	  const cache = smsCache.get(chatId);
	  if (cache && cache.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, cache.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Kirim pesan baru (bukan edit)
	  const sentMessage = await ctx.reply(message, {
		parse_mode: 'HTML',
		reply_markup: { inline_keyboard: keyboard }
	  });
	  
	  // Update cache with new message ID
	  smsCache.set(chatId, {
		...cache,
		messageId: sentMessage.message_id
	  });
	}

	// View Inbox - dengan pagination
	async handleSMSViewInbox(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Hapus pesan menu sebelumnya
	  const cache = smsCache.get(chatId);
	  if (cache && cache.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, cache.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  const loadingMsg = await ctx.reply(`📱 Loading SMS inbox...`);
	  
	  try {
		const smsList = await modemAPI.getSMSList(modemIp);
		
		await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
		
		if (!smsList || !smsList.datas || smsList.datas.length === 0) {
		  await ctx.reply('📭 No SMS messages found in inbox.');
		  await this.showSMSMenu(ctx);
		  return;
		}
		
		// Urutkan dari yang terbaru ke terlama
		const sortedSMS = [...smsList.datas].sort((a, b) => {
		  return b.datetime.localeCompare(a.datetime);
		});
		
		// Store in cache
		smsCache.set(chatId, {
		  datas: sortedSMS,
		  total: sortedSMS.length,
		  page: 1,
		  perPage: 5,
		  messageId: null
		});
		
		// Tampilkan halaman pertama inbox
		await this.sendSMSPage(ctx, 1);
		
	  } catch (error) {
		logger.error(`View inbox error: ${chatId}: ${error.message}`);
		await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
		await this.showSMSMenu(ctx);
	  }
	}

	// Tampilkan halaman SMS Inbox dengan pagination (edit pesan yang sama)
	async sendSMSPage(ctx, page) {
	  const chatId = ctx.chat.id;
	  const cache = smsCache.get(chatId);
	  const Formatter = require('../utils/formatter');
	  
	  if (!cache) {
		await this.showSMSMenu(ctx);
		return;
	  }
	  
	  const { datas, total, perPage } = cache;
	  const totalPages = Math.ceil(total / perPage);
	  const start = (page - 1) * perPage;
	  const end = start + perPage;
	  const pageData = datas.slice(start, end);
	  
	  // Gunakan separator dari Formatter
	  let result = `📱 SMS INBOX\n${Formatter.doubleSeparator()}\n`;
	  result += `Page ${page}/${totalPages} | Total: ${total} messages\n`;
	  result += `${Formatter.separator()}\n\n`;
	  
	  for (let i = 0; i < pageData.length; i++) {
		const sms = pageData[i];
		const globalIndex = start + i + 1;
		result += `${globalIndex}. From: ${sms.phoneNo || 'Unknown'}\n`;
		result += `   Date: ${sms.datetime || 'Unknown'}\n`;
		
		// Tampilkan pesan lengkap (tidak dipotong)
		const content = sms.content || '';
		result += `   Msg: ${content}\n`;
		
		if (i < pageData.length - 1) {
		  result += `\n${Formatter.separator()}\n\n`;
		}
	  }
	  
	  // Create inline keyboard
	  const keyboard = [];
	  
	  // Navigation row
	  const navRow = [];
	  if (page > 1) {
		navRow.push({ text: '◀️ Prev', callback_data: `sms_page_${page - 1}` });
	  }
	  navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'sms_current' });
	  if (page < totalPages) {
		navRow.push({ text: 'Next ▶️', callback_data: `sms_page_${page + 1}` });
	  }
	  keyboard.push(navRow);
	  
	  // Delete buttons per SMS
		const deleteRow = [];
		for (let i = 0; i < pageData.length; i++) {
		  const sms = pageData[i];
		  const globalIndex = start + i + 1;
		  const smsId = sms.id || sms.ID || sms.smsId || globalIndex;
		  deleteRow.push({ 
			text: `🗑️ Delete #${globalIndex}`, 
			callback_data: `sms_delete_${smsId}` 
		  });
		  
		  // Maksimal 2 tombol per baris
		  if (deleteRow.length === 2 || i === pageData.length - 1) {
			keyboard.push([...deleteRow]);
			deleteRow.length = 0;
		  }
		}
	  
	  // Action rows
	  keyboard.push([{ text: '🗑️ Clear All Inbox', callback_data: 'sms_clear_inbox' }]);
	  keyboard.push([{ text: '◀️ Back to Menu', callback_data: 'sms_back_to_menu' }]);
	  keyboard.push([{ text: '❌ Close', callback_data: 'sms_close' }]);
	  
	  const replyMarkup = {
		inline_keyboard: keyboard
	  };
	  
	  // EDIT pesan yang sudah ada (bukan hapus + kirim baru)
	  if (cache.messageId) {
		try {
		  await ctx.editMessageText(result, {
			parse_mode: 'HTML',
			reply_markup: replyMarkup
		  });
		} catch (e) {
		  // Jika edit gagal (misal pesan sudah dihapus), kirim baru
		  logger.debug(`Edit message failed, sending new: ${e.message}`);
		  const sentMessage = await ctx.reply(result, {
			parse_mode: 'HTML',
			reply_markup: replyMarkup
		  });
		  cache.messageId = sentMessage.message_id;
		}
	  } else {
		// Kirim pesan baru jika belum ada
		const sentMessage = await ctx.reply(result, {
		  parse_mode: 'HTML',
		  reply_markup: replyMarkup
		});
		cache.messageId = sentMessage.message_id;
	  }
	  
	  // Update cache
	  smsCache.set(chatId, { ...cache, page });
	  
	  if (ctx.callbackQuery) {
		await ctx.answerCbQuery();
	  }
	}

	// Send New SMS - Tampilkan form input
	async handleSMSSendNew(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '🔙 Cancel', callback_data: 'sms_cancel' }]
		]
	  };
	  
	  const message = `
	📱 <b>SEND NEW SMS</b>
	${Formatter.doubleSeparator()}

	Please send your message in this format:

	<b>PhoneNumber</b> then <b>Message</b> on the next line

	${Formatter.separator()}

	<b>📌 Example:</b>
	<code>081234567890</code>
	<code>Hello world! This is my message.</code>

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• First line: Phone number only
	• Second line: Your message
	• Number will be saved for future use

	Type /cancel to abort.
	`;
	  
	  // Hapus pesan menu sebelumnya
	  const cache = smsCache.get(chatId);
	  if (cache && cache.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, cache.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Kirim pesan baru
	  const sentMessage = await ctx.reply(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  sessionManager.setState(chatId, 'waiting_sms', { 
		action: 'send_new',
		promptMsgId: sentMessage.message_id,
		step: 'waiting_phone'
	  });
	  
	  // Update cache
	  smsCache.set(chatId, { ...cache, messageId: sentMessage.message_id });
	  
	  await ctx.answerCbQuery();
	}

	// Send to Saved Number
	async handleSMSSendSaved(ctx, phoneNumber) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '🔙 Cancel', callback_data: 'sms_cancel' }]
		]
	  };
	  
	  const message = `
	📱 <b>SEND SMS TO ${phoneNumber}</b>
	${Formatter.doubleSeparator()}

	Please send your message below.

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Message can contain spaces and emojis
	• Send any text as your message

	Type /cancel to abort.
	`;
	  
	  // Hapus pesan menu sebelumnya
	  const cache = smsCache.get(chatId);
	  if (cache && cache.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, cache.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Kirim pesan baru
	  const sentMessage = await ctx.reply(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  sessionManager.setState(chatId, 'waiting_sms', { 
		action: 'send_to_number',
		phoneNumber: phoneNumber,
		promptMsgId: sentMessage.message_id
	  });
	  
	  // Update cache
	  smsCache.set(chatId, { ...cache, messageId: sentMessage.message_id });
	  
	  await ctx.answerCbQuery();
	}

	// Proses pengiriman SMS
	async handleSMSProcessSend(ctx, phoneNumber, messageText) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Hapus prompt message
	  const sessionData = sessionManager.getData(chatId);
	  if (sessionData && sessionData.promptMsgId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  const processingMsg = await ctx.reply(`⏳ Sending SMS to ${phoneNumber}...`);
	  
	  try {
		const result = await modemAPI.sendSMS(modemIp, phoneNumber, messageText);
		
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		if (result.success) {
		  // Save the number
		  await savedNumbersDB.saveNumber(chatId, phoneNumber);
		  
		  const successMsg = await ctx.reply(`✅ SMS sent successfully to ${phoneNumber}!`);
		  
		  setTimeout(async () => {
			await ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
			await this.showSMSMenu(ctx);
		  }, 2000);
		  
		} else {
		  const errorMsg = await ctx.reply(`❌ Failed to send SMS: ${result.message || 'Unknown error'}`);
		  setTimeout(async () => {
			await ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
			await this.showSMSMenu(ctx);
		  }, 3000);
		}
	  } catch (error) {
		logger.error(`Send SMS error: ${error.message}`);
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		const errorMsg = await ctx.reply(`❌ Failed to send SMS: ${error.message}`);
		setTimeout(async () => {
		  await ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		  await this.showSMSMenu(ctx);
		}, 3000);
	  }
	  
	  sessionManager.clearState(chatId);
	}

	// Handle user input untuk SMS
	async handleSMSUserInput(ctx, text) {
	  const chatId = ctx.chat.id;
	  const sessionData = sessionManager.getData(chatId);
	  
	  if (!sessionData) return false;
	  
	  // Handle two-step input for new SMS
	  if (sessionData.action === 'send_new') {
		if (!sessionData.phoneNumber) {
		  // Step 1: Waiting for phone number
		  const phoneNumber = text.trim();
		  if (!/^[\d\+]{8,15}$/.test(phoneNumber)) {
			const errorMsg = await ctx.reply(`❌ Invalid phone number format!

	Please enter a valid phone number (8-15 digits).
	Example: 081234567890 or 6281234567890

	Type /cancel to abort.`);
			setTimeout(() => {
			  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
			}, 5000);
			return true;
		  }
		  
		  // Update session to wait for message
		  sessionData.phoneNumber = phoneNumber;
		  sessionData.step = 'waiting_message';
		  sessionManager.setState(chatId, 'waiting_sms', sessionData);
		  
		  // Ask for message
		  const msg = await ctx.reply(`📱 Phone number: ${phoneNumber}

	Now please send your message.

	Type /cancel to abort.`);
		  setTimeout(() => {
			ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
		  }, 3000);
		  
		  await this.deleteUserMessage(ctx);
		  return true;
		  
		} else if (sessionData.step === 'waiting_message') {
		  // Step 2: Waiting for message
		  const messageText = text;
		  await this.handleSMSProcessSend(ctx, sessionData.phoneNumber, messageText);
		  return true;
		}
	  }
	  
	  // Handle direct send to saved number
	  if (sessionData.action === 'send_to_number') {
		await this.handleSMSProcessSend(ctx, sessionData.phoneNumber, text);
		return true;
	  }
	  
	  return false;
	}

	// Clear saved numbers
	async handleSMSClearNumbers(ctx) {
	  const chatId = ctx.chat.id;
	  await savedNumbersDB.clearNumbers(chatId);
	  await this.showSMSMenu(ctx);
	  await ctx.answerCbQuery('Saved numbers cleared!');
	}

	// Cancel SMS sending
	async handleSMSCancel(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus prompt message jika ada
	  const sessionData = sessionManager.getData(chatId);
	  if (sessionData && sessionData.promptMsgId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
		} catch (e) {}
	  }
	  
	  sessionManager.clearState(chatId);
	  
	  // Hapus pesan user jika ada
	  await this.deleteUserMessage(ctx);
	  
	  // Hanya reply pesan cancel, jangan edit message yang sudah dihapus
	  const msg = await ctx.reply('✅ SMS sending cancelled.');
	  setTimeout(() => {
		ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
	  }, 2000);
	  
	  // Tampilkan menu baru (bisa reply baru, bukan edit)
	  await this.showSMSMenu(ctx);
	  
	  if (ctx.callbackQuery) {
		await ctx.answerCbQuery('Cancelled');
	  }
	}

	// Back to Menu dari Inbox
	async handleSMSBackToMenu(ctx) {
	  await this.showSMSMenu(ctx);
	  await ctx.answerCbQuery();
	}

	// Refresh Inbox (dari menu manager)
	async handleSMSRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  smsCache.delete(chatId);
	  
	  // Refresh dan tampilkan inbox
	  await this.handleSMSViewInbox(ctx);
	  await ctx.answerCbQuery('Refreshed!');
	}

	// Handle page navigation callback
	async handleSMSPageCallback(ctx) {
	  const chatId = ctx.callbackQuery.from.id;
	  const data = ctx.callbackQuery.data;
	  
	  if (data === 'sms_close') {
		smsCache.delete(chatId);
		try {
		  await ctx.deleteMessage();
		} catch (e) {}
		await ctx.answerCbQuery();
		return;
	  }

	  if (data === 'sms_back_to_menu') {
		await this.showSMSMenu(ctx);
		await ctx.answerCbQuery();
		return;
	  }	  
	  
	  if (data === 'sms_current') {
		const currentPage = smsCache.get(chatId)?.page || 1;
		await ctx.answerCbQuery(`Page ${currentPage}`);
		return;
	  }
	  
	  if (data.startsWith('sms_page_')) {
		const page = parseInt(data.split('_')[2]);
		const currentPage = smsCache.get(chatId)?.page || 1;
		if (page !== currentPage) {
		  await this.sendSMSPage(ctx, page);
		} else {
		  await ctx.answerCbQuery(`Already on page ${page}`);
		}
	  }
	}

	// Direct send command /send
	async handleSendSMS(ctx) {
	  const chatId = ctx.chat.id;
	  const args = ctx.message.text.split(' ');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  if (args.length < 3) {
		const errorMsg = await ctx.reply(`❌ Usage: /send <phone_number> <message>

	Example: /send 081234567890 Hello world!

	💡 Tip: Use /sms for interactive SMS menu`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		return;
	  }
	  
	  const phoneNo = args[1];
	  const message = args.slice(2).join(' ');
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  const processingMsg = await ctx.reply(`⏳ Sending SMS to ${phoneNo}...`);
	  
	  try {
		const result = await modemAPI.sendSMS(modemIp, phoneNo, message);
		
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		if (result.success) {
		  // Save the number
		  await savedNumbersDB.saveNumber(chatId, phoneNo);
		  
		  const successMsg = await ctx.reply(`✅ SMS sent successfully to ${phoneNo}!`);
		  setTimeout(() => {
			ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
		  }, 3000);
		} else {
		  const errorMsg = await ctx.reply(`❌ Failed to send SMS: ${result.message || 'Unknown error'}`);
		  setTimeout(() => {
			ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		  }, 3000);
		}
	  } catch (error) {
		logger.error(`Send SMS error: ${error.message}`);
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		const errorMsg = await ctx.reply(`❌ Failed to send SMS: ${error.message}`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
	  }
	}

	// Delete single SMS by ID
	async handleSMSDelete(ctx, smsId) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Show processing
	  const originalText = ctx.callbackQuery?.message?.text || '';
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Deleting...', callback_data: 'sms_processing' }]]
	  };
	  
	  try {
		await ctx.editMessageText(`${originalText}\n\n⏳ Deleting SMS #${smsId}...`, {
		  parse_mode: 'HTML',
		  reply_markup: processingKeyboard
		});
	  } catch (e) {
		// Ignore if edit fails
	  }
	  
	  try {
		const result = await modemAPI.deleteSMS(modemIp, smsId);
		
		if (result.success) {
		  // Refresh inbox setelah delete
		  await this.handleSMSViewInbox(ctx);
		  // Jawab callback dengan notifikasi
		  try {
			await ctx.answerCbQuery(`✅ SMS deleted!`);
		  } catch (e) {}
		} else {
		  await this.handleSMSViewInbox(ctx);
		  try {
			await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		  } catch (e) {}
		}
	  } catch (error) {
		logger.error(`Delete SMS error: ${error.message}`);
		await this.handleSMSViewInbox(ctx);
		try {
		  await ctx.answerCbQuery(`Error: ${error.message}`);
		} catch (e) {}
	  }
	}

	// Clear all SMS inbox - show confirmation
	async handleSMSClearInbox(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const confirmKeyboard = {
		inline_keyboard: [
		  [{ text: '✅ Yes, Clear All', callback_data: 'sms_clear_confirm' }],
		  [{ text: '❌ Cancel', callback_data: 'sms_back_to_menu' }]
		]
	  };
	  
	  const message = `
	🗑️ <b>CLEAR ALL SMS</b>
	${Formatter.doubleSeparator()}

	⚠️ <b>WARNING:</b>
	This will permanently delete ALL SMS messages from inbox!

	${Formatter.separator()}

	Are you sure you want to continue?
	`;
	  
	  // Hapus pesan inbox sebelumnya
	  const cache = smsCache.get(chatId);
	  if (cache && cache.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, cache.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  try {
		await ctx.editMessageText(message, {
		  parse_mode: 'HTML',
		  reply_markup: confirmKeyboard
		});
	  } catch (e) {
		// Jika edit gagal, kirim pesan baru
		const sentMsg = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: confirmKeyboard
		});
		// Update cache
		smsCache.set(chatId, { ...cache, messageId: sentMsg.message_id });
	  }
	  
	  try {
		await ctx.answerCbQuery();
	  } catch (e) {}
	}

	// Confirm clear all SMS
	async handleSMSClearInboxConfirm(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Clearing...', callback_data: 'sms_processing' }]]
	  };
	  
	  try {
		await ctx.editMessageText(`🗑️ Clearing all SMS messages...\n\n⏳ Please wait...`, {
		  parse_mode: 'HTML',
		  reply_markup: processingKeyboard
		});
	  } catch (e) {
		// Ignore
	  }
	  
	  try {
		const result = await modemAPI.clearAllSMS(modemIp);
		
		if (result.success) {
		  // Clear SMS cache
		  smsCache.delete(chatId);
		  
		  // Hapus pesan processing
		  try {
			await ctx.deleteMessage();
		  } catch (e) {}
		  
		  // Tampilkan pesan sukses sementara
		  const successMsg = await ctx.reply(`✅ ${result.message || 'All SMS cleared successfully!'}`);
		  
		  setTimeout(async () => {
			try {
			  await ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
			} catch (e) {}
			// Kembali ke menu SMS
			await this.showSMSMenu(ctx);
		  }, 2000);
		  
		  try {
			await ctx.answerCbQuery('Inbox cleared!');
		  } catch (e) {}
		} else {
		  await ctx.editMessageText(`❌ Failed to clear inbox: ${result.message || 'Unknown error'}`, {
			parse_mode: 'HTML',
			reply_markup: {
			  inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'sms_back_to_menu' }]]
			}
		  });
		  try {
			await ctx.answerCbQuery('Failed');
		  } catch (e) {}
		}
	  } catch (error) {
		logger.error(`Clear all SMS error: ${error.message}`);
		await ctx.editMessageText(`❌ Error: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'sms_back_to_menu' }]]
		  }
		});
		try {
		  await ctx.answerCbQuery('Error');
		} catch (e) {}
	  }
	}

	// ===== END SMS COMMANDS =====
	
  async handleReboot(ctx) {
    const chatId = ctx.chat.id;
	
	// Hapus pesan user
	await this.deleteUserMessage(ctx);	
    
    try {
      await this.ensureAuth(ctx);
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, Reboot', callback_data: 'reboot_confirm' },
              { text: '❌ Cancel', callback_data: 'reboot_cancel' }
            ]
          ]
        }
      };
      
      await ctx.reply('⚠️ *WARNING: This will reboot your modem!*\n\nAre you sure?', { 
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      logger.error(`Reboot auth error: ${error.message}`);
    }
  }
	// ============= LOCK BAND ===========
	// /band commands
	async handleBand(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
		  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [band, currentBand] = await Promise.all([
		  modemAPI.getBandConfig(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		// Parse current locked bands from mask
		const currentMask = band.band_4g_mask || '0';
		const isAutoMode = (currentMask === '8000000095' || currentMask === '0' || currentMask === '');
		const lockedBands = isAutoMode ? [] : this.parseLockedBandsFromMask(currentMask);
		
		// Individual band checkboxes
		const individualBands = [
		  { band: 1, name: 'Band 1', freq: '2100 MHz', mask: '1' },
		  { band: 3, name: 'Band 3', freq: '1800 MHz', mask: '4' },
		  { band: 5, name: 'Band 5', freq: '850 MHz', mask: '10' },
		  { band: 8, name: 'Band 8', freq: '900 MHz', mask: '80' },
		  { band: 40, name: 'Band 40', freq: '2300 MHz', mask: '8000000000' }
		];
		
		// Create checkbox buttons for individual bands
		const bandButtons = [];
		for (const b of individualBands) {
		  const isSelected = !isAutoMode && lockedBands.includes(b.band);
		  const checkbox = isSelected ? '✅' : '⬜';
		  bandButtons.push([{ text: `${checkbox} ${b.name} (${b.freq})`, callback_data: `band_toggle_${b.band}` }]);
		}
		
		// Preset combinations
		const presets = [
		  { name: '🌐 Auto Mode', mask: '8000000095' },
		  { name: '🔓 Off Lock Band', mask: '0' },
		  { name: '🔗 Band 1+3', mask: '5' },
		  { name: '🔗 Band 1+5', mask: '11' },
		  { name: '🔗 Band 3+5', mask: '14' },
		  { name: '🔗 Band 1+3+5', mask: '15' },
		  { name: '🔗 Band 1+3+40', mask: '8000000005' },
		  { name: '🔗 Band 1+5+40', mask: '8000000011' },
		  { name: '🔗 Band 3+5+40', mask: '8000000014' },
		  { name: '🔗 Band 1+3+5+40', mask: '8000000015' }
		];
		
		// Create preset buttons with current indicator
		const presetButtons = [];
		for (let i = 0; i < presets.length; i += 2) {
		  const row = [];
		  for (let j = 0; j < 2 && i + j < presets.length; j++) {
			const preset = presets[i + j];
			let isCurrent = false;
			if (preset.mask === '8000000095' && isAutoMode) {
			  isCurrent = true;
			} else if (preset.mask === '0' && currentMask === '0') {
			  isCurrent = true;
			} else if (preset.mask === currentMask) {
			  isCurrent = true;
			}
			const currentMark = isCurrent ? '✅ ' : '';
			row.push({ text: `${currentMark}${preset.name}`, callback_data: `band_preset_${preset.mask}` });
		  }
		  presetButtons.push(row);
		}
		
		const keyboard = {
		  inline_keyboard: [
			...bandButtons,
			[{ text: '─────────────────────', callback_data: 'band_sep' }],
			...presetButtons,
			[{ text: '🔄 Refresh', callback_data: 'band_refresh' }, { text: '❌ Close', callback_data: 'band_close' }]
		  ]
		};
		
		// Store current data
		bandMenuData.set(chatId, {
		  currentMask: currentMask,
		  sessionId: sessionId,
		  modemIp: modemIp,
		  band: band,
		  currentBand: currentBand,
		  individualBands: individualBands,
		  lockedBands: lockedBands,
		  isAutoMode: isAutoMode
		});
		
		// Format band info for display
		const bandInfo = {
		  all_band_4g: band.all_band_4g,
		  lock_band_4g: band.lock_band_4g,
		  band_4g_mask: band.band_4g_mask,
		  all_band_3g: band.all_band_3g,
		  band_3g_mask: band.band_3g_mask,
		  band_4g_switch: band.band_4g_switch,
		  band_3g_switch: band.band_3g_switch,
		  parsedLockedBands: lockedBands,
		  isAutoMode: isAutoMode,
		  rawMask: currentMask
		};
		
		const formattedMessage = Formatter.formatBand(bandInfo, currentBand);
		
		const tipsInfo = `
	${Formatter.separator()}
	💡 <b>Tips:</b>
	• ✅ = Selected / ⬜ = Not selected
	• Click band buttons to select/deselect
	• Click preset buttons to apply combination
	• "Auto Mode" = Modem selects best band
	• "Off Lock Band" = Disable band locking
	• Modem will reconnect after applying changes`;

		const finalMessage = formattedMessage + tipsInfo;
		
		const sentMessage = await ctx.reply(finalMessage, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		bandMenuData.get(chatId).messageId = sentMessage.message_id;
		
	  } catch (error) {
		logger.error(`Band error for ${chatId}: ${error.message}`);
		await ctx.reply(`❌ Failed: ${error.message}\n\nTry /logout then /band again.`);
	  }
	}

	parseLockedBandsFromMask(mask) {
	  const supportedBands = {
		1: '1',
		3: '4',
		5: '10',
		8: '80',
		40: '8000000000'
	  };
	  
	  if (mask === '8000000095' || mask === '0') return [];
	  
	  let maskNum;
	  if (typeof mask === 'string') {
		if (mask.toLowerCase().startsWith('0x')) {
		  maskNum = parseInt(mask, 16);
		} else if (mask.length > 10) {
		  maskNum = parseInt(mask, 16);
		} else {
		  maskNum = parseInt(mask);
		}
	  } else {
		maskNum = mask;
	  }
	  
	  const lockedBands = [];
	  for (const [band, bandMask] of Object.entries(supportedBands)) {
		let bandMaskNum;
		if (typeof bandMask === 'string' && bandMask.length > 10) {
		  bandMaskNum = parseInt(bandMask, 16);
		} else {
		  bandMaskNum = parseInt(bandMask);
		}
		
		if ((maskNum & bandMaskNum) !== 0) {
		  lockedBands.push(parseInt(band));
		}
	  }
	  
	  return lockedBands;
	}

	async handleBandToggle(ctx, bandNumber) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = bandMenuData.get(chatId);
	  
	  if (!data) {
		await ctx.answerCbQuery('Menu expired, please use /band again');
		return;
	  }
	  
	  // If in auto mode, we need to exit auto mode first
	  const isAutoMode = (data.currentMask === '8000000095' || data.currentMask === '0');
	  
	  let newLockedBands;
	  if (isAutoMode) {
		// Start with only this band selected
		newLockedBands = [bandNumber];
	  } else {
		// Toggle band selection
		if (data.lockedBands.includes(bandNumber)) {
		  newLockedBands = data.lockedBands.filter(b => b !== bandNumber);
		} else {
		  newLockedBands = [...data.lockedBands, bandNumber];
		  newLockedBands.sort((a, b) => a - b);
		}
	  }
	  
	  // Calculate new mask
	  let newMask = 0;
	  for (const band of data.individualBands) {
		if (newLockedBands.includes(band.band)) {
		  let bandMaskNum;
		  if (typeof band.mask === 'string' && band.mask.length > 10) {
			bandMaskNum = parseInt(band.mask, 16);
		  } else {
			bandMaskNum = parseInt(band.mask);
		  }
		  newMask += bandMaskNum;
		}
	  }
	  
	  const maskToApply = newMask === 0 ? '0' : newMask.toString();
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'band_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Applying band selection...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.setBand4G(data.modemIp, data.sessionId, maskToApply);
		
		if (result.success && result.message === "0") {
		  data.lockedBands = newLockedBands;
		  data.currentMask = maskToApply;
		  data.isAutoMode = (maskToApply === '8000000095' || maskToApply === '0');
		  bandMenuData.set(chatId, data);
		  
		  await this.refreshBandMenu(ctx, true);
		  await ctx.answerCbQuery(newLockedBands.includes(bandNumber) ? `Band ${bandNumber} selected` : `Band ${bandNumber} deselected`);
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshBandMenu(ctx, true);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`Band toggle error: ${error.message}`);
		await this.refreshBandMenu(ctx, true);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleBandPreset(ctx, mask) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = bandMenuData.get(chatId);
	  
	  if (!data) {
		await ctx.answerCbQuery('Menu expired, please use /band again');
		return;
	  }
	  
	  // Check if already in this mode
	  const isCurrent = (mask === data.currentMask) || 
						(mask === '8000000095' && (data.currentMask === '8000000095' || data.currentMask === '0'));
	  
	  if (isCurrent) {
		await ctx.answerCbQuery('Already in this mode!');
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'band_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Applying preset configuration...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.setBand4G(data.modemIp, data.sessionId, mask);
		
		if (result.success && result.message === "0") {
		  let newLockedBands = [];
		  let isAutoMode = false;
		  
		  if (mask === '8000000095' || mask === '0') {
			isAutoMode = true;
			newLockedBands = [];
		  } else {
			newLockedBands = this.parseLockedBandsFromMask(mask);
		  }
		  
		  data.lockedBands = newLockedBands;
		  data.currentMask = mask;
		  data.isAutoMode = isAutoMode;
		  bandMenuData.set(chatId, data);
		  
		  await this.refreshBandMenu(ctx, true);
		  
		  let message = '';
		  if (mask === '8000000095') {
			message = '✅ Auto mode activated! Modem will select best band.';
		  } else if (mask === '0') {
			message = '✅ Band locking disabled!';
		  } else {
			message = `✅ Preset applied: ${newLockedBands.join(', ')}`;
		  }
		  await ctx.answerCbQuery(message);
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshBandMenu(ctx, true);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`Band preset error: ${error.message}`);
		await this.refreshBandMenu(ctx, true);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async refreshBandMenu(ctx, forceRefresh = false) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = bandMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleBand(ctx);
		return;
	  }
	  
	  try {
		// Get fresh data from modem
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [band, currentBand] = await Promise.all([
		  modemAPI.getBandConfig(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		// Parse current mask - handle both auto mode values
		let currentMask = band.band_4g_mask || '0';
		const isAutoMode = (currentMask === '8000000095' || currentMask === '0' || currentMask === '');
		
		// For display purposes, treat auto mode as having no bands selected
		let lockedBands = [];
		if (!isAutoMode) {
		  lockedBands = this.parseLockedBandsFromMask(currentMask);
		}
		
		// Update stored data
		data.currentMask = currentMask;
		data.lockedBands = lockedBands;
		data.band = band;
		data.currentBand = currentBand;
		data.sessionId = sessionId;
		data.modemIp = modemIp;
		data.isAutoMode = isAutoMode;
		bandMenuData.set(chatId, data);
		
		// Create checkbox buttons for individual bands
		const bandButtons = [];
		for (const b of data.individualBands) {
		  const isSelected = !isAutoMode && lockedBands.includes(b.band);
		  const checkbox = isSelected ? '✅' : '⬜';
		  bandButtons.push([{ text: `${checkbox} ${b.name} (${b.freq})`, callback_data: `band_toggle_${b.band}` }]);
		}
		
		// Preset combinations with current indicator
		const presets = [
		  { name: '🌐 Auto Mode', mask: '8000000095' },
		  { name: '🔓 Off Lock Band', mask: '0' },
		  { name: '🔗 Band 1+3', mask: '5' },
		  { name: '🔗 Band 1+5', mask: '11' },
		  { name: '🔗 Band 3+5', mask: '14' },
		  { name: '🔗 Band 1+3+5', mask: '15' },
		  { name: '🔗 Band 1+3+40', mask: '8000000005' },
		  { name: '🔗 Band 1+5+40', mask: '8000000011' },
		  { name: '🔗 Band 3+5+40', mask: '8000000014' },
		  { name: '🔗 Band 1+3+5+40', mask: '8000000015' }
		];
		
		const presetButtons = [];
		for (let i = 0; i < presets.length; i += 2) {
		  const row = [];
		  for (let j = 0; j < 2 && i + j < presets.length; j++) {
			const preset = presets[i + j];
			let isCurrent = false;
			if (preset.mask === '8000000095' && isAutoMode) {
			  isCurrent = true;
			} else if (preset.mask === '0' && currentMask === '0') {
			  isCurrent = true;
			} else if (preset.mask === currentMask) {
			  isCurrent = true;
			}
			const currentMark = isCurrent ? '✅ ' : '';
			row.push({ text: `${currentMark}${preset.name}`, callback_data: `band_preset_${preset.mask}` });
		  }
		  presetButtons.push(row);
		}
		
		const keyboard = {
		  inline_keyboard: [
			...bandButtons,
			[{ text: '─────────────────────', callback_data: 'band_sep' }],
			...presetButtons,
			[{ text: '🔄 Refresh', callback_data: 'band_refresh' }, { text: '❌ Close', callback_data: 'band_close' }]
		  ]
		};
		
		const bandInfo = {
		  all_band_4g: band.all_band_4g,
		  lock_band_4g: band.lock_band_4g,
		  band_4g_mask: band.band_4g_mask,
		  all_band_3g: band.all_band_3g,
		  band_3g_mask: band.band_3g_mask,
		  band_4g_switch: band.band_4g_switch,
		  band_3g_switch: band.band_3g_switch,
		  parsedLockedBands: lockedBands,
		  isAutoMode: isAutoMode,
		  rawMask: currentMask
		};
		
		const formattedMessage = Formatter.formatBand(bandInfo, currentBand);
		
		const tipsInfo = `
	${Formatter.separator()}
	💡 <b>Tips:</b>
	• ✅ = Selected / ⬜ = Not selected
	• Click band buttons to select/deselect
	• Click preset buttons to apply combination
	• "Auto Mode" = Modem selects best band
	• "Off Lock Band" = Disable band locking
	• Modem will reconnect after applying changes`;

		const finalMessage = formattedMessage + tipsInfo;
		
		// Only update if content has changed
		const currentMessage = ctx.callbackQuery?.message?.text;
		if (forceRefresh || currentMessage !== finalMessage) {
		  await ctx.editMessageText(finalMessage, {
			parse_mode: 'HTML',
			reply_markup: keyboard
		  });
		} else {
		  await ctx.editMessageReplyMarkup(keyboard);
		}
		
	  } catch (error) {
		if (!error.message.includes('message is not modified')) {
		  logger.error(`Refresh band menu error: ${error.message}`);
		}
	  }
	}

	async handleBandRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [band, currentBand] = await Promise.all([
		  modemAPI.getBandConfig(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		const currentMask = band.band_4g_mask || '0';
		const isAutoMode = (currentMask === '8000000095' || currentMask === '0');
		const lockedBands = isAutoMode ? [] : this.parseLockedBandsFromMask(currentMask);
		
		const data = bandMenuData.get(chatId);
		if (data) {
		  data.band = band;
		  data.currentBand = currentBand;
		  data.currentMask = currentMask;
		  data.lockedBands = lockedBands;
		  data.isAutoMode = isAutoMode;
		  data.sessionId = sessionId;
		  data.modemIp = modemIp;
		  bandMenuData.set(chatId, data);
		}
		
		await this.refreshBandMenu(ctx, true);
		await ctx.answerCbQuery('Refreshed!');
	  } catch (error) {
		logger.error(`Band refresh error: ${error.message}`);
		await ctx.answerCbQuery('Refresh failed');
	  }
	}

	async handleBandClose(ctx) {
	  const chatId = ctx.chat.id;
	  bandMenuData.delete(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	async handleBandSep(ctx) {
	  await ctx.answerCbQuery();
	}
	// ============= LOCK BAND ===========	

	async handleLockBand(ctx) {
	  const chatId = ctx.chat.id;
	  const args = ctx.message.text.split(' ');
	  
	  const supportedBands = {
		1: '2100 MHz',
		3: '1800 MHz',
		5: '850 MHz',
		8: '900 MHz',
		40: '2300 MHz'
	  };
	  
	  if (args.length < 2) {
		await ctx.reply(`❌ *Usage:* /lockband <band_number(s)>

	*Supported Bands:*
	• 1 - 2100 MHz
	• 3 - 1800 MHz
	• 5 - 850 MHz
	• 8 - 900 MHz
	• 40 - 2300 MHz

	*Examples:*
	/lockband 1
	/lockband 1,3
	/lockband 1,3,40
	/lockband auto

	*Note:* After locking band, modem will reconnect.`, { parse_mode: 'Markdown' });
		return;
	  }
	  
	  try {
		// Force new session for lock operation
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		if (args[1].toLowerCase() === 'auto') {
		  await ctx.reply('🔄 Unlocking all bands (auto selection)...');
		  const result = await modemAPI.unlockAllBands(modemIp, sessionId);
		  
		  if (result.success && result.message === "0") {
			await ctx.reply('✅ Band set to AUTO selection.\n\nModem will now automatically select the best band.');
			ModemAuth.clearSession(chatId);
		  } else {
			await ctx.reply(`❌ Failed: ${result.message || 'Unknown error'}`);
		  }
		  return;
		}
		
		// Parse band numbers
		let bandNumbers = args[1].split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
		
		// Filter supported bands
		const validBands = bandNumbers.filter(b => supportedBands[b]);
		const invalidBands = bandNumbers.filter(b => !supportedBands[b]);
		
		if (validBands.length === 0) {
		  await ctx.reply(`❌ No valid bands. Use: ${Object.keys(supportedBands).join(', ')}`);
		  return;
		}
		
		let warning = '';
		if (invalidBands.length > 0) {
		  warning = `\n\n⚠️ Ignored: ${invalidBands.join(', ')} (not supported)`;
		}
		
		const bandList = validBands.map(b => `${b} (${supportedBands[b]})`).join(', ');
		
		await ctx.reply(`🔄 Locking to: ${bandList}...${warning}`);
		
		const result = await modemAPI.lockBand(modemIp, sessionId, validBands);
		
		if (result.success && result.message === "0") {
		  await ctx.reply(`✅ *Success!* Locked to band(s): ${validBands.join(', ')}

	⚠️ Modem will reconnect to apply changes.
	📡 Use /band after 30 seconds to verify.`, { parse_mode: 'Markdown' });
		  
		  // Clear session to force new login after reboot
		  ModemAuth.clearSession(chatId);
		  
		} else {
		  await ctx.reply(`❌ Failed: ${result.message || 'Unknown error'}

	Try:
	1. /logout
	2. Wait 5 seconds
	3. /lockband ${validBands.join(',')}`);
		}
	  } catch (error) {
		logger.error(`Lock band error: ${error.message}`);
		await ctx.reply(`❌ Error: ${error.message}

	Try /logout first, then /lockband again.`);
	  }
	}
	
	
  async handleSetBand(ctx) {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      await ctx.reply('❌ Usage: /setband <band_mask>\n\nExample: /setband 85\n\nCurrent band mask can be seen with /band');
      return;
    }
    
    try {
      const sessionId = await this.ensureAuth(ctx);
      const modemIp = ModemAuth.getModemIp(chatId);
      const bandMask = args[1];
      
      await ctx.reply(`🔄 Setting 4G band to mask ${bandMask}...`);
      
      const result = await modemAPI.setBand4G(modemIp, sessionId, bandMask);
      
      if (result.success && result.message === "0") {
        await ctx.reply(`✅ Band mask set to ${bandMask}. Modem will adjust connection.`);
      } else {
        await ctx.reply(`❌ Failed to set band: ${result.message}`);
      }
    } catch (error) {
      logger.error(`Set band error for ${chatId}: ${error.message}`);
      await ctx.reply(`❌ Failed to set band: ${error.message}`);
    }
  }
    
	// /status commands
	async handleStatus(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  try {
		// Force refresh to get latest data
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [status, uptime] = await Promise.all([
		  modemAPI.getStatus(modemIp, sessionId),
		  modemAPI.getUptime(modemIp, sessionId).catch(() => ({ uptime: '0' }))
		]);
		
		const combinedStatus = { ...status, uptime: uptime.uptime || '0' };
		await ctx.reply(Formatter.formatStatus(combinedStatus), { parse_mode: 'Markdown' });
	  } catch (error) {
		logger.error(`Status error for ${chatId}: ${error.message}`);
	  }
	}

async handleAll(ctx) {
  const chatId = ctx.chat.id;
  
  try {
    // Force refresh to get latest data
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    
    await ctx.reply('🔄 Fetching all information...');
    
    const [signal, status, device, sysinfo, uptime, band, currentBand] = await Promise.all([
      modemAPI.getSignal(modemIp, sessionId),
      modemAPI.getStatus(modemIp, sessionId),
      modemAPI.getDeviceInfo(modemIp, sessionId),
      modemAPI.getSysInfo(modemIp),
      modemAPI.getUptime(modemIp, sessionId).catch(() => ({ uptime: '0' })),
      modemAPI.getBandConfig(modemIp, sessionId),
      modemAPI.getCurrentBand(modemIp, sessionId)
    ]);
    
    const combinedStatus = { ...status, uptime: uptime.uptime || '0' };
    
    await ctx.reply(Formatter.formatSignal(signal), { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
    await ctx.reply(Formatter.formatStatus(combinedStatus), { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
    await ctx.reply(Formatter.formatDevice(device), { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
    await ctx.reply(Formatter.formatSysInfo(sysinfo), { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
    await ctx.reply(Formatter.formatBand(band, currentBand), { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error(`All info error for ${chatId}: ${error.message}`);
    await ctx.reply(`❌ Failed to fetch some information: ${error.message}`);
  }
}
 
	async handlePing(ctx) {
	  const modemIp = await uci.getConfig('modem_ip');
	 
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx); 
	  
	  await ctx.reply(`🏓 Pinging modem at ${modemIp}...`);
	  
	  const isReachable = await this.checkModemReachable(modemIp);
	  
	  if (isReachable) {
		await ctx.reply(`✅ Modem is reachable at ${modemIp}`);
	  } else {
		await ctx.reply(`❌ Cannot reach modem at ${modemIp}\n\nCheck:\n- Modem powered on?\n- Network connected?\n- IP correct?`);
	  }
	}

	// ======= TTL COMMANDS ========
	// /ttl commands
	async handleTTLMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Stop any existing TTL menu for this chat
	  if (ttlMenuData.has(chatId)) {
		ttlMenuData.delete(chatId);
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		// Get current TTL status
		const ttlStatus = await modemAPI.readTTL(modemIp);
		const currentTTL = ttlStatus.ttl || '0';
		const isActive = currentTTL !== '0';
		
		// Common TTL presets
		const ttlPresets = [64, 65, 128, 255];
		
		// Create preset buttons
		const presetButtons = [];
		for (let i = 0; i < ttlPresets.length; i += 2) {
		  const row = [];
		  for (let j = 0; j < 2 && i + j < ttlPresets.length; j++) {
			const preset = ttlPresets[i + j];
			const isCurrent = isActive && parseInt(currentTTL) === preset;
			const buttonText = isCurrent ? `✅ TTL ${preset}` : `TTL ${preset}`;
			row.push({ text: buttonText, callback_data: `ttl_set_${preset}` });
		  }
		  presetButtons.push(row);
		}
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '✏️ Custom TTL', callback_data: 'ttl_custom' }],
			...presetButtons,
			[{ text: '🔄 Reset TTL (Remove Rule)', callback_data: 'ttl_reset' }],
			[{ text: '🔄 Refresh Status', callback_data: 'ttl_refresh' }],
			[{ text: '❌ Close', callback_data: 'ttl_close' }]
		  ]
		};
		
		// Store current data
		ttlMenuData.set(chatId, {
		  sessionId: sessionId,
		  modemIp: modemIp,
		  currentTTL: currentTTL,
		  isActive: isActive,
		  messageId: null
		});
		
		const statusIcon = isActive ? '✅ ACTIVE' : '❌ INACTIVE';
		const statusColor = isActive ? '🟢' : '🔴';
		
		const message = `
	🌐 <b>TTL CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}
	<b>TTL Value:</b> ${isActive ? currentTTL : 'No TTL rule'}

	${Formatter.separator()}

	💡 <b>What is TTL?</b>
	TTL (Time To Live) is a value in network packets that limits their lifetime.
	Setting TTL can help bypass certain network restrictions.

	${Formatter.separator()}

	<b>📌 Tips:</b>
	• Common TTL values: 64 (Linux/Android), 65 (Windows), 128 (Windows), 255 (Unix)
	• Set custom TTL value between 1-255
	• Reset TTL to remove the rule and restore default
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to set TTL:</b>
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		ttlMenuData.get(chatId).messageId = sentMessage.message_id;
		
	  } catch (error) {
		logger.error(`TTL menu error for ${chatId}: ${error.message}`);
	  }
	}

	async handleTTLSetPreset(ctx, ttlValue) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		return;
	  }
	  
	  // Check if already set to this value
	  if (data.isActive && parseInt(data.currentTTL) === ttlValue) {
		await ctx.answerCbQuery(`TTL ${ttlValue} is already active!`);
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Setting TTL...', callback_data: 'ttl_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Setting TTL to ${ttlValue}...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.setTTL(data.modemIp, ttlValue);
		
		if (result.success) {
		  data.currentTTL = ttlValue.toString();
		  data.isActive = true;
		  ttlMenuData.set(chatId, data);
		  
		  await this.refreshTTLMenu(ctx);
		  await ctx.answerCbQuery(`✅ TTL set to ${ttlValue}!`);
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshTTLMenu(ctx);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`TTL set preset error: ${error.message}`);
		await this.refreshTTLMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleTTLCustom(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		return;
	  }
	  
	  // Show custom input prompt
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '🔙 Cancel', callback_data: 'ttl_cancel' }]
		]
	  };
	  
	  const message = `
	🌐 <b>CUSTOM TTL</b>
	${Formatter.doubleSeparator()}

	Please send the TTL value (1-255).

	Example: \`64\` (Linux/Android)
	Example: \`128\` (Windows)

	${Formatter.separator()}

	⚠️ Make sure to enter a number between 1 and 255.

	Type /cancel to abort.
	`;
	  
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  // Set state for custom TTL input
	  sessionManager.setState(chatId, 'waiting_ttl', { menuData: data });
	  await ctx.answerCbQuery();
	}

	async handleTTLSetCustom(ctx, ttlValue) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Get stored menu data from session
	  const sessionData = sessionManager.getData(chatId);
	  const data = sessionData?.menuData || ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		return;
	  }
	  
	  // Validate TTL value
	  const ttlNum = parseInt(ttlValue);
	  if (isNaN(ttlNum) || ttlNum < 1 || ttlNum > 255) {
		const errorMsg = await ctx.reply(`❌ Invalid TTL value!

	TTL must be a number between 1 and 255.
	Example: 64, 65, 128, 255

	Please try again with /ttl`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		sessionManager.clearState(chatId);
		return;
	  }
	  
	  // Check if already set to this value
	  if (data.isActive && parseInt(data.currentTTL) === ttlNum) {
		await ctx.reply(`⚠️ TTL ${ttlNum} is already active!`);
		sessionManager.clearState(chatId);
		return;
	  }
	  
	  // Delete user message
	  await this.deleteUserMessage(ctx);
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Setting TTL...', callback_data: 'ttl_processing' }]]
	  };
	  
	  const processingMsg = await ctx.reply(`⏳ Setting TTL to ${ttlNum}...`);
	  
	  try {
		const result = await modemAPI.setTTL(data.modemIp, ttlNum);
		
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		if (result.success) {
		  data.currentTTL = ttlNum.toString();
		  data.isActive = true;
		  ttlMenuData.set(chatId, data);
		  
		  await this.refreshTTLMenu(ctx);
		  sessionManager.clearState(chatId);
		  await ctx.answerCbQuery(`✅ TTL set to ${ttlNum}!`);
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshTTLMenu(ctx);
		  sessionManager.clearState(chatId);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`TTL set custom error: ${error.message}`);
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		await this.refreshTTLMenu(ctx);
		sessionManager.clearState(chatId);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleTTLReset(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Resetting TTL...', callback_data: 'ttl_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Resetting TTL...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.resetTTL(data.modemIp);
		
		if (result.success) {
		  data.currentTTL = '0';
		  data.isActive = false;
		  ttlMenuData.set(chatId, data);
		  
		  await this.refreshTTLMenu(ctx);
		  await ctx.answerCbQuery('✅ TTL reset successful!');
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshTTLMenu(ctx);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`TTL reset error: ${error.message}`);
		await this.refreshTTLMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleTTLRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const data = ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		await ctx.answerCbQuery('Refreshed!');
		return;
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const ttlStatus = await modemAPI.readTTL(modemIp);
		const currentTTL = ttlStatus.ttl || '0';
		const isActive = currentTTL !== '0';
		
		data.sessionId = sessionId;
		data.modemIp = modemIp;
		data.currentTTL = currentTTL;
		data.isActive = isActive;
		ttlMenuData.set(chatId, data);
		
		await this.refreshTTLMenu(ctx);
		await ctx.answerCbQuery('Refreshed!');
	  } catch (error) {
		logger.error(`TTL refresh error: ${error.message}`);
		await ctx.answerCbQuery('Refresh failed');
	  }
	}

	async handleTTLCancel(ctx) {
	  const chatId = ctx.chat.id;
	  sessionManager.clearState(chatId);
	  await this.refreshTTLMenu(ctx);
	  await ctx.answerCbQuery('Cancelled');
	}

	async handleTTLClose(ctx) {
	  const chatId = ctx.chat.id;
	  ttlMenuData.delete(chatId);
	  sessionManager.clearState(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	async refreshTTLMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = ttlMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleTTLMenu(ctx);
		return;
	  }
	  
	  try {
		// Get fresh status
		const ttlStatus = await modemAPI.readTTL(data.modemIp);
		const currentTTL = ttlStatus.ttl || '0';
		const isActive = currentTTL !== '0';
		
		data.currentTTL = currentTTL;
		data.isActive = isActive;
		ttlMenuData.set(chatId, data);
		
		// Common TTL presets
		const ttlPresets = [64, 65, 128, 255];
		
		// Create preset buttons
		const presetButtons = [];
		for (let i = 0; i < ttlPresets.length; i += 2) {
		  const row = [];
		  for (let j = 0; j < 2 && i + j < ttlPresets.length; j++) {
			const preset = ttlPresets[i + j];
			const isCurrent = isActive && parseInt(currentTTL) === preset;
			const buttonText = isCurrent ? `✅ TTL ${preset}` : `TTL ${preset}`;
			row.push({ text: buttonText, callback_data: `ttl_set_${preset}` });
		  }
		  presetButtons.push(row);
		}
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '✏️ Custom TTL', callback_data: 'ttl_custom' }],
			...presetButtons,
			[{ text: '🔄 Reset TTL (Remove Rule)', callback_data: 'ttl_reset' }],
			[{ text: '🔄 Refresh Status', callback_data: 'ttl_refresh' }],
			[{ text: '❌ Close', callback_data: 'ttl_close' }]
		  ]
		};
		
		const statusIcon = isActive ? '✅ ACTIVE' : '❌ INACTIVE';
		const statusColor = isActive ? '🟢' : '🔴';
		
		const message = `
	🌐 <b>TTL CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}
	<b>TTL Value:</b> ${isActive ? currentTTL : 'No TTL rule'}

	${Formatter.separator()}

	💡 <b>What is TTL?</b>
	TTL (Time To Live) is a value in network packets that limits their lifetime.
	Setting TTL can help bypass certain network restrictions.

	${Formatter.separator()}

	<b>📌 Tips:</b>
	• Common TTL values: 64 (Linux/Android), 65 (Windows), 128 (Windows), 255 (Unix)
	• Set custom TTL value between 1-255
	• Reset TTL to remove the rule and restore default
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to set TTL:</b>
	`;
		
		await ctx.editMessageText(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
	  } catch (error) {
		logger.error(`Refresh TTL menu error: ${error.message}`);
	  }
	}
	// ======= END OF TTL COMMANDS ========

  // setttl commands
  async handleSetTTL(ctx) {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      await ctx.reply('❌ Usage: /setttl <value>\n\nExample: /setttl 64\n\nValid values: 64-255');
      return;
    }
    
    const ttlValue = parseInt(args[1]);
    
    if (isNaN(ttlValue) || ttlValue < 1 || ttlValue > 255) {
      await ctx.reply('❌ Invalid TTL value. Please use a number between 1 and 255.');
      return;
    }
    
    const modemIp = await uci.getConfig('modem_ip');
    
    await ctx.reply(`🔄 Setting TTL to ${ttlValue}...`);
    
    try {
      const result = await modemAPI.setTTL(modemIp, ttlValue);
      
      if (result.success) {
        await ctx.reply(`✅ ${result.msg || `TTL set to ${ttlValue}`}`);
      } else {
        await ctx.reply(`❌ Failed to set TTL: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error(`Set TTL error: ${error.message}`);
      await ctx.reply(`❌ Failed to set TTL: ${error.message}`);
    }
  }

  async handleResetTTL(ctx) {
    const modemIp = await uci.getConfig('modem_ip');
    
    await ctx.reply('🔄 Resetting TTL...');
    
    try {
      const result = await modemAPI.resetTTL(modemIp);
      
      if (result.success) {
        await ctx.reply(`✅ ${result.msg || 'TTL reset successful'}`);
      } else {
        await ctx.reply(`❌ Failed to reset TTL: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error(`Reset TTL error: ${error.message}`);
      await ctx.reply(`❌ Failed to reset TTL: ${error.message}`);
    }
  }


	async handleTTLStatus(ctx) {
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  try {
		const ttlStatus = await modemAPI.readTTL(modemIp);
		await ctx.reply(Formatter.formatTTL(ttlStatus), { parse_mode: 'Markdown' });
	  } catch (error) {
		logger.error(`TTL status error: ${error.message}`);
		await ctx.reply(`❌ Failed to get TTL status: ${error.message}`);
	  }
	}  
    
	// Add these methods to CommandHandlers class

	async handleTraffic(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);  
	  
	  try {
		const sessionId = await this.ensureAuth(ctx);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const traffic = await modemAPI.getTrafficInfo(modemIp, sessionId);
		await ctx.reply(Formatter.formatTraffic(traffic), { parse_mode: 'Markdown' });
	  } catch (error) {
		logger.error(`Traffic error for ${chatId}: ${error.message}`);
	  }
	}

	// =============== LOG commands =============== 
	// /log commands
	async handleLog(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Hapus menu lama jika ada
	  const existingData = logMenuData.get(chatId);
	  if (existingData && existingData.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, existingData.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '📋 View Logs', callback_data: 'log_view' }],
			[{ text: '🗑️ Clear Logs', callback_data: 'log_clear' }],
			[{ text: '❌ Close', callback_data: 'log_close' }]
		  ]
		};
		
		const message = `
	📋 <b>LOG MANAGER</b>
	${Formatter.doubleSeparator()}

	<b>📌 Options:</b>
	• View Logs - Display system logs
	• Clear Logs - Delete all logs (requires confirmation)

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Logs show authentication attempts and system events
	• Logs are stored in modem memory
	• Clearing logs cannot be undone

	${Formatter.separator()}
	<b>🖱️ Click buttons below:</b>
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		logMenuData.set(chatId, {
		  messageId: sentMessage.message_id,
		  sessionId: sessionId,
		  modemIp: modemIp
		});
		
	  } catch (error) {
		logger.error(`Log menu error for ${chatId}: ${error.message}`);
	  }
	}

	async handleLogView(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = logMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLog(ctx);
		return;
	  }
	  
	  // Show loading di pesan yang sama
	  const loadingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Loading logs...', callback_data: 'log_processing' }]]
	  };
	  
	  await ctx.editMessageText(`📋 Fetching system logs...\n\n⏳ Please wait...`, {
		parse_mode: 'HTML',
		reply_markup: loadingKeyboard
	  });
	  
	  try {
		let logData = await modemAPI.getLogInfo(data.modemIp, data.sessionId);
		
		// Cek apakah response adalah NO_AUTH
		if (this.isNoAuthResponse(logData)) {
		  logger.info(`Log view got NO_AUTH, refreshing session...`);
		  
		  // Refresh session (auto-login)
		  const newSessionId = await ModemAuth.autoLogin(chatId);
		  
		  // Update data dengan session baru
		  data.sessionId = newSessionId;
		  data.modemIp = ModemAuth.getModemIp(chatId);
		  logMenuData.set(chatId, data);
		  
		  // Retry get log with new session
		  logData = await modemAPI.getLogInfo(data.modemIp, data.sessionId);
		  
		  // Jika masih NO_AUTH, beri tahu user
		  if (this.isNoAuthResponse(logData)) {
			await ctx.editMessageText(`❌ Failed to fetch logs: Authentication failed. Please try again later.`, {
			  parse_mode: 'HTML',
			  reply_markup: {
				inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
			  }
			});
			await ctx.answerCbQuery();
			return;
		  }
		}
		
		if (!logData) {
		  await ctx.editMessageText(`📋 No log data available`, {
			parse_mode: 'HTML',
			reply_markup: {
			  inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
			}
		  });
		  await ctx.answerCbQuery();
		  return;
		}
		
		const formattedLog = Formatter.formatLog(logData);
		
		// Keyboard untuk view logs
		const keyboard = {
		  inline_keyboard: [
			[{ text: '🔄 Refresh', callback_data: 'log_refresh' }],
			[{ text: '◀️ Back to Menu', callback_data: 'log_back' }],
			[{ text: '❌ Close', callback_data: 'log_close' }]
		  ]
		};
		
		// Edit pesan yang sama dengan log
		await ctx.editMessageText(formattedLog, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		await ctx.answerCbQuery();
		
	  } catch (error) {
		logger.error(`View log error: ${error.message}`);
		await ctx.editMessageText(`❌ Failed to fetch logs: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
		  }
		});
		await ctx.answerCbQuery();
	  }
	}

	// Helper untuk cek response NO_AUTH
	isNoAuthResponse(response) {
	  if (!response) return false;
	  
	  // Cek jika response adalah string
	  if (typeof response === 'string') {
		return response.includes('NO_AUTH');
	  }
	  
	  // Cek jika response adalah object
	  if (typeof response === 'object') {
		return response.success === false && response.message === 'NO_AUTH';
	  }
	  
	  return false;
	}

	async handleLogRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = logMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLog(ctx);
		return;
	  }
	  
	  // Tampilkan loading di pesan yang sama
	  const loadingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Refreshing...', callback_data: 'log_processing' }]]
	  };
	  
	  await ctx.editMessageText(`📋 Refreshing logs...\n\n⏳ Please wait...`, {
		parse_mode: 'HTML',
		reply_markup: loadingKeyboard
	  });
	  
	  try {
		let logData = await modemAPI.getLogInfo(data.modemIp, data.sessionId);
		
		// Cek apakah response adalah NO_AUTH
		if (this.isNoAuthResponse(logData)) {
		  logger.info(`Log refresh got NO_AUTH, refreshing session...`);
		  
		  // Refresh session (auto-login)
		  const newSessionId = await ModemAuth.autoLogin(chatId);
		  
		  // Update data dengan session baru
		  data.sessionId = newSessionId;
		  data.modemIp = ModemAuth.getModemIp(chatId);
		  logMenuData.set(chatId, data);
		  
		  // Retry get log with new session
		  logData = await modemAPI.getLogInfo(data.modemIp, data.sessionId);
		  
		  // Jika masih NO_AUTH
		  if (this.isNoAuthResponse(logData)) {
			await ctx.editMessageText(`❌ Failed to refresh logs: Authentication failed. Please try again later.`, {
			  parse_mode: 'HTML',
			  reply_markup: {
				inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
			  }
			});
			await ctx.answerCbQuery();
			return;
		  }
		}
		
		if (!logData) {
		  await ctx.editMessageText(`📋 No log data available`, {
			parse_mode: 'HTML',
			reply_markup: {
			  inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
			}
		  });
		  await ctx.answerCbQuery();
		  return;
		}
		
		const formattedLog = Formatter.formatLog(logData);
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '🔄 Refresh', callback_data: 'log_refresh' }],
			[{ text: '◀️ Back to Menu', callback_data: 'log_back' }],
			[{ text: '❌ Close', callback_data: 'log_close' }]
		  ]
		};
		
		await ctx.editMessageText(formattedLog, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		await ctx.answerCbQuery('Refreshed!');
		
	  } catch (error) {
		logger.error(`Refresh log error: ${error.message}`);
		await ctx.editMessageText(`❌ Failed to refresh logs: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
		  }
		});
		await ctx.answerCbQuery();
	  }
	}

	async handleLogClear(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = logMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLog(ctx);
		return;
	  }
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '✅ Yes, Clear Logs', callback_data: 'log_clear_confirm' }],
		  [{ text: '❌ Cancel', callback_data: 'log_cancel' }]
		]
	  };
	  
	  const message = `
	🗑️ <b>CLEAR LOGS</b>
	${Formatter.doubleSeparator()}

	⚠️ <b>WARNING:</b>
	This action will permanently delete all system logs.

	${Formatter.separator()}

	Are you sure you want to continue?
	`;
	  
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  await ctx.answerCbQuery();
	}

	async handleLogClearConfirm(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = logMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLog(ctx);
		return;
	  }
	  
	  // Show processing di pesan yang sama
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'log_processing' }]]
	  };
	  
	  await ctx.editMessageText(`🗑️ Clearing logs...\n\n⏳ Please wait...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		let result = await modemAPI.clearLog(data.modemIp, data.sessionId);
		
		// Cek apakah response adalah NO_AUTH
		if (result && result.success === false && result.message === 'NO_AUTH') {
		  logger.info(`Clear log got NO_AUTH, refreshing session...`);
		  
		  // Refresh session (auto-login)
		  const newSessionId = await ModemAuth.autoLogin(chatId);
		  
		  // Update data dengan session baru
		  data.sessionId = newSessionId;
		  data.modemIp = ModemAuth.getModemIp(chatId);
		  logMenuData.set(chatId, data);
		  
		  // Retry clear log with new session
		  result = await modemAPI.clearLog(data.modemIp, data.sessionId);
		}
		
		if (result && result.success) {
		  const successKeyboard = {
			inline_keyboard: [
			  [{ text: '✅ View Logs', callback_data: 'log_view' }],
			  [{ text: '◀️ Back to Menu', callback_data: 'log_back' }],
			  [{ text: '❌ Close', callback_data: 'log_close' }]
			]
		  };
		  
		  await ctx.editMessageText(`✅ Logs cleared successfully!\n\nLogs have been deleted from the modem.`, {
			parse_mode: 'HTML',
			reply_markup: successKeyboard
		  });
		  
		  ModemAuth.clearSession(chatId);
		} else {
		  const errorKeyboard = {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
		  };
		  
		  await ctx.editMessageText(`❌ Failed to clear logs: ${result?.message || 'Unknown error'}`, {
			parse_mode: 'HTML',
			reply_markup: errorKeyboard
		  });
		}
		
		await ctx.answerCbQuery(result?.success ? 'Logs cleared!' : 'Failed');
		
	  } catch (error) {
		logger.error(`Clear log error: ${error.message}`);
		await ctx.editMessageText(`❌ Failed to clear logs: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'log_back' }]]
		  }
		});
		await ctx.answerCbQuery('Error');
	  }
	}

	async handleLogCancel(ctx) {
	  const chatId = ctx.chat.id;
	  await this.handleLog(ctx);
	  await ctx.answerCbQuery('Cancelled');
	}

	async handleLogBack(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = logMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLog(ctx);
		return;
	  }
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '📋 View Logs', callback_data: 'log_view' }],
		  [{ text: '🗑️ Clear Logs', callback_data: 'log_clear' }],
		  [{ text: '❌ Close', callback_data: 'log_close' }]
		]
	  };
	  
	  const message = `
	📋 <b>LOG MANAGER</b>
	${Formatter.doubleSeparator()}

	<b>📌 Options:</b>
	• View Logs - Display system logs
	• Clear Logs - Delete all logs (requires confirmation)

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Logs show authentication attempts and system events
	• Logs are stored in modem memory
	• Clearing logs cannot be undone

	${Formatter.separator()}
	<b>🖱️ Click buttons below:</b>
	`;
	  
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  await ctx.answerCbQuery();
	}

	async handleLogClose(ctx) {
	  const chatId = ctx.chat.id;
	  logMenuData.delete(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {}
	  await ctx.answerCbQuery('Closed');
	}
	// =============== LOG commands =============== 

	async handleClients(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  try {
		const clients = await modemAPI.getLimiterMonitor(modemIp);
		await ctx.reply(Formatter.formatLimiterMonitor(clients), { parse_mode: 'Markdown' });
	  } catch (error) {
		logger.error(`Clients error: ${error.message}`);
		await ctx.reply(`❌ Failed to get client list: ${error.message}`);
	  }
	}

	// === /data commands ====
	// /data commands
	async handleDataMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Stop any existing data menu for this chat
	  if (dataMenuData.has(chatId)) {
		dataMenuData.delete(chatId);
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		// Get current data status
		const status = await modemAPI.getStatus(modemIp, sessionId);
		const isDataOn = status.data_switch === '1';
		
		// Create dynamic buttons based on current state
		const dataButtonText = isDataOn ? '📡 Turn Data OFF' : '📡 Turn Data ON';
		const dataButtonCallback = isDataOn ? 'data_off' : 'data_on';
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: dataButtonText, callback_data: dataButtonCallback }],
			[{ text: '🔄 Refresh IP', callback_data: 'data_refresh_ip' }],
			[{ text: '🔄 Refresh Status', callback_data: 'data_refresh' }],
			[{ text: '❌ Close', callback_data: 'data_close' }]
		  ]
		};
		
		// Store current data
		dataMenuData.set(chatId, {
		  sessionId: sessionId,
		  modemIp: modemIp,
		  isDataOn: isDataOn,
		  messageId: null
		});
		
		const statusIcon = isDataOn ? '✅ ENABLED' : '❌ DISABLED';
		const statusColor = isDataOn ? '🟢' : '🔴';
		
		// Get IP info
		const device = await modemAPI.getDeviceInfo(modemIp, sessionId);
		const wanIp = device.wan_ip || 'N/A';
		const wanIpv6 = device.wan_ipv6_ip || 'N/A';
		const gateway = device.wan_gateway || 'N/A';
		const dns = device.wan_dns || 'N/A';
		
		// Format IPv6
		let ipv6Display = wanIpv6;
		if (ipv6Display !== 'N/A' && ipv6Display.length > 45) {
		  ipv6Display = ipv6Display.substring(0, 40) + '...';
		}
		
		const message = `
	📡 <b>DATA CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}

	${Formatter.separator()}

	<b>🌐 Connection Info:</b>
	   • IPv4: ${wanIp}
	   • IPv6: ${ipv6Display}
	   • Gateway: ${gateway}
	   • DNS: ${dns}

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Turning data OFF will disconnect internet
	• Turning data ON will reconnect to network
	• "Refresh IP" will toggle data OFF/ON to get new IP
	• Use "Refresh Status" to update current state

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control data:</b>
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		dataMenuData.get(chatId).messageId = sentMessage.message_id;
		
	  } catch (error) {
		logger.error(`Data menu error for ${chatId}: ${error.message}`);
	  }
	}

	async handleDataOnFromMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = dataMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleDataMenu(ctx);
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Enabling data...', callback_data: 'data_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Enabling mobile data...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.setDataSwitch(data.modemIp, data.sessionId, true);
		
		if (result.success) {
		  data.isDataOn = true;
		  dataMenuData.set(chatId, data);
		  
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery('✅ Data enabled!');
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`Data on error: ${error.message}`);
		await this.refreshDataMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleDataOffFromMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = dataMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleDataMenu(ctx);
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Disabling data...', callback_data: 'data_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Disabling mobile data...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		const result = await modemAPI.setDataSwitch(data.modemIp, data.sessionId, false);
		
		if (result.success) {
		  data.isDataOn = false;
		  dataMenuData.set(chatId, data);
		  
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery('✅ Data disabled!');
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery(`Failed: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`Data off error: ${error.message}`);
		await this.refreshDataMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleDataRefreshIP(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = dataMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleDataMenu(ctx);
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Refreshing IP...', callback_data: 'data_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${Formatter.separator()}\n⏳ Refreshing IP address (toggling data)...`, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		// Turn off data first
		let result = await modemAPI.setDataSwitch(data.modemIp, data.sessionId, false);
		
		if (!result.success) {
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery(`Failed to disable data: ${result.message || 'Unknown error'}`);
		  return;
		}
		
		// Wait 2 seconds
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Turn on data again
		result = await modemAPI.setDataSwitch(data.modemIp, data.sessionId, true);
		
		if (result.success) {
		  data.isDataOn = true;
		  dataMenuData.set(chatId, data);
		  
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery('✅ IP refreshed! New IP assigned.');
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshDataMenu(ctx);
		  await ctx.answerCbQuery(`Failed to enable data: ${result.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`Data refresh IP error: ${error.message}`);
		await this.refreshDataMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	async handleDataRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const data = dataMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleDataMenu(ctx);
		await ctx.answerCbQuery('Refreshed!');
		return;
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const status = await modemAPI.getStatus(modemIp, sessionId);
		const isDataOn = status.data_switch === '1';
		
		data.sessionId = sessionId;
		data.modemIp = modemIp;
		data.isDataOn = isDataOn;
		dataMenuData.set(chatId, data);
		
		await this.refreshDataMenu(ctx);
		await ctx.answerCbQuery('Refreshed!');
	  } catch (error) {
		logger.error(`Data refresh error: ${error.message}`);
		await ctx.answerCbQuery('Refresh failed');
	  }
	}

	async handleDataClose(ctx) {
	  const chatId = ctx.chat.id;
	  dataMenuData.delete(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	async refreshDataMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = dataMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleDataMenu(ctx);
		return;
	  }
	  
	  try {
		// Get fresh data
		const status = await modemAPI.getStatus(data.modemIp, data.sessionId);
		const isDataOn = status.data_switch === '1';
		const device = await modemAPI.getDeviceInfo(data.modemIp, data.sessionId);
		
		const wanIp = device.wan_ip || 'N/A';
		const wanIpv6 = device.wan_ipv6_ip || 'N/A';
		const gateway = device.wan_gateway || 'N/A';
		const dns = device.wan_dns || 'N/A';
		
		// Format IPv6
		let ipv6Display = wanIpv6;
		if (ipv6Display !== 'N/A' && ipv6Display.length > 45) {
		  ipv6Display = ipv6Display.substring(0, 40) + '...';
		}
		
		// Update data
		data.isDataOn = isDataOn;
		dataMenuData.set(chatId, data);
		
		// Create dynamic buttons
		const dataButtonText = isDataOn ? '📡 Turn Data OFF' : '📡 Turn Data ON';
		const dataButtonCallback = isDataOn ? 'data_off' : 'data_on';
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: dataButtonText, callback_data: dataButtonCallback }],
			[{ text: '🔄 Refresh IP', callback_data: 'data_refresh_ip' }],
			[{ text: '🔄 Refresh Status', callback_data: 'data_refresh' }],
			[{ text: '❌ Close', callback_data: 'data_close' }]
		  ]
		};
		
		const statusIcon = isDataOn ? '✅ ENABLED' : '❌ DISABLED';
		const statusColor = isDataOn ? '🟢' : '🔴';
		
		const message = `
	📡 <b>DATA CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}

	${Formatter.separator()}

	<b>🌐 Connection Info:</b>
	   • IPv4: ${wanIp}
	   • IPv6: ${ipv6Display}
	   • Gateway: ${gateway}
	   • DNS: ${dns}

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Turning data OFF will disconnect internet
	• Turning data ON will reconnect to network
	• "Refresh IP" will toggle data OFF/ON to get new IP
	• Use "Refresh Status" to update current state

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control data:</b>
	`;
		
		await ctx.editMessageText(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
	  } catch (error) {
		logger.error(`Refresh data menu error: ${error.message}`);
	  }
	}
	// === /data commands ====

	// /dataon commands
	async handleDataOn(ctx) {
	  const chatId = ctx.chat.id;
	  
	  try {
		const sessionId = await this.ensureAuth(ctx);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		await ctx.reply('📡 Enabling mobile data...');
		const result = await modemAPI.setDataSwitch(modemIp, sessionId, true);
		
		if (result.success) {
		  await ctx.reply(Formatter.formatDataSwitch('1'), { parse_mode: 'Markdown' });
		} else {
		  await ctx.reply(`❌ Failed to enable data: ${result.message}`);
		}
	  } catch (error) {
		logger.error(`Data on error: ${error.message}`);
		await ctx.reply(`❌ Failed to enable data: ${error.message}`);
	  }
	}
	
	// /dataoff commands
	async handleDataOff(ctx) {
	  const chatId = ctx.chat.id;
	  
	  try {
		const sessionId = await this.ensureAuth(ctx);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		await ctx.reply('📡 Disabling mobile data...');
		const result = await modemAPI.setDataSwitch(modemIp, sessionId, false);
		
		if (result.success) {
		  await ctx.reply(Formatter.formatDataSwitch('0'), { parse_mode: 'Markdown' });
		} else {
		  await ctx.reply(`❌ Failed to disable data: ${result.message}`);
		}
	  } catch (error) {
		logger.error(`Data off error: ${error.message}`);
		await ctx.reply(`❌ Failed to disable data: ${error.message}`);
	  }
	}

	// /currentband commands
	async handleCurrentBand(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const bandInfo = await modemAPI.getCurrentBand(modemIp, sessionId);
		
		// Validate data
		if (bandInfo.cell_id === 'undefined' || bandInfo.cell_id === undefined) {
		  bandInfo.cell_id = 'N/A';
		}
		
		await ctx.reply(Formatter.formatCurrentBand(bandInfo), { parse_mode: 'HTML' });
		
	  } catch (error) {
		logger.error(`Current band error for ${chatId}: ${error.message}`);
		await ctx.reply(`❌ Failed to get current band info: ${error.message}

	Possible solutions:
	1. Make sure modem is connected to network
	2. Try /logout and /band again
	3. Check if SIM card is active`);
	  }
	}

	// /config command handle
	async handleConfig(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  const isAllowed = await uci.isUserAllowed(chatId);
	  
	  if (!isAllowed) {
		const errorMsg = await ctx.reply('❌ You are not authorized to view configuration.');
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
		return;
	  }
	  
	  try {
		const config = await uci.getAllConfig();
		
		let configText = `⚙️ CONFIGURATION
	${Formatter.doubleSeparator()}\n`;
		
		for (const [key, value] of Object.entries(config)) {
		  if (key === 'modem_password') {
			configText += `\n• ${key}: ${'•'.repeat(value.length)}`;
		  } else if (key === 'bot_token') {
			configText += `\n• ${key}: ${value ? '***SET***' : '❌ NOT SET'}`;
		  } else if (key === 'allowed_users') {
			const userCount = value ? value.split(',').length : 0;
			configText += `\n• ${key}: ${userCount} user(s) authorized`;
		  } else {
			configText += `\n• ${key}: ${value || '❌ Not set'}`;
		  }
		}
		
		configText += `

	${Formatter.separator()}

	💡 Use /setconfig key value to update configuration
	📝 Available keys: modem_ip, modem_user, modem_password, log_level`;
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '🔄 Refresh', callback_data: 'config_refresh' }],
			[{ text: '❌ Close', callback_data: 'config_close' }]
		  ]
		};
		
		const sentMessage = await ctx.reply(configText, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Store message ID for later
		sessionManager.setState(chatId, 'config_menu', { messageId: sentMessage.message_id });
		
	  } catch (error) {
		logger.error(`Config error: ${error.message}`);
		const errorMsg = await ctx.reply(`❌ Failed to load configuration: ${error.message}`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
	  }
	}

	async handleConfigRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const menuData = sessionManager.getData(chatId);
	  const originalMessage = ctx.callbackQuery.message;
	  
	  // Show refreshing status
	  const refreshKeyboard = {
		inline_keyboard: [[{ text: '⏳ Refreshing...', callback_data: 'config_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n🔄 Refreshing configuration...`, {
		parse_mode: 'HTML',
		reply_markup: refreshKeyboard
	  });
	  
	  try {
		const config = await uci.getAllConfig();
		
		let configText = `⚙️ CONFIGURATION
	${Formatter.doubleSeparator()}\n`;
		
		for (const [key, value] of Object.entries(config)) {
		  if (key === 'modem_password') {
			configText += `\n• ${key}: ${'•'.repeat(value.length)}`;
		  } else if (key === 'bot_token') {
			configText += `\n• ${key}: ${value ? '***SET***' : '❌ NOT SET'}`;
		  } else if (key === 'allowed_users') {
			const userCount = value ? value.split(',').length : 0;
			configText += `\n• ${key}: ${userCount} user(s) authorized`;
		  } else {
			configText += `\n• ${key}: ${value || '❌ Not set'}`;
		  }
		}
		
		configText += `

	${Formatter.separator()}

	💡 Use /setconfig key value to update configuration
	📝 Available keys: modem_ip, modem_user, modem_password, log_level`;
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '🔄 Refresh', callback_data: 'config_refresh' }],
			[{ text: '❌ Close', callback_data: 'config_close' }]
		  ]
		};
		
		await ctx.editMessageText(configText, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
	  } catch (error) {
		logger.error(`Config refresh error: ${error.message}`);
		await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n❌ Failed to refresh: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back', callback_data: 'config_back' }]]
		  }
		});
	  }
	  
	  await ctx.answerCbQuery('Refreshed!');
	}

	async handleConfigClose(ctx) {
	  const chatId = ctx.chat.id;
	  sessionManager.clearState(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}

	async handleConfigBack(ctx) {
	  const chatId = ctx.chat.id;
	  const menuData = sessionManager.getData(chatId);
	  if (menuData) {
		await this.handleConfig(ctx);
	  }
	  await ctx.answerCbQuery();
	}

	async handleSetConfig(ctx) {
	  const chatId = ctx.chat.id;
	  const args = ctx.message.text.split(' ');
	  const isAllowed = await uci.isUserAllowed(chatId);
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  if (!isAllowed) {
		const errorMsg = await ctx.reply('❌ You are not authorized to modify configuration.');
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
		return;
	  }
	  
	  if (args.length < 3) {
		const errorMsg = await ctx.reply(`❌ Usage: /setconfig <key> <value>

	Available keys: modem_ip, modem_user, modem_password, log_level

	Example:
	/setconfig modem_ip 192.168.0.1
	/setconfig modem_user root
	/setconfig modem_password admin
	/setconfig log_level info`);
		
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		return;
	  }
	  
	  const key = args[1];
	  const value = args.slice(2).join(' ');
	  const validKeys = ['modem_ip', 'modem_user', 'modem_password', 'log_level'];
	  
	  if (!validKeys.includes(key)) {
		const errorMsg = await ctx.reply(`❌ Invalid key. Available keys: ${validKeys.join(', ')}`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
		return;
	  }
	  
	  const success = await uci.setConfig(key, value);
	  
	  if (success) {
		const successMsg = await ctx.reply(`✅ Configuration updated: ${key} = ${key === 'modem_password' ? '*'.repeat(value.length) : value}`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
		}, 3000);
		
		// Clear session to force re-login with new credentials
		ModemAuth.clearSession(chatId);
	  } else {
		const errorMsg = await ctx.reply(`❌ Failed to update configuration.`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 3000);
	  }
	}
	
// ========== WIFI COMMANDS ==========

// Helper methods
getEncryptionTypeName(type) {
  const types = {
    '0': '🔓 Open (No Password)',
    '1': '🔐 WEP',
    '2': '🔐 WPA2-PSK',
    '3': '🔐 WPA/WPA2-PSK',
    '4': '🔐 WPA3-PSK',
    '5': '🔐 WPA2/WPA3-PSK'
  };
  return types[type] || `Type ${type}`;
}

getBandwidthDisplay(bandwidth) {
  const bwMap = {
    '0': '20 MHz',
    '1': '40 MHz',
    '2': '20/40 MHz',
    '3': '80 MHz',
    '4': '20/40/80 MHz',
    '5': '160 MHz'
  };
  return bwMap[bandwidth] || 'Auto';
}

// ========== MAIN MENU ==========
async handleWifiDetail(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  await this.deleteUserMessage(ctx, 100);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    
    const [wifi24g, wifi5g] = await Promise.all([
      modemAPI.getWifi24gConfig(modemIp, sessionId),
      modemAPI.getWifi5gConfig(modemIp, sessionId)
    ]);
    
    const ssid24 = modemAPI.decodeBase64Ssid(wifi24g.ssid);
    const ssid5 = modemAPI.decodeBase64Ssid(wifi5g.ssid);
    const encryptionType24 = this.getEncryptionTypeName(wifi24g.authenticationType);
    const encryptionType5 = this.getEncryptionTypeName(wifi5g.authenticationType);
    
    const is24gOn = wifi24g.wifiOpen === '1';
    const is5gOn = wifi5g.wifiOpen === '1';
    
    const wifi24ToggleText = is24gOn ? '📶 2.4GHz OFF' : '📶 2.4GHz ON';
    const wifi5ToggleText = is5gOn ? '📡 5GHz OFF' : '📡 5GHz ON';
    const bothToggleText = (is24gOn || is5gOn) ? '🔘 All WiFi OFF' : '🔘 All WiFi ON';
    
	const keyboard = {
	  inline_keyboard: [
		[{ text: bothToggleText, callback_data: 'wifi_both_toggle' }],
		[{ text: wifi24ToggleText, callback_data: 'wifi_24_toggle' }, { text: wifi5ToggleText, callback_data: 'wifi_5_toggle' }],
		[{ text: '⚙️ Advanced Settings', callback_data: 'wifi_advanced' }],
		[{ text: '📱 Share WiFi (QR)', callback_data: 'wifi_share' }],
		[{ text: '🔄 Refresh', callback_data: 'wifi_refresh' }],
		[{ text: '❌ Close', callback_data: 'wifi_close' }]
	  ]
	};
    
    const message = `
📶 <b>WIFI CONTROL MENU</b>
${Formatter.doubleSeparator()}

<b>📡 2.4GHz WiFi:</b> ${is24gOn ? '✅ ON' : '❌ OFF'}
   • SSID: ${ssid24 || 'N/A'}
   • Encryption: ${encryptionType24}
   • TX Power: ${wifi24g.txPower || '100'}%
   • Broadcast: ${wifi24g.broadcast === '1' ? '✅ Visible' : '❌ Hidden'}

${Formatter.separator()}

<b>📡 5GHz WiFi:</b> ${is5gOn ? '✅ ON' : '❌ OFF'}
   • SSID: ${ssid5 || 'N/A'}
   • Encryption: ${encryptionType5}
   • TX Power: ${wifi5g.txPower || '100'}%
   • Broadcast: ${wifi5g.broadcast === '1' ? '✅ Visible' : '❌ Hidden'}

${Formatter.separator()}

💡 <b>Info:</b>
• Click "Advanced Settings" to edit SSID, password, encryption

${Formatter.separator()}
<b>🖱️ Current Status:</b> 2.4GHz: ${is24gOn ? 'ON' : 'OFF'} | 5GHz: ${is5gOn ? 'ON' : 'OFF'}
`;
    
    // SIMPAN DATA KE STORE
    const wifiData = {
      messageId: null,
      sessionId: sessionId,
      modemIp: modemIp,
      wifi24g: wifi24g,
      wifi5g: wifi5g
    };
    
    const existingData = wifiDataStore.get(chatId);
    
    if (existingData && existingData.messageId && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        wifiData.messageId = existingData.messageId;
      } catch (e) {
        if (e.message.includes('message is not modified')) {
          // Just update the reply markup
          await ctx.editMessageReplyMarkup(keyboard);
          wifiData.messageId = existingData.messageId;
        } else {
          throw e;
        }
      }
    } else {
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      wifiData.messageId = sentMessage.message_id;
    }
    
    wifiDataStore.set(chatId, wifiData);
    sessionManager.userData.set(chatId, wifiData);
    
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    
  } catch (error) {
    if (!error.message.includes('message is not modified')) {
      logger.error(`Wifi detail error: ${error.message}`);
      await this.autoDelete(ctx, `❌ Failed to get WiFi info: ${error.message}`, 30000);
    }
  }
}

// ========== GET WIFI DATA ==========
getWifiData(chatId) {
  // Try multiple sources
  let data = wifiDataStore.get(chatId);
  if (!data) data = sessionManager.userData.get(chatId);
  if (!data) data = sessionManager.getData(chatId);
  if (data && data.wifiData) data = data.wifiData;
  return data;
}

// ========== ADVANCED MENU ==========
async handleWifiAdvanced(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  let wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi24g) {
    console.log(`No wifiData, refreshing...`);
    await this.handleWifiDetail(ctx);
    wifiData = this.getWifiData(chatId);
    if (!wifiData || !wifiData.wifi24g) {
      await ctx.answerCbQuery('Please try again');
      return;
    }
  }
  
  const ssid24 = modemAPI.decodeBase64Ssid(wifiData.wifi24g.ssid);
  const ssid5 = modemAPI.decodeBase64Ssid(wifiData.wifi5g.ssid);
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📡 2.4GHz Settings', callback_data: 'wifi_24g_settings' }],
      [{ text: '📡 5GHz Settings', callback_data: 'wifi_5g_settings' }],
      [{ text: '◀️ Back to Main', callback_data: 'wifi_back_to_main' }],
      [{ text: '❌ Close', callback_data: 'wifi_close' }]
    ]
  };
  
  const message = `
⚙️ <b>WIFI ADVANCED SETTINGS</b>
${Formatter.doubleSeparator()}

<b>📡 2.4GHz Current:</b>
   • SSID: <code>${ssid24}</code>
   • Encryption: ${this.getEncryptionTypeName(wifiData.wifi24g.authenticationType)}
   • Max Stations: ${wifiData.wifi24g.wifi24g_maxNum_0 || '32'}

${Formatter.separator()}

<b>📡 5GHz Current:</b>
   • SSID: <code>${ssid5}</code>
   • Encryption: ${this.getEncryptionTypeName(wifiData.wifi5g.authenticationType)}
   • Max Stations: ${wifiData.wifi5g.wifi58g_maxNum_0 || '32'}

${Formatter.separator()}

💡 <b>What you can edit:</b>
• SSID (WiFi name)
• Password
• Encryption type
• Max connected devices

${Formatter.separator()}
<b>🖱️ Select band to configure:</b>
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  await ctx.answerCbQuery();
}

// ========== 2.4GHz SETTINGS MENU ==========
async handleWifi24gSettings(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi24g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const wifi24g = wifiData.wifi24g;
  const ssid = modemAPI.decodeBase64Ssid(wifi24g.ssid);
  const isOn = wifi24g.wifiOpen === '1';
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Edit SSID', callback_data: 'wifi_24g_edit_ssid' }],
      [{ text: '🔑 Edit Password', callback_data: 'wifi_24g_edit_password' }],
      [{ text: '🔒 Change Encryption', callback_data: 'wifi_24g_edit_encryption' }],
      [{ text: isOn ? '🔘 Turn OFF' : '🔘 Turn ON', callback_data: 'wifi_24g_toggle' }],
      [{ text: '◀️ Back to Advanced', callback_data: 'wifi_advanced' }],
      [{ text: '❌ Close', callback_data: 'wifi_close' }]
    ]
  };
  
  const message = `
📡 <b>2.4GHz WIFI SETTINGS</b>
${Formatter.doubleSeparator()}

<b>Current Settings:</b>
• Status: ${isOn ? '✅ ON' : '❌ OFF'}
• SSID: <code>${ssid}</code>
• Encryption: ${this.getEncryptionTypeName(wifi24g.authenticationType)}
• Password: ${wifi24g.key ? '••••••••' : '(No password)'}
• Broadcast: ${wifi24g.broadcast === '1' ? '✅ Visible' : '❌ Hidden'}

${Formatter.separator()}

💡 <b>Tips:</b>
• SSID: 1-32 characters
• Password: 8-31 characters (not required for Open)
• WPA2-PSK recommended

${Formatter.separator()}
<b>🖱️ Click buttons to edit:</b>
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  await ctx.answerCbQuery();
}

// ========== 5GHz SETTINGS MENU ==========
async handleWifi5gSettings(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi5g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const wifi5g = wifiData.wifi5g;
  const ssid = modemAPI.decodeBase64Ssid(wifi5g.ssid);
  const isOn = wifi5g.wifiOpen === '1';
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Edit SSID', callback_data: 'wifi_5g_edit_ssid' }],
      [{ text: '🔑 Edit Password', callback_data: 'wifi_5g_edit_password' }],
      [{ text: '🔒 Change Encryption', callback_data: 'wifi_5g_edit_encryption' }],
      [{ text: isOn ? '🔘 Turn OFF' : '🔘 Turn ON', callback_data: 'wifi_5g_toggle' }],
      [{ text: '◀️ Back to Advanced', callback_data: 'wifi_advanced' }],
      [{ text: '❌ Close', callback_data: 'wifi_close' }]
    ]
  };
  
  const message = `
📡 <b>5GHz WIFI SETTINGS</b>
${Formatter.doubleSeparator()}

<b>Current Settings:</b>
• Status: ${isOn ? '✅ ON' : '❌ OFF'}
• SSID: <code>${ssid}</code>
• Encryption: ${this.getEncryptionTypeName(wifi5g.authenticationType)}
• Password: ${wifi5g.key ? '••••••••' : '(No password)'}
• Broadcast: ${wifi5g.broadcast === '1' ? '✅ Visible' : '❌ Hidden'}

${Formatter.separator()}

💡 <b>Tips:</b>
• 5GHz offers faster speed but shorter range
• SSID: 1-32 characters
• Password: 8-31 characters

${Formatter.separator()}
<b>🖱️ Click buttons to edit:</b>
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  await ctx.answerCbQuery();
}

// ========== EDIT SSID ==========
async handleWifi24gEditSsid(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi24g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const currentSsid = modemAPI.decodeBase64Ssid(wifiData.wifi24g.ssid);
  const currentMessageId = ctx.callbackQuery.message.message_id;
  
  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Cancel', callback_data: 'wifi_24g_cancel' }]]
  };
  
  const message = `
✏️ <b>EDIT 2.4GHz SSID</b>
${Formatter.doubleSeparator()}

Current SSID: <code>${currentSsid}</code>

Please send the new SSID name.

<b>Requirements:</b>
• 1-32 characters
• Letters, numbers, and spaces allowed
• Cannot start or end with space

${Formatter.separator()}

💡 <b>Example:</b> <code>MyHomeWiFi_2.4G</code>

Type /cancel to abort.
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  sessionManager.setState(chatId, 'waiting_wifi_ssid', {
    band: '2.4',
    promptMsgId: currentMessageId,
    wifiData: wifiData
  });
  
  await ctx.answerCbQuery();
}

async handleWifi5gEditSsid(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi5g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const currentSsid = modemAPI.decodeBase64Ssid(wifiData.wifi5g.ssid);
  const currentMessageId = ctx.callbackQuery.message.message_id;
  
  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Cancel', callback_data: 'wifi_5g_cancel' }]]
  };
  
  const message = `
✏️ <b>EDIT 5GHz SSID</b>
${Formatter.doubleSeparator()}

Current SSID: <code>${currentSsid}</code>

Please send the new SSID name.

<b>Requirements:</b>
• 1-32 characters
• Letters, numbers, and spaces allowed
• Cannot start or end with space

${Formatter.separator()}

💡 <b>Example:</b> <code>MyHomeWiFi_5G</code>

Type /cancel to abort.
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  sessionManager.setState(chatId, 'waiting_wifi_ssid', {
    band: '5',
    promptMsgId: currentMessageId,
    wifiData: wifiData
  });
  
  await ctx.answerCbQuery();
}

// ========== HANDLE SSID INPUT ==========
async handleWifiSSIDInput(ctx, text) {
  const chatId = ctx.chat.id;
  const sessionData = sessionManager.getData(chatId);
  
  // Hapus prompt message
  if (sessionData && sessionData.promptMsgId) {
    try {
      await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
    } catch (e) {}
  }
  
  await this.deleteUserMessage(ctx);
  
  const newSsid = text.trim();
  if (newSsid.length < 1 || newSsid.length > 32) {
    const errorMsg = await ctx.reply(`❌ SSID must be 1-32 characters.`);
    setTimeout(() => {
      ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
    }, 3000);
    sessionManager.clearState(chatId);
    return;
  }
  
  const band = sessionData?.band || '2.4';
  let wifiData = sessionData?.wifiData || this.getWifiData(chatId);
  
  let currentConfig = band === '2.4' ? wifiData?.wifi24g : wifiData?.wifi5g;
  
  if (!currentConfig) {
    await this.handleWifiDetail(ctx);
    sessionManager.clearState(chatId);
    return;
  }
  
  const processingMsg = await ctx.reply(`⏳ Updating ${band}GHz SSID to "${newSsid}"...`);
  
  const config = {
    wifiOpen: currentConfig.wifiOpen === '1',
    broadcast: currentConfig.broadcast === '1',
    wifiwmm: currentConfig.wifiwmm === '1',
    ssid: newSsid,
    key: currentConfig.key,
    maxNum: currentConfig[band === '2.4' ? 'wifi24g_maxNum_0' : 'wifi58g_maxNum_0'] || '32',
    authenticationType: currentConfig.authenticationType || '2'
  };
  
  await this.handleWifiSaveConfigFromInput(ctx, band, config, processingMsg.message_id);
  sessionManager.clearState(chatId);
}

// ========== EDIT PASSWORD ==========
async handleWifi24gEditPassword(ctx) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  const encryptionType = wifiData?.wifi24g?.authenticationType || '2';
  
  if (encryptionType === '0') {
    await ctx.answerCbQuery('Cannot set password when encryption is Open. Change encryption first.');
    return;
  }
  
  const Formatter = require('../utils/formatter');
  
  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Cancel', callback_data: 'wifi_24g_cancel' }]]
  };
  
  const message = `
🔑 <b>EDIT 2.4GHz PASSWORD</b>
${Formatter.doubleSeparator()}

Please send the new WiFi password.

<b>Requirements:</b>
• 8-31 characters
• Letters, numbers, and symbols allowed

${Formatter.separator()}

💡 <b>Example:</b> <code>MySecurePass123!</code>

Type /cancel to abort.
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  const currentMessageId = ctx.callbackQuery.message.message_id;
  sessionManager.setState(chatId, 'waiting_wifi_password', {
    band: '2.4',
    promptMsgId: currentMessageId
  });
  
  await ctx.answerCbQuery();
}

async handleWifi5gEditPassword(ctx) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  const encryptionType = wifiData?.wifi5g?.authenticationType || '2';
  
  if (encryptionType === '0') {
    await ctx.answerCbQuery('Cannot set password when encryption is Open. Change encryption first.');
    return;
  }
  
  const Formatter = require('../utils/formatter');
  
  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Cancel', callback_data: 'wifi_5g_cancel' }]]
  };
  
  const message = `
🔑 <b>EDIT 5GHz PASSWORD</b>
${Formatter.doubleSeparator()}

Please send the new WiFi password.

<b>Requirements:</b>
• 8-31 characters
• Letters, numbers, and symbols allowed

${Formatter.separator()}

💡 <b>Example:</b> <code>MySecurePass123!</code>

Type /cancel to abort.
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  const currentMessageId = ctx.callbackQuery.message.message_id;
  sessionManager.setState(chatId, 'waiting_wifi_password', {
    band: '5',
    promptMsgId: currentMessageId
  });
  
  await ctx.answerCbQuery();
}

// ========== HANDLE PASSWORD INPUT ==========
async handleWifiPasswordInput(ctx, text) {
  const chatId = ctx.chat.id;
  const sessionData = sessionManager.getData(chatId);
  
  if (sessionData && sessionData.promptMsgId) {
    try {
      await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
    } catch (e) {}
  }
  
  await this.deleteUserMessage(ctx);
  
  const newPassword = text.trim();
  if (newPassword.length > 0 && (newPassword.length < 8 || newPassword.length > 31)) {
    const errorMsg = await ctx.reply(`❌ Password must be 8-31 characters (or empty for Open).`);
    setTimeout(() => {
      ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
    }, 3000);
    sessionManager.clearState(chatId);
    return;
  }
  
  const band = sessionData?.band || '2.4';
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData) {
    await this.handleWifiDetail(ctx);
    sessionManager.clearState(chatId);
    return;
  }
  
  const processingMsg = await ctx.reply(`⏳ Updating ${band}GHz password...`);
  
  const currentConfig = band === '2.4' ? wifiData.wifi24g : wifiData.wifi5g;
  const ssid = modemAPI.decodeBase64Ssid(currentConfig.ssid);
  
  const config = {
    wifiOpen: currentConfig.wifiOpen === '1',
    broadcast: currentConfig.broadcast === '1',
    wifiwmm: currentConfig.wifiwmm === '1',
    ssid: ssid,
    key: newPassword || '',
    maxNum: currentConfig[band === '2.4' ? 'wifi24g_maxNum_0' : 'wifi58g_maxNum_0'] || '32',
    authenticationType: currentConfig.authenticationType || '2'
  };
  
  await this.handleWifiSaveConfigFromInput(ctx, band, config, processingMsg.message_id);
  sessionManager.clearState(chatId);
}

// ========== EDIT ENCRYPTION ==========
async handleWifi24gEditEncryption(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔓 Open', callback_data: 'wifi_24g_enc_0' }],
      [{ text: '🔐 WPA2-PSK', callback_data: 'wifi_24g_enc_2' }],
      [{ text: '🔐 WPA/WPA2-PSK', callback_data: 'wifi_24g_enc_3' }],
      [{ text: '🔐 WPA3-PSK', callback_data: 'wifi_24g_enc_4' }],
      [{ text: '🔐 WPA2/WPA3-PSK', callback_data: 'wifi_24g_enc_5' }],
      [{ text: '◀️ Back', callback_data: 'wifi_24g_settings' }]
    ]
  };
  
  const message = `
🔒 <b>SELECT ENCRYPTION TYPE</b>
${Formatter.doubleSeparator()}

<b>Options:</b>
• <b>Open</b> - No password (not recommended)
• <b>WPA2-PSK</b> - Standard (recommended)
• <b>WPA/WPA2-PSK</b> - Compatible with older devices
• <b>WPA3-PSK</b> - Latest security
• <b>WPA2/WPA3-PSK</b> - Mixed mode

${Formatter.separator()}

💡 <b>Recommendation:</b> Use WPA2-PSK
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  await ctx.answerCbQuery();
}

async handleWifi5gEditEncryption(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔓 Open', callback_data: 'wifi_5g_enc_0' }],
      [{ text: '🔐 WPA2-PSK', callback_data: 'wifi_5g_enc_2' }],
      [{ text: '🔐 WPA/WPA2-PSK', callback_data: 'wifi_5g_enc_3' }],
      [{ text: '🔐 WPA3-PSK', callback_data: 'wifi_5g_enc_4' }],
      [{ text: '🔐 WPA2/WPA3-PSK', callback_data: 'wifi_5g_enc_5' }],
      [{ text: '◀️ Back', callback_data: 'wifi_5g_settings' }]
    ]
  };
  
  const message = `
🔒 <b>SELECT ENCRYPTION TYPE</b>
${Formatter.doubleSeparator()}

<b>Options:</b>
• <b>Open</b> - No password
• <b>WPA2-PSK</b> - Standard
• <b>WPA/WPA2-PSK</b> - Compatible
• <b>WPA3-PSK</b> - Latest
• <b>WPA2/WPA3-PSK</b> - Mixed

${Formatter.separator()}

💡 <b>Recommendation:</b> Use WPA2-PSK
`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  await ctx.answerCbQuery();
}

// ========== SET ENCRYPTION ==========
async handleWifi24gSetEncryption(ctx, encType) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi24g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const wifi24g = wifiData.wifi24g;
  const ssid = modemAPI.decodeBase64Ssid(wifi24g.ssid);
  
  const config = {
    wifiOpen: wifi24g.wifiOpen === '1',
    broadcast: wifi24g.broadcast === '1',
    wifiwmm: wifi24g.wifiwmm === '1',
    ssid: ssid,
    key: encType === '0' ? '' : wifi24g.key,
    maxNum: wifi24g.wifi24g_maxNum_0 || '32',
    authenticationType: encType
  };
  
  await this.handleWifiSaveConfig(ctx, '2.4', config);
}

async handleWifi5gSetEncryption(ctx, encType) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi5g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const wifi5g = wifiData.wifi5g;
  const ssid = modemAPI.decodeBase64Ssid(wifi5g.ssid);
  
  const config = {
    wifiOpen: wifi5g.wifiOpen === '1',
    broadcast: wifi5g.broadcast === '1',
    wifiwmm: wifi5g.wifiwmm === '1',
    ssid: ssid,
    key: encType === '0' ? '' : wifi5g.key,
    maxNum: wifi5g.wifi58g_maxNum_0 || '32',
    authenticationType: encType
  };
  
  await this.handleWifiSaveConfig(ctx, '5', config);
}

// ========== SAVE CONFIGURATION ==========
async handleWifiSaveConfig(ctx, band, config) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const processingKeyboard = {
    inline_keyboard: [[{ text: '⏳ Saving...', callback_data: 'wifi_processing' }]]
  };
  
  try {
    await ctx.editMessageText(`⏳ Saving ${band}GHz configuration...`, {
      parse_mode: 'HTML',
      reply_markup: processingKeyboard
    });
  } catch (e) {}
  
  try {
    let result;
    if (band === '2.4') {
      result = await modemAPI.setWifi24gConfig(wifiData.modemIp, wifiData.sessionId, config);
    } else {
      result = await modemAPI.setWifi5gConfig(wifiData.modemIp, wifiData.sessionId, config);
    }
    
    if (result && result.success && result.message === '0') {
      // Refresh data
      const [wifi24gNew, wifi5gNew] = await Promise.all([
        modemAPI.getWifi24gConfig(wifiData.modemIp, wifiData.sessionId),
        modemAPI.getWifi5gConfig(wifiData.modemIp, wifiData.sessionId)
      ]);
      
      wifiData.wifi24g = wifi24gNew;
      wifiData.wifi5g = wifi5gNew;
      wifiDataStore.set(chatId, wifiData);
      sessionManager.userData.set(chatId, wifiData);
      
      await this.handleWifiDetail(ctx);
    } else {
      await ctx.editMessageText(`❌ Failed: ${result?.message || 'Unknown error'}`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '◀️ Back', callback_data: band === '2.4' ? 'wifi_24g_settings' : 'wifi_5g_settings' }]] }
      });
    }
  } catch (error) {
    logger.error(`Save WiFi error: ${error.message}`);
    await ctx.editMessageText(`❌ Error: ${error.message}`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '◀️ Back', callback_data: band === '2.4' ? 'wifi_24g_settings' : 'wifi_5g_settings' }]] }
    });
  }
}

async handleWifiSaveConfigFromInput(ctx, band, config, processingMsgId) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  try {
    let result;
    
    if (band === '2.4') {
      result = await modemAPI.setWifi24gConfig(wifiData.modemIp, wifiData.sessionId, config);
    } else {
      result = await modemAPI.setWifi5gConfig(wifiData.modemIp, wifiData.sessionId, config);
    }
    
    if (processingMsgId) {
      try {
        await ctx.telegram.deleteMessage(chatId, processingMsgId).catch(() => {});
      } catch (e) {}
    }
    
    if (result && result.success && result.message === '0') {
      // Refresh data
      const [wifi24gNew, wifi5gNew] = await Promise.all([
        modemAPI.getWifi24gConfig(wifiData.modemIp, wifiData.sessionId),
        modemAPI.getWifi5gConfig(wifiData.modemIp, wifiData.sessionId)
      ]);
      
      wifiData.wifi24g = wifi24gNew;
      wifiData.wifi5g = wifi5gNew;
      wifiDataStore.set(chatId, wifiData);
      sessionManager.userData.set(chatId, wifiData);
      
      const successMsg = await ctx.reply(`✅ ${band}GHz SSID changed to "${config.ssid}" successfully!`);
      setTimeout(() => {
        ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
      }, 3000);
      
      await this.handleWifiDetail(ctx);
    } else {
      const errorMsg = await ctx.reply(`❌ Failed to save: ${result?.message || 'Unknown error'}`);
      setTimeout(() => {
        ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
      }, 3000);
      await this.handleWifiDetail(ctx);
    }
  } catch (error) {
    console.error(`Save error: ${error.message}`);
    if (processingMsgId) {
      try {
        await ctx.telegram.deleteMessage(chatId, processingMsgId).catch(() => {});
      } catch (e) {}
    }
    const errorMsg = await ctx.reply(`❌ Error: ${error.message}`);
    setTimeout(() => {
      ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
    }, 3000);
    await this.handleWifiDetail(ctx);
  }
}

// ========== TOGGLE FUNCTIONS ==========
async handleWifi24gToggle(ctx) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi24g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const currentConfig = wifiData.wifi24g;
  const newState = currentConfig.wifiOpen === '1' ? '0' : '1';
  
  const config = {
    wifiOpen: newState === '1',
    broadcast: currentConfig.broadcast === '1',
    wifiwmm: currentConfig.wifiwmm === '1',
    ssid: modemAPI.decodeBase64Ssid(currentConfig.ssid),
    key: currentConfig.key,
    maxNum: currentConfig.wifi24g_maxNum_0 || '32',
    authenticationType: currentConfig.authenticationType || '2'
  };
  
  await this.handleWifiSaveConfig(ctx, '2.4', config);
}

async handleWifi5gToggle(ctx) {
  const chatId = ctx.chat.id;
  const wifiData = this.getWifiData(chatId);
  
  if (!wifiData || !wifiData.wifi5g) {
    await this.handleWifiDetail(ctx);
    return;
  }
  
  const currentConfig = wifiData.wifi5g;
  const newState = currentConfig.wifiOpen === '1' ? '0' : '1';
  
  const config = {
    wifiOpen: newState === '1',
    broadcast: currentConfig.broadcast === '1',
    wifiwmm: currentConfig.wifiwmm === '1',
    ssid: modemAPI.decodeBase64Ssid(currentConfig.ssid),
    key: currentConfig.key,
    maxNum: currentConfig.wifi58g_maxNum_0 || '32',
    authenticationType: currentConfig.authenticationType || '2'
  };
  
  await this.handleWifiSaveConfig(ctx, '5', config);
}

async handleWifiBothToggle(ctx) {
  await this.handleWifi24gToggle(ctx);
  await this.handleWifi5gToggle(ctx);
}

// ========== NAVIGATION ==========
async handleWifiBackToMain(ctx) {
  const chatId = ctx.chat.id;
  await this.handleWifiDetail(ctx);
  await ctx.answerCbQuery();
}

async handleWifiRefresh(ctx) {
  const chatId = ctx.chat.id;
  await this.handleWifiDetail(ctx);
  await ctx.answerCbQuery('Refreshed!');
}

async handleWifiClose(ctx) {
  const chatId = ctx.chat.id;
  wifiDataStore.delete(chatId);
  sessionManager.clearState(chatId);
  try {
    await ctx.deleteMessage();
  } catch (e) {}
  await ctx.answerCbQuery('Closed');
}

async handleWifiCancel(ctx, band) {
  const chatId = ctx.chat.id;
  const sessionData = sessionManager.getData(chatId);
  
  if (sessionData && sessionData.promptMsgId) {
    try {
      await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
    } catch (e) {}
  }
  
  sessionManager.clearState(chatId);
  
  if (band === '2.4') {
    await this.handleWifi24gSettings(ctx);
  } else {
    await this.handleWifi5gSettings(ctx);
  }
  await ctx.answerCbQuery();
}

async handleWifi5gCancel(ctx) {
  const chatId = ctx.chat.id;
  const sessionData = sessionManager.getData(chatId);
  
  if (sessionData && sessionData.promptMsgId) {
    try {
      await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
    } catch (e) {}
  }
  
  sessionManager.clearState(chatId);
  await this.handleWifi5gSettings(ctx);
  await ctx.answerCbQuery();
}

async handleWifiProcessing(ctx) {
  await ctx.answerCbQuery('Please wait...');
}

// ========== SIMPLE COMMANDS (DIRECT) ==========
async handleWifiOn(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    
    const config24 = await modemRequest(modemIp, { cmd: 2, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const config5 = await modemRequest(modemIp, { cmd: 211, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    
    const result24 = await modemRequest(modemIp, {
      cmd: 2, method: 'POST', subcmd: 0, wifiOpen: '1',
      broadcast: config24.broadcast || '1', wifiwmm: config24.wifiwmm || '1',
      ssid: config24.ssid, key: config24.key,
      wifi24g_maxNum_0: config24.wifi24g_maxNum_0 || '32',
      authenticationType: config24.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    
    const result5 = await modemRequest(modemIp, {
      cmd: 211, method: 'POST', subcmd: 0, wifiOpen: '1',
      broadcast: config5.broadcast || '1', wifiwmm: config5.wifiwmm || '1',
      ssid: config5.ssid, key: config5.key,
      wifi58g_maxNum_0: config5.wifi58g_maxNum_0 || '32',
      authenticationType: config5.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    
    let msg = '';
    if (result24?.success && result24?.message === '0') msg += '✅ 2.4GHz ON\n';
    if (result5?.success && result5?.message === '0') msg += '✅ 5GHz ON\n';
    await this.autoDelete(ctx, msg || '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifiOff(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    
    const config24 = await modemRequest(modemIp, { cmd: 2, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const config5 = await modemRequest(modemIp, { cmd: 211, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    
    const result24 = await modemRequest(modemIp, {
      cmd: 2, method: 'POST', subcmd: 0, wifiOpen: '0',
      broadcast: config24.broadcast || '1', wifiwmm: config24.wifiwmm || '1',
      ssid: config24.ssid, key: config24.key,
      wifi24g_maxNum_0: config24.wifi24g_maxNum_0 || '32',
      authenticationType: config24.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    
    const result5 = await modemRequest(modemIp, {
      cmd: 211, method: 'POST', subcmd: 0, wifiOpen: '0',
      broadcast: config5.broadcast || '1', wifiwmm: config5.wifiwmm || '1',
      ssid: config5.ssid, key: config5.key,
      wifi58g_maxNum_0: config5.wifi58g_maxNum_0 || '32',
      authenticationType: config5.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    
    let msg = '';
    if (result24?.success && result24?.message === '0') msg += '✅ 2.4GHz OFF\n';
    if (result5?.success && result5?.message === '0') msg += '✅ 5GHz OFF\n';
    await this.autoDelete(ctx, msg || '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifi24On(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    const config = await modemRequest(modemIp, { cmd: 2, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const result = await modemRequest(modemIp, {
      cmd: 2, method: 'POST', subcmd: 0, wifiOpen: '1',
      broadcast: config.broadcast || '1', wifiwmm: config.wifiwmm || '1',
      ssid: config.ssid, key: config.key,
      wifi24g_maxNum_0: config.wifi24g_maxNum_0 || '32',
      authenticationType: config.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    await this.autoDelete(ctx, result?.success && result?.message === '0' ? '✅ 2.4GHz ON' : '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifi24Off(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    const config = await modemRequest(modemIp, { cmd: 2, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const result = await modemRequest(modemIp, {
      cmd: 2, method: 'POST', subcmd: 0, wifiOpen: '0',
      broadcast: config.broadcast || '1', wifiwmm: config.wifiwmm || '1',
      ssid: config.ssid, key: config.key,
      wifi24g_maxNum_0: config.wifi24g_maxNum_0 || '32',
      authenticationType: config.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    await this.autoDelete(ctx, result?.success && result?.message === '0' ? '✅ 2.4GHz OFF' : '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifi5On(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    const config = await modemRequest(modemIp, { cmd: 211, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const result = await modemRequest(modemIp, {
      cmd: 211, method: 'POST', subcmd: 0, wifiOpen: '1',
      broadcast: config.broadcast || '1', wifiwmm: config.wifiwmm || '1',
      ssid: config.ssid, key: config.key,
      wifi58g_maxNum_0: config.wifi58g_maxNum_0 || '32',
      authenticationType: config.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    await this.autoDelete(ctx, result?.success && result?.message === '0' ? '✅ 5GHz ON' : '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifi5Off(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    const config = await modemRequest(modemIp, { cmd: 211, method: 'GET', wifi_advance: 1, subcmd: 0 }, sessionId);
    const result = await modemRequest(modemIp, {
      cmd: 211, method: 'POST', subcmd: 0, wifiOpen: '0',
      broadcast: config.broadcast || '1', wifiwmm: config.wifiwmm || '1',
      ssid: config.ssid, key: config.key,
      wifi58g_maxNum_0: config.wifi58g_maxNum_0 || '32',
      authenticationType: config.authenticationType || '2', wifi_advance: 1
    }, sessionId);
    await this.autoDelete(ctx, result?.success && result?.message === '0' ? '✅ 5GHz OFF' : '❌ Failed', 30000);
    ModemAuth.clearSession(chatId);
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

async handleWifiToggle(ctx) {
  const chatId = ctx.chat.id;
  await this.deleteUserMessage(ctx);
  
  try {
    const sessionId = await this.ensureAuth(ctx, true);
    const modemIp = ModemAuth.getModemIp(chatId);
    const wifiStatus = await modemAPI.getWifiStatus(modemIp, sessionId);
    
    if (wifiStatus.wifi24g_enabled || wifiStatus.wifi5g_enabled) {
      await this.handleWifiOff(ctx);
    } else {
      await this.handleWifiOn(ctx);
    }
  } catch (error) {
    await this.autoDelete(ctx, `❌ Error: ${error.message}`, 30000);
  }
}

// ========== SHARE WIFI ==========
async handleWifiShare(ctx) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  
  await this.deleteUserMessage(ctx, 100);
  
  try {
    // Ambil data dari session (menu WiFi yang sedang ditampilkan)
    let wifiData = this.getWifiData(chatId);
    
    // Jika tidak ada, ambil dari sessionManager
    if (!wifiData) {
      wifiData = sessionManager.getData(chatId);
    }
    
    // Jika masih tidak ada, refresh
    if (!wifiData || !wifiData.wifi24g) {
      await this.handleWifiDetail(ctx);
      wifiData = this.getWifiData(chatId);
    }
    
    const is24gOn = wifiData.wifi24g?.wifiOpen === '1';
    const is5gOn = wifiData.wifi5g?.wifiOpen === '1';
    const ssid24 = modemAPI.decodeBase64Ssid(wifiData.wifi24g?.ssid || '');
    const ssid5 = modemAPI.decodeBase64Ssid(wifiData.wifi5g?.ssid || '');
    const encType24 = wifiData.wifi24g?.authenticationType || '2';
    const encType5 = wifiData.wifi5g?.authenticationType || '2';
    const areSsidSame = (ssid24 === ssid5);
    
    const keyboard = {
      inline_keyboard: []
    };
    
    // CEK JIKA SEMUA WIFI OFF
    if (!is24gOn && !is5gOn) {
      const offMessage = `
📱 <b>SHARE WIFI</b>
${Formatter.doubleSeparator()}

⚠️ <b>No WiFi is currently enabled!</b>

Please turn on WiFi first using:
• /wifi menu
• Or /wifi_on command

${Formatter.separator()}
<b>🖱️ Click button below:</b>
`;
      
      const offKeyboard = {
        inline_keyboard: [
          [{ text: '◀️ Back to Main', callback_data: 'wifi_back_to_main' }],
          [{ text: '❌ Close', callback_data: 'wifi_close' }]
        ]
      };
      
      // EDIT pesan yang sama
      await ctx.editMessageText(offMessage, {
        parse_mode: 'HTML',
        reply_markup: offKeyboard
      });
      
      // Simpan data tetap
      wifiDataStore.set(chatId + '_share', {
        messageId: ctx.callbackQuery.message.message_id,
        is24gOn: false,
        is5gOn: false
      });
      
      await ctx.answerCbQuery();
      return;
    }
    
    // Jika ada WiFi yang ON, tampilkan menu share normal
    if (is24gOn) {
      keyboard.inline_keyboard.push([{ text: '📱 Share 2.4GHz WiFi', callback_data: 'wifi_share_qr_24' }]);
    }
    
    if (is5gOn && !areSsidSame) {
      keyboard.inline_keyboard.push([{ text: '📱 Share 5GHz WiFi', callback_data: 'wifi_share_qr_5' }]);
    } else if (is5gOn && areSsidSame) {
      keyboard.inline_keyboard.push([{ text: '📱 Share WiFi (2.4GHz & 5GHz)', callback_data: 'wifi_share_qr_both' }]);
    }
    
    keyboard.inline_keyboard.push([{ text: '◀️ Back to Main', callback_data: 'wifi_back_to_main' }]);
    keyboard.inline_keyboard.push([{ text: '❌ Close', callback_data: 'wifi_close' }]);
    
    const infoMessage = `
📱 <b>SHARE WIFI</b>
${Formatter.doubleSeparator()}

<b>2.4GHz WiFi:</b> ${is24gOn ? '✅ ON' : '❌ OFF'}
   • SSID: <code>${ssid24 || 'N/A'}</code>
   • Encryption: ${this.getEncryptionTypeName(encType24)}

<b>5GHz WiFi:</b> ${is5gOn ? '✅ ON' : '❌ OFF'}
   • SSID: <code>${ssid5 || 'N/A'}</code>
   • Encryption: ${this.getEncryptionTypeName(encType5)}

${Formatter.separator()}

💡 <b>How to use:</b>
1. Click the button below to generate QR code
2. Scan with phone camera or WiFi QR scanner
3. Connect automatically

${Formatter.separator()}
<b>🖱️ Click button to share:</b>
`;
    
    // EDIT pesan yang sama (pesan menu WiFi yang sedang ditampilkan)
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    await ctx.editMessageText(infoMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
    // Store data for QR generation
    wifiDataStore.set(chatId + '_share', {
      messageId: currentMessageId,
      sessionId: wifiData.sessionId,
      modemIp: wifiData.modemIp,
      ssid24: ssid24,
      ssid5: ssid5,
      password24: wifiData.wifi24g?.key || '',
      password5: wifiData.wifi5g?.key || '',
      encType24: encType24,
      encType5: encType5,
      is24gOn: is24gOn,
      is5gOn: is5gOn,
      areSsidSame: areSsidSame
    });
    
    await ctx.answerCbQuery();
    
  } catch (error) {
    logger.error(`Wifi share error: ${error.message}`);
    // Jika edit gagal, fallback ke kirim pesan baru
    await ctx.reply(`❌ Failed: ${error.message}`);
  }
}

// Generate and display QR code
async handleWifiShareQr(ctx, band) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  const shareData = wifiDataStore.get(chatId + '_share');
  
  if (!shareData) {
    await this.handleWifiShare(ctx);
    return;
  }
  
  const generateWifiQrText = (ssid, password, encType) => {
    let encTypeStr = '';
    switch (encType) {
      case '0': encTypeStr = 'nopass'; break;
      case '1': encTypeStr = 'WEP'; break;
      case '2': encTypeStr = 'WPA'; break;
      case '3': encTypeStr = 'WPA'; break;
      case '4': encTypeStr = 'WPA'; break;
      case '5': encTypeStr = 'WPA'; break;
      default: encTypeStr = 'WPA';
    }
    
    if (encType === '0' || password === '') {
      return `WIFI:S:${ssid};T:nopass;;`;
    }
    return `WIFI:S:${ssid};T:${encTypeStr};P:${password};;`;
  };
  
  let qrText = '';
  let title = '';
  let ssid = '';
  let password = '';
  let encType = '';
  
  if (band === '24') {
    qrText = generateWifiQrText(shareData.ssid24, shareData.password24, shareData.encType24);
    title = '2.4GHz WiFi QR Code';
    ssid = shareData.ssid24;
    password = shareData.password24;
    encType = shareData.encType24;
  } else if (band === '5') {
    qrText = generateWifiQrText(shareData.ssid5, shareData.password5, shareData.encType5);
    title = '5GHz WiFi QR Code';
    ssid = shareData.ssid5;
    password = shareData.password5;
    encType = shareData.encType5;
  } else if (band === 'both') {
    qrText = generateWifiQrText(shareData.ssid24, shareData.password24, shareData.encType24);
    title = 'WiFi QR Code (2.4GHz & 5GHz)';
    ssid = shareData.ssid24;
    password = shareData.password24;
    encType = shareData.encType24;
  }
  
  // Generate QR code
  let qrImageBuffer;
  try {
    qrImageBuffer = await QRCode.toBuffer(qrText, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (qrError) {
    logger.error(`QR generation error: ${qrError.message}`);
    await ctx.reply(`❌ Failed to generate QR code: ${qrError.message}`);
    return;
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔄 Refresh QR', callback_data: `wifi_share_qr_refresh_${band}` }],
      [{ text: '◀️ Back to Share Menu', callback_data: 'wifi_share_back' }],
      [{ text: '❌ Close', callback_data: 'wifi_close' }]
    ]
  };
  
  const passwordDisplay = password ? '••••••••' : '(No password)';
  const encryptionDisplay = this.getEncryptionTypeName(encType);
  
  const caption = `
📱 <b>${title}</b>
${Formatter.doubleSeparator()}

<b>📡 Network:</b> <code>${ssid}</code>
<b>🔐 Security:</b> ${encryptionDisplay}
<b>🔑 Password:</b> ${passwordDisplay}

${Formatter.separator()}

💡 <b>How to scan:</b>
• Open camera app on phone
• Point at QR code
• Tap notification to connect
`;
  
  // HAPUS pesan menu share
  if (shareData.messageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, shareData.messageId).catch(() => {});
    } catch (e) {}
  }
  
  // Kirim pesan baru dengan QR code
  const sentMsg = await ctx.replyWithPhoto(
    { source: qrImageBuffer },
    {
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
  
  // Update shareData dengan messageId baru
  shareData.messageId = sentMsg.message_id;
  wifiDataStore.set(chatId + '_share', shareData);
  
  await ctx.answerCbQuery();
}

async handleWifiShareQrRefresh(ctx, band) {
  const chatId = ctx.chat.id;
  const Formatter = require('../utils/formatter');
  const shareData = wifiDataStore.get(chatId + '_share');
  
  if (!shareData) {
    await this.handleWifiShare(ctx);
    return;
  }
  
  const generateWifiQrText = (ssid, password, encType) => {
    let encTypeStr = '';
    switch (encType) {
      case '0': encTypeStr = 'nopass'; break;
      case '1': encTypeStr = 'WEP'; break;
      case '2': encTypeStr = 'WPA'; break;
      case '3': encTypeStr = 'WPA'; break;
      case '4': encTypeStr = 'WPA'; break;
      case '5': encTypeStr = 'WPA'; break;
      default: encTypeStr = 'WPA';
    }
    
    if (encType === '0' || password === '') {
      return `WIFI:S:${ssid};T:nopass;;`;
    }
    return `WIFI:S:${ssid};T:${encTypeStr};P:${password};;`;
  };
  
  let qrText = '';
  let title = '';
  let ssid = '';
  let password = '';
  let encType = '';
  
  if (band === '24') {
    qrText = generateWifiQrText(shareData.ssid24, shareData.password24, shareData.encType24);
    title = '2.4GHz WiFi QR Code';
    ssid = shareData.ssid24;
    password = shareData.password24;
    encType = shareData.encType24;
  } else if (band === '5') {
    qrText = generateWifiQrText(shareData.ssid5, shareData.password5, shareData.encType5);
    title = '5GHz WiFi QR Code';
    ssid = shareData.ssid5;
    password = shareData.password5;
    encType = shareData.encType5;
  } else if (band === 'both') {
    qrText = generateWifiQrText(shareData.ssid24, shareData.password24, shareData.encType24);
    title = 'WiFi QR Code (2.4GHz & 5GHz)';
    ssid = shareData.ssid24;
    password = shareData.password24;
    encType = shareData.encType24;
  }
  
  // Generate new QR code
  let qrImageBuffer;
  try {
    qrImageBuffer = await QRCode.toBuffer(qrText, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (qrError) {
    logger.error(`QR generation error: ${qrError.message}`);
    await ctx.reply(`❌ Failed to generate QR code: ${qrError.message}`);
    return;
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔄 Refresh QR', callback_data: `wifi_share_qr_refresh_${band}` }],
      [{ text: '◀️ Back to Share Menu', callback_data: 'wifi_share_back' }],
      [{ text: '❌ Close', callback_data: 'wifi_close' }]
    ]
  };
  
  const passwordDisplay = password ? '••••••••' : '(No password)';
  const encryptionDisplay = this.getEncryptionTypeName(encType);
  
  const caption = `
📱 <b>${title}</b>
${Formatter.doubleSeparator()}

<b>📡 Network:</b> <code>${ssid}</code>
<b>🔐 Security:</b> ${encryptionDisplay}
<b>🔑 Password:</b> ${passwordDisplay}

${Formatter.separator()}

💡 <b>How to scan:</b>
• Open camera app on phone
• Point at QR code
• Tap notification to connect
`;
  
  // EDIT pesan QR yang sama (photo → photo, BISA)
  try {
    await ctx.editMessageMedia({
      type: 'photo',
      media: { source: qrImageBuffer },
      caption: caption,
      parse_mode: 'HTML'
    }, {
      reply_markup: keyboard
    });
  } catch (e) {
    // If cannot edit, send new message
    await ctx.deleteMessage();
    const sentMsg = await ctx.replyWithPhoto(
      { source: qrImageBuffer },
      {
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
    shareData.messageId = sentMsg.message_id;
    wifiDataStore.set(chatId + '_share', shareData);
  }
  
  await ctx.answerCbQuery('QR refreshed!');
}

// Go back to share menu - HAPUS pesan QR, Kirim menu share baru
async handleWifiShareBack(ctx) {
  const chatId = ctx.chat.id;
  const shareData = wifiDataStore.get(chatId + '_share');
  
  if (!shareData) {
    await this.handleWifiShare(ctx);
    return;
  }
  
  const is24gOn = shareData.is24gOn;
  const is5gOn = shareData.is5gOn;
  const ssid24 = shareData.ssid24;
  const ssid5 = shareData.ssid5;
  const encType24 = shareData.encType24;
  const encType5 = shareData.encType5;
  const areSsidSame = shareData.areSsidSame;
  
  const keyboard = {
    inline_keyboard: []
  };
  
  // CEK JIKA SEMUA WIFI OFF
  if (!is24gOn && !is5gOn) {
    const offMessage = `
📱 <b>SHARE WIFI</b>
${Formatter.doubleSeparator()}

⚠️ <b>No WiFi is currently enabled!</b>

Please turn on WiFi first using:
• /wifi menu
• Or /wifi_on command

${Formatter.separator()}
<b>🖱️ Click button below:</b>
`;
    
    const offKeyboard = {
      inline_keyboard: [
        [{ text: '◀️ Back to Main', callback_data: 'wifi_back_to_main' }],
        [{ text: '❌ Close', callback_data: 'wifi_close' }]
      ]
    };
    
    // HAPUS pesan QR code
    if (shareData.messageId) {
      try {
        await ctx.telegram.deleteMessage(chatId, shareData.messageId).catch(() => {});
      } catch (e) {}
    }
    
    // Kirim pesan baru menu share (off state)
    const sentMsg = await ctx.reply(offMessage, {
      parse_mode: 'HTML',
      reply_markup: offKeyboard
    });
    
    // Update shareData
    shareData.messageId = sentMsg.message_id;
    wifiDataStore.set(chatId + '_share', shareData);
    
    await ctx.answerCbQuery();
    return;
  }
  
  // Jika ada WiFi yang ON
  if (is24gOn) {
    keyboard.inline_keyboard.push([{ text: '📱 Share 2.4GHz WiFi', callback_data: 'wifi_share_qr_24' }]);
  }
  
  if (is5gOn && !areSsidSame) {
    keyboard.inline_keyboard.push([{ text: '📱 Share 5GHz WiFi', callback_data: 'wifi_share_qr_5' }]);
  } else if (is5gOn && areSsidSame) {
    keyboard.inline_keyboard.push([{ text: '📱 Share WiFi (2.4GHz & 5GHz)', callback_data: 'wifi_share_qr_both' }]);
  }
  
  keyboard.inline_keyboard.push([{ text: '◀️ Back to Main', callback_data: 'wifi_back_to_main' }]);
  keyboard.inline_keyboard.push([{ text: '❌ Close', callback_data: 'wifi_close' }]);
  
  const infoMessage = `
📱 <b>SHARE WIFI</b>
${Formatter.doubleSeparator()}

<b>2.4GHz WiFi:</b> ${is24gOn ? '✅ ON' : '❌ OFF'}
   • SSID: <code>${ssid24 || 'N/A'}</code>
   • Encryption: ${this.getEncryptionTypeName(encType24)}

<b>5GHz WiFi:</b> ${is5gOn ? '✅ ON' : '❌ OFF'}
   • SSID: <code>${ssid5 || 'N/A'}</code>
   • Encryption: ${this.getEncryptionTypeName(encType5)}

${Formatter.separator()}

💡 <b>How to use:</b>
1. Click the button below to generate QR code
2. Scan with phone camera or WiFi QR scanner
3. Connect automatically

${Formatter.separator()}
<b>🖱️ Click button to share:</b>
`;
  
  // HAPUS pesan QR code
  if (shareData.messageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, shareData.messageId).catch(() => {});
    } catch (e) {}
  }
  
  // Kirim pesan baru menu share
  const sentMsg = await ctx.reply(infoMessage, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
  
  // Update shareData dengan messageId baru
  shareData.messageId = sentMsg.message_id;
  wifiDataStore.set(chatId + '_share', shareData);
  
  await ctx.answerCbQuery();
}
// ========== END OF WIFI COMMANDS ==========
	
	// Setting imei /imei command
	// /imei commands
	async handleIMEI(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus pesan user yang menjalankan command
	  await this.deleteUserMessage(ctx);
	  
	  try {
		const sessionId = await ModemAuth.ensureSession(chatId);
		const modemIp = ModemAuth.getModemIp(chatId);
		const Formatter = require('../utils/formatter');
		
		const result = await modemAPI.getIMEI(modemIp);
		const currentImei = result.imei || 'N/A';
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: '✏️ Change IMEI', callback_data: 'imei_change' }],
			[{ text: '❌ Close', callback_data: 'imei_close' }]
		  ]
		};
		
		const message = `
	📱 <b>MODEM IMEI</b>
	${Formatter.doubleSeparator()}

	Current IMEI: <code>${currentImei}</code>

	${Formatter.separator()}

	💡 IMEI (International Mobile Equipment Identity) is a unique number to identify mobile devices.
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Store message ID for later
		sessionManager.setState(chatId, 'imei_menu', { messageId: sentMessage.message_id });
		
	  } catch (error) {
		logger.error(`IMEI error: ${error.message}`);
	  }
	}

	async handleIMEIChange(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  const Formatter = require('../utils/formatter');
	  
	  // Get current IMEI for example
	  let currentImei = 'N/A';
	  let exampleImei = '123456789012345';
	  try {
		const result = await modemAPI.getIMEI(modemIp);
		if (result.imei && result.imei !== 'N/A') {
		  currentImei = result.imei;
		  exampleImei = result.imei;
		}
	  } catch (error) {
		logger.error(`Failed to get IMEI for example: ${error.message}`);
	  }
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '🔙 Cancel', callback_data: 'imei_cancel' }]
		]
	  };
	  
	  const message = `
	📱 <b>CHANGE IMEI</b>
	${Formatter.doubleSeparator()}

	Current IMEI: <code>${currentImei}</code>

	${Formatter.separator()}

	Please send the new IMEI number (15 digits).

	Example: <code>${exampleImei}</code>

	${Formatter.separator()}

	⚠️ <b>CRITICAL WARNING:</b>
	• Router will reboot automatically after IMEI change
	• Internet connection will be disconnected during reboot
	• Use responsibly

	${Formatter.separator()}

	Type /cancel to abort.
	`;
	  
	  // Edit the existing message
	  const promptMessage = await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  // Store prompt message ID in session
	  sessionManager.setState(chatId, 'waiting_imei', { promptMsgId: promptMessage.message_id });
	}

	async handleIMEISet(ctx, newImei) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  const Formatter = require('../utils/formatter');
	  
	  // Validate IMEI format (15 digits)
	  if (!/^\d{15}$/.test(newImei)) {
		// Show error on the existing message
		const errorMessage = `
	❌ <b>INVALID IMEI FORMAT</b>
	${Formatter.doubleSeparator()}

	IMEI must be exactly 15 digits.
	Example: <code>123456789012345</code>

	${Formatter.separator()}

	Please use /imei to try again.
	`;
		
		await ctx.editMessageText(errorMessage, {
		  parse_mode: 'HTML',
		  reply_markup: {
			inline_keyboard: [[{ text: '◀️ Back', callback_data: 'imei_back' }]]
		  }
		});
		
		sessionManager.clearState(chatId);
		await ctx.answerCbQuery();
		return;
	  }
	  
	  // Hapus prompt message
	  try {
		const data = sessionManager.getData(chatId);
		if (data && data.promptMsgId) {
		  await ctx.telegram.deleteMessage(chatId, data.promptMsgId).catch(() => {});
		}
	  } catch (e) {
		// Ignore
	  }
	  
	  // Hapus pesan user yang berisi IMEI
	  await this.deleteUserMessage(ctx);
	  
	  // Show processing on the same message
	  const processingMsg = await ctx.reply(`
	🔄 <b>CHANGING IMEI</b>
	${Formatter.doubleSeparator()}

	Changing IMEI to: <code>${newImei}</code>

	${Formatter.separator()}

	⚠️ Router will reboot automatically.
	Please wait 2-3 minutes for modem to restart.
	`);
	  
	  try {
		const result = await modemAPI.setIMEI(modemIp, newImei);
		
		// Delete processing message
		try {
		  await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		} catch (e) {
		  // Ignore
		}
		
		if (result.success) {
		  const successMsg = await ctx.reply(`
	✅ <b>IMEI CHANGED SUCCESSFULLY!</b>
	${Formatter.doubleSeparator()}

	New IMEI: <code>${result.imei || newImei}</code>
	Status: ${result.msg || 'OK'}

	${Formatter.separator()}

	⚠️ Router is rebooting...
	• Internet connection will be temporarily disconnected
	• Bot will auto-reconnect after 2-3 minutes
	• Use /status to check when modem is back online

	💡 If modem does not come back, restart manually.
	`, { parse_mode: 'HTML' });
		  
		  // Auto-delete success message after 10 seconds
		  setTimeout(() => {
			ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
		  }, 10000);
		  
		  // Clear session for this user
		  ModemAuth.clearSession(chatId);
		  
		} else {
		  const errorMsg = await ctx.reply(`
	❌ <b>FAILED TO CHANGE IMEI</b>
	${Formatter.doubleSeparator()}

	Error: ${result.msg || 'Unknown error'}

	${Formatter.separator()}

	Please try again with /imei
	`, { parse_mode: 'HTML' });
		  
		  setTimeout(() => {
			ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		  }, 5000);
		}
		
	  } catch (error) {
		logger.error(`Set IMEI error: ${error.message}`);
		
		// Delete processing message
		try {
		  await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		} catch (e) {
		  // Ignore
		}
		
		const errorMsg = await ctx.reply(`
	❌ <b>FAILED TO CHANGE IMEI</b>
	${Formatter.doubleSeparator()}

	Error: ${error.message}

	${Formatter.separator()}

	Please try again with /imei
	`, { parse_mode: 'HTML' });
		
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
	  }
	  
	  sessionManager.clearState(chatId);
	}

	async handleIMEICancel(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Get current IMEI to show
	  const modemIp = await uci.getConfig('modem_ip');
	  let currentImei = 'N/A';
	  try {
		const result = await modemAPI.getIMEI(modemIp);
		currentImei = result.imei || 'N/A';
	  } catch (e) {
		// Ignore
	  }
	  
	  const message = `
	✅ <b>IMEI CHANGE CANCELLED</b>
	${Formatter.doubleSeparator()}

	Current IMEI: <code>${currentImei}</code>

	${Formatter.separator()}

	Use /imei to change IMEI again.
	`;
	  
	  // Edit the existing message
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: {
		  inline_keyboard: [[{ text: '◀️ Back to IMEI', callback_data: 'imei_back' }]]
		}
	  });
	  
	  // Clear session state
	  sessionManager.clearState(chatId);
	  await ctx.answerCbQuery();
	}

	async handleIMEIBack(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const modemIp = await uci.getConfig('modem_ip');
	  let currentImei = 'N/A';
	  try {
		const result = await modemAPI.getIMEI(modemIp);
		currentImei = result.imei || 'N/A';
	  } catch (e) {
		// Ignore
	  }
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '✏️ Change IMEI', callback_data: 'imei_change' }],
		  [{ text: '❌ Close', callback_data: 'imei_close' }]
		]
	  };
	  
	  const message = `
	📱 <b>MODEM IMEI</b>
	${Formatter.doubleSeparator()}

	Current IMEI: <code>${currentImei}</code>

	${Formatter.separator()}

	💡 IMEI (International Mobile Equipment Identity) is a unique number to identify mobile devices.
	`;
	  
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  await ctx.answerCbQuery();
	}

	async handleIMEIClose(ctx) {
	  const chatId = ctx.chat.id;
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}
	
	// /led menu commands
	async handleLEDMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Delete user message
	  await this.deleteUserMessage(ctx);
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		// Try to get current LED states from stored session or assume all ON
		let ledStates = sessionManager.getData(chatId)?.ledStates;
		if (!ledStates) {
		  // Default assumption: all LEDs are ON (factory default)
		  ledStates = {
			wifi: true,
			data: true,
			sig: true,
			all: true
		  };
		}
		
		// Create dynamic buttons with current states
		const allButtonText = ledStates.all ? '💡 All LEDs OFF' : '💡 All LEDs ON';
		const wifiButtonText = ledStates.wifi ? '📡 WiFi OFF' : '📡 WiFi ON';
		const dataButtonText = ledStates.data ? '📶 Data OFF' : '📶 Data ON';
		const sigButtonText = ledStates.sig ? '📊 Signal OFF' : '📊 Signal ON';
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: allButtonText, callback_data: 'led_all_toggle' }],
			[{ text: wifiButtonText, callback_data: 'led_wifi_toggle' }, { text: dataButtonText, callback_data: 'led_data_toggle' }],
			[{ text: sigButtonText, callback_data: 'led_sig_toggle' }],
			[{ text: '🔄 Reset to Auto', callback_data: 'led_reset' }],
			[{ text: '🔄 Refresh', callback_data: 'led_refresh' }],
			[{ text: '❌ Close', callback_data: 'led_close' }]
		  ]
		};
		
		const statusIcon = (isOn) => isOn ? '✅ ON' : '❌ OFF';
		
		const message = `
	💡 <b>LED CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current LED Status:</b>
	• WiFi LED: ${statusIcon(ledStates.wifi)}
	• Data LED: ${statusIcon(ledStates.data)}
	• Signal LED: ${statusIcon(ledStates.sig)}
	• All LEDs: ${statusIcon(ledStates.all)}

	${Formatter.separator()}

	<b>📌 Info:</b>
	• Manual control stops auto-blinking function
	• Use "Reset to Auto" to restore automatic mode
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control LEDs:</b>
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		// Store message ID and current states
		sessionManager.setState(chatId, 'led_menu', { 
		  messageId: sentMessage.message_id,
		  ledStates: ledStates
		});
		
	  } catch (error) {
		logger.error(`LED menu error for ${chatId}: ${error.message}`);
	  }
	}

	async handleLEDToggleFromMenu(ctx, target) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  const Formatter = require('../utils/formatter');
	  
	  // Get current menu data
	  const menuData = sessionManager.getData(chatId);
	  const currentStates = menuData?.ledStates || { wifi: true, data: true, sig: true, all: true };
	  const originalMessage = ctx.callbackQuery.message;
	  
	  // Determine new state based on target
	  let newState = '';
	  let apiTarget = '';
	  let stateChanged = false;
	  
	  try {
		if (target === 'all') {
		  // Toggle all LEDs
		  newState = currentStates.all ? 'off' : 'on';
		  apiTarget = 'all';
		  stateChanged = true;
		} else if (target === 'wifi') {
		  newState = currentStates.wifi ? 'off' : 'on';
		  apiTarget = 'wifi';
		  stateChanged = true;
		} else if (target === 'data') {
		  newState = currentStates.data ? 'off' : 'on';
		  apiTarget = 'data';
		  stateChanged = true;
		} else if (target === 'sig') {
		  newState = currentStates.sig ? 'off' : 'on';
		  apiTarget = 'sig';
		  stateChanged = true;
		}
		
		if (!stateChanged) return;
		
		// Show processing status
		const processingKeyboard = {
		  inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'led_processing' }]]
		};
		
		await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n⏳ Toggling ${target.toUpperCase()} LED...`, {
		  parse_mode: 'HTML',
		  reply_markup: processingKeyboard
		});
		
		// Execute LED control
		const result = await modemAPI.ledControl(modemIp, apiTarget, newState);
		
		if (result && result.success) {
		  // Update local states
		  const newStates = { ...currentStates };
		  
		  if (target === 'all') {
			newStates.all = newState === 'on';
			newStates.wifi = newState === 'on';
			newStates.data = newState === 'on';
			newStates.sig = newState === 'on';
		  } else {
			newStates[target] = newState === 'on';
			// Update all status
			newStates.all = newStates.wifi && newStates.data && newStates.sig;
		  }
		  
		  // Update stored states
		  sessionManager.setState(chatId, 'led_menu', {
			...menuData,
			ledStates: newStates
		  });
		  
		  // Refresh menu with new states
		  await this.refreshLEDMenu(ctx, newStates);
		  
		} else {
		  // Show error
		  const errorKeyboard = {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'led_back' }]]
		  };
		  
		  await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n❌ Failed: ${result?.message || 'Unknown error'}`, {
			parse_mode: 'HTML',
			reply_markup: errorKeyboard
		  });
		}
		
	  } catch (error) {
		logger.error(`LED toggle error: ${error.message}`);
		const errorKeyboard = {
		  inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'led_back' }]]
		};
		
		await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n❌ Error: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: errorKeyboard
		});
	  }
	  
	  await ctx.answerCbQuery();
	}

	async handleLEDResetFromMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  const Formatter = require('../utils/formatter');
	  
	  const menuData = sessionManager.getData(chatId);
	  const originalMessage = ctx.callbackQuery.message;
	  
	  try {
		// Show processing status
		const processingKeyboard = {
		  inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'led_processing' }]]
		};
		
		await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n⏳ Resetting LEDs to auto mode...`, {
		  parse_mode: 'HTML',
		  reply_markup: processingKeyboard
		});
		
		// Execute reset
		const result = await modemAPI.ledReset(modemIp);
		
		if (result && result.success) {
		  // Reset states to default (all ON)
		  const newStates = {
			wifi: true,
			data: true,
			sig: true,
			all: true
		  };
		  
		  // Update stored states
		  sessionManager.setState(chatId, 'led_menu', {
			...menuData,
			ledStates: newStates
		  });
		  
		  // Refresh menu
		  await this.refreshLEDMenu(ctx, newStates);
		  
		} else {
		  const errorKeyboard = {
			inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'led_back' }]]
		  };
		  
		  await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n❌ Reset failed: ${result?.message || 'Unknown error'}`, {
			parse_mode: 'HTML',
			reply_markup: errorKeyboard
		  });
		}
		
	  } catch (error) {
		logger.error(`LED reset error: ${error.message}`);
		const errorKeyboard = {
		  inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'led_back' }]]
		};
		
		await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n❌ Error: ${error.message}`, {
		  parse_mode: 'HTML',
		  reply_markup: errorKeyboard
		});
	  }
	  
	  await ctx.answerCbQuery();
	}

	async refreshLEDMenu(ctx, ledStates = null) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const menuData = sessionManager.getData(chatId);
	  const states = ledStates || menuData?.ledStates || { wifi: true, data: true, sig: true, all: true };
	  
	  // Create dynamic buttons with current states
	  const allButtonText = states.all ? '💡 All LEDs OFF' : '💡 All LEDs ON';
	  const wifiButtonText = states.wifi ? '📡 WiFi OFF' : '📡 WiFi ON';
	  const dataButtonText = states.data ? '📶 Data OFF' : '📶 Data ON';
	  const sigButtonText = states.sig ? '📊 Signal OFF' : '📊 Signal ON';
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: allButtonText, callback_data: 'led_all_toggle' }],
		  [{ text: wifiButtonText, callback_data: 'led_wifi_toggle' }, { text: dataButtonText, callback_data: 'led_data_toggle' }],
		  [{ text: sigButtonText, callback_data: 'led_sig_toggle' }],
		  [{ text: '🔄 Reset to Auto', callback_data: 'led_reset' }],
		  [{ text: '🔄 Refresh', callback_data: 'led_refresh' }],
		  [{ text: '❌ Close', callback_data: 'led_close' }]
		]
	  };
	  
	  const statusIcon = (isOn) => isOn ? '✅ ON' : '❌ OFF';
	  
	  const message = `
	💡 <b>LED CONTROL MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current LED Status:</b>
	• WiFi LED: ${statusIcon(states.wifi)}
	• Data LED: ${statusIcon(states.data)}
	• Signal LED: ${statusIcon(states.sig)}
	• All LEDs: ${statusIcon(states.all)}

	${Formatter.separator()}

	<b>📌 Info:</b>
	• Manual control stops auto-blinking function
	• Use "Reset to Auto" to restore automatic mode
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control LEDs:</b>
	`;
	  
	  await ctx.editMessageText(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	}

	async handleLEDRefresh(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  const menuData = sessionManager.getData(chatId);
	  const originalMessage = ctx.callbackQuery.message;
	  
	  // Show refreshing status
	  const refreshKeyboard = {
		inline_keyboard: [[{ text: '⏳ Refreshing...', callback_data: 'led_processing' }]]
	  };
	  
	  await ctx.editMessageText(`${originalMessage.text}\n\n${Formatter.separator()}\n🔄 Refreshing...`, {
		parse_mode: 'HTML',
		reply_markup: refreshKeyboard
	  });
	  
	  // Just refresh the display (states remain the same)
	  setTimeout(async () => {
		await this.refreshLEDMenu(ctx, menuData?.ledStates);
	  }, 500);
	  
	  await ctx.answerCbQuery('Refreshed!');
	}

	async handleLEDBack(ctx) {
	  const chatId = ctx.chat.id;
	  const menuData = sessionManager.getData(chatId);
	  await this.refreshLEDMenu(ctx, menuData?.ledStates);
	  await ctx.answerCbQuery();
	}

	async handleLEDClose(ctx) {
	  const chatId = ctx.chat.id;
	  sessionManager.clearState(chatId);
	  try {
		await ctx.deleteMessage();
	  } catch (e) {
		// Ignore
	  }
	  await ctx.answerCbQuery('Closed');
	}
	
	// =========== LED HELPER/SINGLE COMMANDS =========== 
	// Single LED commands 
	// LED Control
	async handleLEDControl(target, state, ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  const targetMap = {
		'wifi': 'WiFi',
		'data': 'Data',
		'sig': 'Signal',
		'all': 'All LEDs'
	  };
	  
	  try {
		const result = await modemAPI.ledControl(modemIp, target, state);
		
		if (result && result.success) {
		  let message = '';
		  
		  if (state === 'on' || state === 'off') {
			const stateText = state === 'on' ? 'ON' : 'OFF';
			message = `✅ ${targetMap[target] || target} LED turned ${stateText}.\n\n`;
			message += `⚠️ <b>Manual Control Active:</b>\n`;
			message += `• LED auto-blinking is temporarily disabled\n`;
			message += `• Use /led_reset to restore automatic mode\n`;
			message += `• Or use /led menu for more options`;
		  } else {
			message = `✅ ${targetMap[target] || target} LED reset to automatic mode.\n\n`;
			message += `💡 <b>Auto-blinking restored</b>\n`;
			message += `• LEDs will now blink according to device activity`;
		  }
		  
		  await this.autoDelete(ctx, message, 30000);
		} else {
		  await this.autoDelete(ctx, `❌ Failed to control LED: ${result?.message || 'Unknown error'}`, 30000);
		}
	  } catch (error) {
		logger.error(`LED control error: ${error.message}`);
		await this.autoDelete(ctx, `❌ Failed to control LED: ${error.message}`, 30000);
	  }
	}

	// LED Reset to Auto Mode
	async handleLEDReset(ctx) {
	  const chatId = ctx.chat.id;
	  const modemIp = await uci.getConfig('modem_ip');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  await this.autoDelete(ctx, `🔄 Resetting LED to automatic mode...`, 2000);
	  
	  try {
		const result = await modemAPI.ledReset(modemIp);
		
		if (result && result.success) {
		  const message = `✅ LED reset to automatic mode successfully!\n\n`;
		  `💡 <b>Auto-blinking Restored:</b>\n`;
		  `• LEDs will now blink according to device activity\n`;
		  `• Manual control mode has been deactivated`;
		  
		  await this.autoDelete(ctx, message, 30000);
		} else {
		  await this.autoDelete(ctx, `❌ Failed to reset LED: ${result?.message || 'Unknown error'}`, 30000);
		}
	  } catch (error) {
		logger.error(`LED reset error: ${error.message}`);
		await this.autoDelete(ctx, `❌ Failed to reset LED: ${error.message}`, 30000);
	  }
	}

	// Single LED commands (for direct commands like /led_on, /led_off, etc)
	async handleLEDOn(ctx) {
	  await this.handleLEDControl('all', 'on', ctx);
	}

	async handleLEDOff(ctx) {
	  await this.handleLEDControl('all', 'off', ctx);
	}

	async handleLEDWifiOff(ctx) {
	  await this.handleLEDControl('wifi', 'off', ctx);
	}

	async handleLEDDataOn(ctx) {
	  await this.handleLEDControl('data', 'on', ctx);
	}

	async handleLEDDataOff(ctx) {
	  await this.handleLEDControl('data', 'off', ctx);
	}

	async handleLEDSigOn(ctx) {
	  await this.handleLEDControl('sig', 'on', ctx);
	}

	async handleLEDSigOff(ctx) {
	  await this.handleLEDControl('sig', 'off', ctx);
	}
	// =========== LED HELPER/SINGLE COMMANDS =========== 

	// =========== LOCK CELL COMMANDS =========== 

	// /lockcell commands
	async handleLockCell(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [lockInfo, signal, currentBand] = await Promise.all([
		  modemAPI.getLockCellInfo(modemIp, sessionId),
		  modemAPI.getSignal(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		const isLocked = lockInfo.lte_lock_sw === '1';
		const currentFreq = lockInfo.FREQ || signal.FREQ || 'N/A';
		const currentPci = lockInfo.PCI || signal.PCI || 'N/A';
		const currentBandNum = signal.currentband || 'N/A';
		
		// Band frekuensi mapping
		const bandFreqs = {
		  1: '2100 MHz',
		  3: '1800 MHz',
		  5: '850 MHz',
		  8: '900 MHz',
		  40: '2300 MHz'
		};
		const bandDisplay = bandFreqs[currentBandNum] || 'N/A';
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: isLocked ? '🔓 Unlock Cell' : '🔒 Lock Current Cell', callback_data: isLocked ? 'lockcell_unlock' : 'lockcell_lock' }],
			[{ text: '✏️ Manual Input (PCI & EARFCN)', callback_data: 'lockcell_manual' }],
			[{ text: '🔄 Refresh', callback_data: 'lockcell_refresh' }],
			[{ text: '❌ Close', callback_data: 'lockcell_close' }]
		  ]
		};
		
		const statusIcon = isLocked ? '✅ LOCKED' : '❌ UNLOCKED';
		const statusColor = isLocked ? '🟢' : '🔴';
		
		const message = `
	🔒 <b>CELL LOCK MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}

	${Formatter.separator()}

	<b>📡 Current Cell Info:</b>
	   • Band: ${currentBandNum} (${bandDisplay})
	   • Bandwidth: ${signal.bandwidth || 'N/A'} MHz
	   • PCI: ${currentPci}
	   • EARFCN: ${currentFreq}

	${Formatter.separator()}

	<b>🔒 Locked Cell Info:</b>
	   • Status: ${isLocked ? 'Locked' : 'Not locked'}
	   ${isLocked ? `• PCI: ${lockInfo.lte_lock_pci || 'N/A'}\n   • EARFCN: ${lockInfo.lte_lock_freq || 'N/A'}` : '• No cell locked'}

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Lock Cell will force modem to stay on specific cell tower
	• PCI = Physical Cell ID (0-503)
	• EARFCN = Frequency channel number
	• Unlock to allow modem to select best cell automatically
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control cell lock:</b>
	`;
		
		const sentMessage = await ctx.reply(message, {
		  parse_mode: 'HTML',
		  reply_markup: keyboard
		});
		
		lockcellMenuData.set(chatId, {
		  messageId: sentMessage.message_id,
		  sessionId: sessionId,
		  modemIp: modemIp,
		  isLocked: isLocked,
		  currentFreq: currentFreq,
		  currentPci: currentPci,
		  currentBand: currentBandNum
		});
		
	  } catch (error) {
		logger.error(`LockCell error for ${chatId}: ${error.message}`);
		await ctx.reply(`❌ Failed: ${error.message}\n\nTry /logout then /lockcell again.`);
	  }
	}

	// Manual input for PCI and EARFCN
	// Di commands.js - handleLockCellManual untuk reply keyboard
	async handleLockCellManual(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  
	  // Buat data menu baru jika diperlukan
	  let data = lockcellMenuData.get(chatId);
	  if (!data) {
		try {
		  const sessionId = await this.ensureAuth(ctx, true);
		  const modemIp = ModemAuth.getModemIp(chatId);
		  const [lockInfo, signal] = await Promise.all([
			modemAPI.getLockCellInfo(modemIp, sessionId),
			modemAPI.getSignal(modemIp, sessionId)
		  ]);
		  
		  data = {
			sessionId: sessionId,
			modemIp: modemIp,
			isLocked: lockInfo.lte_lock_sw === '1',
			currentFreq: lockInfo.FREQ || signal.FREQ || 'N/A',
			currentPci: lockInfo.PCI || signal.PCI || 'N/A'
		  };
		  lockcellMenuData.set(chatId, data);
		} catch (error) {
		  await ctx.reply(`❌ Failed to initialize: ${error.message}`);
		  return;
		}
	  }
	  
	  const keyboard = {
		inline_keyboard: [
		  [{ text: '🔙 Cancel', callback_data: 'lockcell_cancel' }]
		]
	  };
	  
	  const message = `
	🔒 <b>MANUAL CELL LOCK</b>
	${Formatter.doubleSeparator()}

	Please send the PCI and EARFCN in this format:

	<b>PCI EARFCN</b> (separated by space)

	${Formatter.separator()}

	<b>📌 Example:</b>
	<code>275 1325</code>

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• PCI = Physical Cell ID (0-503)
	• EARFCN = Frequency channel number
	• Get these values from /signal or /currentband

	Type /cancel to abort.
	`;
	  
	  // Hapus pesan menu sebelumnya
	  if (data.messageId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, data.messageId).catch(() => {});
		} catch (e) {}
	  }
	  
	  const sentMessage = await ctx.reply(message, {
		parse_mode: 'HTML',
		reply_markup: keyboard
	  });
	  
	  data.messageId = sentMessage.message_id;
	  lockcellMenuData.set(chatId, data);
	  
	  sessionManager.setState(chatId, 'waiting_lockcell', { 
		action: 'manual_input',
		promptMsgId: sentMessage.message_id
	  });
	}

	// Proses manual input PCI dan EARFCN
	async handleLockCellManualInput(ctx, text) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const sessionData = sessionManager.getData(chatId);
	  
	  // Parse input: format "PCI EARFCN"
	  const parts = text.trim().split(/\s+/);
	  
	  if (parts.length < 2) {
		const errorMsg = await ctx.reply(`❌ Invalid format!

	Please use: <code>PCI EARFCN</code>

	Example: <code>275 1325</code>

	Type /cancel to abort.`, { parse_mode: 'HTML' });
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		return;
	  }
	  
	  const pci = parseInt(parts[0]);
	  const earfcn = parseInt(parts[1]);
	  
	  // Validasi PCI (0-503 untuk LTE)
	  if (isNaN(pci) || pci < 0 || pci > 503) {
		const errorMsg = await ctx.reply(`❌ Invalid PCI value!

	PCI must be between 0 and 503.
	Example: 275

	Type /cancel to abort.`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		return;
	  }
	  
	  // Validasi EARFCN (range untuk LTE)
	  if (isNaN(earfcn) || earfcn < 0 || earfcn > 100000) {
		const errorMsg = await ctx.reply(`❌ Invalid EARFCN value!

	EARFCN must be a valid frequency channel number.
	Example: 1325

	Type /cancel to abort.`);
		setTimeout(() => {
		  ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		}, 5000);
		return;
	  }
	  
	  // Hapus prompt message
	  if (sessionData && sessionData.promptMsgId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
		} catch (e) {}
	  }
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Get session data from lockcell menu
	  const lockcellData = lockcellMenuData.get(chatId);
	  if (!lockcellData) {
		await ctx.reply(`❌ Session expired. Please use /lockcell again.`);
		sessionManager.clearState(chatId);
		return;
	  }
	  
	  const processingMsg = await ctx.reply(`⏳ Locking to PCI: ${pci}, EARFCN: ${earfcn}...`);
	  
	  try {
		const result = await modemAPI.lockCell(lockcellData.modemIp, lockcellData.sessionId, earfcn.toString(), pci.toString());
		
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		if (result.success && result.message === "0") {
		  lockcellData.isLocked = true;
		  lockcellData.currentPci = pci;
		  lockcellData.currentFreq = earfcn;
		  lockcellMenuData.set(chatId, lockcellData);
		  
		  const successMsg = await ctx.reply(`✅ Cell locked successfully!

	📡 Locked to:
	   • PCI: ${pci}
	   • EARFCN: ${earfcn}

	⚠️ Modem will reconnect to the locked cell.`);
		  
		  setTimeout(async () => {
			await ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
			// Kembali ke menu lockcell dengan pesan baru
			await this.handleLockCell(ctx);
		  }, 3000);
		  
		  ModemAuth.clearSession(chatId);
		} else {
		  const errorMsg = await ctx.reply(`❌ Failed to lock cell: ${result?.message || 'Unknown error'}`);
		  setTimeout(async () => {
			await ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
			await this.handleLockCell(ctx);
		  }, 3000);
		}
	  } catch (error) {
		logger.error(`Manual lock cell error: ${error.message}`);
		await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
		
		const errorMsg = await ctx.reply(`❌ Failed to lock cell: ${error.message}`);
		setTimeout(async () => {
		  await ctx.telegram.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
		  await this.handleLockCell(ctx);
		}, 3000);
	  }
	  
	  sessionManager.clearState(chatId);
	}

	async handleLockCellCancel(ctx) {
	  const chatId = ctx.chat.id;
	  
	  // Hapus prompt message
	  const sessionData = sessionManager.getData(chatId);
	  if (sessionData && sessionData.promptMsgId) {
		try {
		  await ctx.telegram.deleteMessage(chatId, sessionData.promptMsgId).catch(() => {});
		} catch (e) {}
	  }
	  
	  sessionManager.clearState(chatId);
	  
	  // Hapus pesan user
	  await this.deleteUserMessage(ctx);
	  
	  // Langsung buat menu baru (bukan edit pesan lama)
	  await this.handleLockCell(ctx);
	  
	  if (ctx.callbackQuery) {
		await ctx.answerCbQuery('Cancelled');
	  }
	}

	// Update handleLockCellAction untuk lock current cell
	async handleLockCellAction(ctx, action) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = lockcellMenuData.get(chatId);
	  
	  if (!data) {
		await ctx.answerCbQuery('Menu expired, please use /lockcell again');
		return;
	  }
	  
	  // Show processing
	  const processingKeyboard = {
		inline_keyboard: [[{ text: '⏳ Processing...', callback_data: 'lockcell_processing' }]]
	  };
	  
	  const originalMessage = ctx.callbackQuery.message.text;
	  const processingMessage = originalMessage + `\n\n${Formatter.separator()}\n⏳ Processing...`;
	  
	  await ctx.editMessageText(processingMessage, {
		parse_mode: 'HTML',
		reply_markup: processingKeyboard
	  });
	  
	  try {
		let result;
		
		if (action === 'lock') {
		  result = await modemAPI.lockCell(data.modemIp, data.sessionId, data.currentFreq, data.currentPci);
		  if (result.success && result.message === "0") {
			data.isLocked = true;
			lockcellMenuData.set(chatId, data);
		  }
		} else if (action === 'unlock') {
		  result = await modemAPI.unlockCell(data.modemIp, data.sessionId);
		  if (result.success && result.message === "0") {
			data.isLocked = false;
			lockcellMenuData.set(chatId, data);
		  }
		}
		
		if (result && result.success && result.message === "0") {
		  await this.refreshLockCellMenu(ctx);
		  await ctx.answerCbQuery(action === 'lock' ? 'Cell locked!' : 'Cell unlocked!');
		  ModemAuth.clearSession(chatId);
		} else {
		  await this.refreshLockCellMenu(ctx);
		  await ctx.answerCbQuery(`Failed: ${result?.message || 'Unknown error'}`);
		}
	  } catch (error) {
		logger.error(`LockCell action error: ${error.message}`);
		await this.refreshLockCellMenu(ctx);
		await ctx.answerCbQuery('Error occurred');
	  }
	}

	// Update refreshLockCellMenu
	async refreshLockCellMenu(ctx) {
	  const chatId = ctx.chat.id;
	  const Formatter = require('../utils/formatter');
	  const data = lockcellMenuData.get(chatId);
	  
	  if (!data) {
		await this.handleLockCell(ctx);
		return;
	  }
	  
	  try {
		const sessionId = await this.ensureAuth(ctx, true);
		const modemIp = ModemAuth.getModemIp(chatId);
		
		const [lockInfo, signal, currentBand] = await Promise.all([
		  modemAPI.getLockCellInfo(modemIp, sessionId),
		  modemAPI.getSignal(modemIp, sessionId),
		  modemAPI.getCurrentBand(modemIp, sessionId)
		]);
		
		const isLocked = lockInfo.lte_lock_sw === '1';
		const currentFreq = lockInfo.FREQ || signal.FREQ || 'N/A';
		const currentPci = lockInfo.PCI || signal.PCI || 'N/A';
		const currentBandNum = signal.currentband || 'N/A';
		
		const bandFreqs = {
		  1: '2100 MHz', 3: '1800 MHz', 5: '850 MHz',
		  8: '900 MHz', 40: '2300 MHz'
		};
		const bandDisplay = bandFreqs[currentBandNum] || 'N/A';
		
		// Update data
		data.isLocked = isLocked;
		data.currentFreq = currentFreq;
		data.currentPci = currentPci;
		data.sessionId = sessionId;
		data.modemIp = modemIp;
		data.currentBand = currentBandNum;
		lockcellMenuData.set(chatId, data);
		
		const keyboard = {
		  inline_keyboard: [
			[{ text: isLocked ? '🔓 Unlock Cell' : '🔒 Lock Current Cell', callback_data: isLocked ? 'lockcell_unlock' : 'lockcell_lock' }],
			[{ text: '✏️ Manual Input (PCI & EARFCN)', callback_data: 'lockcell_manual' }],
			[{ text: '🔄 Refresh', callback_data: 'lockcell_refresh' }],
			[{ text: '❌ Close', callback_data: 'lockcell_close' }]
		  ]
		};
		
		const statusIcon = isLocked ? '✅ LOCKED' : '❌ UNLOCKED';
		const statusColor = isLocked ? '🟢' : '🔴';
		
		const message = `
	🔒 <b>CELL LOCK MENU</b>
	${Formatter.doubleSeparator()}

	<b>Current Status:</b> ${statusColor} ${statusIcon}

	${Formatter.separator()}

	<b>📡 Current Cell Info:</b>
	   • Band: ${currentBandNum} (${bandDisplay})
	   • Bandwidth: ${signal.bandwidth || 'N/A'} MHz
	   • PCI: ${currentPci}
	   • EARFCN: ${currentFreq}

	${Formatter.separator()}

	<b>🔒 Locked Cell Info:</b>
	   • Status: ${isLocked ? 'Locked' : 'Not locked'}
	   ${isLocked ? `• PCI: ${lockInfo.lte_lock_pci || 'N/A'}\n   • EARFCN: ${lockInfo.lte_lock_freq || 'N/A'}` : '• No cell locked'}

	${Formatter.separator()}

	💡 <b>Tips:</b>
	• Lock Cell will force modem to stay on specific cell tower
	• PCI = Physical Cell ID (0-503)
	• EARFCN = Frequency channel number
	• Unlock to allow modem to select best cell automatically
	• Changes apply immediately

	${Formatter.separator()}
	<b>🖱️ Click buttons below to control cell lock:</b>
	`;
		
		const currentMessage = ctx.callbackQuery?.message?.text;
		
		if (currentMessage !== message) {
		  await ctx.editMessageText(message, {
			parse_mode: 'HTML',
			reply_markup: keyboard
		  });
		} else {
		  await ctx.editMessageReplyMarkup(keyboard);
		}
		
	  } catch (error) {
		if (!error.message.includes('message is not modified')) {
		  logger.error(`Refresh lockcell menu error: ${error.message}`);
		}
	  }
	}
		async handleLockCellRefresh(ctx) {
		  const chatId = ctx.chat.id;
		  await this.refreshLockCellMenu(ctx);
		  await ctx.answerCbQuery('Refreshed!');
		}

		async handleLockCellClose(ctx) {
		  const chatId = ctx.chat.id;
		  lockcellMenuData.delete(chatId);
		  try {
			await ctx.deleteMessage();
		  } catch (e) {}
		  await ctx.answerCbQuery('Closed');
		}
		// end off lock cell COMMANDS

		// Method khusus untuk handle lockcell dari reply keyboard
		// Di commands.js - method sederhana untuk reply keyboard
		async handleLockCellFromReply(ctx, action) {
		  const chatId = ctx.chat.id;
		  
		  // Data menu mungkin tidak ada, buat baru di sini
		  let data = lockcellMenuData.get(chatId);
		  
		  if (!data) {
			try {
			  const sessionId = await this.ensureAuth(ctx, true);
			  const modemIp = ModemAuth.getModemIp(chatId);
			  const [lockInfo, signal] = await Promise.all([
				modemAPI.getLockCellInfo(modemIp, sessionId),
				modemAPI.getSignal(modemIp, sessionId)
			  ]);
			  
			  data = {
				sessionId: sessionId,
				modemIp: modemIp,
				isLocked: lockInfo.lte_lock_sw === '1',
				currentFreq: lockInfo.FREQ || signal.FREQ || 'N/A',
				currentPci: lockInfo.PCI || signal.PCI || 'N/A',
				currentBand: signal.currentband || 'N/A'
			  };
			  lockcellMenuData.set(chatId, data);
			} catch (error) {
			  await ctx.reply(`❌ Failed to initialize: ${error.message}`);
			  return;
			}
		  }
		  
		  const processingMsg = await ctx.reply(`⏳ ${action === 'lock' ? 'Locking' : 'Unlocking'} cell...`);
		  
		  try {
			let result;
			
			if (action === 'lock') {
			  result = await modemAPI.lockCell(data.modemIp, data.sessionId, data.currentFreq, data.currentPci);
			  if (result.success && result.message === "0") {
				data.isLocked = true;
				lockcellMenuData.set(chatId, data);
			  }
			} else {
			  result = await modemAPI.unlockCell(data.modemIp, data.sessionId);
			  if (result.success && result.message === "0") {
				data.isLocked = false;
				lockcellMenuData.set(chatId, data);
			  }
			}
			
			await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
			
			if (result && result.success && result.message === "0") {
			  const successMsg = await ctx.reply(`✅ Cell ${action === 'lock' ? 'locked' : 'unlocked'} successfully!`);
			  setTimeout(() => {
				ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
			  }, 3000);
			  ModemAuth.clearSession(chatId);
			  // JANGAN HAPUS data menu, biarkan untuk penggunaan berikutnya
			} else {
			  await ctx.reply(`❌ Failed to ${action} cell: ${result?.message || 'Unknown error'}`);
			}
		  } catch (error) {
			logger.error(`LockCell reply error: ${error.message}`);
			await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
			await ctx.reply(`❌ Error: ${error.message}`);
		  }
		}

		// Di commands.js - tambahkan method ini
		async handleLockCellFromReplyKeyboard(ctx, action) {
		  const chatId = ctx.chat.id;
		  
		  // Ambil data dari lockcellMenuData atau buat baru
		  let data = lockcellMenuData.get(chatId);
		  
		  if (!data) {
			try {
			  const sessionId = await this.ensureAuth(ctx, true);
			  const modemIp = ModemAuth.getModemIp(chatId);
			  const [lockInfo, signal] = await Promise.all([
				modemAPI.getLockCellInfo(modemIp, sessionId),
				modemAPI.getSignal(modemIp, sessionId)
			  ]);
			  
			  data = {
				sessionId: sessionId,
				modemIp: modemIp,
				isLocked: lockInfo.lte_lock_sw === '1',
				currentFreq: lockInfo.FREQ || signal.FREQ || 'N/A',
				currentPci: lockInfo.PCI || signal.PCI || 'N/A',
				currentBand: signal.currentband || 'N/A'
			  };
			  lockcellMenuData.set(chatId, data);
			} catch (error) {
			  await ctx.reply(`❌ Failed to initialize: ${error.message}`);
			  return;
			}
		  }
		  
		  const processingMsg = await ctx.reply(`⏳ ${action === 'lock' ? 'Locking' : 'Unlocking'} cell...`);
		  
		  try {
			let result;
			
			if (action === 'lock') {
			  result = await modemAPI.lockCell(data.modemIp, data.sessionId, data.currentFreq, data.currentPci);
			  if (result.success && result.message === "0") {
				data.isLocked = true;
				lockcellMenuData.set(chatId, data);
			  }
			} else {
			  result = await modemAPI.unlockCell(data.modemIp, data.sessionId);
			  if (result.success && result.message === "0") {
				data.isLocked = false;
				lockcellMenuData.set(chatId, data);
			  }
			}
			
			await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
			
			if (result && result.success && result.message === "0") {
			  const successMsg = await ctx.reply(`✅ Cell ${action === 'lock' ? 'locked' : 'unlocked'} successfully!`);
			  setTimeout(() => {
				ctx.telegram.deleteMessage(chatId, successMsg.message_id).catch(() => {});
			  }, 3000);
			  ModemAuth.clearSession(chatId);
			} else {
			  await ctx.reply(`❌ Failed to ${action} cell: ${result?.message || 'Unknown error'}`);
			}
		  } catch (error) {
			logger.error(`LockCell reply error: ${error.message}`);
			await ctx.telegram.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
			await ctx.reply(`❌ Error: ${error.message}`);
		  }
		}		
	// =========== LOCK CELL COMMANDS =========== 	
	
}
module.exports = CommandHandlers;
