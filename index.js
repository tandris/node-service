/**
 * Initialize the service classes.
 */
const _ = require('lodash');
const winston = require('winston');
const events = require('events');
const nsq = require('nsqjs');

class ServiceManager {

  constructor() {
    this._services = {};
    this._nsqConfig = {};
    this._nsqWriter = null;
    this._emitter = new events.EventEmitter();
    this._emitter.setMaxListeners(Number.MAX_VALUE);
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
  }

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
          this._createService(serviceCfg, baseDir, done);
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
          this._services[service.name].init(done);
          winston.info(service.name + ' initialized.');
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _initNsq() {
    this._nsqWriter = new nsq.Writer(this._nsqConfig.host, this._nsqConfig.port);
    return new Promise((resolve, reject) => {
      this._nsqWriter.connect();
      this._nsqWriter.on('ready', () => {
        resolve();
      });
      this._nsqWriter.on('error', () => {
        reject('NSQ connection error');
      });
      this._nsqWriter.on('closed', () => {
        winston.info('NSQ writer closed.');
      });
    });
  }

  start({config, baseDir}) {
    // NSQ init
    this._nsqConfig = config.nsq;

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
          reject(err);
        }
        resolve();
      });
    });
  }

  addNsqReader(topic, channel, onMessage) {
    const reader = new nsq.Reader(topic, channel, {
      lookupdHTTPAddresses: this._nsqConfig.lookupdHTTPAddresses
    });
    reader.connect();
    reader.on('message', msg => {
      onMessage(msg);
      msg.finish();
    });
  }
}

const service = new ServiceManager();
module.exports = service;
