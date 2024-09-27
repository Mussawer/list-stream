const test = require('tape')
const xtend = require('xtend')
const fs = require('fs')
const os = require('os')
const path = require('path')
const through2 = require('through2')
const crypto = require('crypto')
const ListStream = require('./')

test('collect list of objects from write()s', function (t) {
  const expectedObjects = [
    'foo',
    'bar',
    { obj: true },
    [1, 2, 3]
  ]

  const ls = ListStream.obj(function (err, data) {
    t.notOk(err, 'no error')
    t.deepEqual(data, xtend(expectedObjects), 'got expected objects')
    t.end()
  })

  expectedObjects.forEach(function (o) {
    ls.write(o)
  })
  ls.end()
})

test('collect list of objects from pipe()', function (t) {
  const expectedObjects = [
    'foo',
    'bar',
    { obj: true },
    [1, 2, 3]
  ]

  const ls = ListStream.obj(function (err, data) {
    t.notOk(err, 'no error')
    t.deepEqual(data, xtend(expectedObjects), 'got expected objects')
    t.end()
  })

  const t2 = through2.obj()
  t2.pipe(ls)

  expectedObjects.forEach(function (o) {
    t2.write(o)
  })
  t2.end()
})

test('collects buffers from binary stream', function (t) {
  const expected = Array.apply(null, Array(20)).map(function () { return crypto.randomBytes(32) })
  const ls = ListStream(verify)
  const t2 = through2()

  t2.pipe(ls)

  expected.forEach(function (b) {
    t2.write(b)
  })
  t2.end()

  function verify (err, data) {
    t.notOk(err, 'no error')
    t.equal(data.length, expected.length, 'got expected number of buffers')
    for (let i = 0; i < data.length; i++) {
      t.ok(Buffer.isBuffer(data[i]), 'got buffer at #' + i)
      t.equal(data[i].toString('hex'), expected[i].toString('hex'), 'got same buffer value at #' + i)
    }
    t.end()
  }
})

test('duplexicity', function (t) {
  const expected = Array.apply(null, Array(20)).map(function () { return crypto.randomBytes(32) })
  const tmpfile = path.join(os.tmpdir(), '_list-stream-test.' + process.pid)
  const t2 = through2()
  const ls = new ListStream()

  t2.pipe(ls)

  expected.forEach(function (b) {
    t2.write(b)
  })
  t2.end()

  // need to delay this because if we start pulling from the ListStream too early
  // it won't have any data and will trigger an end (this.push(null))
  setTimeout(function () {
    t.equal(ls.length, expected.length, 'correct .length property')
    expected.forEach(function (d, i) {
      t.equal(ls.get(i).toString('hex'), expected[i].toString('hex'), 'got correct element with .get(' + i + ')')
    })

    ls.pipe(fs.createWriteStream(tmpfile)).on('close', verify)
  }, 100)

  function verify () {
    fs.readFile(tmpfile, function (err, data) {
      t.notOk(err, 'no error reading ' + tmpfile)
      t.equal(Buffer.concat(expected).toString('hex'), data.toString('hex'), 'got expected contents in file')
      t.end()
    })
  }
})

// Tests if clear() method empties the stream by checking length and internal _chunks array
test('clear() empties the stream', function (t) {
  const ls = ListStream.obj()
  ls.write('foo')
  ls.write('bar')
  t.equal(ls.length, 2, 'stream has 2 items')
  ls.clear()
  t.equal(ls.length, 0, 'stream is empty after clear()')
  t.deepEqual(ls._chunks, [], 'internal _chunks array is empty')
  t.end()
})

// Verifies that clear() allows writing new items after clearing by using write() and get() methods
test('clear() allows writing after clearing', function (t) {
  const ls = ListStream.obj()
  ls.write('foo')
  ls.clear()
  ls.write('bar')
  t.equal(ls.length, 1, 'stream has 1 item after clearing and writing')
  t.equal(ls.get(0), 'bar', 'new item is correct')
  t.end()
})

// Checks if ListStream correctly handles an empty stream, testing end() method and callback functionality
test('handles empty stream', function (t) {
  const ls = ListStream.obj(function (err, data) {
    t.notOk(err, 'no error')
    t.deepEqual(data, [], 'got empty array')
    t.end()
  })
  ls.end()
})

// Verifies ListStream can handle a large number of small objects, testing write(), length property, and get() method
test('handles very large number of small objects', function (t) {
  const COUNT = 1000000 // 1 million objects
  const ls = ListStream.obj()

  for (let i = 0; i < COUNT; i++) {
    ls.write(i)
  }

  t.equal(ls.length, COUNT, `stream has ${COUNT} items`)
  t.equal(ls.get(COUNT - 1), COUNT - 1, 'last item is correct')
  t.end()
})

// Tests if ListStream can correctly store and retrieve very large objects, using write(), length property, and get() method
test('handles very large objects', function (t) {
  const largeObj = { data: 'x'.repeat(10 * 1024 * 1024) } // 10 MB object
  const ls = ListStream.obj()

  ls.write(largeObj)

  t.equal(ls.length, 1, 'stream has 1 item')
  t.equal(ls.get(0), largeObj, 'large object is correctly stored and retrieved')
  t.end()
})

// Tests if toJSON() correctly serializes stream contents for primitive types
test('toJSON() serializes stream contents with primitive types', function (t) {
  const ls = ListStream.obj()
  ls.write('foo')
  ls.write(42)
  ls.write(true)

  const json = ls.toJSON()
  t.equal(json, '["foo",42,true]', 'JSON string is correct for primitive types')
  t.equal(JSON.parse(json).length, 3, 'Parsed JSON has correct number of items')
  t.end()
})

// Verifies toJSON() correctly handles complex objects and maintains their structure
test('toJSON() handles complex objects', function (t) {
  const ls = ListStream.obj()
  ls.write({ name: 'Alice', age: 30 })
  ls.write([1, 2, 3])
  ls.write({ nested: { a: 1, b: [2, 3] } })

  const json = ls.toJSON()
  const parsed = JSON.parse(json)

  t.equal(parsed.length, 3, 'Parsed JSON has correct number of items')
  t.deepEqual(parsed[0], { name: 'Alice', age: 30 }, 'First object correctly serialized')
  t.deepEqual(parsed[1], [1, 2, 3], 'Array correctly serialized')
  t.deepEqual(parsed[2], { nested: { a: 1, b: [2, 3] } }, 'Nested object correctly serialized')
  t.end()
})
