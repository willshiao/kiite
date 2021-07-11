'use strict'

const Apify = require('apify')
const fs = require('fs').promises
const path = require('path')
const config = require('config')
const { textRelatedToCovid, uniqueKeyFromUrl } = require('./helpers')
const OutputWriter = require('./outputWriter')

class ApifyHandler {
  constructor (dirs, requestQueue, pseudoUrls) {
    this.dirs = dirs
    this.requestQueue = requestQueue
    this.pseudoUrls = pseudoUrls
    this.compact = config.get('outputWriter.compact')
    if (this.compact) {
      this.outputWriter = new OutputWriter(dirs.output)
    }
  }

  async handleImage ({ request, body, contentType }) {
    if (config.get('downloadImages')) {
      const imgDir = this.dirs.image
      await fs.writeFile(path.join(imgDir, `image_${request.id}.img`), body)
    }
  }

  async handleScript ({ request, body, contentType }) {
    if (config.get('downloadScripts')) {
      const scriptDir = this.dirs.script
      await fs.writeFile(path.join(scriptDir, `script_${request.id}.js`), body)
    }
  }

  async enqueueAndReturnInfo (baseUrl, relUrl) {
    // TODO: catch invalid URL errors
    try {
      const url = new URL(relUrl, baseUrl).href
      const { requestId } = await this.requestQueue.addRequest({ url })
      return {
        inline: false,
        id: requestId,
        url
      }
    } catch (err) {
      // Likely invalid URL
      console.error('URL error: ', err)
      return null
    }
  }

  async pushData (data) {
    if (this.compact) {
      return this.outputWriter.writeRecord(data)
    }
    return Apify.pushData(data)
  }

  async handleHtml ({ request, response, body, $ }) {
    const effectiveUrl = request.loadedUrl || request.url
    const pageText = Apify.utils.htmlToText($)

    let relatedToCovid = true
    if (config.get('saveCovidOnly')) {
      relatedToCovid = textRelatedToCovid(pageText)
    }

    if (relatedToCovid) {
      let imgInfo = []
      if (config.get('downloadImages')) {
        imgInfo = (await Promise.all($('img')
          .toArray()
          .map(el => $(el).attr('src'))
          .filter(x => x)
          .map(x => this.enqueueAndReturnInfo(effectiveUrl, x))))
          .filter(x => x !== null)
      }

      let scriptInfo = []
      if (config.get('downloadScripts')) {
        $('script')
          .each((__, el) => {
            const $el = $(el)
            const src = $el.attr('src')
            if (src) {
              return scriptInfo.push(this.enqueueAndReturnInfo(effectiveUrl, src))
            }
            const contents = $el.html()
            scriptInfo.push({
              inline: true,
              source: contents
            })
          })
      }
      scriptInfo = (await Promise.all(scriptInfo))
        .filter(x => x !== null)

      await this.pushData({
        url: request.url,
        html: body,
        text: pageText,
        images: imgInfo,
        scripts: scriptInfo
      })
    }

    if (request.userData && request.userData.ignoreLinks) return null
    await Apify.utils.enqueueLinks({
      $,
      requestQueue: this.requestQueue,
      pseudoUrls: this.pseudoUrls,
      baseUrl: effectiveUrl,
      transformRequestFunction (request) {
        request.uniqueKey = uniqueKeyFromUrl(request.url)
        return request
      }
    })
  }
}

module.exports = ApifyHandler
