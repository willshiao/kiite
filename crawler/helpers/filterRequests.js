const { MongoClient } = require('mongodb')
const config = require('config')

MongoClient.connect(config.get('mongo.url'), async (err, dbC) => {
  if (err) return console.error(err)
  const db = dbC.db(config.get('mongo.dbName'))
  const requests = db.collection('requests')
  const result = await requests.deleteMany({
    handled: false,
    url: {
      $regex: /\/videos\//
    }
  })
  console.log(result)
})
