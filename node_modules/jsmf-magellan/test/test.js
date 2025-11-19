"use strict"
const should = require('should')
const _ = require ('lodash')
const JSMF = require('jsmf-core')
const mag = require ('../index')

const Class = JSMF.Class
const Model = JSMF.Model

const FSM = new Model('FSM')
const State = Class.newInstance('State')
State.setAttribute('name', String)
const StartState = Class.newInstance('StartState')
StartState.setSuperType(State)
const EndState = Class.newInstance('EndState')
EndState.setSuperType(State)

const Transition = Class.newInstance('Transition')
Transition.setAttribute('name', String)
Transition.setReference('next', State, 1)
State.setReference('transition', Transition, -1)

FSM.setModellingElements([StartState, State, EndState, Transition])

const sample = new Model('sample')
const unreferencedSample = new Model('sample')

const s0 = StartState.newInstance({name: 'start'})
const s1 = State.newInstance({name: 'test1'})
const s2 = State.newInstance({name: 'test2'})
const s3 = EndState.newInstance({name: 'finish'})

var t0 = Transition.newInstance({name: 'launchTest', next: [s1]})
var t10 = Transition.newInstance({name: 'test1Succeeds', next: [s2]})
var t11 = Transition.newInstance({name: 'test1Fails', next: [s0]})
var t20 = Transition.newInstance({name: 'test2Succeeds', next: [s3]})
var t21 = Transition.newInstance({name: 'test2Fails', next: [s0]})

s0.transition = t0
s1.transition = [t10, t11]
s2.transition = [t20, t21]

sample.setReferenceModel(FSM)
sample.setModellingElements([s0, s1, s2, s3, t0, t10, t11, t20, t21])
unreferencedSample.setModellingElements([s0, s1, s2, s3, t0, t10, t11, t20, t21])

describe('crawl', function () {
  it ('get the entrypoint if it is an instance of the desired class', function (done) {
    // Find all EndStates that can be reached from s3
    const res = mag.crawl({predicate: mag.hasClass(EndState)}, s3)
    res.should.eql([s3])
    done()
  })
  it ('accept subclasses', function (done) {
    // Find all States (or its subclasses) that can be reached from s3
    const res = mag.crawl({predicate: mag.hasClass(State)}, s3)
    res.should.eql([s3])
    done()
  })
  it ('finds nothing for non-corresponding isolated element', function (done) {
    // Find all Transition that can be reached from s3
    var res = mag.crawl({predicate: mag.hasClass(Transition)}, s3)
    res.should.be.empty()
    done()
  })
  it ('follows references', function (done) {
    // Find all States that can be reached from t20
    var res = mag.crawl({predicate: mag.hasClass(State)}, t20)
    res.should.have.lengthOf(1)
    res.should.eql([s3])
    done()
  })
  it ('crawls the model (State example)', function (done) {
    // Find all States that can be reached from s2
    var res = mag.crawl({predicate: mag.hasClass(State)}, s2)
    res.should.have.lengthOf(4)
    res.should.containEql(s0)
    res.should.containEql(s1)
    res.should.containEql(s2)
    res.should.containEql(s3)
    done()
  })
  it ('crawls the model (Transition example)', function (done) {
    // Find all Transitions that can be reached from s2
    var res = mag.crawl({predicate: mag.hasClass(Transition)}, s2)
    res.should.have.lengthOf(5)
    res.should.containEql(t0)
    res.should.containEql(t10)
    res.should.containEql(t11)
    res.should.containEql(t20)
    res.should.containEql(t21)
    done()
  })
  it ('finds nothing for non-instanciated class', function (done) {
    // Find all Dummy that can be reached from s2
    const Dummy = Class.newInstance('Dummy')
    const res = mag.crawl({predicate: mag.hasClass(Dummy)}, s2)
    res.should.eql([])
    done()
  })
  it ('only find the current object if depth is 0', function (done) {
    // Find all State that can be reached from s0 following 0 references
    const res = mag.crawl({predicate: mag.hasClass(State), depth: 0}, s0)
    res.should.have.lengthOf(1)
    res.should.containEql(s0)
    done()
  })
  it ('only find a subset if depth is limited', function (done) {
    // Find all State that can be reached from s0 following exactly 2 references
    // Reference 0: Transition
    // Reference 1: State
    const res = mag.crawl({predicate: mag.hasClass(State), depth: 2}, s0)
    res.should.have.lengthOf(2)
    res.should.containEql(s0)
    res.should.containEql(s1)
    done()
  })
  it ('follows only some references', function(done) {
    const A = new Class("A")
    A.setAttribute("name", String)
    A.setReference("toX", A, 1)
    A.setReference("toY", A, 1)
    const a = A.newInstance({name: 'a'})
    const x = A.newInstance({name: 'x'})
    const y = A.newInstance({name: 'y'})
    a.toX = x
    a.toY = y
    const f = mag.referenceMap({A: 'toX'})
    // Find all As that can be reached from `a` following only toX references
    const res = mag.crawl({predicate: mag.hasClass(A), followIf: f}, a)
    res.should.have.lengthOf(2)
    res.should.containEql(a)
    res.should.containEql(x)
    done()
  })
  it ('works with a custom "followIf" Based on elements name', function(done) {
    // Find all elements that can be reached from `s0` following only nodes that has a name containing 'start' or 'launchTest'
    const res = mag.crawl({followIf: x => _.includes(['start', 'launchTest'], x.name)}, s0)
    res.should.have.lengthOf(3)
    res.should.containEql(s0)
    res.should.containEql(t0)
    res.should.containEql(s1)
    done()
  })
  it ('works with an excluded root', function(done) {
    // Find all states that are less than 2 references away from s0, without including s0.
    const res = mag.crawl({predicate: mag.hasClass(State), includeRoot: false, depth: 2}, s0)
    res.should.eql([s1])
    done()
  })
  it ('works with "stopOnFirst" sets to true', function(done) {
    // Find one State from s0, then stops.
    const res = mag.crawl({predicate: mag.hasClass(State), includeRoot: false, stopOnFirst: true}, s0)
    res.should.eql([s1])
    done()
  })
  it ('works with a custom "followIf" Based on elements name and reference', function(done) {
    // Crawl the model from s1, following the transition reference only if the transition name is test1 or if the reference name is next and the element name is test1Succeeds
    const res = mag.crawl({followIf: (x, ref) =>
        (x.name == "test1" && ref == "transition")
          || (x.name == "test1Succeeds" && ref == "next")
    }, s1)
    res.should.have.lengthOf(4)
    res.should.containEql(s1)
    res.should.containEql(t10)
    res.should.containEql(t11)
    res.should.containEql(s2)
    done()
  })
  it ('gets the current object if it match the predicate', function (done) {
    const res = mag.crawl({predicate: _.matches({name: 'finish'})}, s3)
    res.should.have.lengthOf(1)
    res.should.eql([s3])
    done()
  })
  it ('crawls the model for matches', function (done) {
    const res = mag.crawl({predicate: x => _.includes(x['name'], 'test')}, s0)
    res.should.have.lengthOf(6)
    res.should.containEql(s1)
    res.should.containEql(s2)
    res.should.containEql(t10)
    res.should.containEql(t11)
    res.should.containEql(t20)
    res.should.containEql(t21)
    done()
  })
})

