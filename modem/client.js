// Use curl client for better compatibility
const { modemRequest, customRequest, customPost } = require('./curl-client');

module.exports = {
  modemRequest,
  customRequest,
  customPost
};
