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
    return Promise
      .race([promises[0](), new Promise(resolve, reject) => {
        setTimeout(() => {
          ServiceManager.logger.error('Promise has timed out.', e);
          resolve();
        }, timeout || 5000);
      }])
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
