'use strict'

const got = require('got')
const config = require('config')
const mkdirp = require('mkdirp')
const fs = require('fs').promises
const Promise = require('bluebird')

mkdirp.sync('output')

async function searchApi (data) {
  const apiKey = config.get('apiKey')
  return got('https://factchecktools.googleapis.com/v1alpha1/claims:search', {
    searchParams: {
      key: apiKey,
      ...data
    },
    responseType: 'json'
  })
}

async function main () {
  let pageToken = null
  const queryData = {
    query: config.get('query'),
    languageCode: 'en',
    pageSize: 100
  }
  const out = []
  do {
    try {
      if (pageToken !== null) {
        queryData.pageToken = pageToken
      }
      const res = await searchApi(queryData)
      const { body } = res
      pageToken = body.nextPageToken || null
      body.claims.forEach(el => out.push(el))
      console.log('Page token:', pageToken)
      console.log(`Got ${body.claims.length} results.`)
    } catch (e) {
      console.error(e.response)
    }
    await Promise.delay(4000)
  } while (pageToken)
  await fs.writeFile('output/claims.json', JSON.stringify(out), 'utf8')
  console.log(`Done, ${out.length}`)
}

main()
