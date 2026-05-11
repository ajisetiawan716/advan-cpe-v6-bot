const winston = require('winston');
const fs = require('fs');
const path = require('path');

const logDir = '/var/log/advancpe-bot';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'bot.log'), maxsize: 5242880, maxFiles: 5 })
  ]
});

module.exports = logger;
