module.exports = exports = DuplexPromiseStream;
exports.sync = exports.Sync = DuplexSyncPromiseStream;
exports.obj = exports.Obj = DuplexPromiseStreamObj;

var Duplex = require('readable-stream').Duplex;
var xtend = require('xtend');
var consec = require('consec');
var WritablePromiseStream = require('./writable');
var ReadablePromiseStream = require('./readable');
var util = require('./lib/util');

var CreateCatchPromise = util.CreateCatchPromise;

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

function DuplexPromiseStream(options, read, write) {
  if (!(this instanceof DuplexPromiseStream))
    return new DuplexPromiseStream(options, read, write);

  if ('function' === typeof options) {
    read = write;
    read = options;
    options = {};
  }
  
  ReadablePromiseStream.call(this, options, read);
  WritablePromiseStream.call(this, options, write);
}

DuplexPromiseStream.prototype = Object.create(Duplex.prototype, {
  constructor: { value: DuplexPromiseStream }
});

function DuplexPromiseStreamObj(opts, read, write) {
  if ('function' === typeof opts) {
    write = read;
    read = opts;
    opts = {};
  }

  opts = opts ? xtend(opts) : {};
  opts.objectMode = true;
  return new DuplexPromiseStream(opts, read, write);
}

DuplexPromiseStream.prototype._pending = 0;

DuplexPromiseStream.prototype._ending = false;

// value returned from write finish promise
// this allows values to be built up and accessed
// at the end of it's use
DuplexPromiseStream.prototype.data = null;

DuplexPromiseStream.prototype.__write = util.noop;

DuplexPromiseStream.prototype._onWritePromise = function (promise, complete, next) {
  var self = this;

  promise.then(complete, function (err) {
    self._error = err;
    complete(err);
  });
  next();
}

DuplexPromiseStream.prototype.write_ = DuplexPromiseStream.prototype.write;
DuplexPromiseStream.prototype.write = function (data, enc, cb) {
  if (this._ending === true) {
    throw new Error('Cannot write after end DuplexPromiseStream');
  }

  return this.write_(data, enc, cb);
};

DuplexPromiseStream.prototype.__write = function defaultWrite(data) {
  return addToSrc(data, this.data);
};

function onerror(tr, err) {
  tr._error = err;
  process.nextTick(function () {
    tr.emit('error', err);
  });
}

DuplexPromiseStream.prototype._write = function (chunk, enc, next) {
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

  if (util.isIterable(promise))
    promise = consec(promise);

  if (util.isPromise(promise))
    this._onWritePromise(promise, complete, next_);
}

DuplexPromiseStream.prototype._end = DuplexPromiseStream.prototype.end;

DuplexPromiseStream.prototype.end = function (data, enc, cb) {
  if (this._ending === true) {
    throw new Error('Cannot write after end DuplexPromiseStream');
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

DuplexPromiseStream.prototype._onFinish = function (err) {
  return err || this.data;
};

DuplexPromiseStream.prototype.done = function () {
  var self = this;

  if (self._done)
    return Promise.resolve(self.data);

  else if (self._error)
    return Promise.reject(self._error);

  return util.MakePromise(self, 'finish', function (err) {
    return self._onFinish(err);
  });
};
DuplexPromiseStream.prototype.promise = DuplexPromiseStream.prototype.done;

DuplexPromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = bindSingle(self, fail || function (err) { throw err; });
  return this.done().then(success, fail);
}

DuplexPromiseStream.prototype.catch = function (fn) {
  fn = bindSingle(this, fn);
  if (this._done) return Promise.resolve();
  else if (this._error) return Promise.reject(this._error).catch(fn);
  return CreateCatchPromise(this, fn);
}


function DuplexSyncPromiseStream(options, read, write) {
  if (!(this instanceof DuplexSyncPromiseStream))
    return new DuplexSyncPromiseStream(options, read, write);

  DuplexPromiseStream.call(options);
}

DuplexSyncPromiseStream.prototype = Object.create(DuplexPromiseStream.prototype, {
  constructor: { value: DuplexSyncPromiseStream }
});

DuplexSyncPromiseStream.prototype._onFinish = function (success) {
  return success(this.data);
};

DuplexSyncPromiseStream.prototype._onWritePromise = function (promise, next) {
  promise.then(function () {
    next();
  }, function (err) {
    next(err);
  });
}
