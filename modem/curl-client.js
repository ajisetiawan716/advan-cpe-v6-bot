const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger');

async function curlRequest(url, postData = null, method = 'GET') {
  try {
    let cmd = `curl -s -k --connect-timeout 10 --max-time 30`;
    
    // Add headers
    cmd += ` -H 'User-Agent: Mozilla/5.0'`;
    cmd += ` -H 'X-Requested-With: XMLHttpRequest'`;
    cmd += ` -H 'Accept: application/json, text/javascript, */*'`;
    cmd += ` -H 'Connection: close'`;
    
    if (method === 'POST') {
      cmd += ` -X POST`;
      if (postData) {
        // Untuk send_sms, gunakan application/x-www-form-urlencoded
        if (url.includes('send_sms')) {
          cmd += ` -H 'Content-Type: application/x-www-form-urlencoded'`;
        } else {
          cmd += ` -H 'Content-Type: application/json'`;
        }
        const escapedData = postData.replace(/'/g, "'\\''");
        cmd += ` -d '${escapedData}'`;
      }
    }
    
    cmd += ` '${url}'`;
    
    logger.debug(`Executing curl for: ${url.substring(0, 100)}...`);
    
    const { stdout, stderr } = await execPromise(cmd, {
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (stderr && !stderr.includes('Warning') && !stderr.includes('Failed')) {
      logger.warn(`Curl stderr: ${stderr}`);
    }
    
    // Handle empty response untuk reboot
    if ((!stdout || stdout.trim() === '') && url.includes('reboot')) {
      logger.info('Empty response from reboot command (expected)');
      return { success: true, message: 'reboot initiated' };
    }
    
    let cleanOutput = stdout.trim();
    
    // ========== PERBAIKI: Handle response non-JSON ==========
    // Coba lihat apakah response dimulai dengan angka (plain text log)
    if (cleanOutput.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Response adalah plain text log, return sebagai string
      logger.debug('Response is plain text log, returning as string');
      return cleanOutput;
    }
    
    // Coba cari JSON object di response
    try {
      const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Coba parse langsung
      return JSON.parse(cleanOutput);
    } catch (parseError) {
      // Jika gagal parse JSON, return sebagai string
      logger.debug(`Response is not JSON, returning as plain text: ${cleanOutput.substring(0, 100)}...`);
      return cleanOutput;
    }
    // ========== SAMPAI SINI ==========
    
  } catch (error) {
    if (url.includes('reboot') || url.includes('cmd\":6')) {
      logger.info('Reboot command sent (connection closed expected)');
      return { success: true, message: 'reboot command accepted' };
    }
    
    logger.error(`Curl request failed: ${error.message}`);
    throw error;
  }
}

async function modemRequest(ip, payload, sessionId = null) {
  const url = `http://${ip}/cgi-bin/http.cgi`;
  
  const requestPayload = { ...payload };
  if (sessionId) {
    requestPayload.sessionId = sessionId;
  } else if (!requestPayload.sessionId) {
    requestPayload.sessionId = '';
  }
  
  if (!requestPayload.language) {
    requestPayload.language = 'EN';
  }
  
  const postData = JSON.stringify(requestPayload);
  return await curlRequest(url, postData, 'POST');
}

async function customRequest(ip, action, params = {}) {
  let url = `http://${ip}/cgi-bin/custom.cgi?action=${action}`;
  
  for (const [key, value] of Object.entries(params)) {
    url += `&${key}=${encodeURIComponent(value)}`;
  }
  
  return await curlRequest(url, null, 'GET');
}

async function customPost(ip, action, data, method = 'POST') {
  const url = `http://${ip}/cgi-bin/custom.cgi?action=${action}`;
  
  return await curlRequest(url, data, method);
}

module.exports = {
  modemRequest,
  customRequest,
  customPost
};
