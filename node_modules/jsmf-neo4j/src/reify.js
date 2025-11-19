/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet
*/

const neo4j = require('neo4j-driver').v1
    , _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')

const Meta = new jsmf.Class('Meta', [])

const EnumValue = new jsmf.Class('EnumValue', Meta, {key: String, value: jsmf.Any})
const Enum = new jsmf.Class('Enum', Meta,
  {name: {type: String, mandatory: true}},
  {values: {type: EnumValue, cardinality: jsmf.Cardinality.some}})

const Attribute = new jsmf.Class('Attribute', Meta,
    {name: {type: String, mandatory: true}, mandatory: Boolean, primitiveType: String},
    {type: {type: Enum, cardinality: jsmf.Cardinality.optional}})
const Reference = new jsmf.Class('Reference', Meta,
    {name: {type: String, mandatory: true}, min: jsmf.Positive, max: jsmf.Positive, opposite: String})

const Class = new jsmf.Class('Class', Meta,
    {name: {type: String, mandatory: true}},
    {attributes: {type: Attribute}, references: {type: Reference}})
Class.addReference('superClasses', Class)

const Model = new jsmf.Class('Model', Meta, {name: {type: String, mandatory: true}}, {elements: {type: jsmf.JSMFAny}})
Model.addReference('referenceModel', Model, jsmf.Cardinality.optional)


Reference.addReference('type', Class, jsmf.Cardinality.one)

function reifyEnum(e, mapping) {
  if (!jsmf.isJSMFEnum(e)) {return undefined}
  const cId = uuid.unparse(jsmf.jsmfId(e))
  const cache = mapping.get(cId)
  if (cache != undefined) { return cache }
  const result = new Enum(
    { name: e.__name
    , values: _(e).omit(['__name']).map((value, key) => new EnumValue({key, value})).value()
    })
  result.__jsmf__.uuid = jsmf.jsmfId(e)
  mapping.set(cId, result)
  return result
}

function reifyModel(m, mapping, ownTypes) {
  mapping = mapping || new Map()
  if (!(m instanceof jsmf.Model)) {return undefined}
  const mId = uuid.unparse(jsmf.jsmfId(m))
  const cache = mapping.get(mId)
  if (cache != undefined) { return cache }
  const result = new Model({name: m.__name})
  mapping.set(mId, result)
  const rawElements = m.elements()
  result.elements = _(rawElements).map(e => reifyMetaElement(e, mapping, ownTypes)).map(0).value()
  if (m.referenceModel instanceof jsmf.Model) {result.referenceModel = reifyModel(m.referenceModel, mapping, ownTypes)}
  result.__jsmf__.uuid = jsmf.jsmfId(m)
  result.__jsmf__.storeIn = m.__jsmf__.storeIn
  return result
}

function reifyClass(c, mapping, ownTypes) {
  mapping = mapping || new Map()
  if (!jsmf.isJSMFClass(c)) {return undefined}
  const cId = uuid.unparse(jsmf.jsmfId(c))
  const cache = mapping.get(cId)
  if (cache != undefined) { return cache }
  const result = new Class({name: c.__name})
  result.superClasses = _.map(c.superClasses, c => reifyClass(c, mapping, ownTypes))
  result.attributes = _.map(c.attributes, (a, name) => reifyAttribute(name, a, mapping, ownTypes))
  result.__jsmf__.uuid = jsmf.jsmfId(c)
  mapping.set(cId, result)
  result.references = _.map(c.references, (r, name) => reifyReference(name, r, mapping, ownTypes))
  result.__jsmf__.storeIn = c.__jsmf__.storeIn
  return result
}

function reifyAttribute(name, a, mapping, ownTypes) {
  mapping = mapping || new Map()
  const result = new Attribute({name, mandatory: a.mandatory})
  if (jsmf.isJSMFEnum(a.type)) {
    result.type = reifyEnum(a.type, mapping)
  } else {
    result.primitiveType = reifyPrimitiveType(a.type, ownTypes)
  }
  return result
}

function reifyReference(name, r, mapping, ownTypes) {
  mapping = mapping || new Map()
  const result = new Reference(
    { name
    , min: r.cardinality.min
    , max: r.cardinality.max
    , opposite: r.opposite
    })
  if (r.type !== jsmf.JSMFAny) {result.type = reifyClass(r.type, mapping, ownTypes)}
  return result
}

