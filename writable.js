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

  function cleanup() {
    str.removeListener('finish', onfinish)
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

  handleState(this);
  this._error = null;

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

WritablePromiseStream.prototype._pending = 0;

WritablePromiseStream.prototype._ending = false;

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

WritablePromiseStream.prototype._onWritePromise = function (promise, complete, next) {
  var self = this;

  promise.then(complete, function (err) {
    self._error = err;
    complete(err);
  });
  next();
}

WritablePromiseStream.prototype.write_ = WritablePromiseStream.prototype.write;
WritablePromiseStream.prototype.write = function (data, enc, cb) {
  if (this._ending === true) {
    throw new Error('Cannot write after end WritablePromiseStream');
  }

  return this.write_(data, enc, cb);
};

WritablePromiseStream.prototype.__write = function defaultWrite(data) {
  return addToSrc(data, this.data);
};

function onerror(tr, err) {
  tr._error = err;
  process.nextTick(function () {
    tr.emit('error', err);
  });
}

WritablePromiseStream.prototype._write = function (chunk, enc, next) {
  var doneNext = false;
  var self = this;
  if (self._error) {
    return;
  }
  self._pending += 1;

  function next_(err) {
    if (err) onerror(self, err);
    if (doneNext) {
      if (self._ending) {
        self._end();
      }
      return;
    }
    doneNext = true;

    next(err);

    if (!err && self._ending) self._end();
  }

  function complete(err) {
    self._pending -= 1;
    next_(err);
  }

  var promise = this.__write(chunk, enc, complete);

  if (doneNext) return;

  if (isIterable(promise))
    promise = consec(promise);

  if (isPromise(promise))
    return this._onWritePromise(promise, complete, next_);
}

WritablePromiseStream.prototype._end = WritablePromiseStream.prototype.end;

WritablePromiseStream.prototype.end = function (data, enc, cb) {
  if (this._ending === true) {
    throw new Error('Cannot write after end WritablePromiseStream');
  }

  this._ending = true;
  if (this._pending === 0) {
    return this._end(data, enc, cb);
  }

  return data != null ? this.write_(data, enc, cb) : false;
};

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg);
  }
}

WritablePromiseStream.prototype._onFinish = function (err) {
  return err || this.data;
};

WritablePromiseStream.prototype.promise = function () {
  var self = this;

  if (self._done)
    return Promise.resolve(self.data);

  else if (self._error)
    return Promise.reject(self._error);

  return MakePromise(self, 'finish', function (err) {
    return self._onFinish(err);
  });
};

WritablePromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = bindSingle(self, fail || function (err) { throw err; });
  return this.promise().then(success, fail);
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
