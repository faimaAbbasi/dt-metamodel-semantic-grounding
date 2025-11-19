/**
 *  Importer of JSON files (Metamodel+Model)
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet, Nicolas Biri
*/
'use strict'

const CircularJSON = require('circular-json')
const fs = require('fs')
const JSMF = require('jsmf-core')
const uuid = require('uuid')
const _ = require('lodash')

function saveModel(model,path) {

    //prepare for M2 modelling elements
    const serializedResult = CircularJSON.stringify(model)
    //does not includes the attributes
    fs.writeFile(path, serializedResult, function(err) {
        if(err) { console.log('err'); throw(err) }
        else { console.log('Saved') }
    });
}

function readModel(path) {
  var raw = fs.readFileSync(path)
  var unserializedResult = CircularJSON.parse(raw)
  return unserializedResult
}

function stringify(m, ownTypes) {
  const result = {classes: {}, elements: {}, enums: {}, model: {}}
  result.model = prepareModel(m, result)
  const dryElements = _.mapValues(result.elements, function (xs) {
    return _.map(xs, x => dryElement(x, result.classes, result.elements))
  })
  result.elements = dryElements
  result.classes = _.mapValues(result.classes, xs =>
    _.mapValues(xs, x => dryClass(x, ownTypes, result.enums, result.classes))
  )
  result.enums = _.mapValues(result.enums, xs =>
    _.mapValues(xs, x => dryEnum(x))
  )
  return JSON.stringify(result)
}

function parse(str, ownTypes) {
  const raw = JSON.parse(str)
  const result = {}
  result.enums = _.mapValues(raw.enums, (es, jsmfId) =>
    _.mapValues(es, (v, k) => {
      const e = JSMF.Enum(k, v)
      e.__jsmf__.uuid = uuid.parse(jsmfId)
      return e
    })
  )
  result.classes = _.mapValues(raw.classes, (vs, jsmfId) =>
    _.mapValues(vs, (cls, name) => {
      const attributes = _.mapValues(cls.attributes, a => {
        return { type: reviveType(a.type, result.enums, ownTypes)
               , mandatory: a.mandatory
               , errorCallback: reviveCallback(a.errorCallback)
               }
      })
      const c = new JSMF.Class(name, [], attributes)
      c.__jsmf__.uuid = uuid.parse(jsmfId)
      return c
    })
  )
  resolveClassReferences(raw.classes, result.classes)
  result.elements = _.mapValues(raw.elements, function(vs, jsmfId) {
    return _.map(vs, elem => {
      const cls = result.classes[elem.class.uuid][elem.class.index]
      const e = new cls(elem.attributes)
      e.__jsmf__.uuid = uuid.parse(jsmfId)
      return e

    })
  })
  resolveElementReferences(raw.elements, result.elements)
  return hydrateModel(raw.model, result)
}

function resolveClassReferences(rawClasses, hydratedClasses) {
  for (let i in rawClasses) {
    for (let k in rawClasses[i]) {
      hydratedClasses[i][k].superClasses =
        _.map(rawClasses[i][k].superClasses, function(s) {
          return hydratedClasses[s.uuid][s.index]
        })
      hydratedClasses[i][k].references =
        _.mapValues(rawClasses[i][k].references, r => {
          const ref = { type: hydratedClasses[r.type.uuid][r.type.index]
                      , cardinality: JSMF.Cardinality.check(r.cardinality)
                      , errorCallback: reviveCallback(r.errorCallback)
                      }
          if (r.opposite !== undefined) { ref.opposite = r.opposite }
          if (r.associated !== undefined) {
            ref.associated = hydratedClasses[r.associated.uuid][r.associated.index]
          }
          return ref
        })
    }
  }
}

