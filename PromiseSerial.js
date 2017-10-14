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
      });
  } else {
    return Promise.resolve();
  }
};

module.exports = PromiseSerial;
