module.exports = CreateFinishPromise

if ('undefined' === typeof Promise)
  Promise = require('promise') // eslint-disable-line no-undef

function CreateFinishPromise(str, success, fail) {
  var resolve
  var reject

  var promise = new Promise(handle)
  function handle(res, rej) {
    resolve = res
    reject = rej
  }

  var retPromise = promise.then(success, fail)

  str.on('finish', onfinish)
  function onfinish() {
    resolve()
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    reject(err)
    cleanup()
  }

  function cleanup() {
    str.removeListener('finish', onfinish)
    str.removeListener('error', onerror)
  }

  return retPromise
}
