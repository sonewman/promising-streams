module.exports = CreateCatchPromise

if ('undefined' === typeof Promise)
  Promise = require('promise') // eslint-disable-line no-undef

function CreateCatchPromise(str, fn) {
  var reject
  var promise = new Promise(handleReject)
  function handleReject(res, rej) {
    reject = rej
  }

  var retPromise = promise.catch(fn)

  str.on('error', onerror)
  function onerror(err) {
    reject(err)
    str.removeListener('error', onerror)
  }

  return retPromise
}
