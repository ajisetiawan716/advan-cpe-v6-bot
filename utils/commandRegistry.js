/**
 * Advan Bot - Command Registry
 * File: utils/commandRegistry.js
 * Description: Register bot commands with Telegram API
 */

const logger = require('./logger');

// List of all available commands with descriptions in English
const COMMANDS = [
    // Monitoring
    { command: 'start', description: 'Start the bot and show welcome message' },
    { command: 'help', description: 'Show all available commands' },
    { command: 'signal', description: 'Show signal information (RSRP, RSRQ, SINR)' },
    { command: 'status', description: 'Show modem status and uptime' },
    { command: 'device', description: 'Show device information (IMEI, SN, FW)' },
    { command: 'sysinfo', description: 'Show system info (CPU, Temperature)' },
    { command: 'traffic', description: 'Show WAN traffic (Download/Upload)' },
    { command: 'currentband', description: 'Show current active band' },
    { command: 'clients', description: 'Show active WiFi clients' },
    { command: 'log', description: 'View system logs' },
    
    // SMS
    { command: 'sms', description: 'SMS Manager (inbox and send)' },
    { command: 'send', description: 'Send SMS: /send <phone> <message>' },
    
    // Band Control
    { command: 'band', description: 'Show band configuration' },
    { command: 'lockband', description: 'Lock to specific bands: /lockband 1,3,40' },
    
    // WiFi
    { command: 'wifi', description: 'WiFi control menu' },
    { command: 'wifi_on', description: 'Turn ON all WiFi' },
    { command: 'wifi_off', description: 'Turn OFF all WiFi' },
    { command: 'wifi24_on', description: 'Turn ON 2.4GHz WiFi only' },
    { command: 'wifi24_off', description: 'Turn OFF 2.4GHz WiFi only' },
    { command: 'wifi5_on', description: 'Turn ON 5GHz WiFi only' },
    { command: 'wifi5_off', description: 'Turn OFF 5GHz WiFi only' },
    
    // Network
    { command: 'data', description: 'Mobile data control menu' },
    { command: 'dataon', description: 'Enable mobile data' },
    { command: 'dataoff', description: 'Disable mobile data' },
    { command: 'lockcell', description: 'Lock to specific cell tower' },
    { command: 'ttl', description: 'TTL control menu' },
    { command: 'ttlstatus', description: 'Show TTL status' },
    { command: 'setttl', description: 'Set TTL value: /setttl <64-255>' },
    { command: 'resetttl', description: 'Reset TTL to default' },
    
    // LED Control
    { command: 'led', description: 'LED control menu with buttons' },
    { command: 'led_on', description: 'Turn ON all LEDs' },
    { command: 'led_off', description: 'Turn OFF all LEDs' },
    { command: 'led_wifi_on', description: 'Turn ON WiFi LED' },
    { command: 'led_wifi_off', description: 'Turn OFF WiFi LED' },
    { command: 'led_data_on', description: 'Turn ON Data LED' },
    { command: 'led_data_off', description: 'Turn OFF Data LED' },
    { command: 'led_sig_on', description: 'Turn ON Signal LED' },
    { command: 'led_sig_off', description: 'Turn OFF Signal LED' },
    { command: 'led_reset', description: 'Reset LED to auto mode' },
    
    // System
    { command: 'reboot', description: 'Reboot the modem' },
    { command: 'imei', description: 'Show modem IMEI' },
    { command: 'logout', description: 'Clear session and logout' },
    
    // Admin
    { command: 'config', description: 'Show current configuration' },
    { command: 'setconfig', description: 'Set configuration: /setconfig <key> <value>' },
    { command: 'ping', description: 'Check modem connection' }
];

const EXPECTED_COMMAND_COUNT = COMMANDS.length;

/**
 * Register bot commands with Telegram API
 * @param {Telegram} telegram - Telegram API instance
 * @returns {Promise<boolean>} Success status
 */
async function registerBotCommands(telegram) {
    try {
        const result = await telegram.setMyCommands(COMMANDS);
        
        if (result) {
            const registered = await telegram.getMyCommands();
            logger.info(`Bot commands registered: ${registered.length}/${EXPECTED_COMMAND_COUNT}`);
            return true;
        }
        
        return false;
        
    } catch (err) {
        logger.error(`Failed to register bot commands: ${err.message}`);
        return false;
    }
}

/**
 * Get all commands list
 * @returns {Array} Array of command objects
 */
function getCommandList() {
    return [...COMMANDS];
}

/**
 * Format command list as string
 * @returns {string} Formatted command list
 */
function formatCommandList() {
    const lines = [];
    
    // Group by category
    const categories = {
        '📡 Monitoring': ['start', 'help', 'signal', 'status', 'device', 'sysinfo', 'all', 'traffic', 'currentband', 'clients', 'log'],
        '📱 SMS': ['sms', 'send'],
        '⚙️ Band Control': ['band', 'lockband'],
        '📡 WiFi': ['wifi', 'wifi_on', 'wifi_off', 'wifi24_on', 'wifi24_off', 'wifi5_on', 'wifi5_off'],
        '🌐 Network': ['data', 'dataon', 'dataoff', 'lockcell', 'ttl', 'ttlstatus', 'setttl', 'resetttl'],
        '💡 LED Control': ['led', 'led_on', 'led_off', 'led_wifi_on', 'led_wifi_off', 'led_data_on', 'led_data_off', 'led_sig_on', 'led_sig_off', 'led_reset'],
        '🔄 System': ['reboot', 'imei', 'logout'],
        '🔐 Admin': ['config', 'setconfig', 'ping']
    };
    
    const commandMap = {};
    for (const cmd of COMMANDS) {
        commandMap[cmd.command] = cmd.description;
    }
    
    for (const [category, cmdList] of Object.entries(categories)) {
        lines.push(`\n<b>${category}</b>`);
        for (const cmd of cmdList) {
            if (commandMap[cmd]) {
                lines.push(`/${cmd} - ${commandMap[cmd]}`);
            }
        }
    }
    
    return lines.join('\n');
}

module.exports = {
    registerBotCommands,
    getCommandList,
    formatCommandList,
    EXPECTED_COMMAND_COUNT,
    COMMANDS
};
