/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : N. Biri, J.S. Sottet
*/

/* **************************************
TODO:
    - add logger
    - make a version with batch processing
    - read from DB
    - update nodes/model
*************************************** */
'use strict'

const _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , r = require('./reify')

function loadModelFromName(name, referenceModel, ownTypes, driver) {
  const session = driver.session()
  let nodeModels, dryNodes, dryMeta
  const elements = referenceModel instanceof jsmf.Model
    ? _.fromPairs(_.map(referenceModel.elements(), c => [uuid.unparse(jsmf.jsmfId(c)), c]))
    : {}
  return findModelsByName(session, name)
    .then(res => nodeModels = res)
    .then(() => findModelsNodesByName(session, name))
    .then(res => {
      const part = _.partition(res, isMetaElement)
      dryMeta = part[0]
      dryNodes = part[1]
    })
    .then(() => dryMeta = _.filter(dryMeta, e => elements[e.properties.__jsmf__] === undefined))
    .then(() => loadClasses(session, dryMeta, elements, ownTypes, driver))
    .then(() => loadElements(session, dryNodes.concat(nodeModels), elements, ownTypes, driver))
    .then(() => _.reduce(nodeModels, (acc, n) => {
      const model = elements[n.properties.__jsmf__]
      r.disembodyModel(model, acc)
      return acc
    }, new Map()))
    .then(m => Array.from(m.values()))
}

module.exports.loadModelFromName = loadModelFromName

function loadModelFromId(mId, referenceModel, ownTypes, driver) {
  const session = driver.session()
  let dryNodes, dryMeta
  const elements = referenceModel instanceof jsmf.Model
    ? _.fromPairs(_.map(referenceModel.elements(), c => [uuid.unparse(jsmf.jsmfId(c)), c]))
    : {}
  return findModelsNodesById(session, mId)
    .then(res => {
      const part = _.partition(res, isMetaElement)
      dryMeta = part[0]
      dryNodes = part[1]
    })
    .then(() => dryMeta = _.filter(dryMeta, e => elements[e.properties.__jsmf__] === undefined))
    .then(() => loadClasses(session, dryMeta, elements, ownTypes, driver))
    .then(() => findModelById(session, mId))
    .then(nodeModel => loadElements(session, dryNodes.concat([nodeModel]), elements, ownTypes, driver))
    .then(() => r.disembodyModel(elements[mId], new Map()))
}

module.exports.loadModelFromId = loadModelFromId


function loadClasses(session, dryMeta, elements, ownTypes, driver) {
  const hydratedMetaElements = _.reduce(dryMeta, (acc, e) => hydrateMetaElement(e, acc, driver), {})
  return Promise.all(_.map(hydratedMetaElements, (v, k) => refillMetaReferences(session, k, v, hydratedMetaElements)))
    .then(() => _.reduce(hydratedMetaElements, (cache, e) => disembodyMetaElements(e, ownTypes, cache), new Map()))
    .then(meta => _.reduce(Array.from(meta.entries()), (acc, v) => {
      acc[uuid.unparse(jsmf.jsmfId(v[0]))] = v[1]
      return acc
    }, elements))
}

function loadElements(session, dryNodes, elements, ownTypes, driver) {
  const instances = {}
  return Promise.all(_.map(dryNodes, n => resolveClass(session, n, elements)))
    .then(_.flatten)
    .then(res => _(res).map(e => refillAttributes(e[0], e[1], driver)).reduce((acc, e) => {
      const jsmfId = uuid.unparse(jsmf.jsmfId(e))
      instances[jsmfId] = e
      acc[jsmfId] = e
      return acc
    }, elements))
    .then(() => Promise.all(_.map(instances, (v, k) => refillReferences(session, k, v, elements))))
    .then(() => elements)
}

function resolveMetaRef(e, metamodel) {
  if (e.class) {
    return metamodel.get(e.class.properties.__jsmf__)
  }
}

function isMetaElement(e) {
  const labels = e.labels
  return _.includes(labels, 'Meta') && !(_.includes(labels, 'Model'))
}

function findModelById(session, mId) {
  const query = 'MATCH (m:Meta:Model {__jsmf__: {mId}}) RETURN m'
  return session.run(query, {mId}).then(result => result.records[0].get('m'))
}


