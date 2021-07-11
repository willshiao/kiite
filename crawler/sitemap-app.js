'use strict'

// Must be done before require('apify')
const OUTPUT_DIR = require('./lib/init')()
const config = require('config')
const Apify = require('apify')
const Promise = require('bluebird')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const randomUseragent = require('random-useragent')
const { generatePseudoUrls, createDirStructure, uniqueKeyFromUrl } = require('./lib/helpers')
const { getAllAdditonalTypes, getMimeClass } = require('./lib/mimeTypes')
const ApifyHandler = require('./lib/handler')
const sitemapParser = Promise.promisifyAll(require('sitemap-stream-parser'))

const createMongoRequestQueue = require('./lib/mongoQueue')

const DIRS = createDirStructure(OUTPUT_DIR)
const sitemaps = JSON.parse(fsSync.readFileSync(path.join(OUTPUT_DIR, 'sitemap.json'), 'utf8'))
const seeds = fsSync.readFileSync(path.join(OUTPUT_DIR, 'domains.txt'), 'utf8').split('\n')

const BAD_YEAR_REGEX = /\/(20|19)[^2]\d\//

async function sitemapsToQueue (queue) {
  const numSites = Object.keys(sitemaps).length
  const maplessSites = new Set()
  for (const siteUrl in sitemaps) {
    if (sitemaps[siteUrl].length === 0) {
      maplessSites.add(siteUrl)
      delete sitemaps[siteUrl]
    }
  }
  console.log(`${maplessSites.length}/${numSites} do not have sitemaps.`)

  await Promise.map(Object.keys(sitemaps), async (siteUrl) => {
    const toInsert = []
    console.log('Getting articles from sitemap for', siteUrl)
    try {
      await sitemapParser.parseSitemapsPromise(sitemaps[siteUrl], (page) => {
        if (!page.text || ('lastMod' in page && !page.lastMod.startsWith('2020'))) return null
        if (BAD_YEAR_REGEX.test(page.text)) return null
        toInsert.push({
          url: page.text,
          uniqueKey: uniqueKeyFromUrl(page.text),
          userData: { ignoreLinks: true, lastMod: page.lastMod },
          headers: {
            'User-Agent': randomUseragent.getRandom()
          }
        })
      })
      if (toInsert.length === 0) {
        console.error('Failed to get any valid articles from sitemap for', siteUrl)
        maplessSites.add(siteUrl)
      } else {
        await queue.addRequests(toInsert)
        console.log('Done getting articles from sitemap for', siteUrl)
      }
    } catch (err) {
      console.error('Failed to get sitemap for', siteUrl)
      maplessSites.add(siteUrl)
    }
  }, { concurrency: 3 })
  return maplessSites
}

Apify.main(async () => {
  // const seeds = await getNewsGuardSeeds()
  const baseRequestQueue = await Apify.openRequestQueue()
  const MongoRequestQueue = createMongoRequestQueue(Object.getPrototypeOf(baseRequestQueue).constructor)
  const requestQueue = new MongoRequestQueue(baseRequestQueue.queueId, path.dirname(baseRequestQueue.localStoragePath), {})

  const pseudoUrls = generatePseudoUrls(seeds)
  // const seedUrls = _.flatten(seeds.map(host2Url))
  const maplessSites = await sitemapsToQueue(requestQueue)
  await Promise.all(Array.from(maplessSites).map(url => requestQueue.addRequest({ url, uniqueKey: uniqueKeyFromUrl(url) })))

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
