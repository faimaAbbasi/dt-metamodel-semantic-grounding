/**
 * @license
 * ©2015-2016 Luxembourg Institute of Science and Technology All Rights Reserved
 * JavaScript Modelling Framework (JSMF)
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @author J.S. Sottet
 * @author N. Biri
 * @author A. Vagner
 */

'use strict'

const _ = require ('lodash')

/**
 * Crawl crawls la whole JSMF model from a given entry point
 *
 * @param {object} searchParameters  - The definition of how the model is crawled, the following object properties are inspected:
 * @param {Function} [searchParameters.predicate=_.constant(true)] - A predicate (a function that takes an object as parameter) that must be fullfilled by an object to be part of the result. If undefined, all the objects are accepted
 * @param {Number} [searchParameters.depth=-1] - the number of references to be followed befor we stop crawling, if we don't want to limit crawling, use -1.
 * @param {Function} [searchParameters.followIf=_.constant(true)] - A function that take an object and a reference as parameters, if the function is evaluate to true, we follow this reference, otherwise, we stop crawling this branch. If undefined, all the references are followed.
 * @param {boolean} [searchParameters.stopOnfirst=false] - Set if we continue to crawl the model when the expected predicate is found.
 * @param {boolean} [searchParameters.includeRoot=true] - include the entrypoint in the result.
 * @param {object} entrypoint - The entrypoint object to crawl the model.
 * @returns {List} The elements that fullfill the searchParameters
 * See unit tests for examples.
 */

function crawl(searchParameters, entrypoint) {
  const predicate = searchParameters['predicate'] || _.constant(true)
  let depth = searchParameters['depth']
  if (depth === undefined) { depth = -1 }
  const propertyFilter = searchParameters['followIf'] || _.constant(true)
  let includeRoot = searchParameters['includeRoot']
  if (includeRoot === undefined) { includeRoot = true }
  let stopOnFirst = searchParameters['stopOnFirst']
  if (stopOnFirst === undefined) { stopOnFirst = false }
  const startingNodes = includeRoot
    ? [crawlEntry(entrypoint, depth)]
    : _.map(nodeChildren(propertyFilter, entrypoint), x => crawlEntry(x, nextDepth(depth)))
  return _crawl(predicate, propertyFilter, stopOnFirst, startingNodes).result
}

function nextDepth(depth) {
  return depth > 0 ? depth - 1 : depth
}

function _crawl(predicate, propertyFilter, stopOnFirst, entrypoints) {
  const ctx = {visited: new Set(), result: []}
  while (!(_.isEmpty(entrypoints))) {
    const current = entrypoints.pop()
    const entrypoint = current.elem
    const depth = current.depth
    let children = []
    let found = false
    if (entrypoint !== undefined && !ctx.visited.has(entrypoint)) {
      ctx.visited.add(entrypoint)
      found = predicate(entrypoint)
      if (found) {
        ctx.result.push(entrypoint)
        if (stopOnFirst) { return ctx }
      }
      if (depth !== 0) {
        children = nodeChildren(propertyFilter, entrypoint)
      }
      const newDepth = nextDepth(depth)
      children = _.map(children, x => crawlEntry(x, newDepth))
    }
    entrypoints = entrypoints.concat(children)
  }
  return ctx
}

function nodeChildren(filter, entrypoint) {
  const refs = entrypoint.conformsTo().getAllReferences()
  return _(refs).map((v, ref) => filter(entrypoint, ref) ? entrypoint[ref] : [])
                .flatten()
                .value()
}

function crawlEntry(elem, depth) {
    return {elem, depth}
}

/**
 * Get all the modelingelements from a model that belongs to a class (according to their inheritance chain)
 * @param {Class} cls - The class we are looking for
 * @param {Model} model - The inspected model.
 * @param {boolean} [strict=false] - If strict is false, seek for instances of the clas or of any of its subclass. Otherwise, seek only exact instances of the class.
 */
function allInstancesFromModel (cls, model, strict) {
    const me = _.get(model, ['referenceModel', 'modellingElements'])
    if (_.isEmpty(me)) {
        const os = _(model.modellingElements).values().flatten().value()
        if (!strict)  {
            return _.filter(os,
                x => _(x.conformsTo().getInheritanceChain())
                      .map('__name')
                      .includes(cls.__name))
        } else {
            return _.filter(os, x=> x.conformsTo().__name === cls.__name)
        }
    } else if (!strict) {
        const clss = _(me).values().flatten().value()
        return _(clss).filter( x => (x.getInheritanceChain !== undefined)
                              && _.includes(x.getInheritanceChain(), cls))
                      .map('__name')
                      .map(x => model.modellingElements[x] || [])
                      .flatten()
                      .value()
    } else {
        return me[cls.__name]
    }
}

