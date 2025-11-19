'use strict'

const should = require('should')
    , core   = require('jsmf-core')
    , nav    = require('jsmf-magellan')
    , check  = require('../src/index')

describe('Model.checker', () => {

  it('is initialized with an empty checker', (done) => {
    const checker = (new core.Model()).checker
    checker.should.eql(new check.Checker())
    done()
  })

  it('is not shared between model', (done) => {
    const m1 = new core.Model()
    const m2 = new core.Model()
    m1.checker.addRule('foo', [check.all(x => x)], x => x.bar !== 12)
    m1.checker.rules.should.have.property('foo')
    m2.checker.should.eql(new check.Checker())
    done()
  })

  it('is used when we check model', (done) => {
    const Foo = new core.Class('Foo', undefined, {bar: Number})
    const m = new core.Model('Test', {}, [new Foo({bar: 12})])
    m.check().succeed.should.be.true()
    m.checker.addRule('Foo does not contain 12 for bar', [check.all(nav.allInstancesFromModel(Foo, m))], x => x.bar !== 12)
    m.check().succeed.should.be.false()
    done()
  })

})

describe('Model.instanceChecker', () => {

  it('is initialized with an empty checker', (done) => {
    const checker = (new core.Model()).instanceChecker
    checker.should.eql(new check.Checker())
    done()
  })

  it('is not shared between model', (done) => {
    const m1 = new core.Model()
    const m2 = new core.Model()
    m1.instanceChecker.addRule('foo', [check.all(x => x)], x => x.bar !== 12)
    m1.instanceChecker.rules.should.have.property('foo')
    m2.instanceChecker.should.eql(new check.Checker())
    done()
  })

  it('is used when we check model', (done) => {
    const Foo = new core.Class('Foo', undefined, {bar: Number})
    const mm = new core.Model('MM', {}, [Foo])

    const m = new core.Model('M', mm, [new Foo({bar: 12})])
    m.check().succeed.should.be.true()
    mm.instanceChecker.addRule('Foo does not contain 12 for bar',
      [check.all(nav.allInstancesFromModel(Foo, m))],
      x => x.bar !== 12)
    m.check().succeed.should.be.false()
    done()
  })

})

