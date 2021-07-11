const fs = require('fs')
const FILE = 'output/claims.json'

const claims = JSON.parse(fs.readFileSync(FILE))

console.log('# of claims:', claims.length)