/**
 * Get all the modelingelements from a model that satisfies a predicate
 * @param {Function} predicate - A predicate (a function that takes an object as parameter) that must be fullfilled by an object to be part of the result.
 * @param {Model} model - The inspected model.
 * @returns {List} The elements of the model that verifies the predicate function
 */
function filterModelElements (predicate, model) {
    return _(model.modellingElements).values()
                                     .flatten()
                                     .filter(x => predicate(x))
                                     .value()
}

/**
 * Get the elements down a given path from a given entrypoint of a model.
 * @param {object} searchParameters - The parameters of the search. The following properties are inspected:
 * @param {List} path - The path to follow. A path is a list of reference names that must be followed. The last element can be an attribute name. If no value is given, the default value is the empty list
 * @param {Function} [searchParameters.predicate=_.constant(true)] - A predicate (a function that takes an object as parameter) that must be fullfilled by an object to be part of the result. If undefined, all the objects are accepted
 * @param {boolean} [searchParameters.targetOnly=true] - if true, we return only the objects at the end of the path otherwise, we also take objects we pass through during the search. Default value is 'true'.
 * @param {Symbol} - [searchParameters.searchMethod=DFS_All] - The searchMethod used to crawl the model (either {DFS_All}, {DFS_First}, {BFS_All}, or {BFS_First}).
 * @returns {List} The elements that fullfill the searchParameters
 */
function follow(searchParameters, entrypoint) {
    const path = searchParameters['path'] || []
    path.reverse()
    const predicate = searchParameters['predicate'] || _.constant(true)
    let targetOnly = searchParameters['targetOnly']
    if (targetOnly === undefined) { targetOnly = true }
    const method = searchParameters['searchMethod'] || DFS_All
    const entrypoints = [followEntry(entrypoint, path)]
    return _follow(predicate, method, targetOnly, entrypoints)
}

function followEntry(elem, path) {
    return {elem, path}
}

function _follow(predicate, method, targetOnly, entrypoints) {
  const acc = []
  while (!(_.isEmpty(entrypoints))) {
    const current = entrypoints.pop()
    const entrypoint = current.elem
    const path = current.path
    if ((!targetOnly || _.isEmpty(path)) && predicate(entrypoint)) {
      acc.push(entrypoint)
      if (stopOnFirst(method)) { return acc }
    }
    if (!(_.isEmpty(path))) {
      const pathElement = path.pop()
      if (_.isString(pathElement)) {
        let values = entrypoint[pathElement]
        if (values === undefined) {
          throw new Error(`Unsuppported method ${pathElement} for object ${entrypoint}`)
        }
        values = _.map(values, x => followEntry(x, path))
        entrypoints = isDFS(method)
          ? entrypoints.concat(values)
          : values.concat(entrypoints)
      } else if (pathElement instanceof Function) {
          if (pathElement(entrypoint)) {
            entrypoints.push(followEntry(entrypoint, path))
          }
      } else {
        throw new Error(`invalid path element ${pathElement}`)
      }
    }
  }
  return acc
}

/*********************
 * Predicate helpers *
 *********************/


/**
 * hasClass returns a function that checks if a given object belongs to the given JSMF Class.
 * @param {Class} cls - The expected Class.
 */
function hasClass(cls) {
  return (x => _.includes(x.conformsTo().getInheritanceChain(), cls))
}



/**************************
 * PropertyFilter helpers *
 **************************/


/**
 * A helper for the construction of the propertyFilter for @{allInstancesFromObject} and @{getObjectsFromObject}.
 * for a given clas, follows only the references provided in the corresponding map entry.
 */
function referenceMap(x) {
    return ((e, ref) => {
        const hierarchy = e.conformsTo().getInheritanceChain()
        return _.some(hierarchy, c => _.includes(x[c.__name], ref))
    })
}

/******************
 * Search Methods *
 ******************/

/**
 * - DFS_All: Deep First Search, get all the elements that match the predicate.
 */
const DFS_All = Symbol('DFS_All')

/**
 * BFS_All: Breadth First Search, get all the elements that match the predicate.
 */
const BFS_All = Symbol('BFS_All')

/**
 * DFS_First: Deep First Search, get the first element that matches the predicate.
 */
const DFS_First = Symbol('DFS_First')

/**
 * BFS_First: Breadth First Search, get the first element that matches the predicate.
 */
const BFS_First = Symbol('BFS_First')

function isDFS(m) {
    return _.includes([DFS_All, DFS_First], m)
}

function stopOnFirst(m) {
    return _.includes([DFS_First, BFS_First], m)
}

module.exports = {
    crawl,
    follow,
    allInstancesFromModel,
    filterModelElements,
    DFS_All,
    DFS_First,
    BFS_All,
    BFS_First,
    hasClass,
    referenceMap
}
