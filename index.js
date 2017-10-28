/**
 * Initialize the service classes.
 */
const _ = require('lodash');
const events = require('events');
const nsq = require('nsqjs');
const redis = require('redis');
const winston = require('winston');
const conc = require('concordant')();

class ServiceManager {

  constructor() {
    this._config = {};
    this._services = {};
    this._nsqConfig = {};
    this._nsqWriter = null;
    this._redis = null;
    this._lookupdHTTPAddresses = null;
    this._emitter = new events.EventEmitter();
    this._emitter.setMaxListeners(Number.MAX_VALUE);
    this._logger = null;
  }

  initWinston(logLevel) {
    winston.cli();
    this._logger = new winston.Logger({
      transports: [
        new(winston.transports.Console)({
          handleExceptions: true,
          colorize: true,
          timestamp: true
        })
      ]
    });
    this._logger.cli();
    winston.level = logLevel || 'info';
  };

  get logger() {
    return this._logger;
  }

  _initRedis() {
    let self = this;
    return this._resolve('REDIS', this._redisConfig.host)
      .then(({ host, port }) => {
        this.logger.info('redis writer connection. { host = ' + host + '; port = ' + port + '}');
        self._redis = redis.createClient({
          host: host,
          port: port
        });
        return Promise.resolve();
      });
  }

  _createService({ name, path, enabled, config }, baseDir, cb) {
    if (enabled === true) {
      if (path.indexOf('@') > -1) {
        path = path.replace('@', baseDir);
      }
      this._services[name] = require(path);
      config.baseDir = baseDir;
      this._services[name].configure(config, cb);
      this.logger.info(name + ' configured.');
    }
  }

  _configure(config, baseDir) {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (serviceCfg) => {
          if (serviceCfg.enabled === true) {
            this.logger.log('debug', 'Configure service. { name = ' + serviceCfg.name + ' }');
            this._createService(serviceCfg, baseDir, () => {
              this.logger.log('debug', 'Configure service done. { name = ' + serviceCfg.name + ' }');
              done();
            });
          } else {
            this.logger.log('debug', 'Skip service configuration beacuse it is disabled. { name = ' + serviceCfg.name + ' }');
            done();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _initialize(config, baseDir) {
    return new Promise((resolve, reject) => {
      try {
        let done = _.after(config.services.length, function () {
          resolve();
        });
        _.each(config.services, (service) => {
          if (service.enabled === true) {
            this.logger.log('debug', 'Initialize service. { name = ' + service.name + ' }');
            this._services[service.name].init(() => {
              this.logger.log('debug', 'Initialize service done. { name = ' + service.name + ' }');
              done();
            });
            this.logger.info(service.name + ' initialized.');
          } else {
            this.logger.log('debug', 'Skip service initialization beacuse it is disabled. { name = ' + service.name + ' }');
            done();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  _resolve(service, host) {
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
            this.logger.error('Failed to resolve host. { host = ' + host + ' }', err);
            reject(err);
          } else {
            resolve(result[0]);
          }
        });
      });
    }
  }

  _initNsq() {
    let self = this;
    return this._resolve('NSQD', this._nsqConfig.nsqd.host)
      .then(({ host, port }) => {
        this.logger.info('NSQ writer connection. { host = ' + host + '; port = ' + port + '}');
        this._nsqWriter = new nsq.Writer(host, port);
        this._nsqWriter.connect();
        this._nsqWriter.on('ready', () => {
          this.logger.info('NSQ connected');
        });
        this._nsqWriter.on('error', (err) => {
          this.logger.error('NSQ connection error', err);
        });
        this._nsqWriter.on('closed', () => {
          this.logger.info('NSQ writer closed.');
          self._initNsq().then(() => {});
        });
        return Promise.resolve();
      })
      .then(() => {
        return this._resolve('NSQLOOKUPD', this._nsqConfig.nsqlookupd.host);
      })
      .then(({ host, port }) => {
        this.logger.info('NSQ reader connection. { host = ' + host + '; port = ' + port + '}');
        this._lookupdHTTPAddresses = host + ':' + port;
      });
  }

  start({ config, baseDir }) {
    this._config = config;
    // NSQ init
    this._nsqConfig = config.nsq || {};
    this._redisConfig = config.redis || {};
    this.logger.level = config.logLevel || 'info';

    return this._initNsq()
      .then(() => {
        this._initRedis();
      })
      .then(() => {
        this.logger.info('Service configuration started');
        return this._configure(config, baseDir);
      })
      .then(() => {
        this.logger.info('Service configuration finished');
        this.logger.info('Service initialization started');
        return this._initialize(config, baseDir);
      })
      .then(() => {
        this.logger.info('Service initialization finished');
        return Promise.resolve();
      })
      .catch(err => {
        this.logger.log('error', err);
        return Promise.reject(err);
      });
  }

  geService(name) {
    return this._services[name];
  }

  get emitter() {
    return this._emitter;
  }

  get redis() {
    return this._redis;
  }

  sendNsqMessage(topic, message) {
    return new Promise((resolve, reject) => {
      this._nsqWriter.publish(topic.toLowerCase(), message, err => {
        if (err) {
          this.logger.log('error', err);
          reject(err);
        }
        resolve();
      });
    });
  }

  sendNsqMessageWithTimeout(topic, message, timeout) {
    return new Promise((resolve, reject) => {
      this._nsqWriter.deferPublish(topic.toLowerCase(), message, timeout, err => {
        if (err) {
          this.logger.log('error', err);
          reject(err);
        }
        resolve();
      });
    });
  }

  addNsqReader(topic, channel, onMessage) {
    this.logger.log('debug', 'Add NSQ reader. { host = ' + this._lookupdHTTPAddresses + '; topic = ' + topic + '; channel = ' + channel + '}');
    const reader = new nsq.Reader(topic.toLowerCase(), channel.toLowerCase(), {
      lookupdHTTPAddresses: this._lookupdHTTPAddresses
    });
    reader.on('ready', () => {
      this.logger.log('debug', 'NSQ reader connected.');
    });
    reader.on('closed', () => {
      this.logger.log('warn', 'NSQ reader closed.');
    });
    reader.on('message', msg => {
      this.logger.log('debug', 'NSQ reader message received.');
      onMessage(msg);
      msg.finish();
    });
    reader.connect();
  }
}

const service = new ServiceManager();
module.exports = service;
