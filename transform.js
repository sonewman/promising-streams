module.exports = exports = TransformPromiseStream;
exports.sync = exports.Sync = TransformSyncPromiseStream;
exports.race = exports.Race = TransformRacePromiseStream;
exports.obj = exports.Obj = TransformPromiseStreamObj;

var Transform = require('readable-stream').Transform;
var xtend = require('xtend');
var consec = require('consec');
var util = require('./lib/util');

if ('undefined' === typeof Promise)
  Promise = require('promise'); // eslint-disable-line no-undef

function TransformPromiseStream(options, transform, flush) {
  if (!(this instanceof TransformPromiseStream))
    return new TransformPromiseStream(options, transform);

  if ('function' === typeof options) {
    flush = transform;
    transform = options;
    options = {};
  }

  var opts = options ? xtend(options) : {};
  transform = transform || opts.transform;

  if (opts.transform) {
    if (!transform) transform = opts.transform;
    opts.transform = null;
  }

  flush = flush || opts.flush;
  if (opts.flush) {
    if (!flush) flush = opts.flush;
    opts.flush = null;
  }

  if (transform) this.__transform = transform;
  if (flush) this.__flush = flush;

  Transform.call(this, options);

  if (opts.state) this.state = opts.state;

  this._finished = false;
  this._error = null;
}

function TransformPromiseStreamObj(opts, transform, flush) {
  if ('function' === typeof opts) {
    flush = transform;
    transform = opts;
    opts = {};
  }

  opts = opts ? xtend(opts) : {};
  opts.objectMode = true;
  return new TransformPromiseStream(opts, transform, flush);
}

TransformPromiseStream.prototype = Object.create(Transform.prototype, {
  constructor: { value: TransformPromiseStream }
});

TransformPromiseStream.prototype._pending = 0;

TransformPromiseStream.prototype._ending = false;

TransformPromiseStream.prototype.__transform = util.noop;

function TransformWrap(promise) {
  this.ended = false;
  this.promise = promise;
  this.value = undefined;
}

function throttle(tr) {
  var leader = tr.__buffer[0];
  if (!leader || !leader.ended) {
    if (tr.__flushDone && tr._pending === 0)
      tr.__flushDone();

    tr._finished = true;
    return null;
  }

  leader.ended = true;
  tr.__buffer.shift();
  tr.push(leader.value);
  return throttle(tr);
}

TransformPromiseStream.prototype._onTransformPromise = function (promise, push, next) {
  var self = this;
  if (self._error) {
    next(self._error);
    return;
  }

  if (!self.__buffer)
    self.__buffer = [];

  var wrap = new TransformWrap(promise);
  self.__buffer.push(wrap);


  promise.then(function checkNext(value) {
    wrap.ended = true;
    wrap.value = value;
    throttle(self);
    push();
  },
  function (err) {
    push(err);
  });
  next();
}

function onerror(tr, err) {
  tr._error = err;
  process.nextTick(function () {
    tr.emit('error', err);
  });
}

function callTransformSafe(stream, args, cb) {
  try {
    cb(null, stream.__transform(args[0], args[1], args[2]));
  } catch (err) {
    cb(err);
  }
}

TransformPromiseStream.prototype._transform = function (chunk, enc, next) {
  var doneNext = false;
  var self = this;

  if (self._error) {
    return;
  }
  self._pending += 1;

  function next_(err, data) {
    if (err) onerror(self, err);
    if (doneNext) {
      if (!err && self._pending === 0 && self._ending) {
        self._end();
      }
      return;
    }
    doneNext = true;

    next(null, data);

    if (!err && self._ending) self._end();
  }

  function push(err, data) {
    self._pending -= 1;
    if (!err && data) self.push(data);
    next_(err);
  }

  function complete(err, data) {
    self._pending -= 1;
    next_(err, data);
  }

  var result;
  function ontransform(err, r) {
    if (err) {
      self.emit('error', err);
    } else {
      result = util.isIterable(r) ? consec(r) : r;
    }
  }

  callTransformSafe(this, [chunk, enc, complete], ontransform);

  if (doneNext) return;

  if (util.isPromise(result))
    this._onTransformPromise(result, push, next_);
}

TransformPromiseStream.prototype._end = TransformPromiseStream.prototype.end;

TransformPromiseStream.prototype.end = function (data, enc, cb) {
  if (this._ending === true) {
    throw new Error('Cannot write after end TransformPromiseStream');
  }

  this._ending = true;
  if (this._pending === 0) {
    return this._end(data, enc, cb);
  }

  return data != null ? this.write_(data, enc, cb) : false;
};

