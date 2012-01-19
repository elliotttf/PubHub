/**
 * @fileoverview Handles feed subscriptions.
 */

var crypto = require('crypto');
var events = require('events');
var mysql = require('mysql');
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
function Subscription(feed, sub) {
  var self = this;
  events.EventEmitter.call(self);

  var optionsFile = require('fs').readFileSync('./local.json', 'utf8');
  self.options = JSON.parse(optionsFile);

  self.mysql = mysql.createClient(self.options.database);
  self.mysql.useDatabase(self.options.database.database);

  // First, try to load the object from the database
  // to determine how to handle the subscriber.
  self.Subscription = {};
  self.Subscription.feed = feed;
  self.Subscription.subscribers = [];

  console.log('Loading a subscription for %s', self.Subscription.feed);
  self.mysql.query(
    "SELECT * FROM subscriptions WHERE feed = ?",
    [self.Subscription.feed],
    function foundOne(err, results, fields) {
      if (err) {
        self.emit('error', err);
        return;
      }

      doc = null;
      if (results.length > 0) {
        doc = results[0];
      }

      // A new subscription!
      if (doc === null) {
        self.Subscription.changed = Date.now();
        self.Subscription.data = '';
        self.Subscription.contentType = 'application/atom+xml';
        self.Subscription.push = false;
      }
      // Load the existing subscription.
      else {
        // Load the subscribers.
        self.mysql.query(
          'SELECT callback, created, lease_seconds, secret, verify_token ' +
            'FROM subscribers ' +
            "WHERE feed = ?",
          [self.Subscription.feed],
          function onSubscribersLoaded(err, subResults, subFields) {
            if (err) {
              self.emit('error', err);
              return;
            }

            for (var i in subResults) {
              self.Subscription.subscribers[i] = subResults[i];
            }

            self.emit('subscribersLoaded');
          }
        );
        self.Subscription.changed = doc.changed;
        self.Subscription.data = doc.data;
        self.Subscription.contentType = doc.contentType;
        self.Subscription.push = doc.push;
      }

      // Add the new subscriber.
      if (typeof sub !== 'undefined') {
        var newSub = {};
        newSub.callback = sub.callback;
        newSub.created = sub.created;
        newSub.lease_seconds = sub.lease_seconds;
        newSub.secret = sub.secret;
        newSub.verify_token = sub.verify_token;
        self.Subscription.subscribers.push(newSub);

        if (doc === null) {
          self.emit('loaded', self);
        }
      }
      else if (doc === null) {
        self.emit('loaded', self);
      }

      self.once('subscribersLoaded', function onSubscribersLoaded(msg) {
        self.emit('loaded', self);
      });
    }
  );
}
util.inherits(Subscription, events.EventEmitter);

/**
 * Simple destructor, mainly used to close database connections.
 */
Subscription.prototype.destroy = function() {
  this.mysql.end();
};

/**
 * Adds or updates a subscription for this.feed. This function assumes
 * all records should be upserted.
 */
Subscription.prototype.save = function() {
  var self = this;

  self.mysql.query(
    'INSERT INTO subscriptions ' +
      '(feed, changed, data, contentType, push) ' +
      'VALUES ' +
      "(?, ?, ?, ?, ?) " +
      'ON DUPLICATE KEY UPDATE ' +
      "changed = ?, data = ?, contentType = ?, push = ?",
    [
      self.Subscription.feed,
      self.Subscription.changed,
      self.Subscription.data,
      self.Subscription.contentType,
      self.Subscription.push,
      self.Subscription.changed,
      self.Subscription.data,
      self.Subscription.contentType,
      self.Subscription.push
    ],
    function onUpdate(err) {
      if (err) {
        self.emit('error', err);
        return;
      }

      var saved = 0;

      // Upsert the subscribers.
      // TODO - consider calling self.addSubscriber instead.
      for (var i in self.Subscription.subscribers) {
        self.mysql.query(
          'INSERT INTO subscribers ' +
            '(feed, callback, created, lease_seconds, secret, verify_token) ' +
            'VALUES ' +
            "(?, ?, ?, ?, ?, ?) " +
            'ON DUPLICATE KEY UPDATE ' +
            "created = ?, lease_seconds = ?, secret = ?, verify_token = ?",
          [
            self.Subscription.feed,
            self.Subscription.subscribers[i].callback,
            self.Subscription.subscribers[i].created,
            self.Subscription.subscribers[i].lease_seconds,
            self.Subscription.subscribers[i].secret,
            self.Subscription.subscribers[i].verify_token,
            self.Subscription.subscribers[i].created,
            self.Subscription.subscribers[i].lease_seconds,
            self.Subscription.subscribers[i].secret,
            self.Subscription.subscribers[i].verify_token
          ],
          function onSubUpdate(err) {
            if (err) {
              self.emit('error', err);
              return;
            }

            self.emit('savedOneSubscriber', i);
          }
        );
      }

      if (self.Subscription.subscribers.length === saved) {
        console.log('Saved subscription for %s.', self.Subscription.feed);
        self.emit('saved', 'Saved the subscription.');
      }
      else {
        self.on('savedOneSubscriber', function onSaved() {
          saved++;
          if (self.Subscription.subscribers.length === saved) {
            console.log('Saved subscription for %s.', self.Subscription.feed);
            self.emit('saved', 'Saved the subscription.');
            self.removeAllListeners('savedOneSubscriber');
          }
        });
      }
    }
  );
};

