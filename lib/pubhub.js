/**
 * @fileoverview PubHubSubbub hub built in node.js.
 */

var events = require('events');
var http = require('http');
var url = require('url');
var util = require('util');
var Subscription = require('./subscription.js').Subscription;

/**
 * Creates a new PubHub for a given feed and subscribers.
 *
 * @param {Subscription} subscription
 *   A subscription object with a feed and list of subscribers.
 * @constructor
 */
function PubHub(subscription) {
  var self = this;
  events.EventEmitter.call(self);

  self.listenLoopId = null;
  self.Subscription = subscription;

  // Stop polling if the subscription was removed.
  self.Subscription.on('removed', function onRemoved(message) {
    if (self.listenLoopId !== null) {
      clearInterval(self.listenLoopId);
    }
  });
}
util.inherits(PubHub, events.EventEmitter);

/**
 * Frequency to check for changes in milliseconds.
 * @const
 * @type {int}
 */
PubHub.REFRESH = 6000; // TODO - make this variable?

/**
 * Frequency to retry failed subscription responses in milliseconds.
 * @const
 * @type {int}
 */
PubHub.RETRY = 10000;

/**
 * Number of times to retry a failed subscription response.
 * @const
 * @type {int}
 */
PubHub.RETRY_COUNT = 5;

/**
 * Polls the feed URL for changes.
 */
PubHub.prototype.listen = function() {
  var self = this;
  var options = self.getFeed(true);
  options.headers = {
    'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
  };
  var etag = null;
  var feedString = self.getFeed();
  self.listenLoopId = setInterval(
    function listenLoop() {
      // Send 'nice' headers if we already have data.
      if (self.data !== '') {
        options.headers['If-Modified-Since'] = self.changed;
        if (etag !== null) {
          options.headers['If-None-Match'] = etag;
        }
      }

      var req = http.get(options, function onReq(res) {
        console.log('Polling %s for changed data.', feedString);
        var data = '';
        res.on('data', function onData(chunk) {
          data += chunk;
        });
        res.on('end', function onEnd() {
          // Set the content type if different.
          if (res.headers['content-type'] != self.contentType) {
            self.contentType = res.headers['content-type'];
          }
          // See if the server responded with an etag and store it.
          if (typeof res.headers.etag !== 'undefined') {
            etag = res.headers.etag;
          }

          // Server responded that nothing changed and we already
          // have the data to serve.
          if (res.statusCode === 304 && self.data != '') {
            return;
          }

          // Compare what's on the server with what hwe have already
          // and store it if it's different.
          if (data != self.data) {
            console.log('New data found on %s.', feedString);
            self.data = data;
            self.changed = Date.now();
            self.emit('changed', data);
          }
        });
      });

      req.on('error', function onError(err) {
        console.error(err);
      });
    },
    PubHub.REFRESH
  );
};

/**
 * Publishes new feed items to subscribers.
 */
PubHub.prototype.publish = function() {
  var self = this;

  // Publish to all subscribers.
  for (x in self.Subscription.Subscription.subscribers) {
    if (typeof self.Subscription.Subscription.subscribers[x].callback !== 'undefined') {
      self.publishOne(self.Subscription.Subscription.subscribers[x]);
    }
  }
};

/**
 * Publishes new feed items to an individual subscriber.
 *
 * @param {object} subscriber
 *   A subscriber object from this.Subscriber.Subscriber.subscribers.
 */
PubHub.prototype.publishOne = function(subscriber) {
  var self = this;
  var feedString = self.getFeed();
  var subscriberString = subscriber.callback;
  console.log('Publishing %s to %s.', feedString, subscriberString);

  var options = url.parse(subscriber.callback);
  options.method = 'POST';
  options.headers = {
    'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)',
    'Content-Type': self.contentType
  };

  // Put the publish action into an interval loop, the interval
  // will be cleared once the server responds with a 200 status
  // OR the publish action has been unsuccessfully attempted more
  // than PubHub.RETRY_COUNT times.
  var retry = 0;
  var retryId = setInterval(
    function retryLoop() {
      var req = http.request(options, function onReq(res) {
        res.on('end', function onEnd() {
          if (res.statusCode !== 200 && retry < PubHub.RETRY_COUNT) {
            retry++;
            console.error(
              'Error publishing to %s, retrying in %dms',
              subscriberString,
              PubHub.RETRY
            );
          }
          else if (retry >= PubHub.RETRY_COUNT) {
            console.error(
              'Failed publishing to %s %d times, halting.',
              subscriberString,
              PubHub.RETRY_COUNT
            );
            clearInterval(retryId);
          }
          else {
            console.log('Published %s to %s.', feedString, subscriberString);
            clearInterval(retryId);
          }
        });

        res.on('error', function onError(err) {
          if (retry < PubHub.RETRY_COUNT) {
            retry++;
            console.error(err);
          }
          else {
            clearInterval(retryId);
          }
        });
      });

      req.on('error', function onError(err) {
        console.error(err);
      });

      req.write(self.data);
      req.end();
    },
    PubHub.RETRY
  );
};

/**
 * Stops the listen loop.
 */
PubHub.prototype.stop = function() {
  var self = this;
  if (typeof self.listenLoopId !== null) {
    clearInterval(self.listenLoopId);
  }
};

// Getters.

/**
 * Gets the subscription feed name.
 *
 * @param {boolean} parse
 *   True to parse the URL string.
 * @return mixed
 *   URL string OR parsed URL for this.Subscription.Subscription.feed.
 */
PubHub.prototype.getFeed = function(parse) {
  var self = this;

  // Default to false.
  if (typeof parse !== 'boolean') {
    parse = false;
  }

  // Parse the url then return it.
  if (parse === true) {
    return url.parse(self.Subscription.Subscription.feed);
  }

  return self.Subscription.Subscription.feed;
}

/**
 * Gets the subscription data.
 *
 * @return string
 *   The current feed data.
 */
PubHub.prototype.getData = function() {
  var self = this;

  return self.Subscription.Subscription.data;
}

/**
 * Exports the PubHub class.
 */
exports.PubHub = PubHub;

