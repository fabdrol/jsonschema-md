'use strict'

const Parser = require('./Parser')

new Parser({
  definitions: './schema/definitions.json',
  entry: './schema/signalk.json',
  output: './build',
  debug: true
})