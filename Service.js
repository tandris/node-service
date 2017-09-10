const nsqjs = require('nsqjs');
const ServiceManager = require('./index');

class Service {
  configure(config, cb) {
    cb();
  }

  init(cb) {
    cb();
  }

  listen(topic, channel, onMessage) {
    ServiceManager.addNsqReader(topic, channel, onMessage);
  }

  sendMessage(topic, message) {
    return ServiceManager.sendNsqMessage(topic, message);
  }
}

module.exports = Service;
