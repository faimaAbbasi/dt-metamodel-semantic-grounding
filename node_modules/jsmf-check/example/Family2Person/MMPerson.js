const JSMF = require('jsmf-core')
    , Model = JSMF.Model
    , Class = JSMF.Class

const mmb = new Model('Person')

const Person = Class.newInstance('Person')
Person.setAttribute('fullName', String)

const Male = Class.newInstance('Male')
const Female = Class.newInstance('Female')

Male.setSuperType(Person)
Female.setSuperType(Person)


mmb.setModellingElements([Person,Male,Female])

module.exports = JSMF.modelExport(mmb)
