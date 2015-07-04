module.exports = ReadablePromiseStream

var Readable = require('readable-stream').Readable
var xtend = require('xtend')
var consec = require('consec')
var CreateEndPromise = require('./lib/end-promise')
var CreateCatchPromise = require('./lib/catch-promise')

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

function handleState(str) {
  str.on('end', onend)
  function onend() {
    if (!str._ended) str._ended = true
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err
    cleanup()
  }

  function cleanup() {
    str.removeListener('end', onend)
    str.removeListener('error', onerror)
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

ReadablePromiseStream.prototype = Object.create(Readable.prototype, {
  constructor: { value: ReadablePromiseStream }
})

// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
ReadablePromiseStream.prototype._returnValue = undefined

function noop() {}

ReadablePromiseStream.prototype.__read = noop

function isPromise(p) {
  return 'function' === typeof p.then && 'function' === typeof p.catch
}

function isIterable(i) {
  return 'function' === typeof i.next
}

ReadablePromiseStream.prototype._read = function (n) {
  var self = this
  var r = self.__read(n)

  if (isIterable(r)) r = consec(r)

  if (isPromise(r)) {
    r.then(function (data) {
      self.push(data)
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

ReadablePromiseStream.prototype.then = function (success, fail) {
  var self = this
  success = bindSingle(self, success)
  fail = fail && bindSingle(self, fail)

  if (self._ended) return Promise.resolve().then(onSuccess)
  else if (self._error) return Promise.reject(self._error).catch(fail)
  return CreateEndPromise(self, onSuccess, fail)
  
  function onSuccess() {
    return success(self._returnvalue)
  }
}

ReadablePromiseStream.prototype.catch = function (fn) {
  if (this._ended) return Promise.resolve()
  else if (this._error) return Promise.reject(this._error).catch(fn)
  return CreateCatchPromise(this, fn)
}
