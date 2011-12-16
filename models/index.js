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
    }
  };
  exports.Subscriber = mongo.Model('Subscriber', Subscriber);
  exports.Subscription = mongo.Model('Subscription', Subscription);
}
else if (options.type === 'redis') {
  var client = require('redis-client');
  var redis = require('../db/redis.js');
  exports.db = {
    'connect': function(options) {
      client.createClient(options.port, options.host);
    }
  };
  exports.Subscriber = redis.Model(client, Subscriber);
  exports.Subscription = redis.Model(client, Subscription);
}

