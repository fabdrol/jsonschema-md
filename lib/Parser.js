'use strict'

const _ = require('lodash')
const fs = require('mz/fs')
const path = require('path')
const parser = require('json-schema-load-tree').default
const rimraf = require('rimraf')
const markdown = new (require('markdown-it'))()

class Parser {
  constructor (opts) {
    this.options = _.defaults(opts, {
      entry: './schema/signalk.json',
      output: './build',
      debug: false, 
      cwd: process.cwd(),
      encoding: 'utf-8'
    })

    this.debug = () => {}
    this.tree = {}
    this.docs = {}
    this.invalid = []
    this.files = []

    this.parseOptions()
    this.parse()
  }

  parse () {
    const schema = require(this.options.entry)

    this
    .rm(this.options.output) // remove build directory
    .then(() => fs.mkdir(this.options.output)) // create a new build directory
    .then(() => parser(schema)) // parse the schema
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

    /*
     * Start parsing of properties at root (signalk.json)
     */
    .then(root => {
      return this.parseProperties('/', root)
    })

    /*
     * If debug is set to true, write all paths to a JSON file.
     */
    .then(result => {
      if (this.options.debug === false) {
        return result
      }

      let keys = Object.keys(this.tree).sort()
      
      return fs
      .writeFile(path.join(this.options.output, 'paths.json'), JSON.stringify(keys, null, 2), this.options.encoding)
      .then(_ => {
        this.debug(`Written a list of paths to ${path.join(this.options.output, 'paths.json')}.`)
        return result
      })
    })

    /*
     * If debug is set to true, write the raw tree to a JSON file.
     */
    .then(result => {
      if (this.options.debug === false) {
        return result
      }

      return fs
      .writeFile(path.join(this.options.output, 'tree.json'), JSON.stringify(this.tree, null, 2), this.options.encoding)
      .then(() => {
        this.debug(`Written total tree to ${path.join(this.options.output, 'tree.json')}`)
        return result
      })
    })

    /*
     * Replace RegExp's in the path name with <RegExp> for readability and generate a documentation object for each file
     */
    .then(result => {
      Object.keys(this.tree).forEach(path => {
        if (!_.isObject(this.tree[path])) {
          return
        }

        const splitpath = path.split('/')
        const subtree = this.tree[path]
        const node = splitpath[splitpath.length - 1]

        for (let i in splitpath) {
          if (splitpath[i].indexOf('^') !== -1 || splitpath[i].indexOf('$') > 0 || splitpath[i].indexOf('*') !== -1) {
            splitpath[i] = '<RegExp>'
          }
        }

        /*
        if (splitpath.join('/') === '/vessels/<RegExp>/environment/depth') {
          this.debug(JSON.stringify(subtree, null, 2))
        }
        // */

        const documentation = {
          node: node,
          path: path,
          regexp: false,
          title: typeof subtree.title !== 'undefined' ? subtree.title : '@TODO: add a title',
          type: typeof subtree.type !== 'undefined' ? subtree.type : `@FIXME: ${path} should have a type, which it doesn't.`,
          description: typeof subtree.description !== 'undefined' ? subtree.description : `@TODO: add a description`,
          example: typeof subtree.example !== 'undefined' ? subtree.example : `@TODO: add an example`,
          json: JSON.stringify(subtree, null, 2)
        }

        if (node.indexOf('^') !== -1 || node.indexOf('$') > 0 || node.indexOf('*') !== -1) {
          splitpath[splitpath.length - 1] = '<RegExp>'    
          documentation.regexp = true      
        }

        if (typeof subtree.type === 'undefined') {
          this.invalid.push(splitpath.join('/'))
        }

        this.docs[splitpath.join('/')] = documentation
      })

      /* 
      if (this.invalid.length > 0) {
        console.log(`*** WARNING: found ${this.invalid.length} invalid paths (no \`type\` property): ${JSON.stringify(this.invalid, null, 2)}\n`)
      }
      // */

      return this.docs
    })

    /*
     * Normalise the path name to use as file name and write a Markdown-formatted file to disk
     */
    .then(() => {
      const promises = Object.keys(this.docs).map(p => {
        const doc = this.docs[p]
        const fn = (`${p.replace(/\//g, '.')}`).replace(/<|>/g, '__').replace(/^\./, '')

        return fs
        .writeFile(path.join(this.options.output, `${fn}.md`), this.generateMarkdown(doc), this.options.encoding)
        .then(() => {
          return {
            path: p,
            name: `${fn}.md`,
            file: path.join(this.options.output, `${fn}.md`)
          }
        })
      })

      return Promise.all(promises)
    }) 

    /*
     * Generate an index in Markdown, pass on results of markdown file creation.
     */
    .then(results => {
      const filenames = {}

      results.forEach(result => {
        filenames[result.name] = result.path
      })

      let md = '# Signal K - schema\n\n'

      Object.keys(filenames).forEach(fn => {
        md += `* [${filenames[fn]}](${fn.replace('.md', '.html')})\n`
      })

      return fs.writeFile(path.join(this.options.output, 'index.md'), md, this.options.encoding).then(() => {
        results.push({
          path: '/',
          name: 'index.md',
          file: path.join(this.options.output, 'index.md')
        })

        return results
      })
    })

    /*
     * Generate HTML files, pass on results of markdown file creation.
     */
    .then(results => {
      const promises = []

      results.forEach(result => {
        promises.push(fs.readFile(result.file, this.options.encoding).then(contents => {
          if (Buffer.isBuffer(contents)) {
            contents = contents.toString(this.options.encoding)
          }

          const html = markdown.render(contents)

          return fs
          .unlink(result.file)
          .then(() => fs.writeFile(path.join(this.options.output, result.name.replace('.md', '.html')), this.wrapHTML(result.path, html), this.options.encoding))
          .then(() => {
            return result
          })
        }))
      })

      return Promise.all(promises)
    })

    /*
     * Print a report to stdout and exit the program.
     */
    .then(results => {
      console.log(`*** Written ${results.length} files to ${this.options.output}`)
      process.exit(0)
    })
    .catch(err => {
      console.error(err.message)
      console.error(err.stack)
      process.exit(1)
    })
  }

