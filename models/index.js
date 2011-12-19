/**
 * @fileoverview Abstracts the database layer.
 */

// @see http://tools.ietf.org/html/draft-zyp-json-schema-03#section-5.1

var options = require('../util/settings').database;

/**
 * Defines a single subscriber object.
 *
 * Most of these fields correspond to pubsubhubbub fields,
 * @see http://pubsubhubbub.googlecode.com/svn/trunk/pubsubhubbub-core-0.3.html#anchor5
 */
var Subscriber = {
  'properties': {
    'callback': {
      'type': 'string',
      'required': true,
    },
    'created': {
      'type': 'number'
    },
    'lease_seconds': {
      'type': 'number'
    },
    'secret': {
      'type': 'string'
    },
    'verify_token': {
      'type': 'string'
    }
  },
  'uniqueItems': ['callback']
};

/**
 * Defines the subscription schema.
 */
var Subscription = {
  'properties': {
    'feed': {
      'type': 'string',
      'required': 'true'
    },
    'subscribers': {
      'type': 'array',
      'items': {
        'type': exports.Subscriber
      }
    },
    'changed': {
      'type': 'number'
    },
    'data': {
      'type': 'string'
    },
    'contentType': {
      'type': 'string'
    },
    'push': {
      'type': 'boolean'
    }
  },
  'uniqueItems': ['feed']
};

exports.store = null;
if (options.type === 'mongodb') {
  var mongoose = require('mongoose');
  var mongo = require('../db/mongo.js');
  exports.db = {
    'connect': function(options) {
      mongoose.connect(options.url);
    },
    'find': function(schema, conditions, callback) {
      schema.find(conditions, callback);
    },
    'findOne': function(schema, conditions, callback) {
      schema.findOne(conditions, callback);
    },
    'save': function(object, callback) {
      object.save(callback);
    },
    'update': function(object, conditions, update, options, callback) {
      object.update(conditions, update, options, callback);
    },
    'remove': function(schema, conditions, callback) {
      schema.remove(conditions, callback);
    }
  };
  exports.Subscriber = mongo.Model('Subscriber', Subscriber);
  exports.Subscription = mongo.Model('Subscription', Subscription);
}
else if (options.type === 'redis') {
  var Redis = require('redis');
  var client = null;
  var redis = require('../db/redis');
  exports.db = {
    'connect': function(options) {
      client = Redis.createClient(options.port, options.host);
      client.on('error', function(err) {
        console.log(err);
      });
    },
    'find': function(schema, conditions, callback) {
      var key = '';
      // TODO - apply conditions.
      client.multi().keys('*', function (err, keys) {
        client.mget(keys, function (err, res) {
          var docs = [];
          if (typeof res !== 'array') {
            callback(err, docs);
            return;
          }
          for (var x in res) {
            docs.push(JSON.parse(docs[x]));
          }
          callback(err, docs);
        });
      });
    },
    'findOne': function(schema, conditions, callback) {
      var key = '';
      for (var x in conditions) {
        if (x === schema.key) {
          key = conditions[x];
          break;
        }
      }
      client.get(key, function got(err, doc) {
        if (typeof doc !== 'undefined') {
          doc = JSON.parse(doc);
        }
        callback(err, doc);
      });
    },
    'save': function(object, callback) {
      client.set(object[object.key], JSON.stringify(object), callback);
    },
    'update': function(schema, conditions, update, options, callback) {
      var key = '';
      for (var x in conditions) {
        if (x === schema.key) {
          key = conditions[x];
          break;
        }
      }
      client.set(key, JSON.stringify(update), callback);
    },
    'remove': function(schema, conditions, callback) {
      var key = '';
      for (var x in conditions) {
        if (x === schema.key) {
          key = conditions[x];
          break;
        }
      }
      client.del(key, callback);
    }
  };
  exports.Subscriber = new redis.Model(client, Subscriber);
  exports.Subscription = new redis.Model(client, Subscription);
}

