/**
 * @fileoverview PubHubSubbub hub built in node.js.
 */

var crypto = require('crypto');
var events = require('events');
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');
var Subscription = require('./subscription.js').Subscription;

/**
 * Creates a new PubHub for a given feed and subscribers.
 *
 * @param {Subscription} subscription
 *   A subscription object with a feed and list of subscribers.
 * @param {int} refresh
 *   (optional) Delay between polling requests. Defaults to
 *   PubHub.REFRESH.
 * @constructor
 */
function PubHub(subscription, refresh) {
  var self = this;
  events.EventEmitter.call(self);

  self.etag = null;
  self.listenLoopId = null;
  self.Subscription = subscription;

  self.refresh = PubHub.REFRESH;
  if (typeof refresh !== 'undefined') {
    self.refresh = refresh;
  }

  // Listen for errors.
  self.Subscription.on('error', function onError(err) {
    // Mongoose returns errors in objects keyed with the field that the
    // error originated on.
    if (typeof err === 'object') {
      console.error('%s: %s', err.name, err.message);

      if (typeof err.errors === 'object') {
        for (var x in err.errors) {
          console.error('Error on %s: %s', x, err.errors[x]);
        }
      }
    }
  });

  // Stop polling if the subscription was removed.
  self.Subscription.on('removed', function onRemoved(message) {
    self.etag = null;
    if (self.listenLoopId !== null) {
      clearInterval(self.listenLoopId);
    }
    // Remove all listeners for the subscription if
    // the subscription was removed.
    self.Subscription.removeAllListeners();
  });

  // Remove the subscription if all subscribers have been removed.
  self.Subscription.on('removedAll', function onRemovedAll(message) {
    self.Subscription.remove();
  });
}
util.inherits(PubHub, events.EventEmitter);

/**
 * Frequency to check for changes in milliseconds.
 * @const
 * @type {int}
 */
PubHub.REFRESH = 60000;

/**
 * Frequency to retry failed subscription responses in milliseconds.
 * @const
 * @type {int}
 */
PubHub.RETRY = 30000;

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

  // Prevent this hub from having multiple listeners at once.
  if (self.listenLoopId !== null) {
    return;
  }

  var options = self.getFeed(true);
  options.headers = {
    'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
  };
  self.listenLoopId = setInterval(
    function listenLoop() {
      self.fetch(options);
    },
    self.refresh
  );
};

/**
 * Fetches new data from the feed.
 *
 * @param {object} options
 *   The get options.
 */
PubHub.prototype.fetch = function(options) {
  var self = this;
  var feedString = self.getFeed();
  var re = /^https.+/;
  var method = http;
  if (re.test(options.protocol)) {
    method = https;
  }

  // Send 'nice' headers if we already have data.
  if (self.getData() !== '') {
    options.headers['If-Modified-Since'] = self.getChanged();
    if (self.etag !== null) {
      options.headers['If-None-Match'] = self.etag;
    }
  }

  // Unescape the authorization info if it exists.
  if (typeof options.auth !== 'undefined') {
    options.auth = unescape(options.auth);
  }

  var req = method.get(options, function onReq(res) {
    var data = '';
    res.on('data', function onData(chunk) {
      data += chunk;
    });
    res.on('end', function onEnd() {
      // Handle redirects.
      if (res.statusCode == 301 || res.statusCode == 302 || res.statusCode == 307) {
        if (typeof res.headers.location === 'undefined') {
          console.error('Missing location header for %s redirect, bailing.', feedString);
          return;
        }
        console.log('Feed %s redirected to %s', feedString, res.headers.location);
        var redirectOptions = url.parse(res.headers.location);
        redirectOptions.headers = {
          'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
        };

        // Send 'nice' headers if we already have data.
        if (self.getData() !== '') {
          redirectOptions.headers['If-Modified-Since'] = self.getChanged();
          if (self.etag !== null) {
            redirectOptions.headers['If-None-Match'] = self.etag;
          }
        }

        // Unescape the authorization info if it exists.
        if (typeof redirectOptions.auth !== 'undefined') {
          redirectOptions.auth = unescape(redirectOptions.auth);
        }

        self.fetch(redirectOptions);

        return;
      }
      // Set the content type if different.
      if (res.headers['content-type'] != self.contentType) {
        self.contentType = res.headers['content-type'];
      }
      // See if the server responded with an etag and store it.
      if (typeof res.headers.etag !== 'undefined') {
        self.etag = res.headers.etag;
      }

      // Server responded that nothing changed and we already
      // have the data to serve.
      if (res.statusCode === 304 && self.getData() != '') {
        // Explicitly null out these variables to plug a memory leak.
        data = null;
        feedString = null;
        method = null;
        re = null;
        res = null;
        req = null;
        return;
      }

      // Compare what's on the server with what we have already
      // and notify of a change if it's different.
      var dataHash = crypto.createHash('md5').update(data).digest('hex');
      if (dataHash != self.getData()) {
        console.log('New data found on %s.', feedString);
        self.emit('changed', data);
      }

      // Explicitly null out these variables to plug a memory leak.
      data = null;
      dataHash = null;
      feedString = null;
      method = null;
      re = null;
      res = null;
      req = null;
    });
  });

  req.on('error', function onError(err) {
    console.error('There was a problem fetching new content for %s.', feedString);
    console.error(err);
  });
};

/**
 * Publishes new feed items to subscribers.
 *
 * @param {string} data
 *   The XML data to publish to the subscribers.
 */
