exports.MakePromise = MakePromise;

if ('undefined' === typeof Promise)
  Promise = require('promise'); // eslint-disable-line no-undef

function fwd(err) { return err; }

function MakePromise(str, event, cb) {
  cb = cb || fwd;
  var resolve;
  var reject;

  var promise = new Promise(handle);
  function handle(res, rej) {
    resolve = res;
    reject = rej;
  }

  str.on(event, onfinish)
  function onfinish() {
    if (!str._done) str._done = true;
    if (!str._error) {
      resolve(cb());
      cleanup();
    } else {
      str.removeListener(event, onfinish);
    }
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err;
    reject(cb(err));
    cleanup();
  }

  function cleanup() {
    str.removeListener(event, onfinish);
    str.removeListener('error', onerror);
  }

  return promise;
}

exports.CreateCatchPromise = CreateCatchPromise;

function CreateCatchPromise(str, fn) {
  var reject;
  var promise = new Promise(handleReject);
  function handleReject(res, rej) {
    reject = rej;
  }

  var retPromise = promise.catch(fn);

  str.on('error', onerror)
  function onerror(err) {
    reject(err);
    str.removeListener('error', onerror);
  }

  return retPromise;
}

exports.isPromise = isPromise;
function isPromise(p) {
  return 'function' === typeof p.then && 'function' === typeof p.catch
}

exports.isIterable = isIterable;
function isIterable(i) {
  return 'function' === typeof i.next
}

exports.noop = noop;
function noop() {}
