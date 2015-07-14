module.exports = exports = WritablePromiseStream;
exports.sync = exports.Sync = WritableSyncPromiseStream;
exports.race = exports.Race = WritableRacePromiseStream;

var Writable = require('readable-stream').Writable;
var xtend = require('xtend');
var consec = require('consec');
var MakePromise = require('./lib/finish-promise');
var CreateCatchPromise = require('./lib/catch-promise');

if ('undefined' === typeof Promise)
  Promise = require('promise'); // eslint-disable-line no-undef

function handleState(str) {
  str.on('finish', onend);
  function onend() {
    if (!str._finished) str._finished = true;
    cleanup();
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err;
    cleanup();
  }

  function cleanup() {
    str.removeListener('finish', onend);
    str.removeListener('error', onerror);
  }
}

function WritablePromiseStream(options, write) {
  if (!(this instanceof WritablePromiseStream))
    return new WritablePromiseStream(options, write);

  if ('function' === typeof options) {
    write = options;
    options = {};
  }

  var opts = options ? xtend(options) : {};
  write = write || opts.write;

  if (opts.write) {
    if (!write) write = opts.write;
    opts.write = null;
  }

  if (write) this.__write = write;
  Writable.call(this, options);

  this._finished = false;
  this._error = null;
  handleState(this);

  this._ordered = options.ordered === false;

  if (this._ordered) {
    this._buffer = [];
  }

  this._sync = options.sync !== false;

  if ('returnValue' in options)
    this._returnValue = options.returnValue;
}

WritablePromiseStream.prototype = Object.create(Writable.prototype, {
  constructor: { value: WritablePromiseStream }
});

WritablePromiseStream.prototype._buffer = null;

// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
WritablePromiseStream.prototype._returnValue = undefined;

function noop() {}

WritablePromiseStream.prototype.__write = noop;

function isPromise(p) {
  return 'function' === typeof p.then && 'function' === typeof p.catch
}

function isIterable(i) {
  return 'function' === typeof i.next
}

function WriteWrap(promise) {
  this.ended = false
  this.promise = promise
}

WritablePromiseStream.prototype._onPromise = function (promise, next) {
  var self = this;

  if (!self.__buffer)
    self.__buffer = [];

  var wrap = new WriteWrap(promise);

  self.__buffer.push(wrap);
  promise.then(function () {
    var leader = self.__buffer[0];
    if (leader && leader === wrap) {

    }
  },
  function (err) {
    self.emit('error', err);
  });
  next();
}

WritablePromiseStream.prototype._write = function (chunk, enc, next) {
  var doneNext = false;

  function next_(err) {
    if (doneNext) return;
    doneNext = true;

    next(err);
  }

  var promise = this.__write(chunk, enc, next_);

  if (isIterable(promise))
    promise = consec(promise);

  if (isPromise(promise))
    return this._onPromise(promise, next_);
}

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg);
  }
}

WritablePromiseStream.prototype._onFinish = function (success) {
  return success(this._returnValue);
};

WritablePromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = fail && bindSingle(self, fail);

  if (self._finished)
    return Promise.resolve().then(onSuccess);

  else if (fail && self._error)
    return Promise.reject(self._error).catch(fail);

  return MakePromise(self, onSuccess, fail);

  function onSuccess() {
    return self._onFinish(success);
  }
}


WritablePromiseStream.prototype.catch = function (fn) {
  fn = bindSingle(this, fn);
  if (this._finished) return Promise.resolve();
  else if (this._error) return Promise.reject(this._error).catch(fn);
  return CreateCatchPromise(this, fn);
}



function WritableSyncPromiseStream(options, write) {
  if (!(this instanceof WritableSyncPromiseStream))
    return new WritableSyncPromiseStream(options, write);

  WritablePromiseStream.call(options);
}

WritableSyncPromiseStream.prototype = Object.create(WritablePromiseStream.prototype, {
  constructor: { value: WritableSyncPromiseStream }
});

WritableSyncPromiseStream.prototype._onFinish = function (success) {
  return success(this._returnValue);
};

WritableSyncPromiseStream.prototype._onPromise = function (promise, next) {
  promise.then(function () {
    next();
  }, function (err) {
    next(err);
  });
}

function WritableRacePromiseStream(options, write) {
  if (!(this instanceof WritableRacePromiseStream))
    return new WritableRacePromiseStream(options, write);

  WritablePromiseStream.call(options);
}

WritableRacePromiseStream.prototype = Object.create(WritablePromiseStream.prototype, {
  constructor: { value: WritableRacePromiseStream }
});

WritableRacePromiseStream.prototype._onFinish = function (success) {
  return success(this._returnValue);
};

WritableRacePromiseStream.prototype._onPromise = function (promise, next) {
  var self = this;
  promise.catch(function (err) {
    self.emit('error', err);
  });
  next();
}
