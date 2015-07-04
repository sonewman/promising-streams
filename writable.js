module.exports = WritablePromiseStream

var Writable = require('readable-stream').Writable
var xtend = require('xtend')
var consec = require('consec')
var CreateFinishPromise = require('./lib/finish-promise')
var CreateCatchPromise = require('./lib/catch-promise')

if ('undefined' === typeof Promise)
  Promise = require('promise') // eslint-disable-line no-undef

function handleState(str) {
  str.on('finish', onend)
  function onend() {
    if (!str._finished) str._finished = true
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err
    cleanup()
  }

  function cleanup() {
    str.removeListener('finish', onend)
    str.removeListener('error', onerror)
  }
}

function WritablePromiseStream(options, write) {
  if (!(this instanceof WritablePromiseStream))
    return new WritablePromiseStream(options, write)

  if ('function' === typeof options) {
    write = options
    options = {}
  }

  var opts = options ? xtend(options) : {}
  write = write || opts.write

  if (opts.write) {
    if (!write) write = opts.write
    opts.write = null
  }

  if (write) this.__write = write
  Writable.call(this, options)

  this._finished = false
  this._error = null
  this._setEnd = false
  handleState(this)

  if ('returnValue' in options)
    this._returnValue = options.returnValue
}

WritablePromiseStream.prototype = Object.create(Writable.prototype, {
  constructor: { value: WritablePromiseStream }
})

// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
WritablePromiseStream.prototype._returnValue = undefined

function noop() {}

WritablePromiseStream.prototype.__write = noop

function isPromise(p) {
  return 'function' === typeof p.then && 'function' === typeof p.catch
}

function isIterable(i) {
  return 'function' === typeof i.next
}

WritablePromiseStream.prototype._write = function (chunk, enc, next) {
  var self = this
  var doneNext = false

  function next_() {
    if (doneNext) return
    doneNext = true
    next()
  }

  var r = self.__write(chunk, enc, next_)

  if (isIterable(r)) r = consec(r)

  if (isPromise(r)) {
    r.then(function () {
      next_()
    })

    r.catch(function (err) {
      self.emit('error', err)
    })
  }
}

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg)
  }
}

WritablePromiseStream.prototype.then = function (success, fail) {
  var self = this
  success = bindSingle(self, success)
  fail = fail && bindSingle(self, fail)

  if (self._finished) return Promise.resolve().then(onSuccess)
  else if (fail && self._error) return Promise.reject(self._error).catch(fail)
  return CreateFinishPromise(self, onSuccess, fail)

  function onSuccess() {
    return success(self._returnValue)
  }
}


WritablePromiseStream.prototype.catch = function (fn) {
  fn = bindSingle(this, fn)
  if (this._finished) return Promise.resolve()
  else if (this._error) return Promise.reject(this._error).catch(fn)
  return CreateCatchPromise(this, fn)
}
