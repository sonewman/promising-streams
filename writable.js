module.exports = exports = WritablePromiseStream;
exports.sync = exports.Sync = WritableSyncPromiseStream;
exports.obj = exports.Obj = WritablePromiseStreamObj;

var Writable = require('readable-stream').Writable;
var xtend = require('xtend');
var consec = require('consec');
var MakePromise = require('./lib/make-promise');
var CreateCatchPromise = require('./lib/catch-promise');

function addToSrc(d, src) {
  return new Promise(function (resolve) {
    src.push(d)
    resolve()
  })
}

function handleState(str) {
  str.on('finish', onfinish)
  function onfinish() {
    if (!str._done) str._done = true
    cleanup()
  }

  str.on('error', onerror)
  function onerror(err) {
    if (!str._error) str._error = err
    cleanup()
  }

  function cleanup() {
    str.removeListener('finish', onfinish)
    str.removeListener('error', onerror)
  }
}

if ('undefined' === typeof Promise)
  Promise = require('promise'); // eslint-disable-line no-undef

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

  this._done = false;
  this._error = null;

  if (options && 'data' in options)
    this.data = options.data;
  else
    this.data = [];

  // state is added to the stream itself
  // for internal usage
  if (opts.state) this.state = opts.state;
}

WritablePromiseStream.prototype = Object.create(Writable.prototype, {
  constructor: { value: WritablePromiseStream }
});

function WritablePromiseStreamObj(opts, cb) {
  if ('function' === typeof opts) {
    cb = opts;
    opts = {};
  }

  opts = opts ? xtend(opts) : {};
  opts.objectMode = true;
  return new WritablePromiseStream(opts, cb);
}


// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
WritablePromiseStream.prototype.data = null;

function noop() {}

WritablePromiseStream.prototype.__write = noop;

function isPromise(p) {
  return 'function' === typeof p.then && 'function' === typeof p.catch
}

function isIterable(i) {
  return 'function' === typeof i.next
}

WritablePromiseStream.prototype._onWritePromise = function (promise, next) {
  var self = this;
  promise.catch(function (err) {
    self.emit('error', err);
  });
  next();
}

WritablePromiseStream.prototype.__write = function defaultWrite(data) {
  return addToSrc(data, this.data);
};

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
    return this._onWritePromise(promise, next_);
}

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg);
  }
}

WritablePromiseStream.prototype._onFinish = function (success) {
  return success(this.data);
};

WritablePromiseStream.prototype.promise = function () {
  if (this._done)
    return Promise.resolve();

  else if (this._error)
    return Promise.reject(this._error);

  return MakePromise(this, 'finish');
};

WritablePromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = bindSingle(self, fail || function (err) { throw err; });
  return this.promise().then(onSuccess, fail);

  function onSuccess() {
    return self._onFinish(success);
  }
}

WritablePromiseStream.prototype.catch = function (fn) {
  fn = bindSingle(this, fn);
  if (this._done) return Promise.resolve();
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
  return success(this.data);
};

WritableSyncPromiseStream.prototype._onWritePromise = function (promise, next) {
  promise.then(function () {
    next();
  }, function (err) {
    next(err);
  });
}
