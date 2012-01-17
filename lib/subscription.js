/**
 * @fileoverview Handles feed subscriptions.
 */

var crypto = require('crypto');
var events = require('events');
var mongoose = require('mongoose');
var Models = require('../models/models.js');
var subscriber = mongoose.model('Subscriber', Models.Subscriber);
var subscription = mongoose.model('Subscription', Models.Subscription);
var util = require('util');

/**
 * Creates a new subscription object with one
 * subscribed feed and one-N subscriptions.
 *
 * @param {string} feed
 *   The url string for the feed to subscribe to.
 * @param {object} sub
 *   (optional) An object representation of a subscriber:
 *   {
 *     callback: the callback URL.
 *     created: timestamp for when the subscription was created.
 *     lease_seconds: (optional) how long the subscription is active
 *     secret: (optional) A subscriber-provided secret string that
 *             will be used to compute an HMAC digest for authorized
 *             content distribution.
 *     verify_token: (optional) A subscriber-provided opaque token
 *                   that will be echoed back in the verification
 *                   request to assist the subscriber in identifying
 *                   which subscription request is being verified.
 *   }.
 * @constructor
 */
function Subscription(feed) {
  var self = this;
  events.EventEmitter.call(self);

  // Tracks whether or not subscribers are loaded, false by default.
  self.subscribersLoaded = false;

  // First, try to load the object from the database
  // to determine how to handle the subscriber.
  self.Subscription = new subscription();
  self.Subscription.feed = feed;

  console.log('Loading a subscription for %s', self.Subscription.feed);
  subscription.findOne(
    { 'feed': self.Subscription.feed },
    function foundOne(err, doc) {
      if (err) {
        self.emit('error', err);
        return;
      }

      // A new subscription!
      if (doc === null) {
        self.Subscription.subscribers = [];
        self.Subscription.changed = Date.now();
        self.Subscription.data = '';
        self.Subscription.contentType = 'application/atom+xml';
        self.Subscription.publish = false;
      }
      // Load the existing subscription.
      else {
        // Purposely set the subscribers array to empty. We'll only
        // load it when someone needs to access it.
        self.Subscription.subscribers = [];
        self.Subscription.changed = doc.changed;
        self.Subscription.data = doc.data;
        self.Subscription.contentType = doc.contentType;
        self.Subscription.publish = doc.publish;
      }

      self.emit('loaded', self);
    }
  );
}
util.inherits(Subscription, events.EventEmitter);

/**
 * Adds or updates a subscription for this.feed.
 */
Subscription.prototype.save = function() {
  var self = this;
  var updateObj = {
    'feed': self.Subscription.feed,
    'changed': self.Subscription.changed,
    'data': self.Subscription.data,
    'contentType': self.Subscription.contentType,
    'publish': self.Subscription.publish
  };

  // Only set the subscribers array if it's available.
  if (self.Subscription.subscribers.count) {
    updateObj.subscribers = self.Subscription.subscribers;
  }

  subscription.update(
    { 'feed': self.Subscription.feed },
    { '$set': updateObj },
    { 'upsert': true },
    function onUpdate(err) {
      if (err) {
        self.emit('error', err);
        return;
      }
      console.log('Saved subscription for %s.', self.Subscription.feed);
      self.emit('saved', 'Saved the subscription.');
    }
  );
};

/**
 * Removes the subscription from the database.
 */
Subscription.prototype.remove = function() {
  var self = this;
  subscription.remove(
    { 'feed': self.Subscription.feed },
    function onRemove(err) {
      if (err) {
        self.emit('error', err);
        return;
      }
      console.log('Removed subscription for %s.', self.Subscription.feed);
      self.emit('removed', 'Removed subscription');
    }
  );
};

/**
 * Loads the subscribers for this subscription.
 */
Subscription.prototype.loadSubscribers = function() {
  var self = this;
  subscription.findOne(
    { 'feed': self.Subscription.feed },
    function foundOne(err, doc) {
      if (err) {
        self.emit('error', err);
        return;
      }

      self.subscribersLoaded = true;
      self.Subscription.subscribers = doc.subscribers;
      self.emit('subscribersLoaded', 'Subscribers loaded.');
    }
  );
};

/**
 * Unloads the subscribers for this subscription.
 */
Subscription.prototype.unloadSubscribers = function() {
  var self = this;
  self.subscribersLoaded = false;
  self.Subscription.subscribers = [];
};

/**
 * Adds a subscriber to the subscription.
 *
 * @param {Subscriber} sub
 *   A subscriber object to add to the subscribers array.
 */
Subscription.prototype.addSubscriber = function(sub) {
  var self = this;

  if (typeof upsert === 'undefined') {
    upsert = false;
  }

  /**
   * Helper function to search for and update or insert the
   * new subscriber.
   *
   * @param {object} newSub
   *   The new subscriber object.
   */
  var upsertSub = function(newSub) {
    // If this subscriber already exists, update it, else add it.
    // TODO - improve this search.
    var found = false;
    for (var x in self.Subscription.subscribers) {
      if (self.Subscription.subscribers[x].callback === newSub.callback) {
        // Update all the fields of subscriber from sub.
        self.Subscription.subscribers[x].callback = newSub.callback;
        self.Subscription.subscribers[x].created = newSub.created;
        self.Subscription.subscribers[x].lease_seconds = newSub.lease_seconds;
        self.Subscription.subscribers[x].secret = newSub.secret;
        self.Subscription.subscribers[x].verify_token = newSub.verify_token;
        found = true;
        break;
      }
    }

    // TODO - insert in sorted order.
    if (!found) {
      self.Subscription.subscribers.push(newSub);
    }
    self.save();
  };

  if (self.subscribersLoaded) {
    upsertSub(sub);
  }
  else {
    self.loadSubscribers();
    self.once('subscribersLoaded', function subscribersLoaded(msg) {
      upsertSub(sub);
      // Unload the subscribers after we save.
      self.once('saved', function onSavedUnload(msg) {
        self.unloadSubscribers();
      });
    });
  }
};

/**
 * Removes a subscriber from the subscription.
 *
 * @param {string} callback
 *   The subscriber callback URL.
 */
Subscription.prototype.removeSubscriber = function(callback) {
  var self = this;
  var removeSub = function(rCallback) {
    // TODO - improve this search.
    for (var x in self.Subscription.subscribers) {
      if (self.Subscription.subscribers[x].callback === rCallback) {
        self.Subscription.subscribers[x].remove();
      }
    }

    self.save();
    self.once('saved', function onSave(msg) {
      console.log('Removed subscriber for %s.', self.Subscription.feed);

      // If we removed the last subscriber, notify.
      if (self.Subscription.subscribers.length === 0) {
        console.log(
          'Removed all subscribers for %s.',
          self.Subscription.feed
        );
        self.emit('removedAll', 'All subscribers have been removed.');
      }
    });
  };

  if (self.subscribersLoaded) {
    removeSub(callback);
  }
  else {
    self.loadSubscribers();
    self.once('subscribersLoaded', function subscribersLoaded(msg) {
      removeSub(callback);
      self.once('saved', function onSavedUnload(msg) {
        self.unloadSubscribers();
      });
    });
  }
};

/**
 * Updates the feed data hash.
 *
 * @param {string} data
 *   The feed data to update.
 */
Subscription.prototype.updateData = function(data) {
  var self = this;
  self.Subscription.data = crypto.createHash('md5').update(data).digest('hex');
  self.Subscription.changed = Date.now();
  self.save();
};

/**
 * Exports the Subscription class.
 */
exports.Subscription = Subscription;

