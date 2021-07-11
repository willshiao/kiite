'use strict'

module.exports = {
  dirs: {
    script: 'scripts',
    image: 'images',
    apify: 'apify',
    output: 'output'
  },
  mongo: {
    url: 'mongodb://localhost:27017',
    dbName: 'covidCrawl'
  },
  outputWriter: {
    // If enabled, will write multiple pages to a single file
    compact: true,
    rotateEvery: 25000
  },
  siteBlacklist: [
    // Too big to crawl
    'reddit.com',
    '4chan.org',
    '8ch.net',
    // Not news sites:
    'C19Study.com',
    'C19HCQ.com',
    'HCQTrial.com',
    'greenmedinfo.com',
    // Video sites:
    'brighteon.com'
  ],
  warcDirs: [],
  warcOutputDir: './output',
  warcTrustworthyOnly: true,
  warcPrintInterval: 10000,
  worker: {
    options: {
      maxConcurrentWorkers: 32
    }
  },
  // If the URL contains this substring, ignore it
  urlBlacklist: [
  ],
  // Whether or not the crawler should save pages not
  // related to covid-19
  saveCovidOnly: true,
  downloadScripts: false,
  downloadImages: false,
  apify: {
    maxRequestsPerCrawl: 50,
    minConcurrency: 2,
    maxConcurrency: 1000
  },
  // Whether or not to only include American sites
  americaOnly: true,
  trustworthySites: [
    'bbc.com',
    'reuters.com',
    'economist.com',
    'latimes.com',
    'nytimes.com',
    'npr.org',
    'washingtonpost.com',
    'time.com',
    'wsj.com',
    'seattletimes.com',
    'denverpost.com',
    'kansascity.com',
    'cnn.com'
  ]
}