TransformPromiseStream.prototype._onFlushPromise = function (promise, done) {
  var self = this;

  promise.then(function checkNext(value) {
    if (value != null) {
      self.push(value);
    }

    self.push(null);
    done();
  },
  function (err) {
    done(err);
  });
};

function canFlush(tr) {
  return tr._finished || tr._pending === 0;
}

function callFlushSafe(stream, next, cb) {
  try {
    cb(null, stream.__flush(next));
  } catch (err) {
    cb(err);
  }
}

TransformPromiseStream.prototype._flush = function(done) {
  var isDone = false;

  function next(err) {
    if (isDone) return;
    isDone = true;

    if (err) done(err);
    else done();
  }

  var result;
  function onflush(err, r) {
    if (err) {
      self.emit('error', err);
    } else {
      result = util.isIterable(r) ? consec(r) : r;
    }
  }

  if (this.__flush) {
    callFlushSafe(this, next, onflush);

    if (isDone) return;

    if (util.isPromise(result))
      this._onFlushPromise(result, next);

  } else if (canFlush(this)) {
    done(this._error);
  } else {
    this.__flushDone = done;
  }
};

function bindSingle(ctx, method) {
  return function (arg) {
    return method.call(ctx, arg);
  }
}

TransformPromiseStream.prototype._onFinish = function (success) {
  return success(this.buffer);
};

TransformPromiseStream.prototype.done = function () {
  if (this._finished)
    return Promise.resolve();

  else if (this._error)
    return Promise.reject(this._error);

  return util.MakePromise(this, 'finish');
};
TransformPromiseStream.prototype.promise = TransformPromiseStream.prototype.done;

TransformPromiseStream.prototype.then = function (success, fail) {
  var self = this;
  success = bindSingle(self, success);
  fail = bindSingle(self, fail || function (err) { throw err; });
  return this.promise().then(onSuccess, fail);

  function onSuccess() {
    return self._onFinish(success);
  }
}

TransformPromiseStream.prototype.catch = function (fn) {
  fn = bindSingle(this, fn);
  if (this._finished) return Promise.resolve();
  else if (this._error) return Promise.reject(this._error).catch(fn);
  return util.CreateCatchPromise(this, fn);
}

function TransformSyncPromiseStream(options, transform) {
  if (!(this instanceof TransformSyncPromiseStream))
    return new TransformSyncPromiseStream(options, transform);

  this._waiting = false;
  this.__buffer = [];

  TransformPromiseStream.call(this, options);
}

TransformSyncPromiseStream.prototype = Object.create(TransformPromiseStream.prototype, {
  constructor: { value: TransformSyncPromiseStream }
});

TransformSyncPromiseStream.prototype._onFinish = function (success) {
  return success(this.buffer);
};

TransformSyncPromiseStream.prototype.__write = TransformSyncPromiseStream.prototype._write;

function WriteBuffer(data, enc, cb) {
  this.data = data;
  this.enc = enc;
  this.cb = cb;
}

TransformSyncPromiseStream.prototype._write = function (data, enc, cb) {
  if (this._waiting) {
    this.__buffer.push(new WriteBuffer(data, enc, cb));
  } else {
    this._waiting = true;
    this.__write(data, enc, cb);
  }
};

TransformSyncPromiseStream.prototype.__next = function (next) {
  var self = this;
  var p = self.__buffer.shift();
  if (!p) return next();

  function n() {
    p.cb();
    self.__next(next);
  }

  self.__write(p.data, p.enc, n);
};

TransformSyncPromiseStream.prototype._onTransformPromise = function (promise, push, next) {
  var self = this;

  promise.then(function checkNext(value) {
    self._pending -= 1;

    next(null, value);
    self.__next(function () {
      self._waiting = false;
    });

    if (self._pending === 0 && self.__flushDone)
      self.__flushDone();
  },
  function (err) {
    next(err);
  });
}

function TransformRacePromiseStream(options, transform) {
  if (!(this instanceof TransformRacePromiseStream))
    return new TransformRacePromiseStream(options, transform);

  TransformPromiseStream.call(this, options);
}

TransformRacePromiseStream.prototype = Object.create(TransformPromiseStream.prototype, {
  constructor: { value: TransformRacePromiseStream }
});

TransformRacePromiseStream.prototype._onFinish = function (success) {
  return success(this.buffer);
};

TransformRacePromiseStream.prototype._onTransformPromise = function (promise, push, next) {
  var self = this;

  promise.then(function checkNext(value) {
    push(null, value);

    if (self._pending === 0)
      self.push(null);
  },
  function (err) {
    push(err);
  });
  next();
}
