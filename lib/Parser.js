'use strict'

const _ = require('lodash')
const fs = require('mz/fs')
const path = require('path')
const parser = require('json-schema-load-tree').default
const pick = require('deep-pick')

class Parser {
  constructor (opts) {
    this.options = _.defaults(opts, {
      definitions: './schema/definitions.json',
      entry: './schema/signalk.json',
      output: './build',
      debug: false, 
      cwd: process.cwd(),
      encoding: 'utf-8'
    })

    this.debug = () => {}
    this.tree = {}
    this.definitions = {}
    this.files = []

    this.parseOptions()
    this.parse()
  }

  parse () {
    /*
     * 1. Parse the tree
     * 2. Traverse the tree, find the path for each property
     * 3. Create a list of paths
     */

    const schema = require(this.options.entry)

    return parser(schema)
    .then(files => {
      Object.keys(files).forEach(key => {
        let k = key.replace('https://signalk.github.io/specification/schemas/', '')
        k = k.replace('#', '')
        files[k] = files[key]
        delete files[key]
      })

      this.files = files
      return files['signalk.json']
    })
    .then(signalk => {
      return this.parseReferences(signalk, [])
    })
    .then(parsed => {
      console.log(JSON.stringify(parsed, null, 2))
    })
    .catch(err => {
      console.error(err.message)
      process.exit(1)
    })
  }

  parseReferences (schema, pathArray) {
    const handleProperties = (property, key, object) => {
      pathArray.push(key)
      property._path = `/${pathArray.join('/')}`

      if (typeof property['$ref'] !== 'undefined') {
        let filename = property['$ref']
            filename = filename.split('.json')[0] + '.json'

        if (filename.indexOf('definitions.json') === -1) {
          property = this.parseReferences(this.files[filename], pathArray)
        }
      }

      object[key] = property
    }

    _.forOwn(schema.properties, handleProperties)
    _.forOwn(schema.patternProperties, handleProperties)

    return schema
  }

  parseOptions () {
    this.options.entry = path.join(this.options.cwd, this.options.entry)
    this.options.output = path.join(this.options.cwd, this.options.output)
    this.options._definitions = this.options.definitions
    this.options.definitions = path.join(this.options.cwd, this.options.definitions)

    if (this.options.debug === true) {
      this.debug = require('debug')('signalk-documentation-generator')
    }
  }
}

module.exports = Parser