/**
 * Removes the subscription from the database.
 */
Subscription.prototype.remove = function() {
  var self = this;

  self.mysql.query(
    "DELETE FROM subscribers WHERE feed = ?",
    [self.Subscription.feed],
    function onSubDelete(subErr) {
      if (subErr) {
        self.emit('error', subErr);
        return;
      }
      self.mysql.query(
        "DELETE FROM subscriptions WHERE feed = ?",
        [self.Subscription.feed],
        function onDelete(err) {
          if (err) {
            self.emit('error', err);
            return;
          }

          console.log('Removed subscription for %s.', self.Subscription.feed);
          self.emit('removed', 'Removed subscription');
        }
      );
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
  var self = this;
  // If this subscriber already exists, update it, else add it.
  // TODO - improve this search.
  var found = false;
  for (var x in self.Subscription.subscribers) {
    if (self.Subscription.subscribers[x].callback === sub.callback) {
      // Update all the fields of subscriber from sub.
      self.Subscription.subscribers[x].callback = sub.callback;
      self.Subscription.subscribers[x].created = sub.created;
      self.Subscription.subscribers[x].lease_seconds = sub.lease_seconds;
      self.Subscription.subscribers[x].secret = sub.secret;
      self.Subscription.subscribers[x].verify_token = sub.verify_token;
      found = true;
      break;
    }
  }

  // TODO - insert in sorted order.
  if (!found) {
    self.Subscription.subscribers.push(sub);
  }

  self.mysql.query(
    'INSERT INTO subscribers ' +
      '(feed, callback, created, lease_seconds, secret, verify_token) ' +
      'VALUES ' +
      "(?, ?, ?, ?, ?, ?) " +
      'ON DUPLICATE KEY UPDATE ' +
      "created = ?, lease_seconds = ?, secret = ?, verify_token = ?",
    [
      self.Subscription.feed,
      sub.callback,
      sub.created,
      sub.lease_seconds,
      sub.secret,
      sub.verify_token,
      sub.created,
      sub.lease_seconds,
      sub.secret,
      sub.verify_token
    ],
    function onSubUpdate(err) {
      if (err) {
        self.emit('error', err);
        return;
      }
      console.log('Added/updated subscriber for %s.', self.Subscription.feed);
      self.emit('saved', 'Added/updated subscriber.');
    }
  );
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
    if (self.Subscription.subscribers[x].callback === callback) {
      delete self.Subscription.subscribers[x];

      self.Subscription.subscribers.splice(x, 1);
      self.mysql.query(
        "DELETE FROM subscribers WHERE feed = ? AND callback = ?",
        [self.Subscription.feed, callback],
        function onDelete(err) {
          if (err) {
            self.emit('error', err);
            return;
          }
          console.log('Removed subscriber for %s.', self.Subscription.feed);
          self.emit('saved', 'Removed subscriber.');

          // If we removed the last subscriber, notify.
          if (self.Subscription.subscribers.length === 0) {
            console.log(
              'Removed all subscribers for %s.',
              self.Subscription.feed
            );
            self.emit('removedAll', 'All subscribers have been removed.');
          }
        }
      );
    }
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

