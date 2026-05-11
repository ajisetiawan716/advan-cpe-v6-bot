// utils/qrcode.js
// Simple QR code generator using canvas (Node.js compatible with canvas package)

const QRCode = require('qrcode');

async function generateQRCode(text) {
  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(text, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataUrl;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw error;
  }
}

async function generateQRCodeBuffer(text) {
  try {
    // Generate QR code as buffer
    const buffer = await QRCode.toBuffer(text, {
      width: 300,
      margin: 2
    });
    return buffer;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw error;
  }
}

module.exports = { generateQRCode, generateQRCodeBuffer };
