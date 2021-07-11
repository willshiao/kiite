'use strict'

// Must be done before require('apify')
const OUTPUT_DIR = require('./lib/init')()
const config = require('config')
const Apify = require('apify')
const got = require('got')
const _ = require('lodash')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const Promise = require('bluebird')
const { getNewsGuardSeeds } = require('./helpers/getSeeds')
const { generatePseudoUrls, createDirStructure, host2PlainUrl } = require('./lib/helpers')
const { getAllAdditonalTypes, getMimeClass } = require('./lib/mimeTypes')
const sitemapParser = Promise.promisifyAll(require('sitemap-stream-parser'))

const DIRS = createDirStructure(OUTPUT_DIR)

async function main () {
  const seeds = (await fs.readFile('./real_sites.txt', 'utf8')).split('\n')
  const seedsDir = path.join(OUTPUT_DIR, 'domains.txt')
  if (!fsSync.existsSync(seedsDir)) {
    // Save seeds
    await fs.writeFile(seedsDir, seeds.join('\n'))
  }
  const seedUrls = _.flatten(seeds.map(host2PlainUrl))
  const sitemapLookup = {}

  await Promise.map(seedUrls, async (baseUrl) => {
    console.log('Getting sitemaps for', baseUrl)
    try {
      const urls = await sitemapParser.sitemapsInRobotsAsync(`${baseUrl}/robots.txt`)
      if (!urls || urls.length === 0) {
        console.error(`No sitemap found for "${baseUrl}"`)
      } else {
        console.log('Got sitemaps for ', baseUrl, urls)
        if (baseUrl in sitemapLookup) {
          sitemapLookup[baseUrl].push(...urls)
        } else {
          sitemapLookup[baseUrl] = urls
        }
        return urls
      }
      // return sitemaps.parseSitemapsAsync(urls, )
    } catch (err) {
      console.error(`No sitemap found for "${baseUrl}"`)
    }
    console.log(`Trying alternate method for "${baseUrl}"`)
    // Backup methods
    await Promise.mapSeries(['sitemap_index.xml', 'sitemap.xml', 'wp-sitemap.xml'], async (suffix) => {
      try {
        const testUrl = `${baseUrl}/${suffix}`
        await got(testUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0' },
          timeout: 30000
        })
        if (baseUrl in sitemapLookup) {
          sitemapLookup[baseUrl].push(testUrl)
        } else {
          sitemapLookup[baseUrl] = [testUrl]
        }
        console.log('[!] Found sitemap for', baseUrl, ' at ', testUrl)
        await Promise.delay(Math.floor(Math.random() * 1000))
        return [testUrl]
      } catch (err) {
        // Do nothing
      }
    })
    sitemapLookup[baseUrl] = []
  }, { concurrency: 5 })
  await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify(sitemapLookup))
}

main()
