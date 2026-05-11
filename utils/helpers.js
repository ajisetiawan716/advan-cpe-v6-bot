const fs = require('fs').promises;
const logger = require('./logger');

async function writePid(pidFile) {
    try {
        await fs.writeFile(pidFile, String(process.pid));
    } catch (err) {
        logger.error(`Failed to write PID: ${err.message}`);
    }
}

async function cleanupPid(pidFile) {
    try {
        await fs.unlink(pidFile).catch(() => {});
    } catch (err) {
        // Ignore
    }
}

async function killOldInstances() {
    // Implement if needed
    return true;
}

module.exports = {
    writePid,
    cleanupPid,
    killOldInstances
};
