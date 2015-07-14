module.exports = MakePromise

if ('undefined' === typeof Promise)
  Promise = require('promise') // eslint-disable-line no-undef

function MakePromise(str, event, success, fail) {
  var resolve
  var reject

  var promise = new Promise(handle)
  function handle(res, rej) {
    resolve = res
    reject = rej
  }

  var retPromise = promise.then(success, fail)

  str.on(event, onfinish)
  function onfinish() {
    if (!str._done) str._done = true;
    resolve()
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err;
    reject(err)
    cleanup()
  }

  function cleanup() {
    str.removeListener(event, onfinish)
    str.removeListener('error', onerror)
  }

  return retPromise
}
