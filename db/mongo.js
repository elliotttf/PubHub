/**
 * @fileoverview Defines mongodb interface.
 */

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var util = require('util');

function Model(name, schema) {
  var newSchema = {};
  for (var x in schema.properties) {
    newSchema[x] = schema.properties[x];
    for (var y in newSchema[x]) {
      if (y === 'type') {
        switch (newSchema[x][y]) {
          case 'string':
            newSchema[x][y] = String;
            break;
          case 'number':
            newSchema[x][y] = Number;
            break;
          case 'integer':
            newSchema[x][y] = Number;
            break;
          case 'boolean':
            newSchema[x][y] = Boolean;
            break;
          case 'object':
            newSchema[x][y] = Object;
            break;
          case 'array':
            newSchema[x][y] = Array;
            if (typeof newSchema[x]['items'] !== 'undefined') {
              newSchema[x][y] = [newSchema[x]['items']['type']];
            }
            break;
          case 'null':
          case 'any':
            newSchema[x][y] = Mixed;
            break;
        }
      }
    }
  }

  for (var x in schema.uniqueItems) {
    if (typeof newSchema[x] !== 'undefined') {
      newSchema[x]['unique'] = true;
    }
  }

  namedSchema = new Schema(newSchema);
  return mongoose.model(name, namedSchema);
}

exports.Model = Model;