PubHub.prototype.publish = function(data) {
  var self = this;
  var published = 0;

  // Publish to all subscribers.
  for (x in self.Subscription.Subscription.subscribers) {
    if (typeof self.Subscription.Subscription.subscribers[x].callback !== 'undefined') {
      self.publishOne(self.Subscription.Subscription.subscribers[x], data);
    }
  }

  self.on('publishedOne', function publishedOne(msg) {
    published++;
    if (published == self.Subscription.Subscription.subscribers.length) {
      self.removeAllListeners('publishedOne');
      self.emit('published', 'Published to all subscribers.');
      published = null;
    }
  });
};

/**
 * Publishes new feed items to an individual subscriber.
 *
 * @param {object} subscriber
 *   A subscriber object from this.Subscriber.Subscriber.subscribers.
 * @param {string} data
 *   The XML data to publish to the subscriber.
 * @param {object} options
 *   The request options that will be passed when publishOne is called
 *   recursively.
 * @param {int} retryCount
 *   The number of times this request has been retried.
 */
PubHub.prototype.publishOne = function(subscriber, data, options, retryCount) {
  var self = this;
  var feedString = self.getFeed();
  var subscriberString = subscriber.callback;
  console.log('Publishing %s to %s.', feedString, subscriberString);

  if (typeof options === 'undefined') {
    var options = url.parse(subscriber.callback);
    options.method = 'POST';
    options.headers = {
      'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)',
      'Content-Type': self.contentType,
      'Content-Length': data.length
    };

    // Add the signature if the subscriber was using a secret.
    if (typeof subscriber.secret !== 'undefined') {
      options.headers['X-Hub-Signature'] = 'sha1=' +
        crypto.createHmac('sha1', subscriber.secret).
          update(data).
          digest('hex');
    }
  }

  if (typeof retryCount === 'undefined') {
    retryCount = 0;
  }

  // Publish to the subscriber. If the request fails or the subscriber doesn't
  // respond with a 200 the request will be retried after a delay of
  // PubHub.RETRY ms.
  var req = http.request(options, function onReq(res) {
    res.on('end', function onEnd() {
      if (res.statusCode !== 200 && retryCount < PubHub.RETRY_COUNT) {
        retryCount++;
        console.error(
          'Error publishing to %s, retrying in %dms',
          subscriberString,
          PubHub.RETRY
        );
        setTimeout(
          function retryPublishOne(obj) {
            self.publishOne(obj.subscriber, obj.data, obj.options, obj.retryCount);
          },
          PubHub.RETRY,
          {
            'subscriber': subscriber,
            'data': data,
            'options': options,
            'retryCount': retryCount
          }
        );
      }
      else if (retryCount >= PubHub.RETRY_COUNT) {
        console.error(
          'Failed publishing to %s %d times, halting.',
          subscriberString,
          PubHub.RETRY_COUNT
        );

        // Explicitly null out this variable to plug a memory leak.
        feedString = null;
        options = null;
        retryCount = null;
        subscriberString = null;

        self.emit('publishedOne', 'Published to one subscriber.');
      }
      else {
        console.log('Published %s to %s.', feedString, subscriberString);

        // Explicitly null out this variable to plug a memory leak.
        feedString = null;
        options = null;
        retryCount = null;
        subscriberString = null;

        self.emit('publishedOne', 'Published to one subscriber.');
      }

      // Explicitly null out these variables to plug a memory leak.
      data = null;
      res = null;
      req = null;
    });

    res.on('error', function onError(err) {
      if (retry < PubHub.RETRY_COUNT) {
        retryCount++;
        console.error(err);
        setTimeout(
          function retryPublishOne(obj) {
            self.publishOne(obj.subscriber, obj.data, obj.options, obj.retryCount);
          },
          PubHub.RETRY,
          {
            'subscriber': subscriber,
            'data': data,
            'options': options,
            'retryCount': retryCount
          }
        );
      }
    });
  });

  req.on('error', function onError(err) {
    console.error('There was a problem publishing to new content.');
    console.error(err);
  });

  req.write(data);
  req.end();
};

/**
 * Stops the listen loop.
 */
PubHub.prototype.stop = function() {
  var self = this;
  // If there's a timer running, stop it and reset the ID.
  if (self.listenLoopId !== null) {
    self.etag = null;
    clearInterval(self.listenLoopId);
    self.listenLoopId = null;
  }
};

/**
 * Gets the subscription feed name.
 *
 * @param {boolean} parse
 *   True to parse the URL string.
 * @return {mixed}
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
};

/**
 * Gets the changed timestamp.
 *
 * @return {int}
 *   The timestamp (in milliseconds) for when the data changed.
 */
PubHub.prototype.getChanged = function() {
  var self = this;

  return self.Subscription.Subscription.changed;
};

/**
 * Gets the subscription data hash.
 *
 * @return {string}
 *   The current feed data hash.
 */
PubHub.prototype.getData = function() {
  var self = this;

  return self.Subscription.Subscription.data;
};

/**
 * Determines if the subscription supports push notifications
 * and updates the variables accordingly.
 */
PubHub.prototype.supportsPush = function() {
  var self = this;

  var re = /^https.+/;
  var method = http;
  if (re.test(options.protocol)) {
    method = https;
  }
  var options = self.getFeed(true);
  options.headers = {
    'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
  };
  var req = method.get(options, function onReq(res) {
    var data = '';
    res.on('data', function onData(chunk) {
      data += chunk;
    });

    // Parse the XML to determine if this feed can push to this hub.
    res.on('end', function onEnd() {
    });
  });
  req.on('error', function onSupportsPushError(err) {
    console.error('There was a problem determining if this subscription supports push.');
    console.error(err);
  });
};

/**
 * Exports the PubHub class.
 */
exports.PubHub = PubHub;

