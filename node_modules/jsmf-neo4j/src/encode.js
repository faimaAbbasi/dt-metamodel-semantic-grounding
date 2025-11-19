/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet, N. Biri
*/

'use strict'

const _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , r = require('./reify')

module.exports.saveModel = function saveModel(m, ownTypes, driver) {
  const reified = new Map()
  const rawElements = gatherElements(m)
  const elements = _.flatMap(rawElements, e => r.reifyMetaElement(e, reified, ownTypes)[1])
  const session = driver.session()
  return saveElements(elements, new Map(), reified, ownTypes, session, driver)
    .then(() => session.close())
}


function saveElements(elements, elemMap, reified, ownTypes, session, driver) {
  return saveAttributes(elements, elemMap, reified, ownTypes, session, driver)
    .then(() => saveRelationships(elements, elemMap, reified, ownTypes, session, driver))
}


function saveAttributes(es, elemMap, reified, ownTypes, session, driver) {
  return Promise.all(_.map(es, x => saveAttribute(x, reified, ownTypes, session, driver)))
    .then(vs => _.reduce(vs, (acc, v) => {acc.set(v[0], v[1]); return acc}, elemMap))
}

function saveAttribute(elt, reified, ownTypes, session, driver) {
  const e = reified.get(elt) || elt
  const dry = dryElement(e, ownTypes)
  const classes = _.map(e.conformsTo().getInheritanceChain(), '__name')
  classes.push('JSMF')
  if (e.__jsmf__.storedIn === driver._url) {
    const clean = 'MATCH (x {__jsmf__: {jsmfId}}) DETACH DELETE x'
    const update = `MERGE (x:${classes.join(':')} {__jsmf__: {jsmfId}}) SET x = {params} RETURN (x)`
    return session.run(clean, {jsmfId: dry.__jsmf__})
      .then(() => session.run(update, {params: dry, jsmfId: dry.__jsmf__}))
      .then(v => { setAsStored(e, driver); return [e, v.records[0].get(0).identity]})
      .catch(err => Promise.reject(new Error(`Error with element: ${dry}`)))
  } else {
    const query = `CREATE (x:${classes.join(':')} {params}) RETURN (x)`
    return session.run(query, {params: dry})
      .catch(() => storeDuplicatedIdElement(classes, e, dry, session, driver))
      .then(v => { setAsStored(e, driver); return [e, v.records[0].get(0).identity]})
      .catch(err => Promise.reject(new Error(`Error with element: ${dry}`)))
  }
}


function saveRelationships(es, elemMap, reified, ownTypes, session, driver) {
  const relations = _.flatMap(es, e => saveElemRelationships(e, elemMap, reified, ownTypes, session, driver))
  return Promise.all(relations)
}

function saveElemRelationships(elt, elemMap, reified, ownTypes, session, driver) {
  const e = reified.get(uuid.unparse(jsmf.jsmfId(elt))) || elt
  const references = e.conformsTo().getAllReferences()
  const result = _.flatMap(references, (v, r) => saveElemRelationship(e, r, elemMap, reified, ownTypes, session, driver))
  const ct = e.conformsTo()
  if (jsmf.isJSMFClass(ct) && !_.includes(ct.superClasses, r.Meta)) {
    result.push(saveRelationship(e, 'conformsTo', ct, undefined, elemMap, reified, ownTypes, session, driver))
  }
  return result
}

function saveElemRelationship(e, ref, elemMap, reified, ownTypes, session, driver) {
  const associated = new Map(_.map(e.getAssociated(ref), a => [a.elem, a.associated]))
  const referenced = e[ref]
  return _.map(referenced, t => saveRelationship(e, ref, t, associated.get(t), elemMap, reified, ownTypes, session, driver))
}

function saveRelationship(source, ref, target, associated, elemMap, reified, ownTypes, session, driver) {
  const statements = `MATCH (s) WHERE id(s) in { sourceId }
                      MATCH (t) WHERE id(t) in { targetId }
                      MERGE (s) -[r:${ref}]-> (t)
                      ${associated ? 'ON CREATE SET r = { associated }' : ''}
                      RETURN r
                     `
  return Promise.all(_.map([source, associated, target], e => resolveId(e, elemMap, reified, ownTypes, session, driver)))
    .then(ids => Object.assign({sourceId: ids[0], targetId: ids[2]}, associated!==undefined?{associated: dryElement(associated)}:{})
    )
    .then(params => session.run(statements, params))
}


function storeDuplicatedIdElement(classes, e, dry, session, driver) {
  const newId = jsmf.generateId()
  e.__jsmf__.uuid = newId
  dry.__jsmf__ = uuid.unparse(newId)
  const query = `CREATE (x:${classes.join(':')} {params}) RETURN (x)`
  return session.run(query, {params: dry})
    .then(v => { setAsStored(e, driver); return [e, v.records[0].get(0).identity]})
    .catch(() => storeDuplicatedIdElement(classes, e, dry, session, driver))
}

function setAsStored(e,driver) {
  e.__jsmf__.storedIn = driver._url
}


function dryElement(e) {
  const attributes = e.conformsTo().getAllAttributes()
  const jid = uuid.unparse(jsmf.jsmfId(e))
  return _.reduce(attributes,
    function (res, a, k) {
      if (e[k] !== undefined) { res[k] = e[k] }
      return res
    },
    {__jsmf__: jid})
}

function resolveId(e, elemMap, reified, ownTypes, session, driver) {
  if (e === undefined) {return Promise.resolve(undefined)}
  let elem = reified.get(uuid.unparse(jsmf.jsmfId(e))) || e
  const elemId = elemMap.get(elem)
  if (elemId) {return Promise.resolve(elemId)}
  const re = r.reifyMetaElement(e, reified, ownTypes)[1]
  return saveElements(re, elemMap, reified, ownTypes, session, driver)
    .then(() => {
      elem = reified.get(uuid.unparse(jsmf.jsmfId(e))) || e
      return elemMap.get(elem)
    })
}


function gatherElements(m) {
  if (!(m instanceof jsmf.Model)) { return []}
  const result = m.elements()
  result.push(m)
  const mm = m.referenceModel
  return mm instanceof jsmf.Model
    ? result.concat(gatherElements(mm))
    : result
}

