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
      return this.files['signalk.json']
    })
    .then(root => {
      return this.parseProperties('/', root)
    })
    .then(parsed => {
      let keys = Object.keys(this.tree).sort()
      fs.writeFileSync(path.join(this.options.output, 'paths.json'), JSON.stringify(keys, null, 2), this.encoding)

      console.log(JSON.stringify(this.tree, null, 2))
      console.log(`Written a list of paths to ${path.join(this.options.output, 'paths.json')}.`)
    })
    .catch(err => {
      console.error(err.message)
      console.error(err.stack)
      process.exit(1)
    })
  }

  hasProperties (data) {
    return (typeof data === 'object' && data !== null && (typeof data.properties !== 'undefined' || typeof data.patternProperties !== 'undefined'))
  }

  parseProperties (prefix, data) {
    if (prefix.charAt(prefix.length - 1) === '/') {
      prefix = prefix.replace(/\/+$/, '')
    }

    if (typeof data.properties === 'object' && data.properties !== null) {
      Object.keys(data.properties).forEach(key => {
        if (typeof data.properties[key]['$ref'] === 'undefined') {
          this.tree[`${prefix}/${key}`] = data.properties[key]
        } else {
          this.tree[`${prefix}/${key}`] = this.resolveReference(data.properties[key]['$ref'])
        }

        if (this.hasProperties(this.tree[`${prefix}/${key}`])) {
          this.parseProperties(`${prefix}/${key}`, this.tree[`${prefix}/${key}`])
        }
      })
    }

    if (typeof data.patternProperties === 'object' && data.patternProperties !== null) {
      Object.keys(data.patternProperties).forEach(key => {
        if (typeof data.patternProperties[key]['$ref'] === 'undefined') {
          this.tree[`${prefix}/${key}`] = data.patternProperties[key]
        } else {
          this.tree[`${prefix}/${key}`] = this.resolveReference(data.patternProperties[key]['$ref'])
        }

        if (this.hasProperties(this.tree[`${prefix}/${key}`])) {
          this.parseProperties(`${prefix}/${key}`, this.tree[`${prefix}/${key}`])
        }
      })
    }

    return data
  }

  resolveReference (ref) {
    ref = ref.split('#')
    const file = ref[0].trim()
    let path = ref[1].trim()

    if (path.length === 0) {
      return this.files[file]
    }

    if (path.charAt(0) === '/') {
      path = path.replace(/^\//, '')
    }

    path = path.split('/')
    let cursor = this.files[file]
    
    path.forEach(key => {
      if (cursor !== null && typeof cursor === 'object' && typeof cursor[key] !== 'undefined') {
        cursor = cursor[key]
      }
    })

    return cursor
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