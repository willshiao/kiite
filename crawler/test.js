'use strict'

const Apify = require('apify')

const pUrl = new Apify.PseudoUrl('http[s?]://[([A-Za-z0-9]+\\.)?]google.com[(/.*)?]')

const list = [
  'http://google.com/',
  'https://google.com/',
  'https://mail.google.com/',
  'https://mail.google.com',
  'http://google.com'
]

console.log(list.map(x => [x, pUrl.matches(x)]))
