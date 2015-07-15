var desc = require('macchiato')
var rps = require('../readable')
var Writable = require('readable-stream').Writable

if ('undefined' === typeof Promise)
  Promise = require('Promise') // eslint-disable-line no-undef

desc('ReadablePromiseStream')
.it('should allow `read` method to return promise', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1
  var got = []

  rps(function () {
    if ((i += 1) < arr.length)
      return Promise.resolve(arr[i])

    return Promise.resolve(null)
  })
  .pipe(new Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'))
      next()
    }
  }))
  .on('finish', function () {
    t.eqls(arr, got)
    t.end()
  })
})
.it('should return promise when all data is read', function (t) {
  var arr = ['a', 'b', 'c', 'd', 'e']
  var i = -1
  var got = []

  var ended = false
  var s = rps(function () {
    if ((i += 1) < arr.length)
      return Promise.resolve(arr[i])

    return Promise.resolve(null)
  })
  .on('end', function () {
    ended = true
  })

  s.then(function () {
    t.assert(ended)
    t.eqls(arr, got)
    t.end()
  })

  s.pipe(new Writable({
    write: function (d, enc, next) {
      got.push(d.toString('utf8'))
      next()
    }
  }))
})
.it('should fail promise on error', function (t) {
  var err = new Error()
  var s = rps(function () {
    return Promise.reject(err)
  })

  var notcalled = true
  s.then(function () {
    notcalled = false
    t.fail();
  },
  function (er) {
    t.equals(er, err)
    t.assert(notcalled)
    t.end()
  })

  s.pipe(new Writable({
    write: function (d, enc, next) {
      next()
    }
  }))
})
.it('should catch promise on error', function (t) {
  var err = new Error()
  var s = rps(function () {
    return Promise.reject(err)
  })

  s.catch(function (er) {
    t.equals(er, err)
    t.end()
  })

  s.pipe(new Writable({
    write: function (d, enc, next) {
      next()
    }
  }))
})
