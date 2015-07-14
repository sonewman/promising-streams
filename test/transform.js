var desc = require('macchiato');
var tps = require('../transform');
var stream = require('readable-stream');

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

//function addToSrc(d, src) {
//  return new Promise(function (resolve) {
//    src.push(d)
//    resolve()
//  })
//}

desc('TransformPromiseStream')
.it('should allow `transform` method to return promise', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e'];
  var i = -1;
  var got = [];

  new stream.Readable({
    read: function () {
      var self = this;

      if ((i += 1) < arr.length)
        return self.push(arr[i]);

      self.push(null);
    }
  })
  .pipe(tps(function (chunk) {
    return Promise.resolve(chunk.toString('utf8'));
  }))
  .pipe(new stream.Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'));
      next();
    }
  }))
  .on('finish', function () {
    process.nextTick(function () {
      t.eqls(got, arr);
      t.end();
    });
  });
})
.it('should always keep correct chunk ordering despite being async', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e'];
  var i = -1;
  var got = [];

  var transformPromise = tps(function (chunk) {
    if ((i += 1) % 2) {
      return Promise.resolve(chunk.toString('utf8'));
    } else {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(chunk);
        }, 100);
      });
    }
  });

  transformPromise.pipe(new stream.Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'));
      next();
    }
  }))
  .on('finish', function () {
    t.eqls(got, arr);
    t.end();
  });


  arr.forEach(function (v) {
    transformPromise.write(v);
  })

  transformPromise.end();
})
.it('should allow promise to be returned from flush', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e'];
  var got = [];

  var transformPromise = tps(
  function transform(chunk) {
    return Promise.resolve(chunk);
  },
  function flush() {
    return new Promise(function (resolve) {
      process.nextTick(function () {
        resolve('f');
      });
    });
  });

  transformPromise.pipe(new stream.Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'));
      next();
    }
  }))
  .on('finish', function () {
    t.eqls(got, arr.concat(['f']));
    t.end();
  });


  arr.forEach(function (v) {
    transformPromise.write(v);
  })

  transformPromise.end();
})
.it('should handle error in transform promise', function (t) {
  var err = new Error('blerg');
  var transformPromise = tps(
  function transform() {
    return Promise.reject(err);
  })
  .on('error', function (er) {
    t.equals(er, err);
    t.end();
  })

  transformPromise.end('abc');
})
//.it('should not transform until unpaused', function (t) {
//  var arr = ['a', 'b', 'c', 'd', 'e'];
//  var i = -1;
//  var got = [];
//  var called = false;
//
//  var transformPromise = tps(function (chunk) {
//    called = true;
//    return Promise.resolve(chunk.toString('utf8'));
//  });
//
//  transformPromise.pause();
//
//  transformPromise.pipe(new stream.Writable({
//    write: function (d, enc, next) {
//      got.push(d.toString('utf8'));
//      next();
//    }
//  }))
//  .on('finish', function () {
//    t.eqls(got, arr);
//    t.end();
//  });
//
//  var j = 0;
//
//  process.nextTick(function () {
//    t.isFalse(called);
//    transformPromise.resume();
//  })
//  arr.forEach(function (v) {
//    transformPromise.write(v);
//  })
//
//  transformPromise.end();
//
//})
//.it('should resolve promise when all data is been written', function (t) {
//  var arr = ['a', 'b', 'c', 'd', 'e']
//  var i = -1
//  var got = []
//
//  return new Readable({
//    read: function () {
//      var self = this
//
//      if ((i += 1) < arr.length)
//        return self.push(arr[i])
//
//      self.push(null)
//    }
//  })
//  .pipe(wps(function (chunk) {
//    return addToSrc(chunk.toString('utf8'), got)
//  }))
//  .then(function () {
//    t.eqls(got, arr)
//  })
//})
//.it('should fail promise on error', function (t) {
//  var err = new Error()
//  var notcalled = true
//
//  return new Readable({
//    read: function () {
//      this.push('abc')
//      this.push(null)
//    }
//  })
//  .pipe(wps(function () {
//    return Promise.reject(err)
//  }))
//  .then(function () {
//    notcalled = false
//  },
//  function (er) {
//    t.equals(er, err)
//    t.assert(notcalled)
//  })
//})
//.it('should catch promise on error', function (t) {
//  var err = new Error()
//
//  return new Readable({
//    read: function () {
//      this.push('abc')
//      this.push(null)
//    }
//  })
//  .pipe(wps(function () {
//    return Promise.reject(err)
//  }))
//  .catch(function (er) {
//    t.equals(er, err)
//  })
//})
//.it('should return `_returnValue` on success', function (t) {
//  var arr = ['a', 'b', 'c', 'd', 'e']
//  var i = -1
//
//  return new Readable({
//    read: function () {
//      var self = this
//
//      if ((i += 1) < arr.length)
//        return self.push(arr[i])
//
//      self.push(null)
//    }
//  })
//  .pipe(wps({ returnValue: [] }, function (chunk) {
//    return addToSrc(chunk.toString('utf8'), this._returnValue)
//  }))
//  .then(function (res) {
//    t.eqls(res, arr)
//    t.equals(res, this._returnValue)
//  })
//})
//.it('should return `_returnValue` on success', function (t) {
//  var arr = ['a', 'b', 'c', 'd', 'e'];
//  var i = -1;
//  var j = 0;
//
//  return new Readable({
//    read: function () {
//      var self = this
//
//      if ((i += 1) < arr.length)
//        return self.push(arr[i])
//
//      self.push(null)
//    }
//  })
//  .pipe(wps({ returnValue: [] }, function (chunk) {
//    var j += 1;
//
//      if (j % 1)
//        return addToSrc(chunk.toString('utf8'), this._returnValue);
//
//      else process.nextTick(function () {
//        self.push(arr[j]);
//      });
//    }
//  }))
//  .then(function (res) {
//    t.eqls(res, arr)
//    t.equals(res, this._returnValue)
//  })
//})

desc('TransformSyncPromiseStream')
.it('should allow `transform` method to return promise', function (t) {
  var arr = ['1', '2', '3', '4', '5'];
  var i = 0;
  var j = 0;
  var got = [];

  var transformPromise = tps.sync(function (chunk) {
    i += 1;
    return new Promise(function (resolve) {
      process.nextTick(function () {
        t.equals(j += 1, i);
        resolve(chunk.toString('utf8'));
      })
    });
  });

  transformPromise.pipe(new stream.Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'));
      next();
    }
  }))
  .on('finish', function () {
      t.end();
  });

  arr.forEach(function (v) {
    transformPromise.write(v);
  });

  transformPromise.end();
})

desc('TransformRacePromiseStream')
.it('should allow `transform` method to return promise', function (t) {
  var arr = ['1', '2', '3', '4', '5'];
  var i = -1;
  var got = [];

  var transformPromise = tps.race(function (chunk) {
    if ((i += 1) % 2) {
      return Promise.resolve(chunk.toString('utf8'));
    } else {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(chunk);
        }, 100);
      });
    }
  });

  transformPromise.pipe(new stream.Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'));
      next();
    }
  }))
  .on('finish', function () {
      t.eqls(got.sort(function (a, b) {
        return a > b;
      }), arr);
      t.end();
  });


  arr.forEach(function (v) {
    transformPromise.write(v);
  })

  transformPromise.end();
})
