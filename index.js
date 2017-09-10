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
        new(winston.transports.Console)({
          handleExceptions: true,
          colorize: true
        })
      ]
    });
    logger.cli();
  }

  _createService({ name, path, enabled, config }, cb) {
    if (enabled === true) {
      this._services[name] = require(path);
      this._services[name].configure(config, cb);
      winston.info(name + ' configured.');
    }
  }

  _configure(config) {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (serviceCfg) => {
          this._createService(serviceCfg, done);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _initialize() {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (service) => {
          this._services[service.name].init();
          winston.info(service.name + ' initialized.');
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  start({ config }) {
    return this._configure(config)
      .then(() => {
        return this._initialize();
      })
      .then(() => {
        winston.info('Service initialization finished');
        return Promise.resolve();
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