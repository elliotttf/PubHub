/**
 * @fileoverview Defines schemas for use in PubHub.
 */

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * Defines a single subscriber object.
 *
 * Most of these fields correspond to pubsubhubbub fields,
 * @see http://pubsubhubbub.googlecode.com/svn/trunk/pubsubhubbub-core-0.3.html#anchor5
 */
exports.Subscriber = new Schema({
  'callback': {            // The subscriber callback URL.
    'type': String,
    'required': true,
    'unique': true
  },
  'created': Number,       // Timestamp.
  'lease_seconds': Number, // Lease lifetime.
  'secret': String,        // Secret for HMAC digest.
  'verify_token': String   // Token used for verification.
});

/**
 * Defines the subscription schema.
 */
exports.Subscription = new Schema({
  'feed': {                            // The feed url.
    'type': String,
    'index': true,
    'unique': true
  },
  'subscribers': [exports.Subscriber], // Array of Subscribers.
  'changed': {                         // Date feed changed.
    'type': Number,
    'index': true
  },
  'data': String,                      // MD5 hash of feed.
  'contentType': String                // Content type header.
});
