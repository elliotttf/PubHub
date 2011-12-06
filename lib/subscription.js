/**
 * @fileoverview Handles feed subscriptions.
 */

var events = require('events');
var mongoose = require('mongoose');
var Model = require('../models/models.js');
var subscriber = Model.Subscriber;
var subscription = Model.Subscription;

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
function Subscription(feed, sub) {
  var self = this;
  events.EventEmitter.call(self);

  // First, try to load the object from the database
  // to determine how to handle the subscriber.
  self.db = mongoose.connect('mongodb://localhost/pubhub');
  self.Subscriber = new mongoose.model('Subscriber', subscriber);
  self.Subscriber.feed = feed;

  self.Subscription.findOne(
    { 'feed': self.Subscriber.feed },
    function foundOne(err, doc) {
      if (err) {
        self.emit('error', err);
        return;
      }

      // A new subscription!
      if (doc === null) {
        self.subscribers = [];
        self.changed = Date.now();
        self.data = '';
        self.contentType = 'application/atom+xml';
      }
      // Load the existing subscription.
      else {
        self.subscribers = doc.subscribers;
        self.changed = doc.changed;
        self.data = doc.data;
        self.contentType = doc.contentType;
      }

      // Add the new subscriber.
      if (typeof sub !== 'undefined') {
        var newSub = new mongoose.model('Subscriber', subscriber);
        newSub.callback = sub.callback;
        newSub.created = sub.created;
        newSub.lease_seconds = sub.lease_seconds;
        newSub.secret = sub.secret;
        newSub.verify_token = sub.verify_token;
        self.subscribers.push(newSub);
      }

      self.emit('loaded', 'Subscription loaded.');
    }
  );
}
util.inherits(Subscription, events.EventEmitter);

/**
 * Adds or updates a subscription for this.feed.
 */
Subscription.prototype.save = function() {
  var self = this;
  self.Subscription.update(
    { 'feed': self.feed },
    self.Subscriber,
    { 'upsert': true },
    function onUpdate(err) {
      if (err) {
        self.emit('error', err);
        return;
      }
      self.emit('saved', 'Saved the subscription.');
    }
  );
};

/**
 * Removes the subscription from the database.
 */
Subscription.prototype.remove = function() {
  var self = this;
  self.Subscription.remove(
    { 'feed': self.Subscription.feed },
    function onRemove(err) {
      if (err) {
        self.emit('error', err);
        return;
      }
      self.emit('removed', 'Removed subscription');
    }
  );
};

/**
 * Adds a subscriber to the subscription.
 *
 * @param {Subscriber} sub
 *   A subscriber object to add to the subscribers array.
 */
Subscription.prototype.addSubscriber = function(sub) {
  self.Subscription.subscribers.push(sub);
  self.Subscription.save(function onSave(err) {
    if (err) {
      self.emit('error', err);
      return;
    }
    self.emit('saved', 'Added new subscriber.');
  });
};

/**
 * Removes a subscriber from the subscription.
 *
 * @param {string} callback
 *   The subscriber callback URL.
 */
 Subscription.prototype.removeSubscriber = function(callback) {
   var self = this;
   // TODO - improve this search.
   for (var x in self.Subscription.subscribers) {
     if (self.Subscription.subscribers[x].callback == sub) {
       self.Subscription.subscribers[x].remove();
       self.Subscription.save(function onSave(err) {
         if (err) {
           self.emit('error', err);
           return;
         }
         self.emit('saved', 'Removed subscriber');
       });
       break;
     }
   }
 };

/**
 * Exports the Subscription class.
 */
exports.Subscription = Subscription;

