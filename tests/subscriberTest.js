/**
 * @fileoverview tests subscriber object functionality.
 */

var Subscription = require('../lib/subscription.js').Subscription;


exports.subscriberTest = {
  'setUp': function(callback) {
    this.feed = 'https://github.com/elliotttf.atom';
    this.subObj = {
      'callback': 'http://localhost/subscriptionTest',
      'created': Date.now(),
      'lease_seconds': 0,
      'secret': 'foo',
      'verify_token': 'bar',
    };

    callback();
  },
  'subscription': function(test) {
    var self = this;
    var sub = new Subscription(self.feed, self.subObj);
    sub.once('loaded', function onLoaded(loadedSub) {
      test.equal(loadedSub.Subscription.feed, self.feed, 'Feed saved correctly.');
      test.equal(loadedSub.Subscription.subscribers[0]['callback'], self.subObj.callback);
      sub.save();
    });
    sub.once('saved', function onSaved(msg) {
      sub.destroy();
      sub = null;
      sub = new Subscription(self.feed);
      sub.on('loaded', function onLoaded(loadedSub) {
        test.equal(loadedSub.Subscription.feed, self.feed, 'Feed saved correctly.');
        test.equal(loadedSub.Subscription.subscribers[0]['callback'], self.subObj.callback);

        sub.remove();
      });
      sub.on('removed', function onRemoved(msg) {
        sub.removeAllListeners();
        sub.destroy();
        sub = null;
        test.ok(true, msg);
        test.done();
      });
    });
  },
  'add subscriber': function(test) {
    var self = this;
    var sub = new Subscription(self.feed);
    sub.once('loaded', function onLoaded(loadedSub) {
      sub.save();
    });
    sub.once('saved', function onSaved(msg) {
      sub.addSubscriber(self.subObj);
      sub.once('saved', function onSubSaved(msg) {
        sub.destroy();
        sub = null;
        sub = new Subscription(self.feed);
        sub.once('loaded', function onLoaded(loadedSub) {
          test.equal(loadedSub.Subscription.subscribers[0]['callback'], self.subObj.callback);

          sub.remove();
        });
        sub.on('removed', function onRemoved(msg) {
          sub.removeAllListeners();
          sub.destroy();
          sub = null;
          test.ok(true, msg);
          test.done();
        });
      });
    });
  },
  'remove subscriber': function(test) {
    var self = this;
    var sub = new Subscription(self.feed, self.subObj);
    sub.on('loaded', function onLoaded(loadedSub) {
      sub.removeSubscriber(self.subObj.callback);
    });
    sub.on('removedAll', function onRemovedAll(msg) {
      test.equal(sub.Subscription.subscribers.length, 0);
      sub.remove();
    });
    sub.on('removed', function onRemoved(msg) {
      sub.removeAllListeners();
      sub.destroy();
      sub = null;
      test.ok(true, msg);
      test.done();
    });
  }
};
