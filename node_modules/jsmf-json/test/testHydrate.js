'use strict'

const assert = require("assert")
const _ = require("lodash")
const should = require('should')
const JSMF = require('jsmf-core')
const json = require('../index')

describe('JSON serialization / rebuild', function() {

describe('For metamodel', function() {

  it('works with a Simple Enum', function(done) {
    const e = new JSMF.Enum('Foo', ['on', 'off'])
    const original = new JSMF.Model('M', {}, e)
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

  it('works with a Simple Empty Class', function(done) {
    const e = new JSMF.Class('Foo')
    const original = new JSMF.Model('M', {}, e)
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

  it('works with a Simple Class with Attributes', function(done) {
    const e = new JSMF.Class('Foo', [], {foo: JSMF.String})
    const original = new JSMF.Model('M', {}, e)
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

  it('works with a simple Class with Reference', function(done) {
    const e = new JSMF.Class('Foo')
    e.setReference('foo', e)
    const original = new JSMF.Model('M', {}, e)
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.be.eql(original)
    done()
  })

  it('works with classes', function(done) {
    const f = new JSMF.Class('Foo')
    const b = new JSMF.Class('Bar')
    b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some)
    const original = new JSMF.Model('M', {}, [b,f])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

  it('works with Classes and Enums', function(done) {
    const f = new JSMF.Class('Foo')
    const b = new JSMF.Class('Bar')
    const e = new JSMF.Enum('Work', ['on', 'off'])
    b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some)
    f.setAttribute('work', e)
    const original = new JSMF.Model('M', {}, [b,f,e])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

  it('works with inheritance', function(done) {
    const f = new JSMF.Class('Foo')
    const b = new JSMF.Class('Bar', f)
    const e = new JSMF.Enum('Work', ['on', 'off'])
    b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some)
    f.setAttribute('work', e)
    const original = new JSMF.Model('M', {}, [b,f,e])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.eql(original)
    done()
  })

})

describe('For model', function() {

  it('works for a single element without reference model', function(done) {
    const f = new Class('Foo', [], {name: String})
    const e = new f({name: 'John Doe'})
    const original = new JSMF.Model('M', {}, [e])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.have.propertyByPath('modellingElements', 'Foo', 0, 'name')
    rebuilt.modellingElements.Foo[0].name.should.eql('John Doe')
    done()
  })

  it('works with custom attributes', function(done) {
    function MyPositive(x) {return x >= 0}
    function ownTypeParser(x) {
      if (x == MyPositive) {return 'MyPositive'}
      return undefined
    }
    function ownTypeUnparser(x) {
      if (x == 'MyPositive') {return MyPositive}
      return undefined
    }
    const f = new Class('Foo', [], {name: MyPositive})
    const e = new f({name : 42})
    const original = new JSMF.Model('M', {}, [e])
    const str = json.stringify(original, ownTypeParser)
    const rebuilt = json.parse(str, ownTypeUnparser)
    rebuilt.should.have.propertyByPath('modellingElements', 'Foo', 0, 'name')
    rebuilt.modellingElements.Foo[0].name.should.eql(42)
    done()
  })


  it('works for a single element with a reference model', function(done) {
    const f = new Class('Foo', [], {name: String})
    const e = new f({name: 'John Doe'})
    const MM = new JSMF.Model('MM', {}, [f])
    const original = new JSMF.Model('M', MM, [e])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.have.propertyByPath('modellingElements', 'Foo', 0, 'name')
    rebuilt.modellingElements.Foo[0].name.should.eql('John Doe')
    done()
  })

  it('works without adding everything to modelElements', function(done) {
    const f = new Class('Foo', [], {name: String})
    f.addReference('f', f)
    const e1 = new f({name : 'John'})
    const e2 = new f({name: 'Doe'})
    e1.f = e2
    const MM = new JSMF.Model('MM', {}, [f])
    const original = new JSMF.Model('M', MM, [e1])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.have.propertyByPath('modellingElements', 'Foo', 0, 'f', 0, 'name')
    rebuilt.modellingElements.Foo[0].f[0].name.should.eql('Doe')
    done()
  })

  it('works with associated elements', function(done) {
    const f = new Class('Foo', [], {name: String})
    f.addReference('f', f, JSMF.Cardinality.any, undefined, undefined, f)
    const e1 = new f({name : 'John'})
    const e2 = new f({name: 'Doe'})
    e1.addF(e2, e1)
    const MM = new JSMF.Model('MM', {}, [f])
    const original = new JSMF.Model('M', MM, [e1])
    const str = json.stringify(original)
    const rebuilt = json.parse(str)
    rebuilt.should.have.propertyByPath('modellingElements', 'Foo', 0, 'f', 0)
    const rebuiltE1 = rebuilt.modellingElements.Foo[0]
    const rebuiltE2 = rebuilt.modellingElements.Foo[0].f[0]
    _.find(rebuiltE1.getAssociated('f'), x => x.elem == rebuiltE2).associated.name.should.eql('John')
    done()
  })

})

})
