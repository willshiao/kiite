'use strict'

// Common MIME types that can be processed
const types = {
  image: new Set([
    'image/svg+xml',
    'image/bmp',
    'image/png',
    'image/gif',
    'image/jpeg',
    'image/webp',
    'image/x-icon'
  ]),
  html: new Set([
    'text/html',
    'application/xhtml+xml'
  ]),
  script: new Set([
    'application/javascript',
    'text/javascript',
    'text/x-c++',
    'application/x-javascript'
  ])
}

function getMimeClass (mimeType) {
  for (const key in types) {
    if (types[key].has(mimeType)) return key
  }
  return 'unknown'
}

function getAllAdditonalTypes () {
  const output = []
  for (const key in types) {
    if (key === 'html') continue
    output.push(...types[key])
  }
  return output
}

module.exports = {
  getMimeClass,
  getAllAdditonalTypes
}