function resolveElementReferences(rawElements, hydratedElements) {
  for (let i in rawElements) {
    for (let k in rawElements[i]) {
      _.forEach(rawElements[i][k].references, (refs, name) => {
        hydratedElements[i][k][name] = _.map(refs, ref =>
          hydratedElements[ref.uuid][ref.index]
        )
      })
      _.forEach(rawElements[i][k].associated, (refs, name) => {
        hydratedElements[i][k].__jsmf__.associated[name] = _.map(refs, ref =>
          ({ elem: hydratedElements[ref.elem.uuid][ref.elem.index]
           , associated: hydratedElements[ref.associated.uuid][ref.associated.index]
           })
        )
      })
    }
  }
}

function hydrateModel(m, content) {
  const modellingElements = _.map(m.modellingElements, xs => _.map(xs, x => resolveRef(x, content)))
  const refModel = m.referenceModel
  let referenceModel = {}
  if (!_.isEmpty(refModel)) {
    referenceModel = hydrateModel(refModel, content)
  }
  const result = new JSMF.Model(m.__name, referenceModel, modellingElements)
  result.__jsmf__.uuid = m.__jsmf__
  return result
}

function prepareModel(m, content) {
  const preparedModel = {}
  preparedModel.__name = m.__name
  preparedModel.__jsmf__ = JSMF.jsmfId(m)
  if (!_.isEmpty(m.referenceModel)) {
    preparedModel.referenceModel = prepareModel(m.referenceModel, content)
  }
  preparedModel.modellingElements = _.mapValues(
  m.modellingElements, xs =>
    _.map(xs, x => {
      if (JSMF.isJSMFClass(x)) { return prepareClass(x, content.classes) }
      if (JSMF.isJSMFEnum(x)) { return prepareEnum(x, content.enums) }
      if (JSMF.isJSMFElement(x)) { return prepareElement(x, content.classes, content.elements) }
      return x
    })
  )
  return preparedModel
}

function prepareEnum(m, content) {
  let enumPath = jsmfFindByName(m, content)
  if (enumPath === undefined) {
    enumPath = {uuid: uuid.unparse(JSMF.jsmfId(m)), index: m.__name}
    const values = content[enumPath.uuid] || {}
    values[m.__name] =  m
    content[enumPath.uuid] = values
  }
  return enumPath
}

function dryEnum(m) {
  return _.omit(m, '__name')
}

function prepareClass(m, classes) {
  let classPath = jsmfFindByName(m, classes)
  if (classPath === undefined) {
    classPath = {uuid: uuid.unparse(JSMF.jsmfId(m)), index: m.__name}
    const values = classes[classPath.uuid] || {}
    values[m.__name] = m
    classes[classPath.uuid] = values
    _.forEach(m.references, function(r) {prepareClass(r.type, classes)})
    _.forEach(m.superClasses, function(s) {prepareClass(s, classes)})
  }
  return classPath
}

function prepareElement(m, classes, elements) {
  let elemPath = jsmfFindByObject(m, elements)
  if (elemPath === undefined) {
    const meta = m.__jsmf__
    elemPath = {uuid: uuid.unparse(JSMF.jsmfId(m))}
    const values = elements[elemPath.uuid] || []
    elemPath.index = values.push(m) - 1
    elements[elemPath.uuid] = values
    _.forEach(meta.references, ref => _.forEach(ref, e => prepareElement(e, classes, elements)))
    _.forEach(meta.associated, ref => _.forEach(ref, e => prepareElement(e.associated, classes, elements)))
    prepareClass(m.conformsTo(), classes)
  }
  return elemPath
}

function jsmfFindByName(m, content) {
  const res =  {uuid: uuid.unparse(JSMF.jsmfId(m)), index: m.__name}
  if (_.has(content, [res.uuid, res.index])) {
    return res
  }
}

function jsmfFindByObject(m, content) {
  const result = {uuid: uuid.unparse(JSMF.jsmfId(m))}
  result.index = _.indexOf(content[result.uuid], m)
  return result.index === -1 ? undefined : result
}

function resolveRef(ref, content) {
  const uuid = ref.uuid
  const ix = ref.index
  return _.get(content.elements, [uuid, ix])
      || _.get(content.classes, [uuid, ix])
      || _.get(content.enums, [uuid, ix])
}

