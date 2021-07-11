'use strict'

// Must be done before require('apify')
const OUTPUT_DIR = require('./lib/init')()
const config = require('config')
const Apify = require('apify')
const _ = require('lodash')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { getNewsGuardSeeds } = require('./helpers/getSeeds')
const { generatePseudoUrls, createDirStructure, host2Url } = require('./lib/helpers')
const { getAllAdditonalTypes, getMimeClass } = require('./lib/mimeTypes')
const ApifyHandler = require('./lib/handler')
const createMongoRequestQueue = require('./lib/mongoQueue')

const DIRS = createDirStructure(OUTPUT_DIR)

Apify.main(async () => {
  const seeds = await getNewsGuardSeeds()
  const baseRequestQueue = await Apify.openRequestQueue()
  const MongoRequestQueue = createMongoRequestQueue(Object.getPrototypeOf(baseRequestQueue).constructor)
  const requestQueue = new MongoRequestQueue(baseRequestQueue.queueId, path.dirname(baseRequestQueue.localStoragePath))

  // Object.setPrototypeOf(MongoRequestQueue, baseRequestQueue)
  // Object.defineProperty(MongoRequestQueue, 'prototype', {
  //   value: baseRequestQueue.prototype,
  //   writable: false,
  //   configurable: true
  // })
  // MongoRequestQueue.prototype = baseRequestQueue.prototype

  const seedsDir = path.join(OUTPUT_DIR, 'domains.txt')
  if (!fsSync.existsSync(seedsDir)) {
    // Save seeds
    await fs.writeFile(seedsDir, seeds.join('\n'))
  }
  const pseudoUrls = generatePseudoUrls(seeds)
  // const requestQueue = new MongoRequestQueue()
  const seedUrls = _.flatten(seeds.map(host2Url))
  await Promise.all(seedUrls.map(url => requestQueue.addRequest({ url })))

  const handler = new ApifyHandler(DIRS, requestQueue, pseudoUrls)
  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    async handlePageFunction (pageInfo) {
      // const { request, response, body, contentType, $ } = pageInfo
      // console.log('Request:', request)
      // console.log('contentType:', contentType)
      const { request, contentType } = pageInfo
      // console.log(request)

      const skipPage = config.get('urlBlacklist')
        .some(urlSubstr => request.url.includes(urlSubstr))
      if (skipPage) return null

      const mimeClass = getMimeClass(contentType.type)
      if (mimeClass === 'html') {
        await handler.handleHtml(pageInfo)
      } else if (mimeClass === 'image') {
        await handler.handleImage(pageInfo)
      } else if (mimeClass === 'script') {
        await handler.handleScript(pageInfo)
      } else {
        console.log(`WARNING: No handler for MIME type "${contentType.type}"`)
      }
    },
    additionalMimeTypes: getAllAdditonalTypes(),
    handleFailedRequestFunction ({ error }) {
      console.error(error)
    },
    ...config.get('apify')
  })
  await crawler.run()
})
