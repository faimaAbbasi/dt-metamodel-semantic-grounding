"use strict";
const JSMF   = require('jsmf-core')
const nav    = require('jsmf-magellan')
const check  = require('../src/index.js')
const _      = require('lodash')
const should = require('should')

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

const s0 = StartState.newInstance({name: 'start'})
const s1 = StartState.newInstance({name: 'test1'})
const s2 = StartState.newInstance({name: 'test2'})
const s3 = EndState.newInstance({name: 'finish'})

const t0 = Transition.newInstance({name: 'launchTest'})
t0.next = s1
const t10 = Transition.newInstance({name: 'test1Succeeds'})
t10.next = s2
const t11 = Transition.newInstance({name: 'test1Fails'})
t11.next = s0
const t20 = Transition.newInstance({name: 'test2Succeeds'})
t20.next = s3
const t21 = Transition.newInstance({name: 'test2Fails'})
t21.next = s0;

s0.transition = t0
s1.transition = [t10, t11]
s2.transition = [t20, t21]

sample.setReferenceModel(FSM)
sample.setModellingElements([s0, s1, s2, s3, t0, t10, t11, t20, t21])

function states (model) {
    return nav.allInstancesFromModel(State, model)
}

describe ('jsmf with check', function () {
    it ('allows to check that some elements validate a given property', function (done) {
        function reachEnd (e) {
            return !(_.isEmpty(nav.crawl({predicate: nav.hasClass(EndState)}, e)))
        }
        const cs = new check.Checker()
        cs.rules["end can be reach"] = check.Rule.define(
            check.all(states),
            reachEnd
        )
        cs.run(sample).succeed.should.be.true()
        done()
    })
    it ('provides a detailed list of failing elements', function (done) {
        function reachS0 (e) {
            return !(_.isEmpty(nav.crawl({predicate: x => x == s0}, e)))
        }
        const cs = new check.Checker()
        cs.rules.reachS0 = check.Rule.define(
            check.all(states),
            reachS0
        )
        const test = cs.run(sample)
        test.succeed.should.be.false()
        should.exist(test.errors.reachS0)
        test.errors.reachS0.should.eql([[s3]])
        done()
    })
})
