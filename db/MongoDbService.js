const Service = require('../Service');
// const nems = require('nems');
const mongoose = require('mongoose');

class MongoDbService extends Service {

  constructor() {
    super();
    this._connection = null;
  }

  configure(config, cb) {
    let self = this;
    mongoose.Promise = global.Promise;

    this._config = config;
    /* if (config.embedded === true) {
      nems.distribute(config.version, '.', config.port, true, true)
        .then(function (pid) {
          console.log('MongoDb started.');
          self._connection = mongoose.createConnection('mongodb://localhost/' + config.dbName, {
            useMongoClient: true,
            promiseLibrary: global.Promise
          });
        })
        .catch((err) => {
          console.log(err);
        });
    } else { */
    self._connection = mongoose.createConnection('mongodb://' + config.host + '/' + config.dbName, {
      useMongoClient: true,
      promiseLibrary: global.Promise
    });
    // }
    self._connection.on('open', function () {
      cb();
    });
  }

  get connection() {
    return this._connection;
  }
}

const service = new MongoDbService();

module.exports = service;
