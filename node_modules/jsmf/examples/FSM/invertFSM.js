'use strict'

const _ = require('lodash')

const Model = require('jsmf-core').Model
const Transformation = require('jsmf-jstl').Transformation
const nav = require('jsmf-magellan')

let FSM_MM, FSM, State, Transition
(function() { const MM = require('./fsm-metaModel.js')
    FSM_MM = MM.FSM_MM
    FSM = MM.FSM
    State = MM.State
    Transition = MM.Transition
}).call()

const input = require('./fsm-model.js').sample


const trans = new Transformation()

const fsmInversion = {
    in: x => nav.allInstancesFromModel(FSM, x),
    out: function(i) {
        const fsm = FSM.newInstance()
        this.assign(fsm, 'initial', i.final)
        this.assign(fsm, 'final', i.initial)
        this.assign(fsm, 'states', i.states)
        return [fsm]
    }
}
trans.addRule(fsmInversion)

const transitionInversion = {
    in: x => nav.allInstancesFromModel(Transition, x),
    out: function(i) {
        const transition = Transition.newInstance({name: i.name})
        this.assign(transition, 'target', i.source)
        return [transition]
    }
}
trans.addRule(transitionInversion)

const stateInversion = {
    in: x => nav.allInstancesFromModel(State, x),
    out: function(i) {
        const state = State.newInstance({name: i.name})
        this.assign(state, 'transitions', this.helpers.opposedTarget.get(i))
        return [state]
    }
}
trans.addRule(stateInversion)

const opposedTargetRelation = {
    name: 'opposedTarget',
    map: x => {
      const result = new Map()
      _.forEach(
          nav.allInstancesFromModel(Transition, x),
          t => {
            const target = _.first(t.target)
            let value = result.get(target) || []
            value.push(t)
            result.set(target, value)
          }
      )
      return result
    }
}
trans.addHelper(opposedTargetRelation)

const output = new Model('invertedSample')
trans.apply(input, output)
const inspect = require('eyes').inspector({maxLength: 12000})
inspect(output)

module.exports.inverted = output
