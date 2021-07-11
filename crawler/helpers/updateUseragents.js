const { MongoClient } = require('mongodb')
const config = require('config')
const randomUseragent = require('random-useragent')

async function main () {
  const dbC = MongoClient.connect(config.get('mongo.url'))
  const db = dbC.db(config.get('mongo.dbName'))
  const requests = db.collection('requests')
  const result = await requests.updateMany({ handled: false }, {
    $set: {
      headers: {
        'User-Agent': randomUseragent.getRandom()
      }
    }
  })
  console.log(result)
}

main()
