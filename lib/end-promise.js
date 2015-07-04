module.exports = CreateEndPromise

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

function CreateEndPromise(str, success, fail) {
  var resolve
  var reject

  var promise = new Promise(handle)
  function handle(res, rej) {
    resolve = res
    reject = rej
  }

  var retPromise = promise.then(success, fail)

  str.on('end', onend)
  function onend() {
    resolve()
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    reject(err)
    cleanup()
  }

  function cleanup() {
    str.removeListener('end', onend)
    str.removeListener('error', onerror)
  }

  return retPromise
}

