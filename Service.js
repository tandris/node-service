const nsqjs = require('nsqjs');
const ServiceManager = require('./index');
const conc = require('concordant')();
const fetch = require('node-fetch');
const qs = require('query-string');
const _ = require('lodash');

class Service {
  configure(config, cb) {
    this._cacheEnabled = config.cacheEnabled === undefined ? true : config.cacheEnabled;
    cb();
  }

  init(cb) {
    cb();
  }

  listen(topic, channel, onMessage) {
    ServiceManager.addNsqReader(topic, channel, onMessage);
  }

  sendMessage(topic, message, timeout) {
    if (timeout) {
      return ServiceManager.sendNsqMessageWithTimeou(topic, message, timeout);
    } else {
      return ServiceManager.sendNsqMessage(topic, message);
    }
  }

  resolve(service, host) {
    if (process.env[service + '_SERVICE_HOST'] && process.env[service + '_SERVICE_PORT']) {
      let host = process.env[service + '_SERVICE_HOST'];
      let port = process.env[service + '_SERVICE_PORT'];
      this.logger.log('debug', 'Resolve service from environment variable. { service = ' + service + '; host = ' + host + '; port = ' + port + ' }');
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

  callService({name = null, host = null, url, data = {}, query = {}}) {
    return this.resolve(name, host)
      .then(({host, port}) => {
        let q = null;
        if (query) {
          q = qs.stringify(query);
        }
        let path = 'http://' + host + ':' + port + url;
        if (q) {
          path += '?' + q;
        }
        this.logger.log('debug', 'Call service. { path = ' + path + '}');
        return fetch(path, data);
      })
      .then(res => {
        return res.json();
      });
  }

  setCache({key, data, expiration = null}) {
    return new Promise((resolve, reject) => {
      if (this._cacheEnabled === true) {
        try {
          if (expiration) {
            ServiceManager.redis.set(key, JSON.stringify(data), 'EX', expiration);
          } else {
            ServiceManager.redis.set(key, JSON.stringify(data));
            resolve(data);
          }
        } catch (e) {
          reject(e);
        }
      } else {
        this.logger.log('warn', 'Caching is disabled.');
        resolve(data);
      }
    });
  }

  getCache(key) {
    return new Promise((resolve, reject) => {
      if (this._cacheEnabled === true) {
        ServiceManager.redis.get(key, (err, reply) => {
          if (err) {
            reject(err);
          } else {
            resolve(reply ? JSON.parse(reply) : null);
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  getCacheOrStore(key, expiration, provider) {
    return this.getCache(key)
      .then((result) => {
        if (result) {
          return Promise.resolve(result);
        } else {
          return provider()
            .then((data) => {
              return this.setCache(({
                key: key,
                data: data,
                expiration: expiration
              }));
            });
        }
      })
      .catch(e => {
        this.logger.log('error', 'Failed to cache content.', e);
      });
  }

  expireCache(key) {
    return new Promise((resolve, reject) => {
      ServiceManager.redis.del(key, (err, reply) => {
        if (err) {
          reject(err);
        } else {
          resolve(reply);
        }
      });
    });
  }

  expireCaches(prefix) {
    return this.getCacheKeys(prefix)
      .then(keys => {
        _.each(keys, key => {
          this.logger.log('debug', 'Clear redis cache. { key = ' + key + ' }');
          ServiceManager.redis.del(key, (err, reply) => {
            if (err) {
              this.logger.log('error', 'Failed to clear redis cache. { key = ' + key + ' }');
            }
          });
        });
        return Promise.resolve();
      });
  }

  getCacheKeys(service) {
    return new Promise((resolve, reject) => {
      ServiceManager.redis.keys(service + '*', (err, reply) => {
        if (err) {
          reject(err);
        } else {
          resolve(reply);
        }
      });
    });
  }

  get logger() {
    return ServiceManager.logger;
  }
}

module.exports = Service;
