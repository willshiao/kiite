'use strict'

const config = require('config')
const { MongoClient } = require('mongodb')

class MongoOutputWriter {
  constructor (baseDir) {
    this.baseDir = baseDir
    this.currentCount = 0
    this.initializationPromise = this.initialize()
  }

  async initialize () {
    return new Promise((resolve, reject) => {
      MongoClient.connect(config.get('mongo.url'), (err, db) => {
        if (err) return reject(err)
        console.log('Connected to MongoDB.')
        this.db = db.db(config.get('mongo.dbName'))
        this.articles = this.db.collection('articles')
        resolve()
        // this.articles.ensureIndex('handled', (err2) => {
        //   if (err2) return reject(err2)
        //   resolve()
        // })
      })
    })
  }

  async writeRecord (record) {
    await this.articles.insertOne(record)
  }
}

module.exports = MongoOutputWriter
