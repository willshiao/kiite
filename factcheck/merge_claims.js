'use strict'

const fs = require('fs').promises
const Promise = require('bluebird')

async function main () {
  const data = await Promise.map(['./output/claims.json', './output/claims2.json', './output/claims3.json'], async (item) => {
    const contents = await fs.readFile(item, 'utf8')
    return JSON.parse(contents)
  })
  const urlMap = {}
  let dupCount = 0

  data.forEach(pieces => {
    pieces.forEach(item => {
      const itemKey = item.text + '|' + JSON.stringify(item.claimReview)
      if (itemKey in urlMap) {
        console.log('Item key already exists in map: ', itemKey)
        // console.log(item)
        dupCount++
        return false
      }
      urlMap[itemKey] = item
    })
  })
  console.log(`Found ${dupCount} duplicates!`)
  await fs.writeFile('./output/output_all.json', JSON.stringify(Object.values(urlMap)), 'utf8')
}

main()
