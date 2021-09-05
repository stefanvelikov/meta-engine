const core = require('@actions/core')
const fetch = require('node-fetch')

let site = null

function init () {
  site = core.getInput('site')
}

async function fetchIndex () {
  const response = await fetch(site)
  const body = await response.text()
  return body
}

async function fetchCSS (index) {
  const cssMatch = index.match(/<link href="(.*\/.*\.webflow\.[a-z0-9]+.css)".*\/>/)
  if (!cssMatch) {
    throw new Error('CSS file not found')
  }

  const cssURL = cssMatch[1]

  const response = await fetch(cssURL)
  const css = await response.text()
  return css
}

async function main () {
  init()
  const index = await fetchIndex()
  const css = await fetchCSS(index)
  console.log(css)
}

main()
  .then(() => {
    console.log('Executed successfully')
  })
  .catch((error) => {
    console.error(error)
  })
