'use strict'

const _ = require('lodash')

const Model = require('jsmf-core').Model

const nav = require('jsmf-magellan')
const check = require('jsmf-check')

let FSM_MM, FSM, State, Transition
(function() { var MM = require('./fsm-metaModel.js');
    FSM_MM = MM.FSM_MM
    FSM = MM.FSM
    State = MM.State
    Transition = MM.Transition
}).call()

const initial = require('./fsm-model.js').sample

const inverted = require('./invertFSM.js').inverted

const checkTransformation = new check.Checker()

checkTransformation.addRule(
    'FSM_inversion',
    [ check.all(check.onInput(x => nav.allInstancesFromModel(FSM, x)))
    , check.any(check.onOutput(x => nav.allInstancesFromModel(FSM, x)))
    ],
    (x, y) => x.initial[0].name === y.final[0].name
          && x.final[0].name === y.initial[0].name
          && x.states.length === y.states.length
)

checkTransformation.helpers.inputStates =
    check.onInput(x => nav.allInstancesFromModel(State, x))

checkTransformation.helpers.outputStates =
    check.onOutput(x => nav.allInstancesFromModel(State, x))

checkTransformation.addRule(
    'State cardinality preservation',
    [ check.raw(new check.Reference('inputStates'))
    , check.raw(new check.Reference('outputStates'))
    ],
    (x, y) => x.length === y.length
)

checkTransformation.addRule(
    'State name preservation',
    [ check.all(new check.Reference('inputStates'))
    , check.any(new check.Reference('outputStates'))
    ],
    (x, y) => x.name === y.name
)

checkTransformation.addRule(
    'Transition cardinality preservation',
    [ check.raw(check.onInput(x => nav.allInstancesFromModel(Transition, x)))
    , check.raw(check.onOutput(x => nav.allInstancesFromModel(Transition, x)))
    ],
    (x, y) => x.length === y.length
)

checkTransformation.addRule(
    'Transition are inverted',
    [ check.all(check.onInput(x => nav.allInstancesFromModel(Transition, x)))
    , check.any(check.onOutput(x => nav.allInstancesFromModel(Transition, x)))
    ],
    (inputT, outputT) => inputT.target[0].name == outputT.source[0].name
            && outputT.target[0].name == inputT.source[0].name
)

console.log(checkTransformation.runOnTransformation(initial, inverted))
