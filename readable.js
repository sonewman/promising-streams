module.exports = exports = ReadablePromiseStream
exports.obj = exports.Obj = ReadablePromiseStreamObj;

var Readable = require('readable-stream').Readable
var xtend = require('xtend')
var consec = require('consec')
var util = require('./lib/util');

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

function handleState(str) {
  str.on('end', onend)
  function onend() {
    if (!str._ended) str._ended = true
    cleanup()
  }

  function cleanup() {
    str.removeListener('end', onend)
  }
}

function ReadablePromiseStream(options, read) {
  if (!(this instanceof ReadablePromiseStream))
    return new ReadablePromiseStream(options, read)

  if ('function' === typeof options) {
    read = options
    options = {}
  }

  var opts = options ? xtend(options) : {}
  read = read || opts.read

  if (opts.read) {
    if (!read) read = opts.read
    opts.read = null
  }

  if (read) this.__read = read
  Readable.call(this, options)

  this._ended = false
  this._error = null
  this._setEnd = false
  handleState(this)

  if ('returnValue' in options)
    this._returnValue = options.returnValue
}

function ReadablePromiseStreamObj(opts, read) {
  if ('function' === typeof opts) {
    read = opts;
    opts = {};
  }

  opts = opts ? xtend(opts) : {};
  opts.objectMode = true;
  return new ReadablePromiseStream(opts, read);
}

ReadablePromiseStream.prototype = Object.create(Readable.prototype, {
  constructor: { value: ReadablePromiseStream }
})

// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
ReadablePromiseStream.prototype._returnValue = undefined

ReadablePromiseStream.prototype.__read = util.noop

ReadablePromiseStream.prototype._read = function (n) {
  var self = this
  var r = self.__read(n)

  if (util.isIterable(r)) r = consec(r)

  if (util.isPromise(r)) {
    r.then(function (data) {
      self.push(data)
    },
    function (err) {
      self._error = err;
      process.nextTick(function () {
        self.emit('error', err)
      });
    });
  }
}

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg)
  }
}

ReadablePromiseStream.prototype.done = function () {
  if (this._done)
    return Promise.resolve()

  else if (this._error)
    return Promise.reject(this._error);

  return util.MakePromise(this, 'end');
};
ReadablePromiseStream.prototype.promise = ReadablePromiseStream.prototype.done;

ReadablePromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = bindSingle(self, fail || function (err) { throw err; });
  return this.done().then(onSuccess, fail);

  function onSuccess() {
    return success(self._returnvalue)
  }
}

ReadablePromiseStream.prototype.catch = function (fn) {
  if (this._ended) return Promise.resolve()
  else if (this._error) return Promise.reject(this._error).catch(fn)
  return util.CreateCatchPromise(this, fn)
}
