const ServiceManager = require('./index');
/**
 * Serial promise execution.
 * @method PromiseSerial
 * @param  {[type]}      promises array of promises
 *
 * @return empty Promise
 */
const PromiseSerial = (promises) => {
  if (promises.length > 0) {
    return promises[0]()
      .then(() => {
        return PromiseSerial(promises.slice(1));
      })
      .catch(e => {
        ServiceManager.logger.error('Serial promise execution error.', e);
      });
  } else {
    return Promise.resolve();
  }
};

module.exports = PromiseSerial;
