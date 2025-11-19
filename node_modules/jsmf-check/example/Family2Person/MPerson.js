const JSMF = require('jsmf')
    , Model = JSMF.Model

const MM = require('./MMFamily.js')

const ma = new Model('a')
const familyMarch = MM.Family.newInstance()
familyMarch.lastName = 'March'
const fatherM = MM.Member.newInstance()
const motherM = MM.Member.newInstance()
const sonM = MM.Member.newInstance()
const daughterM = MM.Member.newInstance()

familyMarch.setFather(fatherM)
familyMarch.setMother(MotherM)
familyMarch.setSons(sonM)
familyMarch.setDaughters(daughterM)

const familySailor = MM.Family.newInstance()
familySailor.setLastName('Sailor')
const FatherS = MM.Member.newInstance()
const MotherS = MM.Member.newInstance()
const SonS1 = MM.Member.newInstance()
const Sons2 = MM.Member.newInstance()
const DaughterS = MM.Member.newInstance()

familySailor.setFather(FatherS)
familySailor.setMother(MotherS)
familySailor.setSons([SonS1,SonS2])
familySailor.setDaughters(DaughterS)
