/**
 * @fileoverview Manages all of the current subscriptions.
 */

var events = require('events');
var mysql = require('mysql');
var PubHub = require('./lib/pubhub.js').PubHub;
var Subscription = require('./lib/subscription.js').Subscription;
var url = require('url');
var util = require('util');

/**
 * @constructor
 */
function Factory() {
  var self = this;
  events.EventEmitter.call(self);

  // TODO - bail if this file doesn't exist.
  var optionsFile = require('fs').readFileSync('./local.json', 'utf8');
  self.options = JSON.parse(optionsFile);

  // Create the MySQL client and connect to the database.
  var client = mysql.createClient(self.options.database);
  client.useDatabase(self.options.database.database);

  self.hubs = [];

  // Connect to the db and load up all of the existing hubs.
  client.query("SELECT feed FROM subscriptions", function onFind(err, docs, fields) {
    if (err) {
      self.emit('error', err);
      return;
    }
    for (var x in docs) {
      self.addHub(docs[x].feed, null, false);
    }

  });
  // Close the MySQL connection since it's not used by us anymore.
  client.end();
}
util.inherits(Factory, events.EventEmitter);

/**
 * Stop all hubs.
 */
Factory.prototype.stop = function() {
  var self = this;
  for (var x in self.hubs) {
    self.hubs[x].stop();
  }
};

/**
 * Adds/removes a subscription. The actual action is determined by
 * sub.hub_mode.
 *
 * @param {object} sub
 *   A subscription object as handled by routes/subscribe.js:
 *   {
 *     hub_callback: The subscriber callback.
 *     hub_mode: 'subscribe' or 'unsubscribe'.
 *     hub_topic: The feed URL to subscribe to.
 *     hub_verify: 'sync' or 'async', not needed.
 *     hub_lease_seconds: Length of time to keep the feed active.
 *     hub_secret: Used to compute HMAC digest.
 *     hub_verify_token: Verification token.
 *   }.
 * @see http://pubsubhubbub.googlecode.com/svn/trunk/pubsubhubbub-core-0.3.html#anchor5
 */
Factory.prototype.subscribe = function(sub) {
  var self = this;
  var found = false;
  var newSubscriber = {};
  newSubscriber.callback = sub.hub_callback;
  newSubscriber.lease_seconds = sub.hub_lease_seconds;
  newSubscriber.created = Date.now();
  newSubscriber.secret = sub.hub_secret;
  newSubscriber.verify_token = sub.hub_verify_token;
  // Check to see if a hub already exists for this feed.
  // TODO - improve this search.
  for (var x in self.hubs) {
    if (self.hubs[x].getFeed() === sub.hub_topic) {
      if (sub.hub_mode === 'subscribe') {
        self.hubs[x].Subscription.addSubscriber(newSubscriber);
      }
      else {
        self.hubs[x].Subscription.removeSubscriber(newSubscriber.callback);
      }
      found = true;
      break;
    }
  }

  // Add a new hub if we didn't find an existing one.
  if (!found && sub.hub_mode === 'subscribe') {
    self.addHub(sub.hub_topic, newSubscriber);
  }
};

/**
 * Handles a publish notification.
 *
 * @param {string} url
 *   The feed URL that notified us of new content.
 */
Factory.prototype.publish = function(url) {
  var self = this;
  var found = false;

  // Find the feed that's being published.
  // TODO - improve this search.
  for (var x in self.hubs) {
    if (self.hubs[x].getFeed() === url) {
      found = true;
      var options = self.hubs[x].getFeed(true);
      options.headers = {
        'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
      };

      // Update the subscription if we didn't know this feed could publish.
      if (!self.hubs[x].Subscription.Subscription.push) {
        self.hubs[x].Subscription.Subscription.push = true;
        self.hubs[x].Subscription.save();

        // Stop polling since we know the feed can talk to us now.
        self.hubs[x].stop();
      }

      self.hubs[x].fetch(options);
      break;
    }
  }

  // If the feed wasn't found, add an empty feed with no subscribers,
  // we'll notify subscribers when they come in.
  if (!found) {
    self.addHub(url);
  }
};

/**
 * Adds a new hub to the list.
 *
 * @param {string} url
 *   The feed url.
 * @param {object} sub
 *   (optional) A subscriber object for this feed.
 * @param {boolean} save
 *   (optional) true if the subscription should be saved after it is loaded.
 *
 * @see Subscription().
 */
Factory.prototype.addHub = function(url, sub, save) {
  var self = this;

  if (typeof sub !== 'undefined' && sub !== null) {
    var newSubscription = new Subscription(url, sub);
  }
  else {
    var newSubscription = new Subscription(url);
  }

  newSubscription.on('loaded', function onLoaded(loadedSub) {
    newSubscription = null;

    if (typeof save === 'undefined' || save === true) {
      loadedSub.save();
    }

    var newHub = new PubHub(loadedSub);
    var index = (self.hubs.push(newHub) - 1);
    // We always start with a polling model until the source publishes to us.
    self.hubs[index].listen();
    self.hubs[index].on('changed', function onChanged(data) {
      self.hubs[index].stop();
      self.hubs[index].Subscription.updateData(data);
      self.hubs[index].publish(data);
    });
    self.hubs[index].on('published', function published(msg) {
      self.hubs[index].listen();
    });
  });
};

exports.Factory = Factory;

