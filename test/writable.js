var desc = require('macchiato')
var wps = require('../writable')
var Readable = require('readable-stream').Readable

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

function addToSrc(d, src) {
  return new Promise(function (resolve) {
    src.push(d)
    resolve()
  })
}

desc('WritablePromiseStream')
.it('should allow `write` method to return promise', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1
  var got = []

  new Readable({
    read: function () {
      var self = this

      if ((i += 1) < arr.length)
        return self.push(arr[i])

      self.push(null)
    }
  })
  .pipe(wps(function (chunk) {
    return addToSrc(chunk.toString('utf8'), got)
  }))
  .on('finish', function () {
    t.eqls(got, arr)
    t.end()
  })
})
.it('should resolve promise when all data is been written', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1
  var got = []

  return new Readable({
    read: function () {
      var self = this

      if ((i += 1) < arr.length)
        return self.push(arr[i])

      self.push(null)
    }
  })
  .pipe(wps(function (chunk) {
    return addToSrc(chunk.toString('utf8'), got)
  }))
  .then(function () {
    t.eqls(got, arr)
  })
})
.it('should fail promise on error', function (t) {
  var err = new Error()
  var notcalled = true

  return new Readable({
    read: function () {
      this.push('abc')
      this.push(null)
    }
  })
  .pipe(wps(function () {
    return Promise.reject(err)
  }))
  .then(function () {
    notcalled = false
  },
  function (er) {
    t.equals(er, err)
    t.assert(notcalled)
  })
})
.it('should catch promise on error', function (t) {
  var err = new Error()

  return new Readable({
    read: function () {
      this.push('abc')
      this.push(null)
    }
  })
  .pipe(wps(function () {
    return Promise.reject(err)
  }))
  .catch(function (er) {
    t.equals(er, err)
  })
})
.it('should return `data` on success', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1

  return new Readable({
    read: function () {
      var self = this

      if ((i += 1) < arr.length)
        return self.push(arr[i])

      self.push(null)
    }
  })
  .pipe(wps.obj())
  .then(function (res) {
    t.eqls(res.map(function (i) {
      return i.toString('utf8');
    }), arr)
    t.equals(res, this.data)
  })
})
.it('should resolve promise if then called after promise has resolved', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1

  var writable = new Readable({
    read: function () {
      var self = this

      if ((i += 1) < arr.length)
        return self.push(arr[i])

      self.push(null)
    }
  })
  .pipe(wps.obj());

  return new Promise(function (resolve, reject) {
    process.nextTick(function () {
      writable.then(function (got) {
        t.eqls(got.map(function (i) {
          return i.toString('utf8');
        }), arr)
        resolve();
      },
      function (err) {
        reject(err);
      });
    });
  });
})
.it('should resolve promise data if data is ready', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1

  var writable = new Readable({
    read: function () {
      var self = this

      if ((i += 1) < arr.length)
        return self.push(arr[i])

      self.push(null)
    }
  })
  .pipe(wps.obj());

  return new Promise(function (resolve, reject) {
    process.nextTick(function () {
      writable.promise().then(function (got) {
        t.eqls(got.map(function (i) {
          return i.toString('utf8');
        }), arr)
        resolve();
      },
      function (err) {
        reject(err);
      });
    });
  });
})
