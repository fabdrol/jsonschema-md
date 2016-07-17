# signalk-documentation-generator

## About
Generate Signal K specification documentation from the schema files.

## Usage
```
signalk-docgen --schema ./schema --output ./build --debug
# OR 
signalk-docgen -s ./schema -o ./build
```

## TODO
- [x] Fix issue with leave nodes
- [ ] Add support for `allOf` and `anyOf`, as this is extensively used by SK schema
- [ ] Add list of child nodes in each documentation file
- [ ] Improve styling/Signal K branding
- [ ] Add real-times search box
- [ ] Add NICE syntax highlighting to `<code>` blocks