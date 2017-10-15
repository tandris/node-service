const ServiceManager = require('./index');
/**
 * Serial promise execution.
 * @method PromiseSerial
 * @param  {[Function]}      promises array of promises
 * @param {Number}           timeout period
 *
 * @return empty Promise
 */
const PromiseSerial = (promises, timeout) => {
  if (promises.length > 0) {
    return new Promise((resolve, reject) => {
        let t = null;
        if (timeout) {
          t = setTimeout(() => {
            reject(new Error('Promise timeout error.'));
          }, timeout);
        }
        promises[0]()
          .then(() => {
            if (timeout) {
              clearTimeout(t);
            }
            resolve();
          })
          .catch(reject);
      })
      .then((res, id) => {
        return PromiseSerial(promises.slice(1), timeout);
      })
      .catch(e => {
        ServiceManager.logger.error('Serial promise execution error.', e);
      });
  } else {
    return Promise.resolve();
  }
};

const buildTimeout = (id) => {
  return (cb, ms) => {
    setTimeout(() => {
      cb(id);
    }, ms);
  }
}

module.exports = PromiseSerial;