  wrapHTML (title, str) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="x-ua-compatible" content="ie=edge, chrome=1">
<title>Signal K - ${title}</title>
<link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.0.0-alpha.2/css/bootstrap.min.css">
</head>
<body>
<main class="container-fluid">
${str}
</main>
</body>
</html>`
  }

  generateMarkdown (doc) {
    let md = ''

    md += `## ${doc.title}\n`
    md += `*${doc.description}*\n\n`

    md += `* Type: \`${(typeof doc.type === 'string' ? doc.type : JSON.stringify(doc.type))}\`\n`
    md += `* Path: \`${doc.path}\`\n`
    md += `* Node: \`${doc.node}\`\n`
    md += `* RegExp: \`${JSON.stringify(doc.regexp)}\`\n\n`

    md += `### Source:\n`
    md += `\`\`\`\n`
    md += `${doc.json}\n`
    md += `\`\`\`\n\n`

    md += `### Example:\n`
    md += `\`\`\`\n`
    md += `${doc.example}\n`
    md += `\`\`\`\n`

    return md
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

    if (typeof data['$ref'] !== 'undefined') {
      this.tree[prefix] = this.resolveReference(data['$ref'])

      if (typeof this.tree[prefix].properties !== 'undefined' || typeof this.tree[prefix].properties !== 'undefined') {
        this.parseProperties(prefix, this.tree[prefix])
      }
    }

    return data
  }

  resolveReference (origRef) {
    const ref = origRef.replace('../', '').split('#')
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

  rm (path) {
    return new Promise((resolve, reject) => {
      rimraf(path, (err) => {
        if (err) {
          return reject(err)
        }

        resolve(path)
      })
    })
  }
}

module.exports = Parser