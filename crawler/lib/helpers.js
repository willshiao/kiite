/**
 * Miscellanous helper functions
 */
'use strict'

const path = require('path')
const config = require('config')
const mkdirp = require('mkdirp')
const Apify = require('apify')
const got = require('got')
const fs = require('fs')

const TRUSTWORTHY_SITES = fs.readFileSync(path.join(__dirname, '../real_sites.txt'), 'utf8')
  .split('\n')
  .filter(x => x.length > 0)
const TRUSTWORTHY_REGEX_STR = '^(?:[a-zA-Z0-9]*\\.){0,4}(?:' + TRUSTWORTHY_SITES.map(escapeRegex).join('|') + ')'
const TRUSTWORTHY_REGEX = new RegExp(TRUSTWORTHY_REGEX_STR, 'i')
// Warm up the regex
TRUSTWORTHY_REGEX.test('cnn.com')

function generatePseudoUrls (hosts) {
  const output = []
  hosts.forEach(host => {
    const pUrl = `http[s?]://[([A-Za-z0-9]+\\.)?]${host}[(/.*)?]`
    output.push(new Apify.PseudoUrl(pUrl))
  })
  return output
}

function host2Url (host) {
  if (host.includes('http:')) return host
  return [
    `http://${host}`,
    `https://www.${host}`
  ]
}

function host2PlainUrl (host) {
  if (host.includes('http:')) return host
  return `http://${host}`
}

async function usesCloudflare (url) {
  const response = await got(url)
  if ('cf-ray' in response.headers) return true
  return false
}

/**
 * Sync function to create dir structure needed for app
 * Returns an object representing the directories created
 * @param {String} dirName
 * @returns {Object}
 */
function createDirStructure (dirName) {
  const output = {}
  for (const key in config.get('dirs')) {
    output[key] = path.join(dirName, config.get(`dirs.${key}`))
    mkdirp.sync(output[key])
  }
  console.log('Output:', output)
  return output
}

const covidRegexes = [
  /(epidemic|pandemic|flu|covid)/i,
  /(?:corona)? ?virus/i
]
function textRelatedToCovid (pageText) {
  return covidRegexes.some(r => r.test(pageText))
}

function uniqueKeyFromUrl (urlStr) {
  const url = new URL(urlStr)
  // Ignore parameters if it's a static site
  if (url.pathname.endsWith('.html')) {
    return url.hostname + url.pathname
  }
  return url.hostname + url.pathname + url.search
}

function isTrustworthySource (url) {
  const hostname = new URL(url).hostname
  // return TRUSTWORTHY_SITES.has(hostname)
  // return TRUSTWORTHY_SITES
  //   .some(site => hostname.includes(site))
  return TRUSTWORTHY_REGEX.test(hostname)
}

function escapeRegex (string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

async function main () {
  const sources = ['https://test.cnn.com', 'https://subdomain.sub.sub.reuters.com', 'https://fox.com', 'https://bs.com', 'http://mobilesyrup.com', 'http://universal.com',
  'https://noticierouniversal.com', 'https://google.com'
  ]
  
  sources.forEach(source => {
    console.time('superRegex')
    const testRes = TRUSTWORTHY_REGEX.test(new URL(source).hostname)
    console.timeEnd('superRegex')
    console.time('normal')
    const sourceRes = isTrustworthySource(source)
    console.timeEnd('normal')
    console.log(source, testRes, sourceRes)
  })
  
  // console.log('superRegexStr: ', superRegexStr)
}

if (require.main === module) {
  console.log('Running as standalone script')
  main()
}

module.exports = {
  generatePseudoUrls,
  createDirStructure,
  host2Url,
  host2PlainUrl,
  uniqueKeyFromUrl,
  textRelatedToCovid,
  isTrustworthySource,
  usesCloudflare
}