function findModelsByName(session, name) {
  const query = 'MATCH (m:Meta:Model {name: {name}}) RETURN m'
  return session.run(query, {name}).then(result => _.map(result.records, r => r.get('m')))
}

function findModelsNodesByName(session, name) {
  const query =
    `MATCH (m:Meta:Model {name: {name}})-[*]->(n)
     RETURN DISTINCT n`
  return session.run(query, {name}).then(result => _.map(result.records, r => r.get('n')))
}

function findModelsNodesById(session, mId) {
  const query =
    `MATCH (m:Meta:Model {__jsmf__: {mId}})-[*]->(n)
     RETURN DISTINCT n`
  return session.run(query, {mId}).then(result => _.map(result.records, r => r.get('n')))
}

function hydrateMetaElement(e, objectsMap, driver) {
  const labels = e.labels
  let cls
  if (_.includes(labels, 'EnumValue')) {
    cls = r.EnumValue
  } else if (_.includes(labels, 'Enum')) {
    cls = r.Enum
  } else if (_.includes(labels, 'Attribute')) {
    cls = r.Attribute
  } else if (_.includes(labels, 'Reference')) {
    cls = r.Reference
  } else if (_.includes(labels, 'Class')) {
    cls = r.Class
  }
  if (cls) {
    objectsMap[e.properties.__jsmf__] = refillAttributes(cls, e, driver)
  }
  return objectsMap
}

function resolveClass(session, e, classMap) {
  const query = 'MATCH (n {__jsmf__: {jsmfId}})-[:conformsTo]->(m) RETURN m.__jsmf__'
  return session.run(query, {jsmfId: e.properties.__jsmf__})
           .then(res => {
             const result = _.get(res, ['records', 0])
             return result ? [[classMap[result.get(0)], e]] : (isModel(e) ? [[r.Model, e]] : [])
           })
}

function isModel(e) {
  const labels = e.labels
  return  (_.includes(labels, 'Meta')) && (_.includes(labels, 'Model'))
}

function refillAttributes(cls, e, driver) {
  const res = cls.newInstance()
  _.forEach(_.omit(e.properties, ['__jsmf__']), (v, k) => {res[k] = v})
  try {res.__jsmf__.uuid = uuid.parse(e.properties.__jsmf__)} catch (err) {}
  setAsStored(res, driver)
  return res
}

function refillMetaReferences(session, key, element, objectMap) {
  const query = 'MATCH (m {__jsmf__: { key }})-[r]->(n) RETURN r, n.__jsmf__'
  return session.run(query, {key})
           .then(res => res.records)
           .then(res => _(res).groupBy(r => r.get('r').type).forEach((values, ref) => {
             element[ref] = _(values).map(r => objectMap[r.get(1)]).filter(r => r !== undefined).value()
           }))
}

function refillReferences(session, key, element, objectMap) {
  const query = 'MATCH (m {__jsmf__: { key }})-[r]->(n) RETURN r, n.__jsmf__'
  return session.run(query, {key})
           .then(res => res.records)
           .then(res => {
             _(res).groupBy(r => r.get('r').type).omit('conformsTo').forEach((values, ref) => {
               const refContent = element.__jsmf__.references[ref] = []
               const association = element.__jsmf__.associated[ref] = []
               _(values).forEach(r => {
                 const target = objectMap[r.get(1)]
                 if (target !== undefined) {
                   refContent.push(target)
                   const associatedId = r.get(0).properties.__jsmf__
                   if (associatedId !== undefined) {
                     association.push({elem: target, associated: objectMap[associatedId]})
                   }
                 }
               })
             })
           })
}

function disembodyMetaElements(e, ownTypes, cache) {
  const cached = cache.get(e)
  if (!cached) {
    const c = e.conformsTo()
    if (c === r.Class) { r.disembodyClass(e, cache, ownTypes) }
    else if (c === r.Enum)  { r.disembodyEnum(e, cache) }
    else if (c === r.Model) { r.disembodyModel(e, cache) }
    else { return cache }
  }
  return cache
}

function setAsStored(e, driver) {
  e.__jsmf__.storedIn = driver._url
}
