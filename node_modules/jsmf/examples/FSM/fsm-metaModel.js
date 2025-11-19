'use strict';

let Class;
let Model;

(function() {const JSMF = require('jsmf-core')
    Model = JSMF.Model
    Class = JSMF.Class
}).call()

const FSM_MM = new Model('State')

const State = Class.newInstance('State', [], {name: String})

const Transition = Class.newInstance('Transition', [], {name: String}, {target: {target: State, cardinality: 1}})
State.setReference('transitions', Transition, -1, 'source')

const FSM = Class.newInstance('FSM', [], {}, {
    initial: {target: State, cardinality: 1},
    final: {target: State, cardinality: 1},
    states: {target: State, cardinality: -1}
})

FSM_MM.setModellingElements([FSM, State, Transition])

module.exports = {
    FSM_MM,
    FSM,
    State,
    Transition
}
