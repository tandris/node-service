const Service = require('../Service');
// const nems = require('nems');
const winston = require('winston');
const mongoose = require('mongoose');
const conc = require('concordant')();

class MongoDbService extends Service {

  constructor() {
    super();
    this._connection = null;
  }

  configure(config, cb) {
    let self = this;
    mongoose.Promise = global.Promise;

    this._config = config;

    this._resolve(config.host)
      .then(({host, port}) => {
        winston.info('MongoDB connection. { url = ' + 'mongodb://' + host + ':' + port + '/' + config.dbName + ' }');
        self._connection = mongoose.createConnection('mongodb://' + host + ':' + port + '/' + config.dbName, {
          useMongoClient: true,
          promiseLibrary: global.Promise
        });
        self._connection.on('open', function () {
          cb();
        });
      });
  }

  init(cb) {
    cb();
  }

  _resolve(host) {
    if (process.env[host]) {
      return Promise.resolve({
        host: process.env[host].split(':')[0],
        port: process.env[host].split(':')[1],
      });
    } else {
      return new Promise((resolve, reject) => {
        conc.dns.resolve(host, function (err, result) {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            resolve(result[0]);
          }
        });
      });
    }
  }

  get connection() {
    return this._connection;
  }
}

const service = new MongoDbService();

module.exports = service;
