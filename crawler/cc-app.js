'use strict'

const workerFarm = require('worker-farm')
const config = require('config')
const workers = workerFarm(config.get('worker.options'), require.resolve('./cc-worker'))
const path = require('path')
const fs = require('fs').promises
const awsCli = require('aws-cli-js')
const Aws = awsCli.Aws
const aws = new Aws()

const CRAWL_REGEX = /(crawl-data.+\.gz)$/

async function getCrawlFilenames () {
  const res = await aws.command('s3 ls --recursive s3://commoncrawl/crawl-data/CC-NEWS/ --no-sign-request')
  console.log(res.raw)
  const filenames = res.raw.split('\n')
    .map(line => {
      const matches = line.match(CRAWL_REGEX)
      if (matches === null) return null
      return matches[0]
    })
    .filter(x => x !== null)
    .filter(x => x.startsWith('crawl-data/CC-NEWS/2020'))
  console.log(filenames.length)
}

async function processFiles (files) {
  return new Promise((resolve, reject) => {
    let ret = 0

    files.forEach(file => {
      const workerData = {
        outputDir: config.get('warcOutputDir'),
        targetFile: file
      }
      workers(workerData, (err, out) => {
        if (err !== null) return console.error('Error processing', file, err)
        console.log(`Worker finished ${file} (${out} lines)`)
        if (++ret === files.length) {
          console.log('Done w/ everything!')
          resolve()
        }
      })
    })
  })
}

const DIRS = config.get('warcDirs').length > 0
  ? config.get('warcDirs')
  : ['lib']

async function main () {
  for (let i = 0; i < DIRS.length; ++i) {
    const dir = DIRS[i]
    const files = (await fs.readdir(dir))
      .map(fn => path.join(dir, fn))

    console.log(`========== Processing dir: ${dir} ==========`)
    await processFiles(files)
  }
  workerFarm.end(workers)
}

main()
