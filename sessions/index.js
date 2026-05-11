class SessionManager {
  constructor() {
    this.userStates = new Map(); // chatId -> state
    this.userData = new Map();   // chatId -> temporary data
    this.commandTimeouts = new Map(); // chatId -> timeout
  }

  setState(chatId, state, data = null) {
    this.userStates.set(chatId, state);
    if (data) {
      this.userData.set(chatId, data);
    }
    
    // Auto clear state after 5 minutes
    const existingTimeout = this.commandTimeouts.get(chatId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeout = setTimeout(() => {
      this.clearState(chatId);
    }, 300000); // 5 minutes
    
    this.commandTimeouts.set(chatId, timeout);
  }

  getState(chatId) {
    return this.userStates.get(chatId);
  }

  getData(chatId) {
    return this.userData.get(chatId);
  }

  clearState(chatId) {
    this.userStates.delete(chatId);
    this.userData.delete(chatId);
    
    const timeout = this.commandTimeouts.get(chatId);
    if (timeout) {
      clearTimeout(timeout);
      this.commandTimeouts.delete(chatId);
    }
  }

  hasActiveState(chatId) {
    return this.userStates.has(chatId);
  }
}

module.exports = new SessionManager();
