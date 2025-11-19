# Getting Started

In this section, we will create a dummy finite state machine model (FSM) example
(with only one initial and one final state), and a model transformation that
invert the transition of the state machine.

This example is available in the examples directory.

## The FSM metamodel

### Class description

In this example, a `FSM` is composed of:

- an initial state;
- a final state;
- some intermediate states;

A `State` has a name and a set of `transitions`.

A `Transition` has a name and an `target` state and a `source` state.
`source` and `outgoing` are opposed relationship.

# Implementation

The FSM metamodel code is proposed in `fsm-metamodel.js`.

We start with a traditional `jsmf-core` import:

```javascript
'use strict'

let Class
let Model

(function() {const JSMF = require('jsmf-core')
    Model = JSMF.Model
    Class = JSMF.Class
}).call()
```

Then, we create our (meta-)model, empty:

```javascript
const FSM_MM = new Model('State')
```

We know start wit the definition of the `State` class:

```javascript
const State = Class.newInstance('State', [])
State.setAttribute('name', String)
```

It creates the `State` class and its `name` attribute.
We use the `setAttribute` function to add this attribute, but it could also be
done in the `newInstance` call, we will see it in the next example.
As we have not created the `Transition` class yet, we can not declare the
`outgoing` reference at the moment. Let's do it now:

```javascript
const Transition = Class.newInstance('Transition', [], {name: String}, {target: {type: State, cardinality: 1}})
State.setReference('transitions', Transition, -1, 'source')
```

We start by creating the `Transition` class thanks to `newIsntance`.

The second argument of
`newInstance` is where we declare the super class of a class. There is none
here, thus we leave an empty array (`undefined` would be accepted as well).

The third argument is an object that is used to populate the attributes of the
created class. Here, we create the `name` attribute, of type `String`.

The fourth argument is for the definition of relationships. We add only one
`target` reference to `State`, with a max cardinality of 1.

Finally we use `setReference` to add the `outgoing` reference to `State`.
The 4 parameters here are in order:

- the name of the reference;
- its type;
- the max cardinality (-1 for no max);
- the name of the opposite reference.

We conclude the definition of the FSM with the FSM class using all the thing we have seen so far:

```javascript
const FSM = Class.newInstance('FSM', [], {}, {
    initial: {type: State, cardinality: 1},
    final: {type: State, cardinality: 1},
    states: {type: State, cardinality: -1}
})
```

```javascript
A final (and tedious part) is to add the modelling elements to the model:
```

FSM_MM.setModellingElements([FSM, State, Transition])


And the file and with a module exports for nodejs:

```javascript
module.exports = {
    FSM_MM,
    FSM,
    State,
    Transition
}
```

## FSM sample

Let's continue with the implementation of a small FSM sample. We will model the
following FSM in JSMF (where `s0` is the initial state):

![FSM Sample](fsm-sample.png)

The code is in `fsm-model.js`.

As a preamble, we start with an import of `jsmf-core` and of the meta-model:

```javascript
let FSM_MM, FSM, State, Transition

(function() {var MM = require('./fsm-metaModel.js')
    FSM_MM = FSM_MM
    FSM = FSM
    State = State
    Transition = Transition
}).call()

const Model = require('jsmf-core').Model
```

Then, we start with the definition of the states. To do so, we use
`newInstance`. This function takes an initialization object in option:

```javascript
const s0 = State.newInstance({name: 's0'})
const s1 = State.newInstance({name: 's1'})
const s2 = State.newInstance({name: 's2'})
const s3 = State.newInstance({name: 's3'})
const s4 = State.newInstance({name: 's4'})
const s5 = State.newInstance({name: 's5'})
```

Then, we add the transitions. We are creating them with `newInstance`
(note how we add the references in the same way as attributes) and we
add them to states with a generated setter. Actually, new Instance create
setters that can be use to populate references and attributes for each element.

```javascript
const t0 = Transition.newInstance({name: 't0'})
t0.target = s1
s0.transitions = t0

const t10 = Transition.newInstance({name: 't10', target: s2})
const t11 = Transition.newInstance({name: 't11', target: s3})
s1.transitions = [t10, t11]

const t20 = Transition.newInstance({name: 't20', target: s4})
const t21 = Transition.newInstance({name: 't21', target: s5})
s2.transitions = [t20, t21]

const t3 = Transition.newInstance({name: 't3', target: s0})
s3.transitions = t3

const t5 = Transition.newInstance({name: 't5', target: s0})
s5.transitions = t5
```

Finally, in the same way, we can build the `FSM` object:

