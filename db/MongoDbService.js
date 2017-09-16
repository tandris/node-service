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
    if (process.env['MONGO_SERVICE_HOST'] && process.env['MONGO_SERVICE_PORT']) {
      let host = process.env['MONGO_SERVICE_HOST'];
      let port = process.env['MONGO_SERVICE_PORT'];
      console.log('Resolve service from environment variable. { host = ' + host + '; port = ' + port + ' }');
      return Promise.resolve({
        host: host,
        port: port,
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
