'use strict'

require('should')
const neo4j = require('neo4j-driver').v1
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , n = require('../src/index')
    , _ = require('lodash')

const url = 'bolt://localhost'
const username = 'neo4j'
const password = 'neo4j'

const uuid1 = uuid.unparse(jsmf.generateId())
const uuid2 = uuid.unparse(jsmf.generateId())
const uuid3 = uuid.unparse(jsmf.generateId())

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


describe('Round trip transformation', function () {
  this.timeout(5000)

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('works on a model with an element and a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('ref', A, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const params = { aId: uuid1.toLowerCase()
                   , bId: uuid2.toLowerCase()
                   }
    const a = new A()
        , b = new A()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(2)
        _.flatMap(x.modellingElements.A[0], 'ref').length.should.equal(1)
      })
  })

  it('resolves correctly opposite references', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1, 'back', -1)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const a = new A()
        , b = new B()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.A[0].ref.length.should.equal(1)
        x.modellingElements.B[0].back.length.should.equal(1)
      })
  })

  it('populate associated data', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
        , C = new jsmf.Class('C', [])
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const params = { aId: uuid1
                   , bId: uuid2
                   , cId: uuid3
                   }
    const a = new A()
        , b = new B()
        , c = new C()
    a.addRef(b, c)
    const M = new jsmf.Model('M', MM, [a, b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(3)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.A[0].getAssociated('ref').length.should.equal(1)
        x.modellingElements.B[0].back.length.should.equal(1)
      })
  })

  it('populate associated data with reference', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
        , C = new jsmf.Class('C', [], {}, {a: {type: A}})
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B, C])
    const a = new A()
        , b = new B()
        , c = new C()
    a.addRef(b, c)
    c.a = a
    const M = new jsmf.Model('M', MM, [a, b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(3)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.A[0].getAssociated('ref')[0].associated.should
          .equal(x.modellingElements.C[0])
        x.modellingElements.C[0].a[0].should.equal(x.modellingElements.A[0])
      })
  })

  it('resolves correctly inherited attributes', () => {
    const A = new jsmf.Class('A', [], {x: Number})
        , B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B])
    const b = new B({x: 12})
    const M = new jsmf.Model('M', MM, [b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(12)
      })
  })

  it('resolves correctly inherited references', () => {
    const A = new jsmf.Class('A', [])
        , C = new jsmf.Class('C', [])
    A.addReference('ref', C, -1, 'back', -1)
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B,C])
    const b = new B()
        , c = new C()
    b.ref = c
    const M = new jsmf.Model('M', MM, [b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].ref.length.should.equal(1)
        x.modellingElements.C[0].back.length.should.equal(1)
      })
  })


  it('solves multilevel inheritance', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [A,B])
    const a = new A({x : 12})
    const b = new B({x : 42})
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(12)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(42)
      })
  })

  it('solves elements that are not in the model', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const a = new A()
    const b = new B()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(MM))))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.Class.length.should.equal(1)
        x.classes.A[0].references.should.have.property('ref')
      })
  })

})
