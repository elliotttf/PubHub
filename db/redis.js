/**
 * @fileoverview Redis model definition.
 */

var util = require('util');

function Model(client, schema) {
  function newSchema() {
  for (var x in schema.properties) {
    for (var y in schema.properties[x]) {
      if (y === 'type') {
        switch (schema.properties[x][y]) {
          case 'string':
            this[x] = '';
            break;
          case 'number':
            this[x] = 0;
            break;
          case 'integer':
            this[x] = 0;
            break;
          case 'boolean':
            this[x] = false;
            break;
          case 'object':
            this[x] = {};
            break;
          case 'array':
            this[x] = [];
            break;
          case 'null':
          case 'any':
            this[x][y] = null;
            break;
        }
      }
    }
  }

  // Assumes one uniqe per schema...
  for (var x in schema.uniqueItems) {
    if (typeof this[schema.uniqueItems[x]] !== 'undefined') {
      this.key = schema.uniqueItems[x];
      break;
    }
  }
console.log(this);
  };

  return newSchema;
}

exports.Model = Model;
