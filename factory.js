/**
 * @fileoverview Manages all of the current subscriptions.
 */

var events = require('events');
var mongoose = require('mongoose');
var Model = require('./models/models.js');
var PubHub = require('./lib/pubhub.js').PubHub;
var subscriber = mongoose.model('Subscriber', Model.Subscriber);
var subscription = mongoose.model('Subscription', Model.Subscription);
var Subscription = require('./lib/subscription.js').Subscription;
var url = require('url');
var util = require('util');

/**
 * @constructor
 */
function Factory() {
  var self = this;
  events.EventEmitter.call(self);
  self.hubs = [];
  self.subscription = new subscription();

  // Connect to the db and load up all of the existing hubs.
  subscription.find({}, function onFind(err, docs) {
    if (err) {
      self.emit('error', err);
      return;
    }
    for (var x in docs) {
      var sub = new Subscription(docs[x].feed);
      sub.on('loaded', function onLoaded(loadedSub) {
        var hub = new PubHub(loadedSub);
        var index = (self.hubs.push(hub) - 1);
        self.hubs[index].listen();
        self.hubs[index].on('changed', function onChanged(data) {
          self.hubs[index].Subscription.updateData(data);
          self.hubs[index].publish(data);
        });
      });
    }
  });
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
  var newSubscriber = new subscriber();
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
    var newSubscription = new Subscription(sub.hub_topic, newSubscriber);
    newSubscription.on('loaded', function onLoaded(loadedSub) {
      loadedSub.save();
      var newHub = new PubHub(loadedSub);
      var index = (self.hubs.push(newHub) - 1);
      self.hubs[index].listen();
      self.hubs[index].on('changed', function onChanged(data) {
        self.hubs[index].Subscription.updateData(data);
        self.hubs[index].publish(data);
      });
    });
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

  // Find the feed that's being published.
  // TODO - improve this search.
  for (var x in self.hubs) {
    if (self.hubs[x].getFeed() === url) {
      var options = self.hubs[x].getFeed(true);
      options.headers = {
        'User-Agent': 'PubHub (https://github.com/elliotttf/PubHub)'
      };
      self.hubs[x].fetch(options);
      break;
    }
  }
};

/**
 * Exports the factory class.
 */
exports.Factory = Factory;
