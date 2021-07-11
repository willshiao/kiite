'use strict'

// Must be done before require('apify')
const OUTPUT_DIR = require('./lib/init')()
const config = require('config')
const Apify = require('apify')
const Promise = require('bluebird')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { getNewsGuardSeeds } = require('./helpers/getSeeds')
const { generatePseudoUrls, createDirStructure, uniqueKeyFromUrl } = require('./lib/helpers')
const { getAllAdditonalTypes, getMimeClass } = require('./lib/mimeTypes')
const ApifyHandler = require('./lib/handler')

const DIRS = createDirStructure(OUTPUT_DIR)
const seeds = fsSync.readFileSync(path.join(OUTPUT_DIR, 'domains.txt'), 'utf8').split('\n')
const createMongoRequestQueue = require('./lib/mongoQueue')

Apify.main(async () => {
  const baseRequestQueue = await Apify.openRequestQueue()
  const MongoRequestQueue = createMongoRequestQueue(Object.getPrototypeOf(baseRequestQueue).constructor)
  const requestQueue = new MongoRequestQueue(baseRequestQueue.queueId, path.dirname(baseRequestQueue.localStoragePath), {})
  const pseudoUrls = generatePseudoUrls(seeds)

  const handler = new ApifyHandler(DIRS, requestQueue, pseudoUrls)
  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    async handlePageFunction (pageInfo) {
      const { request, contentType } = pageInfo

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
