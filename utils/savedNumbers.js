const fs = require('fs');
const path = '/etc/advan-bot/saved-numbers.json';
const logger = require('./logger');

// Pastikan direktori ada
function ensureDir() {
  const dir = path.split('/').slice(0, -1).join('/');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load data dari file
function loadData() {
  try {
    ensureDir();
    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    logger.error(`Failed to load saved numbers: ${e.message}`);
  }
  return {};
}

// Save data ke file
function saveData(data) {
  try {
    ensureDir();
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    logger.error(`Failed to save saved numbers: ${e.message}`);
    return false;
  }
}

// Simpan nomor untuk user
function saveNumber(chatId, phoneNumber) {
  const data = loadData();
  const key = String(chatId);
  let numbers = data[key] || [];
  
  if (!numbers.includes(phoneNumber)) {
    numbers.unshift(phoneNumber);
    data[key] = numbers.slice(0, 10); // Max 10 nomor
    saveData(data);
    logger.debug(`Saved number ${phoneNumber} for user ${chatId}`);
    return true;
  }
  return false;
}

// Ambil semua nomor user
function getNumbers(chatId) {
  const data = loadData();
  return data[String(chatId)] || [];
}

// Hapus semua nomor user
function clearNumbers(chatId) {
  const data = loadData();
  delete data[String(chatId)];
  saveData(data);
  logger.debug(`Cleared numbers for user ${chatId}`);
}

// Hapus nomor tertentu
function removeNumber(chatId, phoneNumber) {
  const data = loadData();
  const key = String(chatId);
  if (data[key]) {
    data[key] = data[key].filter(n => n !== phoneNumber);
    if (data[key].length === 0) {
      delete data[key];
    }
    saveData(data);
    return true;
  }
  return false;
}

module.exports = {
  saveNumber,
  getNumbers,
  clearNumbers,
  removeNumber
};
