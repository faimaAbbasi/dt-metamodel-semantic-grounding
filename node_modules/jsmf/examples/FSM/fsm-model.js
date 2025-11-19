'use strict'

let FSM_MM, FSM, State, Transition;

(function() { const MM = require('./fsm-metaModel.js');
    FSM_MM = MM.FSM_MM
    FSM = MM.FSM
    State = MM.State
    Transition = MM.Transition
}).call()

const Model = require('jsmf-core').Model

const s0 = State.newInstance({name: 's0'})
const s1 = State.newInstance({name: 's1'})
const s2 = State.newInstance({name: 's2'})
const s3 = State.newInstance({name: 's3'})
const s4 = State.newInstance({name: 's4'})
const s5 = State.newInstance({name: 's5'})


const t0 = Transition.newInstance({name: 't0'})
t0.target = s1
s0.transitions = t0

const t10 = Transition.newInstance({name: 't10', target: s2})
const t11 = Transition.newInstance({name: 't11', target: s3})
s1.transitions = [t10, t11]

const t20 = Transition.newInstance({name: 't20', target: s4})
const t21 = Transition.newInstance({name: 't21', target: s5})
s2.transitions = [t20, t21]

const t3 = Transition.newInstance({name: 't3', target: s0})
s3.transitions = t3

const t5 = Transition.newInstance({name: 't5', target: s0})
s5.transitions = t5

const myFSM = FSM.newInstance({
    initial: s0,
    final: s4,
    states: [s0,s1,s2,s3,s4,s5]
})

const sample = new Model('fsmSample', FSM_MM, myFSM, true)

module.exports.sample = sample
