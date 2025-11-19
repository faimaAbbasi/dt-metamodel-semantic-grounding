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
const uuid4 = uuid.unparse(jsmf.generateId())
const uuid5 = uuid.unparse(jsmf.generateId())
const uuid6 = uuid.unparse(jsmf.generateId())

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

describe('load models', function () {
  this.timeout(5000)

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('loads a simple class', () => {
    const modelId = uuid1
    const elemId = uuid2
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:Meta:Class {name: "A", __jsmf__: { elemId }})
                   CREATE (m)-[:elements]->(a)`
    const initDB = session.run(query, {modelId, elemId})
    return initDB
      .then(() => n.loadModelFromId(modelId))
      .then(x => {
        function createA() {
          let A = x.elements()[0]
          return new A()
        }
        (createA()).should.not.throw()
      })
  })

  it('loads a class with an attribute', () => {
    const elemId = uuid1
    const attrId = uuid2
    const modelId = uuid3
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { elemId }})
                   CREATE (attr:Meta:Attribute {name: "foo", primitiveType: "String", __jsmf__: { attrId }})
                   CREATE (m)-[:elements]->(c)
                   CREATE (c)-[:attributes]->(attr)`
    const initDB = session.run(query, {elemId, attrId, modelId})
    return initDB
      .then(() => n.loadModelFromId(modelId))
      .then(x => {
        function createA(y) {
          return function() {
            let A = x.classes.A[0]
            return new A({foo: y})
          }
        }
        (createA('test')).should.not.throw();
        (createA(12)).should.throw()
      })
  })

  it('loads a simple element', () => {
    const modelId = uuid1
    const elemId = uuid2
    const classId = uuid3
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, {elemId, modelId, classId})
    return initDB
      .then(() => n.loadModelFromId(uuid1))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        jsmf.jsmfId(x.modellingElements.A[0]).should.eql(uuid.parse(elemId))
      })
  })

  it('loads an element with a single property', () => {
    const params = {elemId: uuid1, elemX: 12, modelId: uuid2, classId: uuid3, attrId: uuid4}
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }, x: { elemX }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (attr:Meta:Attribute {name: "x", primitiveType: "Number", __jsmf__: { attrId }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (c)-[:atributes]->(attr)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, params)
    return initDB
      .then(() => n.loadModelFromId(params.modelId))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.elemX)
      })
  })

  it('loads an element with properties', () => {
    const params = {elemId: uuid1, x: 12, y: 'foo', modelId: uuid2, classId: uuid3, attrId: uuid4, attr2Id: uuid5}
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }, x: { x }, y: { y }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (attr:Meta:Attribute {name: "x", primitiveType: "Number", __jsmf__: { attrId }})
                   CREATE (attr2:Meta:Attribute {name: "x", primitiveType: "String", __jsmf__: { attr2Id }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (c)-[:atributes]->(attr)
                   CREATE (c)-[:atributes]->(attr2)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, params)
    return initDB
      .then(() => n.loadModelFromId(params.modelId))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.x)
        x.modellingElements.A[0].y.should.equal(params.y)
      })
  })
})


describe('load models by name', function () {
  this.timeout(5000)

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('loads a simple element model from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        jsmf.jsmfId(x[0].modellingElements.A[0]).should.eql(uuid.parse(uuid2))
      })
  })

  it('loads a simple modle element with attribute from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", primitiveType: "String"})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
      })
  })

  it('loads a simple model element with custom attribute from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", primitiveType: "MyString"})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M', t => t == 'MyString' ? jsmf.jsmfString : undefined))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
      })
  })

  it('loads a simple element with an enum attribute model from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: {value}})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", __jsmf__: {uuid4}})
       CREATE (at)-[:type]->(e:Meta:Enum {name: 'State', __jsmf__: {uuid5}})
       CREATE (e)-[:values]->(o:Meta:EnumValue {key: "toto", value: {value}, __jsmf__: {uuid6}})`,
        {uuid1, uuid2, uuid3, uuid4, uuid5, uuid6, value: 0})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql(0)
      })
  })

  it('loads a simple element with reference from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (m)-[:elements]->(b:A {__jsmf__: {uuid4}, foo: "woot"})-[:conformsTo]->(c)
       CREATE (a)-[:ref]->(b)
       CREATE (c)-[:references]->(r:Meta:Reference {name: "ref", min: 1, max: 1, __jsmf__: {uuid5}})
       CREATE (r)-[:type]->(c)
      `, {uuid1, uuid2, uuid3, uuid4, uuid5})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(2)
        x[0].modellingElements.A.length.should.equal(2)
        _.flatMap(x[0].modellingElements.A, 'ref').should.matchAny(v => x[0].modellingElements.A.should.containEql(v))
      })
  })

  it('loads a model of a simple element with inherited attributes from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test", bar: "ok"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {__jsmf__: {uuid4}, name: "foo", primitiveType: "String"})
       CREATE (c)-[:superClasses]->(s:Meta:Class {__jsmf__: {uuid5}, name: "B"})
       CREATE (s)-[:attributes]->(at2:Meta:Attribute {__jsmf__: {uuid6}, name: "bar", primitiveType: "String"})`, {uuid1, uuid2, uuid3, uuid4, uuid5, uuid6})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
        x[0].modellingElements.A[0].bar.should.eql('ok')
      })
  })

})

