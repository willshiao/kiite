/**
 * Script containing the initialization function.
 * Should not import Apify, as it sets env. variables
 */
'use strict'

const config = require('config')
const path = require('path')

module.exports = function (overrideDir = null) {
  if (overrideDir === null && !process.env.STORAGE_DIR && process.argv.length < 3) {
    console.error('STORAGE_DIR argument required')
    process.exit(1)
  }

  const outputDir = (overrideDir === null)
    ? process.env.STORAGE_DIR || process.argv[2]
    : overrideDir
  process.env.APIFY_LOCAL_STORAGE_DIR = path.join(outputDir, config.get('dirs.apify'))
  return outputDir
}
