'use strict'

// Must be done before require('apify')
const OUTPUT_DIR = require('./lib/init')('data_test/tmp')
const Apify = require('apify')
const fsOld = require('fs')
const fs = require('fs').promises
const mkdirp = require('mkdirp')
const zlib = require('zlib')
const path = require('path')
const cheerio = require('cheerio')
const config = require('config')
const crypto = require('crypto')
const { recordIterator } = require('node-warc')
const OutputWriter = require('./lib/outputWriter')

const { textRelatedToCovid, isTrustworthySource } = require('./lib/helpers')

const OUT_DIR = './output'
const FILE_DIR = path.join(OUTPUT_DIR, 'files')
mkdirp.sync(FILE_DIR)
mkdirp.sync(OUT_DIR)
const writer = new OutputWriter(OUT_DIR)

let cnt = 0

function shouldSkip (record) {
  if (record.warcHeader['WARC-Type'] !== 'response') return true
  if (config.get('warcTrustworthyOnly')) {
    return !isTrustworthySource(record.warcHeader['WARC-Target-URI'])
  }
  return false
}

// await Apify.pushData({
//   url: request.url,
//   html: body,
//   text: pageText,
//   images: imgInfo,
//   scripts: scriptInfo
// })
function extractInfo (record) {
  const header = record.warcHeader
  const html = record.content.toString('utf8')

  const $ = cheerio.load(html)
  const text = Apify.utils.htmlToText($)
  const covidRelated = textRelatedToCovid(text)
  if (!covidRelated) return null

  // const images = $('img')
  //   .toArray()
  //   .map(el => $(el).attr('src'))
  //   .filter(x => x)
  //   .map(url => ({ url }))

  record.content.toString('utf8')
  return {
    url: header['WARC-Target-URI'],
    crawledAt: header['WARC-Date'],
    html,
    text
    // images
  }
}

async function iterateRecords (warcStream, outDir) {
  for await (const record of recordIterator(warcStream)) {
    cnt++
    if (cnt % config.get('warcPrintInterval') === 0) {
      console.log(`Processed ${cnt} records`)
    }
    if (shouldSkip(record)) continue
    const fileInfo = extractInfo(record)
    // if (fileInfo !== null) await writeToFile(outDir, fileInfo)
    if (fileInfo !== null) await writer.writeRecord(fileInfo)
  }
}

async function writeToFile (outDir, data, hashedWrite = true) {
  const hash = crypto.createHash('md5')
    .update(data.url + data.html)
    .digest('hex')
  // Should split in roughly 16^4 = 64K directories
  const targetDir = hashedWrite
    ? path.join(outDir, hash.slice(0, 4))
    : outDir
  await mkdirp(targetDir)
  await fs.writeFile(path.join(targetDir, `${hash}.json`), JSON.stringify(data))
}

async function main () {
  await iterateRecords(
    fsOld.createReadStream()
      .pipe(zlib.createGunzip())
    , OUT_DIR)
  console.log('Done:', cnt)
}

function workerFunction ({ outputDir, targetFile }, cb) {
  // console.log(outputDir)
  mkdirp.sync(outputDir)
  iterateRecords(fsOld.createReadStream(targetFile).pipe(zlib.createGunzip()), outputDir)
    .then(() => {
      cb(null, cnt)
    })
    .catch(err => cb(err, null))
}

if (require.main === module) {
  console.log('Running as standalone script')
  main()
}

module.exports = workerFunction
