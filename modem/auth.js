const crypto = require('crypto');
const { modemRequest } = require('./client');
const logger = require('../utils/logger');
const uci = require('../utils/uci');

class ModemAuth {
  constructor() {
    this.sessions = new Map();
    this.SESSION_TTL = 3600000;
    this.loginAttempts = new Map(); // Track login attempts per chat
  }

  sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  randomSessionId() {
    return crypto.createHash('md5').update(Math.random().toString()).digest('hex') +
           crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  }

  async getToken(ip) {
    try {
      const response = await modemRequest(ip, {
        cmd: 232,
        method: 'GET',
        sessionId: ''
      });
      
      if (!response || !response.token) {
        throw new Error('Failed to get token');
      }
      
      logger.info(`Token obtained: ${response.token}`);
      return response.token;
    } catch (error) {
      logger.error(`Failed to get token: ${error.message}`);
      throw error;
    }
  }

	async autoLogin(chatId, retryCount = 0) {
	  const maxRetries = 2;
	  
	  try {
		const modemConfig = await uci.getModemConfig();
		const ip = modemConfig.ip;
		const username = modemConfig.username;
		const password = modemConfig.password;
		
		logger.info(`Auto-login for chat ${chatId}`);
		
		const token = await this.getToken(ip);
		const tempSession = this.randomSessionId();
		const hash = this.sha256(token + password);
		
		const response = await modemRequest(ip, {
		  cmd: 100,
		  method: 'POST',
		  sessionId: tempSession,
		  username: username,
		  passwd: hash,
		  isAutoUpgrade: "0"
		});
		
		if (response && response.success && response.sessionId) {
		  this.sessions.set(chatId, {
			sessionId: response.sessionId,
			expiresAt: Date.now() + this.SESSION_TTL,
			ip: ip
		  });
		  logger.info(`✅ Login successful for chat ${chatId}`);
		  return response.sessionId;
		} else {
		  throw new Error('Login failed');
		}
	  } catch (error) {
		logger.error(`Auto-login error: ${error.message}`);
		
		if (retryCount < maxRetries) {
		  await new Promise(resolve => setTimeout(resolve, 2000));
		  return this.autoLogin(chatId, retryCount + 1);
		}
		
		throw error;
	  }
	}

  async ensureSession(chatId) {
    let session = this.sessions.get(chatId);
    
    if (session && session.expiresAt > Date.now()) {
      return session.sessionId;
    }
    
    logger.info(`Session expired or not found for chat ${chatId}, auto-login...`);
    return await this.autoLogin(chatId);
  }

  getSession(chatId) {
    const session = this.sessions.get(chatId);
    if (session && session.expiresAt > Date.now()) {
      return session.sessionId;
    }
    return null;
  }

  getModemIp(chatId) {
    const session = this.sessions.get(chatId);
    if (session && session.expiresAt > Date.now()) {
      return session.ip;
    }
    return null;
  }

  clearSession(chatId) {
    this.sessions.delete(chatId);
    logger.info(`Session cleared for chat ${chatId}`);
  }

  isLoggedIn(chatId) {
    return this.getSession(chatId) !== null;
  }
}

module.exports = new ModemAuth();