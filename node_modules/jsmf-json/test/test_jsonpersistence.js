var assert = require("assert");
var should = require('should');
var JSMF = require('jsmf-core');
var JSON_save = require('../index')
Class = JSMF.Class;
Model = JSMF.Model;

//should preprocess the deletion of persisted path
describe('Save Models', function() {
    describe('Save MetaModels', function() {
        it('Simple MetaModel correctly persisted', function(done)   {
        var ReferenceModel = new Model('Reference');
        var State = Class.newInstance('State');
        State.setAttribute('name',String);
        State.setAttribute('id',Number);
        State.setAttribute('isStart', Boolean);
        ReferenceModel.add(State);

    try {
      JSON_save.saveModel(ReferenceModel,'./test/persistence.json');
      done();
    }
catch(e){
    console.log(e);
}

            //check that file exists
            //chek that files...
        });
    });
});
