const JSMF = require('jsmf-core')
    , Model = JSMF.Model
    , Class = JSMF.Class

var mma = new Model('Famillies')

const Member = Class.newInstance('Member', undefined, {firstName: String})
const Family = Class.newInstance('Family', undefined,
    {lastName: String},
    { father: {type: Member, cardinality: 1, opposite: 'familyFather'}
    , mother: {type: Member, cardinality: 1, opposite: 'familyMother'}
    , sons: {type: Member, cardinality: -1, opposite: 'familySon'}
    , daughter: {type: Member, cardinality: -1, opposite: 'familyDaughter'}
    })

Member.setReference('familyFather',Family, 1, 'father')
Member.setReference('familyMother', Family, 1, 'mother')
Member.setReference('familySon', Family, 1, 'sons')
Member.setReference('familyDaughter', Family, 1, 'daughters')

mma.setModellingElements([Family,Member])


module.exports = JSMF.modelExport(mma)