describe('allInstancesFromModel', function () {
  describe('with reference model', function () {
    it ('find instances', function (done) {
      const res = mag.allInstancesFromModel(StartState, sample)
      res.should.eql([s0])
      done()
    })
    it ('find children instances too', function (done) {
      const res = mag.allInstancesFromModel(State, sample)
      res.should.have.lengthOf(4)
      res.should.containEql(s0)
      res.should.containEql(s1)
      res.should.containEql(s2)
      res.should.containEql(s3)
      done()
    })
  })
  describe('without reference model', function () {
    it ('find instances', function (done) {
      const res = mag.allInstancesFromModel(StartState, unreferencedSample)
      res.should.eql([s0])
      done()
    })
    it ('find children instances too', function (done) {
      const res = mag.allInstancesFromModel(State, unreferencedSample)
      res.should.have.lengthOf(4)
      res.should.containEql(s0)
      res.should.containEql(s1)
      res.should.containEql(s2)
      res.should.containEql(s3)
      done()
    })
    it ('using strict mode (search by class name)', function (done) {
      const res = mag.allInstancesFromModel(StartState, unreferencedSample,true)
      res.should.eql([s0])
      done()
    })
  })
})

describe('filterModelElements', function () {
  it ('crawls the model for matches', function (done) {
    const res = mag.filterModelElements(x => x['name'].indexOf('test2') != -1, sample)
    res.should.have.lengthOf(3)
    res.should.containEql(s2)
    res.should.containEql(t20)
    res.should.containEql(t21)
    done()
  })
})

describe('follow', function () {
  it('get the current object on empty path', function(done) {
    const res = mag.follow({path: []}, s1)
    res.should.eql([s1])
    done()
  })
  it('get the objects at the end of a single path', function(done) {
    const res = mag.follow({path: ['transition']}, s1)
    res.should.have.lengthOf(2)
    res.should.containEql(t10)
    res.should.containEql(t11)
    done()
  })
  it ('get the objects at the end on complex paths', function(done) {
    const res = mag.follow({path: ['transition', 'next', 'transition']}, s0)
    res.should.have.lengthOf(2)
    res.should.containEql(t10)
    res.should.containEql(t11)
    done()
  })
  it ('get objects along if "targetOnly" is set to false', function(done) {
    const res = mag.follow({path: ['transition', 'next', 'transition'], targetOnly: false}, s0)
    res.should.have.lengthOf(5)
    res.should.containEql(s0)
    res.should.containEql(t0)
    res.should.containEql(s1)
    res.should.containEql(t10)
    res.should.containEql(t11)
    done()
  })
  it ('works with all parameters sets', function(done) {
    const res = mag.follow({path: ['transition', 'next', 'transition'],
                            targetOnly: false,
                            predicate: mag.hasClass(Transition)}, s0)
    res.should.have.lengthOf(3)
    res.should.containEql(t0)
    res.should.containEql(t10)
    res.should.containEql(t11)
    done()
  })
  it ('works with path and predicate', function(done) {
      const res = mag.follow({path: ['transition',  'next', 'transition', _.matches({name: 'test1Succeeds'}), 'next'],
                              predicate: mag.hasClass(State)}, s0)
      res.should.eql([s2])
      done()
  })
  it ('works with path, predicate and searchMethod that stop on first', function(done) {
      const res = mag.follow({path: ['transition',  'next', 'transition'],
                              searchMethod: mag.DFS_First,
                              predicate: x => _.includes(x.name, "test1")} , s0)
      res.should.have.lengthOf(1)
      done()
  })
})
