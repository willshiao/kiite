'use strict'

const fs = require('fs').promises
const axios = require('axios')
const cheerio = require('cheerio')
const _ = require('lodash')
const config = require('config')

const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{1,8}$/
const DOMAIN_BLACKLIST = new Set(config.get('siteBlacklist'))

async function getNewsGuardSeeds () {
  const res = await axios.get('https://www.newsguardtech.com/coronavirus-misinformation-tracking-center')
  const $ = cheerio.load(res.data)
  let links;
  if (config.get('americaOnly')) {
    links = $('p:contains("United States")')
      .next()
      .find('li')
  } else {
    links = $('li')
  }
  links = links
    .map(function () {
      const txt = $(this).text()
      return txt.substring(txt.indexOf('('))
        .trim()
        .toLowerCase()
    })
    .get()
    .filter(x => DOMAIN_REGEX.test(x))
  return _.uniq(links)
    .filter(l => !DOMAIN_BLACKLIST.has(l))
}

async function main () {
  const seeds = await getNewsGuardSeeds()
  console.log('Got seeds:', seeds)
  await fs.writeFile('links.txt', seeds.join('\n'), 'utf8')
  console.log('Wrote to links.txt')
}

if (require.main === module) {
  console.log('Running as standalone script')
  main()
}

module.exports = { getNewsGuardSeeds }