function reifyMetaElement(elt, reified, ownTypes) {
  const cached = reified.get(uuid.unparse(jsmf.jsmfId(elt)))
  if (cached) {return [cached, [cached]]}
  const rModel = reifyModel(elt, reified, ownTypes)
  if (rModel) {return [rModel, [rModel]]}
  const rClass = reifyClass(elt, reified, ownTypes)
  if (rClass) {return [rClass, (new jsmf.Model('', undefined, rClass, true)).elements()]}
  const rEnum = reifyEnum(elt, reified, ownTypes)
  if (rEnum) {return [rEnum, (new jsmf.Model('', undefined, rEnum, true)).elements()]}
  return [elt, [elt]]
}

function reifyPrimitiveType(t, ownTypes) {
  return (ownTypes && ownTypes(t)) || stringifyType(t)
}

function stringifyType(t) {
  switch (t) {
  case jsmf.Number: return 'Number'
  case jsmf.Positive: return 'Positive'
  case jsmf.Negative: return 'Negative'
  case jsmf.String: return 'String'
  case jsmf.Boolean: return 'Boolean'
  case jsmf.Date: return 'Date'
  case jsmf.Array: return 'Array'
  case jsmf.Object: return 'Object'
  case jsmf.Any: return 'Any'
  default: if (t.typeName === 'Range') { return `Range(${t.min}, ${t.max})` }
    return 'UnknwonType'
  }
}

function disembodyEnum(e, mapping) {
  if (!e instanceof Enum) {return undefined}
  mapping = mapping || new Map()
  const cache = mapping.get(e)
  if (cache) {return cache}
  const values = _(e.values).map(v => disembodyEnumValue(v)).fromPairs().value()
  const result = new jsmf.Enum(e.name, values)
  result.__jsmf__.uuid = e.__jsmf__.uuid
  result.__jsmf__.storeIn = e.__jsmf__.storeIn
  mapping.set(e, result)
  return result
}

function disembodyEnumValue(v) {
  if (!v instanceof EnumValue) {return undefined}
  return [v.key, v.value]
}

function disembodyClass(c, mapping, ownTypes) {
  if (!c instanceof Class) {return undefined}
  mapping = mapping || new Map()
  const cache = mapping.get(c)
  if (cache) {return cache}
  const superClasses = _.map(c.superClasses, s => disembodyClass(s, mapping, ownTypes))
  const attributes = _(c.attributes).map(a => [a.name, disembodyAttribute(a, mapping, ownTypes)]).fromPairs().value()
  const result = new jsmf.Class(c.name, superClasses, attributes)
  mapping.set(c, result)
  _.forEach(c.references, r => {
    const target = _.map(r.type, t => disembodyClass(t, mapping, ownTypes))
    result.addReference(
      r.name,
      target[0],
      new jsmf.Cardinality(r.min, r.max),
      r.opposite
      )
  })
  return result
}

function disembodyAttribute(a, mapping, ownTypes) {
  const result = {mandatory: a.type}
  if (a.primitiveType) {result.type = parseType(a.primitiveType, ownTypes)}
  else {result.type = disembodyEnum(a.type[0], mapping)}
  return result
}

function disembodyModel(m, mapping) {
  mapping = mapping || new Map()
  const cache = mapping.get(m)
  if (cache) {return cache}
  if (!m instanceof Model) {return undefined}
  const result = new jsmf.Model(m.name)
  mapping.set(m, result)
  if (m.referenceModel instanceof Model) {
    result.referenceModel = disembodyModel(m.referenceModel, mapping)
  }
  result.addModellingElement(m.elements)
  return result
}

function parseType(t, ownTypes) {
  switch (t) {
  case 'Number': return jsmf.Number
  case 'Positive': return jsmf.Positive
  case 'Negative': return jsmf.Negative
  case 'String': return jsmf.String
  case 'Boolean': return jsmf.Boolean
  case 'Date': return jsmf.Date
  case 'Array': return jsmf.Array
  case 'Object': return jsmf.Object
  case 'Any': return jsmf.Any
  default: ownTypes = ownTypes || _.constant(false)
    return checkRange(t) || ownTypes(t) || jsmf.Any
  }
}

function checkRange(t) {
  const rangeRegex = /Range\((\d+(?:\.\d+)?), *(\d+(?:\.\d+)?)\)/
  const res = rangeRegex.exec(t)
  if (res != null) {
    return jsmf.Range(res[1], res[2])
  }
}


const jsmfMetamodel = new jsmf.Model('jsmfMetamodel', undefined, [Class, Model, Meta], true)

module.exports = jsmf.modelExport(jsmfMetamodel)

_.assign(module.exports, {reifyEnum, disembodyEnum, reifyClass, disembodyClass, reifyModel, reifyMetaElement, disembodyModel})