```javascript
const myFSM = FSM.newInstance({
    initial: s0,
    final: s4,
    states: [s0,s1,s2,s3,s4,s5]
})
```

We just have to gather all these elements in a model. In JSMF, the same class
is used to handle metamodel or model. But this time, we do not use
`setModellingElements` to populate the model. Instead, we pass the entrypoint
of the model at its creation. And all the elements that are referenced
transitively by this entrypoint are automatically added:

```javascript
const sample = new Model('fsmSample', FSM_MM, myFSM, true)
```

And we finish by an export of the model:

```javascript
module.exports.sample = sample
```

## Model transformation

As an example of model transformation, we propose a transformation module that
_revert_ a FSM: the final state becomes the initial state (and vice versa) and
all the transitions are inverted. The model transformation code is proposed in
the file `invertFSM.js`.

The transformation uses JSTL (JavaScript Transformation Library) a subpart of
JSMF for model transformation inspired by [ATL](http://www.eclipse.org/atl/).

The file start with JSMF libraries, FSM meta-model and FSM model import (from
line 3 to line 31):

```javascript
const _ = require('lodash')

const Model = require('jsmf-core').Model
const Transformation = require('jsmf-jstl').Transformation
const nav = require('jsmf-magellan')


let FSM_MM, FSM, State, Transition;
(function() { const MM = require('./fsm-metaModel.js')
    FSM_MM = MM.FSM_MM
    FSM = MM.FSM
    State = MM.State
    Transition = MM.Transition
}).call()

const input = require('./fsm-model.js').sample
```

We continue by the initialisation of the transformation module.


```javascript
const trans = new TransformationModule('invertFSM', input, output)
```

### FSMs Transformation

Let's start with a first rule that will invert a FSM instance. In JSTL, a
transformation rule is an object composed of two properties:

- `in`: that is actually a filter function on the input model, to select the
elements the rules will be applied on.
- `out`: a function that take a selected element (and optionally the input
model) as parameters. It returns an array of output
elements (that will populate the output models). The `out` function can also
declare reference resolution rules using `this.assign` (these last ones are
described below).

`this.assign` takes 3 arguments:
- `source`: The element we are resolving reference for.
- `relationName`: the name of the relation we populate.
- `target`: the collection of elements from the input models that we transform
to populate the relation.

Let's come back to FSM. We need to select all the FSM element from the model.
To do so, we use Magellan, a JSMF library for model navigation. The
`allInstancesFromModel` can be used to this intent. For the output part,
we build a new FSM instance and we define its relationships, we describes them
in details below the code. Finally, we add the rule to the module.

```javascript
const fsmInversion = {
    in: x => nav.allInstancesFromModel(FSM, x),
    out: function(i) {
        const fsm = FSM.newInstance()
        this.assign(fsm, 'initial', i.final)
        this.assign(fsm, 'final', i.initial)
        this.assign(fsm, 'states', i.states)
        return [fsm]
    }
}
trans.addRule(fsmInversion)
```

In this sample, the two first `this.assign` resolution rules follow the
same pattern: they will populate a reference in the newly created fsm object,
and will respectively used the transformed `final` and `initial` reference of
the inital FSM to poluate the references. The last resolution rule is also
straightforward: the transformation of each states of the inital model will be
a state in the output FSM.

### Transitions Transformation

The objective for the transitions transformation is to invert the direction of
the original transition:

```javascript
const transitionInversion = {
    in: x => nav.allInstancesFromModel(Transition, x),
    out: function(i) {
        const transition = Transition.newInstance({name: i.name})
        this.assign(transition, 'target', i.source)
        return [transition]
    }
}
trans.addRule(transitionInversion)
```

Source is an opposite reference and thus will be handled in state, not in
Transition. As a consequence, we only have to invert the target reference.
The `transitionTarget` rule claims that the target in the output transition
will be the transformation of the original source state of this transition.

### States transformation

The main difficulty for state transformation is that the transitions of a state
in the output model will be the transitions that led to this state in the input
model. Unfortunately, there is no opposite relationship to `transitions`. Thus,
we must query the input model to build the new set of transitions. To do so, we
use a helper, dsicussed below. For the moment, just see how this helper is used
in the example:

```javascript
const stateInversion = {
    in: x => nav.allInstancesFromModel(State, x),
    out: function(i) {
        const state = State.newInstance({name: i.name})
        this.assign(state, 'transitions', this.helpers.opposedTarget.get(i))
        return [state]
    }
}
trans.addRule(stateInversion)
```

The helper is called `opposedTarget` and provide a mapping that associate each
states to the array of transitions that lead to this state. The `valuesFor`
function give us access to these transitions. Let see how the helper is declared:

```javascript
const opposedTargetRelation = {
    name: 'opposedTarget',
    map: x => {
      const result = new Map()
      _.forEach(
          nav.allInstancesFromModel(Transition, x),
          t => {
            const target = _.first(t.target)
            let value = result.get(target) || []
            value.push(t)
            result.set(target, value)
          }
      )
      return result
    }
}
trans.addHelper(opposedTargetRelation)
```

```javascript
const output = new Model('invertedSample')
trans.apply(input, output)
const inspect = require('eyes').inspector({maxLength: 12000})
inspect(output)
```

But we haven't finish with the transformed FSM yet, so let's export the result:

```javascript
module.exports.inverted = output
```


## Transformation verification

We now have transformed our initial model, but how can we be sure that the
result of our transformation is what we expected? JSMF provide a checking tool
that can be used either to check properties of a model or of a transformation.
In this section, we use it to test some properties of our transformation.

The code is available in the `checkTransformation.js` file of the example
directory.

As usual, we start with libraries import:

```javascript
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
```

Then we initialize a checker:

```javascript
const checkTransformation = new check.Checker()
```

Let start with a check of the FSM object transformation. We will check
if for each FSM of the input model, there exists a FSM in the output
model such that:

- The name of the initial state in the input model is the name of the final
state in the output model.
- The name of the final state in the input model is the name of the initial
state in the output model.
- Both model has the same number of states.

We add a rule (that we call `FSM_inversion`) to check these properties.
The `addRule` function takes 3 arguments: the name, the set of selection
to check rule (here, for all FSM elements in the input model (first selection),
check if there exists an FSM element in the output model (second selection)).

The thris argument is the function that must be fullfilled by these models:

```javascript
checkTransformation.addRule(
    'FSM_inversion',
    [ check.all(check.onInput(x => nav.allInstancesFromModel(FSM, x)))
    , check.any(check.onOutput(x => nav.allInstancesFromModel(FSM, x)))
    ],
    (x, y) => x.initial[0].name === y.final[0].name
          && x.final[0].name === y.initial[0].name
          && x.states.length === y.states.length
)
```

We continue with the definition of several selections for the checker.
_Selections_ are filter on the input / output models that will be evaluated
once and can be reused several times afterwards. We use such selections
to filter all the states of the input and of the ouput models, which will be
used several times in the next rules.

```javascript
checkTransformation.helpers.inputStates =
    check.onInput(x => nav.allInstancesFromModel(State, x))

checkTransformation.helpers.outputStates =
    check.onOutput(x => nav.allInstancesFromModel(State, x))
```

With these selections, we can check that the transformation preserve the number of states:

```javascript
checkTransformation.addRule(
    'State cardinality preservation',
    [ check.raw(new check.Reference('inputStates'))
    , check.raw(new check.Reference('outputStates'))
    ],
    (x, y) => x.length === y.length
)
```

We also check if the names are preserved: for each state of the input model, it
exists a state in the output model with the same name:

```javascript
checkTransformation.addRule(
    'State name preservation',
    [ check.all(new check.Reference('inputStates'))
    , check.any(new check.Reference('outputStates'))
    ],
    (x, y) => x.name === y.name
)
```

We continue by checking that the number of transitions is preserved thourgh the transformation:

```javascript
checkTransformation.addRule(
    'Transition cardinality preservation',
    [ check.raw(check.onInput(x => nav.allInstancesFromModel(Transition, x)))
    , check.raw(check.onOutput(x => nav.allInstancesFromModel(Transition, x)))
    ],
    (x, y) => x.length === y.length
)
```

We finish with the most important rule: transitions are inverted. For all the
transitions in the input model, there exists a transition of the output model
such that:

- The name of the source state of the input transition is the name of the target state of the output transition.
- The name of the source state of the output transition is the name of the target state of the input transition.

```javascript
checkTransformation.addRule(
    'Transition are inverted',
    [ check.all(check.onInput(x => nav.allInstancesFromModel(Transition, x)))
    , check.any(check.onOutput(x => nav.allInstancesFromModel(Transition, x)))
    ],
    (inputT, outputT) => inputT.target[0].name == outputT.source[0].name
            && outputT.target[0].name == inputT.source[0].name
)
```

And then we run all these rules (and log the result):

```javascript
console.log(checkTransformation.runOnTransformation(initial, inverted))
```
