/**
 * Message Handler for Reply Keyboard
 * File: handlers/messages.js
 * Description: Handle all text messages from reply keyboard and inline commands
 */

const logger = require('../utils/logger');
const KeyboardBuilder = require('../utils/keyboardBuilder');

/**
 * Handle reply keyboard button clicks
 * @param {Object} ctx - Telegraf context
 * @param {Object} commands - CommandHandlers instance
 */
async function handleReplyKeyboard(ctx, commands) {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  
  logger.info(`Processing reply keyboard: ${text} from ${chatId}`);
  
  // Handle "Back to Main Menu"
  if (text === '🔙 Back to Main Menu') {
    await ctx.reply('Returning to main menu...', KeyboardBuilder.getMainMenuKeyboard());
    return;
  }
  
  // Handle "Close Keyboard"
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
  
  // Handle command mapping from keyboard buttons
  const command = KeyboardBuilder.menuCommandMap[text];
  console.log(`🔍 DEBUG: text="${text}" -> command="${command}"`);

  if (command) {
	console.log(`🔍 DEBUG: Executing command: ${command}`);
    logger.info(`Executing command: ${command} from reply keyboard`);
    
    // Create fake context for command execution
    const fakeCtx = { ...ctx, message: { ...ctx.message, text: command } };
    
    // Execute based on command
    if (command === '/signal') {
      await commands.handleSignal(fakeCtx);
    } 
    else if (command === '/status') {
      await commands.handleStatus(fakeCtx);
    } 
    else if (command === '/device') {
      await commands.handleDevice(fakeCtx);
    } 
    else if (command === '/sysinfo') {
      await commands.handleSysInfo(fakeCtx);
    } 
    else if (command === '/all') {
      await commands.handleAll(fakeCtx);
    } 
    else if (command === '/traffic') {
      await commands.handleTraffic(fakeCtx);
    } 
    else if (command === '/sms') {
      await commands.handleSMS(fakeCtx);
    } 
    else if (command === '/wifi') {
      await commands.handleWifiDetail(fakeCtx);
    } 
    else if (command === '/wifi_on') {
      await commands.handleWifiOn(fakeCtx);
    } 
    else if (command === '/wifi_off') {
      await commands.handleWifiOff(fakeCtx);
    } 
    else if (command === '/wifi24_on') {
      await commands.handleWifi24On(fakeCtx);
    } 
    else if (command === '/wifi24_off') {
      await commands.handleWifi24Off(fakeCtx);
    } 
    else if (command === '/wifi5_on') {
      await commands.handleWifi5On(fakeCtx);
    } 
    else if (command === '/wifi5_off') {
      await commands.handleWifi5Off(fakeCtx);
    } 
    else if (command === '/wifi_toggle') {
      await commands.handleWifiToggle(fakeCtx);
    }
    // ========== LED COMMANDS ==========	
    else if (command === '/led_on') {
	  console.log("🔴🔴🔴 LED ON CALLED! 🔴🔴🔴");
      await commands.handleLEDOn(fakeCtx);
    } 
    else if (command === '/led_off') {
      await commands.handleLEDOff(fakeCtx);
    } 
    else if (command === '/led_wifi_on') {
      await commands.handleLEDWifiOn(fakeCtx);
    } 
    else if (command === '/led_wifi_off') {
	  console.log("🔴🔴🔴 LED WIFI OFF CALLED! 🔴🔴🔴");
      await commands.handleLEDWifiOff(fakeCtx);
    } 
    else if (command === '/led_data_on') {
      await commands.handleLEDDataOn(fakeCtx);
    } 
    else if (command === '/led_data_off') {
      await commands.handleLEDDataOff(fakeCtx);
    } 
    else if (command === '/led_sig_on') {
      await commands.handleLEDSigOn(fakeCtx);
    } 
    else if (command === '/led_sig_off') {
      await commands.handleLEDSigOff(fakeCtx);
    } 
    else if (command === '/led_reset') {
      await commands.handleLEDReset(fakeCtx);
    } 
    // ========== END LED COMMANDS ========== 
    else if (command === '/band') {
      await commands.handleBand(fakeCtx);
    } 
    else if (command === '/lockband') {
      // Extract band numbers from command text
      if (command.includes('1,3,5')) {
        await commands.handleLockBand(fakeCtx, '1,3,5');
      } else if (command.includes('1,3')) {
        await commands.handleLockBand(fakeCtx, '1,3');
      } else if (command.includes('1')) {
        await commands.handleLockBand(fakeCtx, '1');
      } else if (command.includes('3')) {
        await commands.handleLockBand(fakeCtx, '3');
      } else if (command.includes('5')) {
        await commands.handleLockBand(fakeCtx, '5');
      } else if (command.includes('8')) {
        await commands.handleLockBand(fakeCtx, '8');
      } else if (command.includes('40')) {
        await commands.handleLockBand(fakeCtx, '40');
      } else if (command.includes('auto')) {
        await commands.handleLockBand(fakeCtx, 'auto');
      } else {
        await commands.handleLockBand(fakeCtx, '');
      }
    } 
    else if (command === '/lockcell') {
      await commands.handleLockCell(fakeCtx);
    } 
    else if (command === '/lockcell lock') {
      await commands.handleLockCellAction(fakeCtx, 'lock');
    } 
    else if (command === '/lockcell unlock') {
      await commands.handleLockCellAction(fakeCtx, 'unlock');
    } 
    else if (command === '/dataon') {
      await commands.handleDataOn(fakeCtx);
    } 
    else if (command === '/dataoff') {
      await commands.handleDataOff(fakeCtx);
    } 
    else if (command === '/data') {
      await commands.handleDataMenu(fakeCtx);
    } 
    else if (command === '/ttl') {
      await commands.handleTTLMenu(fakeCtx);
    } 
    else if (command === '/ttlstatus') {
      await commands.handleTTLStatus(fakeCtx);
    } 
    else if (command === '/setttl') {
      // Extract TTL value
      const ttlMatch = command.match(/\d+/);
      if (ttlMatch) {
        const fakeCtxWithArg = { ...ctx, message: { ...ctx.message, text: `/setttl ${ttlMatch[0]}` } };
        await commands.handleSetTTL(fakeCtxWithArg);
      } else {
        await commands.handleSetTTL(fakeCtx);
      }
    } 
    else if (command === '/reboot') {
      await commands.handleReboot(fakeCtx);
    } 
    else if (command === '/imei') {
      await commands.handleIMEI(fakeCtx);
    } 
    else if (command === '/log') {
      await commands.handleLog(fakeCtx);
    } 
    else if (command === '/log clear') {
      await commands.handleLogClear(fakeCtx);
    } 
    else if (command === '/logout') {
      await commands.handleLogout(fakeCtx);
    } 
    else if (command === '/config') {
      await commands.handleConfig(fakeCtx);
    } 
    else if (command === '/setconfig') {
      await commands.handleSetConfig(fakeCtx);
    } 
    else if (command === '/ping') {
      await commands.handlePing(fakeCtx);
    } 
    else if (command === '/help') {
      await commands.handleHelp(fakeCtx);
    } 
    else if (command === '/currentband') {
      await commands.handleCurrentBand(fakeCtx);
    } 
    else if (command === '/clients') {
      await commands.handleClients(fakeCtx);
    } 
    else {
      await ctx.reply(`⚠️ Command not implemented: ${command}\n\nPlease use /help for available commands.`);
    }
    return;
  }
  
  // Handle direct command from text (if user types /command)
  if (text.startsWith('/')) {
    logger.info(`Direct command: ${text} from ${chatId}`);
    
    // Create fake context and let the command handlers process it
    const fakeCtx = { ...ctx, message: { ...ctx.message, text: text } };
    
    // Extract command name
    const cmdName = text.split(' ')[0].toLowerCase();
    
    switch (cmdName) {
		// Monitoring
		case '/signal': await commands.handleSignal(fakeCtx); break;
		case '/status': await commands.handleStatus(fakeCtx); break;
		case '/device': await commands.handleDevice(fakeCtx); break;
		case '/sysinfo': await commands.handleSysInfo(fakeCtx); break;
		case '/all': await commands.handleAll(fakeCtx); break;
		case '/traffic': await commands.handleTraffic(fakeCtx); break;
		case '/currentband': await commands.handleCurrentBand(fakeCtx); break;
		case '/clients': await commands.handleClients(fakeCtx); break;
		case '/log': await commands.handleLog(fakeCtx); break;
			
		// SMS
		case '/sms': await commands.handleSMS(fakeCtx); break;
		case '/send': await commands.handleSendSMS(fakeCtx); break;
			
		// WiFi
		case '/wifi': await commands.handleWifiDetail(fakeCtx); break;
		case '/wifi_on': await commands.handleWifiOn(fakeCtx); break;
		case '/wifi_off': await commands.handleWifiOff(fakeCtx); break;
		case '/wifi24_on': await commands.handleWifi24On(fakeCtx); break;
		case '/wifi24_off': await commands.handleWifi24Off(fakeCtx); break;
		case '/wifi5_on': await commands.handleWifi5On(fakeCtx); break;
		case '/wifi5_off': await commands.handleWifi5Off(fakeCtx); break;
		case '/wifi_toggle': await commands.handleWifiToggle(fakeCtx); break;
		case '/wifishare': await commands.handleWifiShare(fakeCtx); break;
			
		// LED 
		case '/led': await commands.handleLEDMenu(fakeCtx); break;
		case '/led_on': await commands.handleLEDOn(fakeCtx); break;
		case '/led_off': await commands.handleLEDOff(fakeCtx); break;
		case '/led_wifi_on': await commands.handleLEDWifiOn(fakeCtx); break;
		case '/led_wifi_off': await commands.handleLEDWifiOff(fakeCtx); break;
		case '/led_data_on': await commands.handleLEDDataOn(fakeCtx); break;
		case '/led_data_off': await commands.handleLEDDataOff(fakeCtx); break;
		case '/led_sig_on': await commands.handleLEDSigOn(fakeCtx); break;
		case '/led_sig_off': await commands.handleLEDSigOff(fakeCtx); break;
		case '/led_reset': await commands.handleLEDReset(fakeCtx); break;
			
		// Band
		case '/band': await commands.handleBand(fakeCtx); break;
		case '/lockband': await commands.handleLockBand(fakeCtx); break;
		case '/setband': await commands.handleSetBand(fakeCtx); break;
			
		// Network
		case '/data': await commands.handleDataMenu(fakeCtx); break;
		case '/dataon': await commands.handleDataOn(fakeCtx); break;
		case '/dataoff': await commands.handleDataOff(fakeCtx); break;
		case '/ttl': await commands.handleTTLMenu(fakeCtx); break;
		case '/ttlstatus': await commands.handleTTLStatus(fakeCtx); break;
		case '/setttl': await commands.handleSetTTL(fakeCtx); break;
		case '/resetttl': await commands.handleResetTTL(fakeCtx); break;
		case '/lockcell': await commands.handleLockCell(fakeCtx); break;
			
		// System
		case '/reboot': await commands.handleReboot(fakeCtx); break;
		case '/imei': await commands.handleIMEI(fakeCtx); break;
		case '/logout': await commands.handleLogout(fakeCtx); break;
			
		// Admin
		case '/config': await commands.handleConfig(fakeCtx); break;
		case '/setconfig': await commands.handleSetConfig(fakeCtx); break;
		case '/ping': await commands.handlePing(fakeCtx); break;
		case '/help': await commands.handleHelp(fakeCtx); break;
		case '/start': await commands.handleStart(fakeCtx); break;

      default:
        await ctx.reply(`❓ Unknown command: ${text}\n\nType /help to see available commands.`);
    }
    return;
  }
  
  // Default response for unknown text (not a command and not a keyboard button)
  await ctx.reply(`❓ Unknown: "${text}"\n\nType /help to see available commands or use the keyboard buttons below.`);
}

/**
 * Setup message handlers for the bot
 * @param {Object} bot - Telegraf bot instance
 * @param {Object} commands - CommandHandlers instance
 */
async function setupMessages(bot, commands) {
  // Hanya handle text yang TIDAK dimulai dengan / (bukan command)
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    
    // Skip jika itu adalah command (dimulai dengan /)
    if (text.startsWith('/')) {
      return;
    }
    
    // Skip jika sedang dalam state waiting (biar ditangani setupTextInput)
    const state = require('../sessions').getState(ctx.chat.id);
    if (state && (state === 'waiting_sms' || state === 'waiting_imei' || state === 'waiting_ttl' || state === 'waiting_lockcell' || state === 'waiting_wifi_ssid' || state === 'waiting_wifi_password')) {
      return;
    }
    
    await handleReplyKeyboard(ctx, commands);
  });
  
  logger.info('Reply keyboard message handlers initialized');
}

module.exports = { 
  setupMessages, 
  handleReplyKeyboard 
};