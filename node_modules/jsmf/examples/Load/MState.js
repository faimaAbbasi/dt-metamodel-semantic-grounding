'use strict'
const MM = require('./MMState.js')
const _ = require('lodash')
const NAV = require('jsmf-magellan')
const JSTL = require('jsmf-jstl')

let Model
let Class

let start, end;
let sum = 0;


(function() {
    var JSMF = require('jsmf-core');
    Model = JSMF.Model;
    Class = JSMF.Class;
}).call();


function generateStates(n) {
    const result = []
    for (let i = 0; i < n; i++) {
        const s = new MM.State({name: 'state' + i})
        result.push(s)
    }
    return result;
}

function generateTransitions(states, n) {
    const result = []
    for (let i = 0; i < n; i++) {
        const t = new MM.Transition({ name: 'transition' + i, target: states[_.random(states.length - 1)]});
        states[_.random(states.length - 1)].addTransitions(t);
        result.push(t);
    }
    return result;
}

function generateModel(nbStates, nbTransitions) {
    const states = generateStates(nbStates)
    const transitions = generateTransitions(states, nbTransitions)
    const result = new Model('stateModel')
    result.setReferenceModel(MM.MMState)
    result.setModellingElements(states)
    result.setModellingElements(transitions)
    return result
}

function modelCrawlingTest(nbStates, nbTransitions) {
    const model = generateModel(nbStates, nbTransitions)
    console.log('Start')
    start = Date.now()
    console.log(NAV.crawl({predicate: _.matches({name: "transition" + (nbTransitions / 2)})}, model.modellingElements.State[0]))
    end = Date.now()
    console.log(`End: ${end - start}`)
    }

function modelFilter(nbStates, nbTransitions) {
    const model = generateModel(nbStates, nbTransitions)
    console.log('Start')
    start = Date.now()
    console.log(NAV.filterModelElements(function(x) {return NAV.hasClass(MM.Transition)(x) && _.matches({name: "transition100"})(x)}, model))
    end = Date.now()
    console.log(`End: ${end - start}`)
}

function invertModel(nbStates, nbTransitions) {
    start = Date.now()
    const model = generateModel(nbStates, nbTransitions)
    end = Date.now()
    console.log(`Model Creation: ${end - start} ms`);
    const inverted = new Model('inverted')
    const trans = new JSTL.Transformation()
    trans.addHelper({
        name: 'invertTarget',
        map: input => {
          const result = new Map()
          _.forEach(NAV.allInstancesFromModel(MM.Transition, input), t => {
            const target = _.first(t.target)
            const value = result.get(target) || []
            value.push(t)
            result.set(target, value)
          })
          return result
        }
    })
    trans.addRule({
        name: 'copyState',
        in: x => NAV.allInstancesFromModel(MM.State, x),
        out: function(i, input) {
          const state = MM.State.newInstance({name: i.name})
          this.assign(state, 'transitions', this.helpers.invertTarget.get(i))
          return [state]
        }
    });
    trans.addRule({
        name: 'invertTransition',
        in: x => NAV.allInstancesFromModel(MM.Transition, x),
        out: function(i) {
          const transition = new MM.Transition({name: i.name})
          this.assign(transition, 'target', i.source)
          return [transition]
        }
    });

    console.log('Invert FSM');
    console.log('Start')
    console.log(`States: ${nbStates}`)
    console.log(`Transitions: ${nbTransitions}`)
    start = Date.now()
    trans.apply(model, inverted)
    end = Date.now()
    console.log(`Total: ${end - start} ms`)
}

/*
invertModel(1000,10000);
invertModel(1000,25000);
invertModel(1000,50000);
invertModel(10000,100000);
invertModel(10000,200000);
*/

invertModel(10000,100000);
