/**
 * Initialize the service classes.
 */
const _ = require('lodash');
const winston = require('winston');
const events = require('events');
const nsq = require('nsqjs');
const conc = require('concordant')();

class ServiceManager {

  constructor() {
    this._config = {};
    this._services = {};
    this._nsqConfig = {};
    this._nsqWriter = null;
    this._lookupdHTTPAddresses = null;
    this._emitter = new events.EventEmitter();
    this._emitter.setMaxListeners(Number.MAX_VALUE);
    this.initWinston(winston);
  }

  initWinston(winston, logLevel) {
    winston.cli();
    let logger = new winston.Logger({
      transports: [
        new (winston.transports.Console)({
          handleExceptions: true,
          colorize: true
        })
      ]
    });
    logger.cli();
    winston.level = logLevel || 'info';
  };

  _createService({name, path, enabled, config}, baseDir, cb) {
    if (enabled === true) {
      if (path.indexOf('@') > -1) {
        path = path.replace('@', baseDir);
      }
      this._services[name] = require(path);
      this._services[name].configure(config, cb);
      winston.info(name + ' configured.');
    }
  }

  _configure(config, baseDir) {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (serviceCfg) => {
          winston.log('debug', 'Configure service. { name = ' + serviceCfg.name + ' }');
          this._createService(serviceCfg, baseDir, () => {
            winston.log('debug', 'Configure service done. { name = ' + serviceCfg.name + ' }');
            done();
          });
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _initialize(config) {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (service) => {
          winston.log('debug', 'Initialize service. { name = ' + service.name + ' }');
          this._services[service.name].init(() => {
            winston.log('debug', 'Initialize service done. { name = ' + service.name + ' }');
            done();
          });
          winston.info(service.name + ' initialized.');
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _resolve(host) {
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

  _initNsq() {
    let self = this;
    return this._resolve(this._nsqConfig.nsqd.host)
      .then(({host, port}) => {
        winston.info('NSQ writer connection. { host = ' + host + '; port = ' + port + '}');
        this._nsqWriter = new nsq.Writer(host, port);
        this._nsqWriter.connect();
        this._nsqWriter.on('ready', () => {
          winston.info('NSQ connected');
        });
        this._nsqWriter.on('error', (err) => {
          winston.error('NSQ connection error', err);
        });
        this._nsqWriter.on('closed', () => {
          winston.info('NSQ writer closed.');
          self._initNsq().then(() => {});
        });
        return Promise.resolve();
      })
      .then(() => {
        return this._resolve(this._nsqConfig.nsqlookupd.host);
      })
      .then(({host, port}) => {
        winston.info('NSQ reader connection. { host = ' + host + '; port = ' + port + '}');
        this._lookupdHTTPAddresses = host + ':' + port;
      });
  }

  start({config, baseDir}) {
    this._config = config;
    // NSQ init
    this._nsqConfig = config.nsq;
    winston.level = config.logLevel || 'info';

    return this._initNsq()
      .then(() => {
        return this._configure(config, baseDir);
      })
      .then(() => {
        return this._initialize(config);
      })
      .then(() => {
        winston.info('Service initialization finished');
        return Promise.resolve();
      })
      .catch(err => {
        winston.log('error', err);
        return Promise.reject(err);
      });
  }

  geService(name) {
    return this._services[name];
  }

  get emitter() {
    return this._emitter;
  }

  sendNsqMessage(topic, message) {
    return new Promise((resolve, reject) => {
      this._nsqWriter.publish(topic, message, err => {
        if (err) {
          winston.log('error', err);
          reject(err);
        }
        resolve();
      });
    });
  }

  addNsqReader(topic, channel, onMessage) {
    winston.log('debug', 'Add NSQ reader. { host = ' + this._lookupdHTTPAddresses + '; topic = ' + topic + '; channel = ' + channel + '}');
    const reader = new nsq.Reader(topic, channel, {
      lookupdHTTPAddresses: '127.0.0.1:4161'
    });
    reader.on('ready', () => {
      winston.log('debug', 'NSQ reader connected.');
    });
    reader.on('closed', () => {
      winston.log('warn', 'NSQ reader closed.');
    });
    reader.on('message', msg => {
      winston.log('debug', 'NSQ reader message received.');
      onMessage(msg);
      msg.finish();
    });
    reader.connect();
  }
}

const service = new ServiceManager();
module.exports = service;
