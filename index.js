/**
 * Initialize the service classes.
 */
const _ = require('lodash');
const winston = require('winston');
const events = require('events');
const nsq = require('nsqjs');
const redis = require('redis');
const conc = require('concordant')();

const tsFormat = () => ( new Date() ).toLocaleDateString() + ' - ' + ( new Date() ).toLocaleTimeString();

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
    this.initWinston(winston);
  }

  initWinston(winston, logLevel) {
    winston.cli();
    let logger = new winston.Logger({
      transports: [
        new (winston.transports.Console)({
          handleExceptions: true,
          colorize: true,
          timestamp: tsFormat
        })
      ]
    });
    logger.cli();
    winston.level = logLevel || 'info';
  };

  _initRedis() {
    let self = this;
    return this._resolve('REDIS', this._redisConfig.host)
      .then(({host, port}) => {
        winston.info('redis writer connection. { host = ' + host + '; port = ' + port + '}');
        self._redis = redis.createClient({
          host: host,
          port: port
        });
        return Promise.resolve();
      });
  }

  _createService({name, path, enabled, config}, baseDir, cb) {
    if (enabled === true) {
      if (path.indexOf('@') > -1) {
        path = path.replace('@', baseDir);
      }
      this._services[name] = require(path);
      config.baseDir = baseDir;
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
          if (serviceCfg.enabled === true) {
            winston.log('debug', 'Configure service. { name = ' + serviceCfg.name + ' }');
            this._createService(serviceCfg, baseDir, () => {
              winston.log('debug', 'Configure service done. { name = ' + serviceCfg.name + ' }');
              done();
            });
          } else {
            winston.log('debug', 'Skip service configuration beacuse it is disabled. { name = ' + serviceCfg.name + ' }');
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
            winston.log('debug', 'Initialize service. { name = ' + service.name + ' }');
            this._services[service.name].init(() => {
              winston.log('debug', 'Initialize service done. { name = ' + service.name + ' }');
              done();
            });
            winston.info(service.name + ' initialized.');
          } else {
            winston.log('debug', 'Skip service initialization beacuse it is disabled. { name = ' + service.name + ' }');
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
            winston.error('Failed to resolve host. { host = ' + host + ' }', err);
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
        return this._resolve('NSQLOOKUPD', this._nsqConfig.nsqlookupd.host);
      })
      .then(({host, port}) => {
        winston.info('NSQ reader connection. { host = ' + host + '; port = ' + port + '}');
        this._lookupdHTTPAddresses = host + ':' + port;
      });
  }

  start({config, baseDir}) {
    this._config = config;
    // NSQ init
    this._nsqConfig = config.nsq || {};
    this._redisConfig = config.redis || {};
    winston.level = config.logLevel || 'info';

    return this._initNsq()
      .then(() => {
        this._initRedis();
      })
      .then(() => {
        winston.info('Service configuration started');
        return this._configure(config, baseDir);
      })
      .then(() => {
        winston.info('Service configuration finished');
        winston.info('Service initialization started');
        return this._initialize(config, baseDir);
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

  get redis() {
    return this._redis;
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

  sendNsqMessageWithTimeou(topic, message, timeout) {
    return new Promise((resolve, reject) => {
      this._nsqWriter.deferPublish(topic, message, timeout, err => {
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
