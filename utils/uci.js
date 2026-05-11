const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('./logger');

const CONFIG_NAME = 'advan_bot';
const CONFIG_SECTION = 'main';

// Initialize UCI config if not exists
async function initUciConfig() {
  try {
    // Check if config exists
    const { stdout } = await execPromise(`uci show ${CONFIG_NAME} 2>/dev/null || echo ""`);
    
    if (!stdout.trim()) {
      logger.info(`Creating UCI config: ${CONFIG_NAME}`);
      
      // Create config with default values
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}=${CONFIG_NAME}`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.modem_ip='192.168.0.1'`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.modem_user='root'`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.modem_password='admin'`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.bot_token=''`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.log_level='info'`);
      await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.allowed_users=''`);
      await execPromise(`uci commit ${CONFIG_NAME}`);
      
      logger.info('UCI config created with default values');
    } else {
      logger.info('UCI config already exists');
    }
  } catch (error) {
    logger.error(`Failed to init UCI config: ${error.message}`);
  }
}

async function getConfig(key) {
  try {
    const { stdout } = await execPromise(`uci get ${CONFIG_NAME}.${CONFIG_SECTION}.${key} 2>/dev/null || echo ""`);
    const value = stdout.trim();
    
    if (value === '') {
      return null;
    }
    
    return value;
  } catch (error) {
    logger.error(`Failed to get config ${key}: ${error.message}`);
    return null;
  }
}

async function setConfig(key, value) {
  try {
    await execPromise(`uci set ${CONFIG_NAME}.${CONFIG_SECTION}.${key}='${value}'`);
    await execPromise(`uci commit ${CONFIG_NAME}`);
    logger.info(`Config updated: ${key}=${value}`);
    return true;
  } catch (error) {
    logger.error(`Failed to set config ${key}: ${error.message}`);
    return false;
  }
}

async function getAllConfig() {
  const config = {};
  
  try {
    const { stdout } = await execPromise(`uci show ${CONFIG_NAME}.${CONFIG_SECTION} 2>/dev/null`);
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      // Match pattern: advan_bot.main.key='value'
      const match = line.match(new RegExp(`${CONFIG_NAME}\\.${CONFIG_SECTION}\\.(\\w+)='(.*)'`));
      if (match) {
        config[match[1]] = match[2];
      }
    }
  } catch (error) {
    logger.error(`Failed to get all config: ${error.message}`);
  }
  
  return config;
}

async function setAllowedUser(chatId) {
  try {
    // Get existing allowed users
    const existing = await getConfig('allowed_users');
    let users = existing && existing !== '' ? existing.split(',') : [];
    
    if (!users.includes(chatId.toString())) {
      users.push(chatId.toString());
      await setConfig('allowed_users', users.join(','));
    }
    return true;
  } catch (error) {
    logger.error(`Failed to set allowed user: ${error.message}`);
    return false;
  }
}

async function removeAllowedUser(chatId) {
  try {
    const existing = await getConfig('allowed_users');
    if (!existing || existing === '') return false;
    
    let users = existing.split(',');
    users = users.filter(u => u !== chatId.toString());
    await setConfig('allowed_users', users.join(','));
    return true;
  } catch (error) {
    logger.error(`Failed to remove allowed user: ${error.message}`);
    return false;
  }
}

async function isUserAllowed(chatId) {
  try {
    const allowed = await getConfig('allowed_users');
    if (!allowed || allowed === '') return false;
    
    const users = allowed.split(',');
    return users.includes(chatId.toString());
  } catch (error) {
    logger.error(`Failed to check allowed user: ${error.message}`);
    return false;
  }
}

async function getModemConfig() {
  const modemIp = await getConfig('modem_ip');
  const modemUser = await getConfig('modem_user');
  const modemPassword = await getConfig('modem_password');
  
  return {
    ip: modemIp || '192.168.0.1',
    username: modemUser || 'root',
    password: modemPassword || 'admin'
  };
}

async function getBotToken() {
  return await getConfig('bot_token');
}

async function setBotToken(token) {
  return await setConfig('bot_token', token);
}

async function getLogLevel() {
  const level = await getConfig('log_level');
  return level || 'info';
}

async function setLogLevel(level) {
  const validLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLevels.includes(level)) {
    logger.error(`Invalid log level: ${level}. Must be one of: ${validLevels.join(', ')}`);
    return false;
  }
  return await setConfig('log_level', level);
}

module.exports = {
  initUciConfig,
  getConfig,
  setConfig,
  getAllConfig,
  setAllowedUser,
  removeAllowedUser,
  isUserAllowed,
  getModemConfig,
  getBotToken,
  setBotToken,
  getLogLevel,
  setLogLevel,
  CONFIG_NAME,
  CONFIG_SECTION
};
