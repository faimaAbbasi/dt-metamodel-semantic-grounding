const JSMF = require('jsmf-core')
    , Model = JSMF.Model
    , MM = require('./MMFamily.js')

const ma = new Model('a')
const familyMarch = MM.Family.newInstance({lastname: 'March'})

const fatherM = MM.Member.newInstance({firstName: 'Jim', familyFather: familyMarch})
const motherM = MM.Member.newInstance()
motherM.firstName = 'Cindy'
const sonM = MM.Member.newInstance()
sonM.firstName = 'Brandon'
const daughterM = MM.Member.newInstance()
daughterM.firstName = 'Brenda'

motherM.familyMother = familyMarch
sonM.familySon = familyMarch
daughterM.familyDaughter = familyMarch

const familySailor = MM.Family.newInstance()
familySailor.lastName = 'Sailor'

const FatherS = MM.Member.newInstance()
FatherS.firstName = 'Peter'

const MotherS = MM.Member.newInstance()
MotherS.firstName = 'Jackie'

const SonS1 = MM.Member.newInstance()
SonS1.firstName = 'David'

const SonS2 = MM.Member.newInstance()
SonS2.firstName = 'Dylan'

const DaughterS = MM.Member.newInstance()
DaughterS.firstName = 'Kelly'

FatherS.familyFather = familySailor
MotherS.familyMother = familySailor
SonS1.familySon = familySailor
SonS2.familySon = familySailor
DaughterS.familyDaughter = familySailor

ma.setModellingElements([familyMarch,fatherM,motherM,sonM,daughterM,familySailor,FatherS,MotherS,SonS1,SonS2,DaughterS])

module.exports = { ma }
