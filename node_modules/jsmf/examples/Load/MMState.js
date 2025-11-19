'use strict';

const JSMF = require('jsmf-core')

const Model = JSMF.Model
const Class = JSMF.Class
const Enum = JSMF.Enum


const State = Class.newInstance('State', [], {name: String})
const Transition = Class.newInstance('Transition', [], {name: String})
State.setReference('transitions', Transition, -1, 'source')
Transition.setReference('target', State, 1)

const MMState = new Model('StateModel', {}, [State, Transition])

module.exports = JSMF.modelExport(MMState)
