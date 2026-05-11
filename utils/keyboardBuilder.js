/**
 * Keyboard Builder for Advan Bot
 * File: utils/keyboardBuilder.js
 * Description: Build reply keyboards for bot navigation
 */

const logger = require('./logger');

// ============ MAIN MENU ============
const getMainMenuKeyboard = () => ({
  reply_markup: {
    keyboard: [
      ['📡 Monitor', '🌐 Network'],
      ['📱 SMS', '📡 WiFi'],
      ['💡 LED', '⚙️ Band'],
      ['🔒 Cell Lock', '📊 Traffic'],
      ['🔄 System', '🔐 Admin'],
      ['❌ Close Keyboard']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// ============ SUBMENUS ============

// Monitor submenu
const getMonitorSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['📶 Signal', '📊 Status'],
      ['💻 Device', '🖥️ Sysinfo'],
      ['📈 All Info', '📊 Traffic'],
      ['🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// Network submenu
const getNetworkSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['🌐 Data ON', '🌐 Data OFF'],
      ['📊 Data Status', '🔒 Lock Cell'],
      ['🔓 Unlock Cell', '🌍 TTL Status'],
      ['⚙️ Set TTL', '🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// SMS submenu
const getSMSSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['📥 View Inbox', '✏️ Send SMS'],
      ['📋 Saved Numbers', '🗑️ Clear Numbers'],
      ['🗑️ Clear All SMS', '🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// WiFi submenu
const getWifiSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['📡 WiFi Status', '🔘 WiFi ON'],
      ['🔘 WiFi OFF', '📶 2.4GHz ON'],
      ['📶 2.4GHz OFF', '📡 5GHz ON'],
      ['📡 5GHz OFF', '🔄 WiFi Toggle'],
      ['🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// LED submenu
const getLEDSubmenu = () => {
  console.log('🔍 getLEDSubmenu called');
  return {
    reply_markup: {
      keyboard: [
        ['💡 All LEDs ON', '💡 All LEDs OFF'],
        ['📶 WiFi LED ON', '📶 WiFi LED OFF'],
        ['📡 Data LED ON', '📡 Data LED OFF'],
        ['📊 Signal LED ON', '📊 Signal LED OFF'],
        ['🔄 Reset to Auto', '🔙 Back to Main Menu']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

// Band submenu
const getBandSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['📡 Band Status', '📡 Current Band'],
      ['🔒 Lock Band 1', '🔒 Lock Band 3'],
      ['🔒 Lock Band 5', '🔒 Lock Band 8'],
      ['🔒 Lock Band 40', '🔗 Lock Band 1+3'],
      ['🔗 Lock Band 1+3+5', '🌐 Auto Mode'],
      ['🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// Cell Lock submenu
const getCellLockSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['🔒 Lock Current Cell', '🔓 Unlock Cell'],
      ['✏️ Manual Lock Cell', '📊 Cell Status'],
      ['🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// Traffic submenu
const getTrafficSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['📊 Traffic Info', '🔄 Refresh Traffic'],
      ['📈 History Traffic', '🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// System submenu
const getSystemSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['🔄 Reboot Modem', '📱 Show IMEI'],
      ['📋 System Logs', '🗑️ Clear Logs'],
      ['🔌 Logout', '🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// Admin submenu
const getAdminSubmenu = () => ({
  reply_markup: {
    keyboard: [
      ['⚙️ Show Config', '✏️ Set Config'],
      ['🏓 Ping Modem', '📋 Commands Help'],
      ['🔙 Back to Main Menu']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// ============ UTILITY ============

// Close keyboard (hide)
const getCloseKeyboard = () => ({
  reply_markup: {
    remove_keyboard: true
  }
});

// ============ COMMAND MAPPING ============
// Maps button text to bot commands
const menuCommandMap = {
  // Monitor menu
  '📶 Signal': '/signal',
  '📊 Status': '/status',
  '💻 Device': '/device',
  '🖥️ Sysinfo': '/sysinfo',
  '📈 All Info': '/all',
  '📊 Traffic': '/traffic',
  
  // Network menu
  '🌐 Data ON': '/dataon',
  '🌐 Data OFF': '/dataoff',
  '📊 Data Status': '/data',  
  '🔒 Lock Cell': '/lockcell',
  '🔓 Unlock Cell': '/lockcell_unlock',
  '🌍 TTL Status': '/ttlstatus',
  '⚙️ Set TTL': '/ttl',
  
  // SMS menu
  '📥 View Inbox': '/sms_view_inbox',     
  '✏️ Send SMS': '/sms_send_new',         
  '📋 Saved Numbers': '/sms_saved',       
  '🗑️ Clear Numbers': '/sms_clear_numbers',
  '🗑️ Clear All SMS': '/sms_clear_inbox',  
  
  // WiFi menu
  '📡 WiFi Status': '/wifi',
  '🔘 WiFi ON': '/wifi_on',
  '🔘 WiFi OFF': '/wifi_off',
  '📶 2.4GHz ON': '/wifi24_on',
  '📶 2.4GHz OFF': '/wifi24_off',
  '📡 5GHz ON': '/wifi5_on',
  '📡 5GHz OFF': '/wifi5_off',
  '🔄 WiFi Toggle': '/wifi_toggle',
  
  // LED menu
  '💡 All LEDs ON': '/led_on',
  '💡 All LEDs OFF': '/led_off',
  '📶 WiFi LED ON': '/led_wifi_on',
  '📶 WiFi LED OFF': '/led_wifi_off',
  '📡 Data LED ON': '/led_data_on',
  '📡 Data LED OFF': '/led_data_off',
  '📊 Signal LED ON': '/led_sig_on',
  '📊 Signal LED OFF': '/led_sig_off',
  '🔄 Reset to Auto': '/led_reset',
  
  // Band menu
  '📡 Band Status': '/band',
  '📡 Current Band': '/currentband',
  '🔒 Lock Band 1': '/lockband 1',
  '🔒 Lock Band 3': '/lockband 3',
  '🔒 Lock Band 5': '/lockband 5',
  '🔒 Lock Band 8': '/lockband 8',
  '🔒 Lock Band 40': '/lockband 40',
  '🔗 Lock Band 1+3': '/lockband 1,3',
  '🔗 Lock Band 1+3+5': '/lockband 1,3,5',
  '🌐 Auto Mode': '/lockband auto',
  
  // Cell Lock menu
  '🔒 Lock Current Cell': '/lockcell_lock',
  '✏️ Manual Lock Cell': '/lockcell_manual',
  '📊 Cell Status': '/lockcell',
  
  // Traffic menu
  '📊 Traffic Info': '/traffic',
  '🔄 Refresh Traffic': '/traffic',
  '📈 History Traffic': '/traffic history',
  
  // System menu
  '🔄 Reboot Modem': '/reboot',
  '📱 Show IMEI': '/imei',
  '📋 System Logs': '/log',
  '🗑️ Clear Logs': '/log_clear',
  '🔌 Logout': '/logout',
  
  // Admin menu
  '⚙️ Show Config': '/config',
  '✏️ Set Config': '/setconfig',
  '🏓 Ping Modem': '/ping',
  '📋 Commands Help': '/help'
};

// ============ SUBMENU MAPPING ============
// Maps main menu text to submenu function
const getSubmenuForKey = (text) => {
  const submenuMap = {
    '📡 Monitor': getMonitorSubmenu,
    '🌐 Network': getNetworkSubmenu,
    '📱 SMS': getSMSSubmenu,
    '📡 WiFi': getWifiSubmenu,
    '💡 LED': getLEDSubmenu,
    '⚙️ Band': getBandSubmenu,
    '🔒 Cell Lock': getCellLockSubmenu,
    '📊 Traffic': getTrafficSubmenu,
    '🔄 System': getSystemSubmenu,
    '🔐 Admin': getAdminSubmenu
  };
  
  const submenuFn = submenuMap[text];
  if (submenuFn) {
    return submenuFn();
  }
  return null;
};

// ============ GETTER FOR SPECIFIC SUBMENU ============
const getSubmenuByName = (name) => {
  const submenuMap = {
    'monitor': getMonitorSubmenu,
    'network': getNetworkSubmenu,
    'sms': getSMSSubmenu,
    'wifi': getWifiSubmenu,
    'led': getLEDSubmenu,
    'band': getBandSubmenu,
    'celllock': getCellLockSubmenu,
    'traffic': getTrafficSubmenu,
    'system': getSystemSubmenu,
    'admin': getAdminSubmenu
  };
  
  const submenuFn = submenuMap[name.toLowerCase()];
  if (submenuFn) {
    return submenuFn();
  }
  return getMainMenuKeyboard();
};

// ============ CHECK IF TEXT IS A MAIN MENU BUTTON ============
const isMainMenuButton = (text) => {
  const mainMenuButtons = [
    '📡 Monitor', '🌐 Network', '📱 SMS', '📡 WiFi',
    '💡 LED', '⚙️ Band', '🔒 Cell Lock', '📊 Traffic',
    '🔄 System', '🔐 Admin', '❌ Close Keyboard'
  ];
  return mainMenuButtons.includes(text);
};

// ============ CHECK IF TEXT IS A BACK BUTTON ============
const isBackButton = (text) => {
  return text === '🔙 Back to Main Menu';
};

// ============ CHECK IF TEXT IS CLOSE BUTTON ============
const isCloseButton = (text) => {
  return text === '❌ Close Keyboard';
};

// ============ GET COMMAND FROM BUTTON TEXT ============
const getCommandFromButton = (text) => {
  return menuCommandMap[text] || null;
};

// ============ EXPORTS ============
module.exports = {
  // Keyboard getters
  getMainMenuKeyboard,
  getMonitorSubmenu,
  getNetworkSubmenu,
  getSMSSubmenu,
  getWifiSubmenu,
  getLEDSubmenu,
  getBandSubmenu,
  getCellLockSubmenu,
  getTrafficSubmenu,
  getSystemSubmenu,
  getAdminSubmenu,
  getCloseKeyboard,
  getSubmenuByName,
  
  // Utility functions
  getSubmenuForKey,
  isMainMenuButton,
  isBackButton,
  isCloseButton,
  getCommandFromButton,
  
  // Data mappings
  menuCommandMap
};