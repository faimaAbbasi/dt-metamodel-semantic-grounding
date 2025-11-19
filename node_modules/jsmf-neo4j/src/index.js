/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet, N. Biri
*/

/* **************************************
TODO:
    - add logger
    - make a version with batch processing
    - read from DB
    - update nodes/model
*************************************** */
'use strict'

const neo4j = require('neo4j-driver').v1
    , encode = require('./encode')
    , decode = require('./decode')

let driver

module.exports = function init(url, user, password) {
  if (user !== undefined && password !== undefined) {
    driver = neo4j.driver(url, neo4j.auth.basic(user, password),  {trust: 'TRUST_ON_FIRST_USE', encrypted: true})
  } else if (user === undefined && password === undefined) {
    driver = neo4j.driver(url)
  } else  {
    throw new Error('Invalid user/password pair')
  }
}

module.exports.close = () => driver.close()

module.exports.initStorage = () => {
  const existence = 'CREATE CONSTRAINT ON (a:JSMF) ASSERT exists(a.__jsmf__)'
  const uniqueness = 'CREATE CONSTRAINT ON (a:JSMF) ASSERT a.__jsmf__ IS UNIQUE'
  const session = driver.session()
  session.run([existence, uniqueness].join(' '))
}

module.exports.saveModel = function saveModel(m, ownTypes) {
  return encode.saveModel(m, ownTypes, driver)
}

module.exports.loadModelByName = module.exports.loadModelFromName = function loadModelFromName(name, mm, ownTypes) {
  return decode.loadModelFromName(name, mm, ownTypes, driver)
}

module.exports.loadModelById = module.exports.loadModelFromId = function loadModelFromId(mId, mm, ownTypes) {
  return decode.loadModelFromId(mId, mm, ownTypes, driver)
}
