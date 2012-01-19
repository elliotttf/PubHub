/**
 * @fileoverview Unit tests for the hub code.
 */

var PubHub = require('../lib/pubhub.js').PubHub;
var Subscription = require('../lib/subscription.js').Subscription;
var url = require('url');

exports.hubTests = {
  'setUp': function(callback) {
    var self = this;
    self.feed = 'https://github.com/elliotttf.atom';
    self.subObj = {
      'callback': 'http://127.0.0.1:3999',
      'created': Date.now(),
      'lease_seconds': 0,
      'secret': 'foo',
      'verify_token': 'bar',
    };
    var sub = new Subscription(self.feed, self.subObj);
    sub.on('loaded', function onLoaded(loadedSub) {
      self.subscription = loadedSub;
      self.subscription.save();
      callback();
    });
  },
  'subscription info': function(test) {
    var self = this;

    test.expect(4);

    var hub = new PubHub(self.subscription);
    test.equal(hub.getFeed(), self.feed, 'Subscription feed correctly set.');
    var myParsedFeed = url.parse(self.feed);
    var parsedFeed = hub.getFeed(true);
    test.ok(
      (
        parsedFeed.protocol === myParsedFeed.protocol &&
        parsedFeed.slashes === myParsedFeed.slashes &&
        parsedFeed.host === myParsedFeed.host &&
        parsedFeed.hostname === myParsedFeed.hostname &&
        parsedFeed.href === myParsedFeed.href &&
        parsedFeed.pathname === myParsedFeed.pathname &&
        parsedFeed.path === myParsedFeed.pathname
      ),
      'Subscription feed correctly parsed.'
    );
    test.equal(hub.getChanged(), self.subscription.Subscription.changed, 'Changed set correctly.');
    test.equal(hub.getData(), self.subscription.Subscription.data);

    self.subscription.remove();
    self.subscription.on('removed', function(msg) {
      self.subscription.destroy();
      test.done();
    });
  },
  'listen test': function(test) {
    var self = this;

    test.expect(2);

    var hub = new PubHub(self.subscription, 1000);
    hub.listen();
    test.ok(hub.listenLoopId !== null, 'Hub listening on an interval.');
    hub.on('changed', function onChange(msg) {
      hub.stop();
      test.ok(hub.listenLoopId === null, 'Hub listening interval removed.');
      self.subscription.remove();
      self.subscription.on('removed', function(msg) {
        self.subscription.destroy();
        test.done();
      });
    });
  },
  'publish test': function(test) {
    var http = require('http');
    var self = this;
    var data = 'hello world';

    test.expect(2);

    var server = http.createServer(function (req, res) {
      var body = '';
      req.on('data', function onData(chunk) {
        body += chunk;
      });

      req.on('end', function onEnd() {
        test.equal(body, data, 'Data received.');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end();
      });
    });

    server.listen(3999, '127.0.0.1');
    var hub = new PubHub(self.subscription);
    hub.publish(data);
    hub.on('published', function onPublished(msg) {
      test.ok(true, msg);
      self.subscription.remove();
      self.subscription.on('removed', function(msg) {
        self.subscription.destroy();
        server.close();
        test.done();
      });
    });
  }
};

