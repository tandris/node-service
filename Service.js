const nsqjs = require('nsqjs');
const ServiceManager = require('./index');
const conc = require('concordant')();

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

  resolve(service, host) {
    if (process.env[service + '_SERVICE_HOST'] && process.env[service + '_SERVICE_PORT']) {
      let host = process.env[service + '_SERVICE_HOST'];
      let port = process.env[service + '_SERVICE_PORT'];
      console.log('Resolve service from environment variable. { service = ' + service + '; host = ' + host + '; port = ' + port + ' }');
      return Promise.resolve({
        host: host,
        port: port,
      });
    } else {
      return new Promise((resolve, reject) => {
        conc.dns.resolve(host, function (err, result) {
          if (err) {
            winston.error('Failed to resolve host. { host = ' + host + ' }', err);
            reject(err);
          } else {
            resolve(result[0]);
          }
        });
      });
    }
  }
}

module.exports = Service;
