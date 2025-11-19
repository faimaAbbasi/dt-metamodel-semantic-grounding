'use strict'

require('should')
const neo4j = require('neo4j-driver').v1
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , n = require('../src/index')

const url = 'bolt://localhost'
const username = 'neo4j'
const password = 'neo4j'

let driver, session

function initNeo4jConnector(done) {
  driver = neo4j.driver(url, neo4j.auth.basic(username, password))
  session = driver.session()
  n(url, username, password)
  n.initStorage()
  done()
}

function cleanDB() {
  return session.run('MATCH (n) DETACH DELETE n')
}

function closeNeo4j() {
  driver.close()
  n.close()
}

describe('saveModel', function () {
  this.timeout(5000)

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('saves element', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves metamodel', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta {name: "MM"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves the referenceModel', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta {name: "MM"})<-[:referenceModel]-(b:Meta:Model {name: "M"}) RETURN (b)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves conformsTo relationship', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta:Class {name: "A"})<-[:conformsTo]-(b:A) RETURN (b)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves classes', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Class {name: "A"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves enum', () => {
    const A = new jsmf.Enum('A', ['on', 'off'])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Enum {name: "A"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves enum values', () => {
    const A = new jsmf.Enum('A', ['on', 'off'])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Enum {name: "A"})-[:values]->(b) RETURN (b)'))
      .then(x => x.records.length.should.equal(2))
  })

  it('saves class attributes', () => {
    const A = new jsmf.Class('A', [], {x:Number})
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Class {name: "A"})-[:attributes]->(b:Attribute {name: "x"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves modellingElements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves relationship between models and elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves modellingElements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves relationship between models and elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('is idempotent on two saves', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => n.saveModel(M))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then( x => x.records.length.should.equal(1))
  })

  it('updates attributes on second save', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => n.saveModel(M))
      .then(() => { a.x = 24; return n.saveModel(M)})
      .then(() => session.run('MATCH (a:A {x: {x}}) RETURN (a)', {x: 24}))
      .then(x => x.records.length.should.equal(1))
  })

  it('updates ref on second save', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const B = new jsmf.Class('B', [], {}, {a: A})
    const MM = new jsmf.Model('MM', {}, A)
    const a0 = new A({x: 0})
        , a1 = new A({x: 1})
    const b = new B({a: a0})
    const M = new jsmf.Model('M', MM, [b, a0, a1])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 0}))
      .then(x => x.records.length.should.equal(1))
      .then(() => { b.a = a1; return n.saveModel(M)})
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 0}))
      .then(x => x.records.length.should.equal(0))
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 1}))
      .then(x => x.records.length.should.equal(1))
  })

  it('changes uuid if duplicates', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    let b = new A({x: 24})
    b.__jsmf__.uuid = a.__jsmf__.uuid
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A) RETURN (a)'))
      .then(x => x.records.length.should.equal(2))
  })

  it('saves class hierarchy', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    const C = new jsmf.Class('C', [A,B])
    const MM = new jsmf.Model('MM', {}, [A,B,C])
    let a = new C()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A:B:C {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves one attribute element', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId, x: a.x}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several attributes element', () => {
    const A = new jsmf.Class('A', [], {x: Number, y: String})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12, y: 'ahoy'})
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId, x: a.x, y: a.y}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfIdA = uuid.unparse(jsmf.jsmfId(a))
        , jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfIdA}}) RETURN (a)', {jsmfIdA}))
      .then( x => x.records.length.should.equal(1))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfIdB}}) RETURN (a)', {jsmfIdB}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves elem with a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('a', A, 1)
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    a.a = b
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfIdA = uuid.unparse(jsmf.jsmfId(a))
        , jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfIdA}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfIdA)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
  })

  it('saves elem with references', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('a', A, 1)
    A.addReference('b', A, 1)
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    a.a = b
    a.b = b
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    const jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfId)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
      .then(() => session.run('MATCH (a) -[:b]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfId)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
  })

  it('saves associated data attributes', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [], {x: Number})
    A.addReference('a', A, 1, undefined, undefined, B)
    const MM = new jsmf.Model('MM', {}, A)
    const a0 = new A()
        , a1 = new A()
        , b  = new B({x: 12})
    a0.addA(a1, b)
    const M = new jsmf.Model('M', MM, [a0,a1])
    const jsmfId = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[x:a]-> (b) RETURN x.x, x.__jsmf__'))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('x.x').should.equal(b.x)
        x.records[0].get('x.__jsmf__').should.equal(jsmfId)
      })
  })

  it('saves associated data as a node', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [], {x: Number}, {a: A})
    A.addReference('a', A, 1, undefined, undefined, B)
    const MM = new jsmf.Model('MM', {}, A)
    let a0 = new A()
      , a1 = new A()
      , b  = new B({x: 12})
    a0.addA(a1, b)
    b.a = a1
    const M = new jsmf.Model('M', MM, [a0,a1])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[x:a]-> (b) MATCH (c) WHERE x.__jsmf__ = c.__jsmf__ RETURN c'))
      .then( x => {
        x.records.length.should.equal(1)
      })
  })

  it('saved both side of opposite relationships', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('b', B, 1, 'a', -1)
    const MM = new jsmf.Model('MM', {}, [A,B])
    let a = new A()
      , b = new B()
    a.b = b
    const M = new jsmf.Model('M', MM, [a,b])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:b]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then(x  => x.records.length.should.equal(1))
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then(x  => x.records.length.should.equal(1))
  })

})


