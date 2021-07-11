'use strict'

const { throws } = require('assert')
const config = require('config')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

class OutputWriter {
  constructor (baseDir) {
    this.baseDir = baseDir
    this.rotateEvery = config.get('outputWriter.rotateEvery')
    this.currentStream = fs.createWriteStream(path.join(baseDir, uuidv4()))
    this.addHandlers(this.currentStream)
    this.currentCount = 0
    this.paused = false
  }

  addHandlers (stream) {
    stream.on('drain', () => {
      this.paused = false
    })
  }

  writeRecord (record) {
    return new Promise((resolve, reject) => {
      if (this.paused) {
        return this.currentStream.once('drain', async () => {
          await this.writeRecord(record)
          resolve()
        })
      }
      const status = this.currentStream.write(JSON.stringify(record) + '\n')
      if (!status) {
        this.paused = true
      }
      resolve()
    })
  }

  rotateStream () {
    this.currentStream.end()
    this.currentStream = fs.createWriteStream(path.join(this.baseDir, uuidv4()))
    this.addHandlers(this.currentStream)
    this.currentCount = 0
  }
}

async function main () {
  console.log('Writing records...')
  const writer = new OutputWriter('./testdir')
  for (let i = 0; i < 10000; ++i) {
    await writer.writeRecord({
      index: i,
      value: uuidv4()
    })
  }
  console.log('Done!')
}

if (require.main === module) {
  console.log('Running as standalone script')
  main()
}

module.exports = OutputWriter
