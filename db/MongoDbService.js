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

    this.resolve('MONGO', config.host)
      .then(({host, port}) => {
        logger.info('MongoDB connection. { url = ' + 'mongodb://' + host + ':' + port + '/' + config.dbName + ' }');
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

  get connection() {
    return this._connection;
  }
}

const service = new MongoDbService();

module.exports = service;
