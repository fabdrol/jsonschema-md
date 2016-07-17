# signalk-documentation-generator

Generate Signal K specification documentation from the schema files.

## Usage
```
signalk-docgen --schema ./schema --output ./build --debug
# OR 
signalk-docgen -s ./schema -o ./build
```

## TODO
- [x] Fix issue with leave nodes
- [x] Add support for `allOf`, as this is extensively used by SK schema
- [ ] Add list of child nodes in each documentation file
- [ ] Improve styling/Signal K branding
- [ ] Add real-times search box
- [ ] Add NICE syntax highlighting to `<code>` blocks
- [ ] Add support for fetching latest `master` schema from GitHub