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
 * @param {Subscription} subscriber
 *   A subscription object with a feed and list of subscribers.
 * @constructor
 */
function PubHub(subscriber) {
  var self = this;
  events.EventEmitter.call(self);

  self.listenLoopId = null;
  self.feed = url.parse(subscriber.Subscription.feed);
  self.subscribers = [];

  // Convert the strings into url objects.
  for (var x in subscriber.Subscription.subscribers) {
    if (typeof subscriber.Subscription.subscribers[x]['callback'] !== 'undefined') {
      self.subscribers.push(url.parse(subscriber.Subscription.subscribers[x]['callback']));
    }
  }

  // Stop polling if the subscription was removed.
  subscriber.on('removed', function onRemoved(message) {
    if (self.listenLoopId !== null) {
      clearInterval(self.listenLoopId);
    }
  });

  // Update the polling/publishing logic if the subscription changed.
  subscriber.on('saved', function onSaved(message) {
    // Update our info.
    self.feed = subscriber.Subscription.feed;
    self.subscribers = subscriber.Subscription.subscribers;

    // Convert the strings into url objects.
    for (x in self.subscribers) {
      self.subscribers[x].callback = url.parse(self.subscribers[x].callback);
    }

    // Restart the polling.
    // TODO - this might not be necessary.
    if (self.listenLoopId !== null) {
      clearInterval(self.listenLoopId);
      self.listen();
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
  var options = self.feed;
  options.headers = {
    'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
  };
  var etag = null;
  var feedString = url.format(self.feed);
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
  for (x in self.subscribers) {
    self.publishOne(self.subscribers[x]);
  }
};

/**
 * Publishes new feed items to an individual subscriber.
 *
 * @param {object} subscriber
 *   A subscriber object from this.subscribers.
 */
PubHub.prototype.publishOne = function(subscriber) {
  var self = this;
  var feedString = url.format(self.feed);
  var subscriberString = url.format(subscriber);
  console.log('Publishing %s to %s.', feedString, subscriberString);

  var options = subscriber;
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

/**
 * Exports the PubHub class.
 */
exports.PubHub = PubHub;