function dryClass(m, ownTypes, enums, classes) {
  const res = {}
  res.superClasses = _.map(m.superClasses, s => jsmfFindByName(s, classes))
  res.attributes = _.mapValues(m.attributes, a => {
    return { type: stringifyType(a.type, enums, ownTypes)
           , mandatory: a.mandatory
           , errorCallback: stringifyCallback(a.errorCallback)
           }
  })
  res.references = _.mapValues(m.references, r => {
    const dryR = { type: jsmfFindByName(r.type, classes)
           , opposite: r.opposite
           , cardinality: r.cardinality
           , errorCallback: stringifyCallback(r.errorCallback)
           }
    if (r.associated !== undefined) {
      dryR.associated = jsmfFindByName(r.associated, classes)
    }
    return dryR
  })
  return res
}

function dryElement(m, classes, elements) {
  const meta = m.__jsmf__
  const res = {attributes: meta.attributes}
  res.references = _.mapValues(meta.references, refs => _.map(refs, o => jsmfFindByObject(o, elements)))
  res.associated = _.mapValues(meta.associated, as => _.map(as,
        function (a) {
          return { elem : jsmfFindByObject(a.elem, elements)
                 , associated : jsmfFindByObject(a.associated, elements)
                 }
        }))
  res.class = jsmfFindByName(m.conformsTo(), classes)
  return res
}

function stringifyType(t, enums, ownTypes) {
  if (JSMF.isJSMFEnum(t)) {
    return prepareEnum(t, enums)
  }
  switch (t) {
  case JSMF.Number: return 'Number'
  case JSMF.Positive: return 'Positive'
  case JSMF.Negative: return 'Negative'
  case JSMF.String: return 'String'
  case JSMF.Boolean: return 'Boolean'
  case JSMF.Date: return 'Date'
  case JSMF.Array: return 'Array'
  case JSMF.Object: return 'Object'
  case JSMF.Any: return 'Any'
  default:
    if (t.typeName === 'Range') { return `Range(${t.min}, ${t.max})` }
    const res = ownTypes !== undefined ? ownTypes(t) : undefined
    if (res !== undefined) {
      return res
    } else {
      throw new Error(`Unknown type: ${t}`)
    }
  }
}

function reviveType(t, enums, ownTypes) {
  const err = new Error(`Unknown type: ${t}`)
  if (t.uuid !== undefined) {
    return enums[t.uuid][t.index]
  }
  switch (t) {
  case 'Number': return JSMF.Number
  case 'Positive': return JSMF.Positive
  case 'Negative': return JSMF.Negative
  case 'String': return JSMF.String
  case 'Boolean': return JSMF.Boolean
  case 'Date': return JSMF.Date
  case 'Array': return JSMF.Array
  case 'Object': return JSMF.Object
  case 'Any': return JSMF.Any
  default:
    let res = checkRange(t) || undefined
    if (ownTypes !== undefined) {
      res = res || ownTypes(t)
    }
    if (res !== undefined) {
      return res
    } else {
      throw err
    }
  }
}

function stringifyCallback(c) {
  switch (c) {
  case JSMF.onError.throw: return 'throw'
  case JSMF.onError.log: return 'log'
  case JSMF.onError.silent: return 'silent'
  default: throw new TypeError(`UnknownCallback ${c}`)
  }
}

function reviveCallback(c) {
  switch (c) {
  case 'throw': return JSMF.onError.throw
  case 'log': return JSMF.onError.log
  case 'silent': return JSMF.onError.silent
  default: throw new TypeError(`UnknownCallback ${c}`)
  }
}

function checkRange(t) {
  const rangeRegex = /Range\((\d+(?:\.\d+)?), *(\d+(?:\.\d+)?)\)/
  const res = rangeRegex.exec(t)
  if (res != null) {
    return JSMF.Range(res[1], res[2])
  }
}

module.exports = {
  saveModel: (model,path) => saveModel(model,path),
  readModel: path => readModel(path),
  stringify,
  parse
}
