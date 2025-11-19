/**
 *   JavaScript Modelling Framework (JSMF)
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : Nicolas Biri, J.S. Sottet
 */

var JSMF = require('jsmf-core'); var Model = JSMF.Model; var Class = JSMF.Class;
var JSTL = require('jsmf-jstl'); var Transformation = JSTL.Transformation;
var nav = require('jsmf-magellan');
var check = require('../../index.js');
var _ = require('lodash');

//Load the metamodels (in one file for the example)
var MMI = require('./MMFamily.js');
var MMO = require('./MMPerson.js');

//Load the model (in one file for the example)
var Mi = require('./MFamily.js');

//Create the outputModel
var Mo = new Model('Out');


// <=> to the underscore library.
var _ = require('lodash');

// ************************
//Helper
function isFemale(member) {
    //Warning writting the function name... checking empty table
    return (member.familyMother.length!=0 || member.familyDaughter.length!=0);
}

function familyName(member) {
    if(member.familyFather[0] != undefined) {
        return member.familyFather[0].lastName;
    }
    if(member.familyMother.length!=0) {
        return member.familyMother[0].lastName;
    }
    if(member.familySon.length!=0) {
        return member.familySon[0].lastName;
    }
     if(member.familyDaughter.length!=0) {
        return member.familyDaughter[0].lastName;
    }
}



//Rule
var Member2Male = {

    in : function(inputModel) {
        return  _.reject(inputModel.Filter(MMI.Member),
                    function(elem){
                      return isFemale(elem);
                    });
    },

    out : function(inp) {
        var d = MMO.Male.newInstance({fullname: inp.firstName + ' ' + familyName(inp)});
        return [d];
    }
}

var Member2FeMale = {

    in : function(inputModel) {
        return  _.filter(inputModel.Filter(MMI.Member),
                    function(elem){
                        return isFemale(elem);
                    });
    },

    out : function(inp) {
        var d = MMO.Female.newInstance({fullname: inp.firstName + ' ' + familyName(inp)});
        return [d];
    }
}

// ***********************
var mod = new Transformation();
mod.addRule(Member2Male);
mod.addRule(Member2FeMale);

// Verification rules
var checker = new check.Checker();
checker.helpers.inputMembers = check.onInput(function (x) { return nav.allInstancesFromModel(MMI.Member, x); });
checker.rules["same cardinality"] = new check.Rule.define(
    check.raw(new check.Reference('inputMembers')),
    check.raw(check.onOutput(function (x) {return nav.allInstancesFromModel(MMO.Person, x)})),
    function(x,y) {return x.length == y.length}
);
checker.rules['right number of females'] = check.Rule.define(
    check.raw(check.onInput(function(x) {return _.filter(nav.allInstancesFromModel(MMI.Member, x), isFemale);})),
    check.raw(check.onOutput(function (x) {return nav.allInstancesFromModel(MMO.Female, x)})),
    function(x,y) {return x.length == y.length}
);
checker.rules['right number of males'] = check.Rule.define(
    check.raw(check.onInput(function(x) {return _.filter(nav.allInstancesFromModel(MMI.Member, x), _.negate(isFemale));})),
    check.raw(check.onOutput(function (x) {return nav.allInstancesFromModel(MMO.Male, x)})),
    function(x,y) {return x.length == y.length}
);

//Apply all rules in the models and resolve references, actual transformation execution
mod.apply(Mi.ma, Mo);

// Launch verification
// inspect(Mi.ma);
console.log(checker.runOnTransformation(Mi.ma, Mo));
