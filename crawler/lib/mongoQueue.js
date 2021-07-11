const { MongoClient } = require('mongodb')
const { Request } = require('apify')
const config = require('config')
const crypto = require('crypto')

function getRequestId (uniqueKey) {
  const str = crypto
    .createHash('md5')
    .update(uniqueKey)
    .digest('base64')
    .replace(/(\+|\/|=)/g, '')
  return str.substr(0, 15)
}

function createMongoRequestQueue (baseClass) {
  class MongoRequestQueue extends baseClass {
    constructor (queueId, localStorageDir, { hashKeyRegex = null, reverseOrder = false }, shouldFilterFunction = null) {
      super(queueId, localStorageDir)
      // console.log('Initialized with ', { queueId, localStorageDir })
      this.hashKeyRegex = hashKeyRegex
      this.reverseOrder = reverseOrder
      this.initializationPromise = this._initialize()
      if (shouldFilterFunction === null) {
        this.shouldFilterFunction = () => false
      } else {
        this.shouldFilterFunction = shouldFilterFunction
      }
    }

    async _initialize () {
      const db = await MongoClient.connect(config.get('mongo.url'))
      this.db = db.db(config.get('mongo.dbName'))
      this.requests = this.db.collection('requests')
      await this.requests.createIndexes([
        { // Compound index
          key: {
            handled: 1,
            pending: 1,
            addedAt: 1
          }
        },
        { // Compound index
          key: {
            handled: 1,
            pending: 1,
            addedAt: -1,
            hashKey: 1,
            'userData.ignoreLinks': 1
          }
        },
        { key: { handled: 1 } },
        { key: { pending: 1 } },
        { key: { hashKey: 1 } },
        { key: { addedAt: 1 } },
        { key: { addedAt: -1 } },
        { key: { hashKey: -1 } },
        { key: { 'userData.ignoreLinks': 1 } }
      ])
    }

    async addRequests (requests) {
      await this.initializationPromise
      requests = requests.map(request => {
        const newRequest = (request instanceof Request) ? request : new Request(request)
        const hashKey = getRequestId(newRequest.uniqueKey)
        return {
          ...newRequest,
          hashKey,
          handled: false,
          pending: false,
          addedAt: new Date()
        }
      })
      return this.requests.insertMany(requests)
    }

    async addRequest (request, opts = {}) {
      await this.initializationPromise
      const newRequest = request instanceof Request ? request : new Request(request)
      const hashKey = getRequestId(newRequest.uniqueKey)
      // console.log('Request: ', newRequest)
      const res = await this.requests.updateOne({ hashKey }, {
        $setOnInsert: {
          ...newRequest,
          hashKey,
          handled: false,
          pending: false,
          addedAt: new Date()
        }
      }, { upsert: true })
      if (!res.upserted) {
        const existing = await this.requests.findOne({ hashKey })
        // console.log('Got: ', existing)
        existing.id = existing._id
        return {
          wasAlreadyHandled: existing.handled,
          wasAlreadyPresent: true,
          requestId: existing._id,
          request: existing
        }
      }
      newRequest.id = res.insertedId
      // console.log('Res: ', newRequest.url, res.result)
      // console.log('addRequest called with', newRequest)
      return {
        wasAlreadyHandled: false,
        wasAlreadyPresent: false,
        request: newRequest,
        requestId: newRequest.id
      }
    }

    async getRequest (requestId) {
      // console.log('getRequest called with', requestId)
      await this.initializationPromise
      return this.findOne({ _id: requestId })
    }

    async fetchNextRequest () {
      await this.initializationPromise
      // console.log('fetchNextRequest called')
      const query = { pending: false, handled: false }
      if (this.hashKeyRegex !== null) {
        query.hashKey = { $regex: this.hashKeyRegex }
        query['userData.ignoreLinks'] = true
      }

      const sorting = { sort: { addedAt: 1 } }
      if (this.reverseOrder) sorting.sort.addedAt = -1
      const newDoc = await this.requests.findOneAndUpdate(query,
        { $set: { pending: true } },
        sorting)

      if (newDoc === null || newDoc.value === null) return null
      const newRequest = new Request(newDoc.value)
      newRequest.id = newDoc.value._id

      const shouldFilter = this.shouldFilterFunction(newRequest)
      if (shouldFilter) {
        await this.markRequestFiltered(newRequest)
        return this.fetchNextRequest()
      }
      // console.log('Got doc:', newRequest)
      return newRequest
    }

    async markRequestFiltered (request) {
      await this.initializationPromise
      await this.requests.findOneAndUpdate({ _id: request.id },
        { $set: { pending: false, handled: true, filtered: true } })
    }

    async markRequestHandled (request) {
      await this.initializationPromise
      // console.log('markRequestHandled called with:', request)
      await this.requests.findOneAndUpdate({ _id: request.id },
        { $set: { pending: false, handled: true } })
    }

    async reclaimRequest (request, opts = {}) {
      await this.initializationPromise
      console.log('reclaimRequest called with:', request)
      await this.requests.replaceOne({ _id: request.id }, request)
    }

    async isEmpty () {
      await this.initializationPromise
      const query = { handled: false }
      if (this.hashKeyRegex !== null) {
        query.hashKey = { $regex: this.hashKeyRegex }
        query['userData.ignoreLinks'] = true
      }
      const hasDocs = await this.requests.countDocuments(query, { limit: 1 })
      return hasDocs === 0
    }

    async isFinished () {
      await this.initializationPromise
      // console.log('isFinished called')
      return this.isEmpty()
    }

  }
  return MongoRequestQueue
}

module.exports = createMongoRequestQueue
