/**
 * Initialize the service classes.
 */
const _ = require('lodash');
const winston = require('winston');
const events = require('events');

class ServiceManager {

  constructor() {
    this._services = {};
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

  start({config, baseDir}) {
    return this._configure(config, baseDir)
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
}

const service = new ServiceManager();
module.exports = service;
