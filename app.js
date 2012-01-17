/**
 * @fileoverview Base for PubHub.
 */

/**
 * Module dependencies.
 */

var cluster = require('cluster');
var cp = require('child_process');
var events = require('events');
var express = require('express');
var Factory = require('./factory.js').Factory;
var form = require('connect-form');
var mongoose = require('mongoose');
var routes = require('./routes');
var subscriber = mongoose.model('Subscriber', Models.Subscriber);

mongoose.connect('mongodb://localhost/pubhub');
mongoose.connection.on('error', function(err) {
  console.error(err);
});

if (cluster.isMaster) {
  var cpus = require('os').cpus().length;

  // TODO - select all the existing subscriptions and assign them
  // to a CPU for processing.

  // Create no more processes than we have CPUs.
  for (var i = 0; i < cpus; i++) {
    var worker = cluster.fork();

    worker.on('message', function onMessage(msg) {
      // TODO - figure out which worker is actually handling this.
      // if it's a new subscription, just pick one.
      if (msg.subscribe) {
      }
      else if (msg.publish) {
      }
    });
  }

  cluster.on('death', function onDeath(worker) {
    console.log('Worker ' + worker.pid + ' died. Restarting.');
    cluster.fork();
  });
}
else  {
  var app = module.exports = express.createServer(
    form({ keepExtensions: true })
  );

  // Configuration
  app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
  });

  app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  app.configure('production', function(){
    app.use(express.errorHandler());
  });

  // Start the factory!
  var factory = new Factory();

  var hubEvents = new events.EventEmitter();
  // TODO - figure out if we can handle this, or if it needs to be routed.
  hubEvents.on('subscribed', function onSubscribed(query) {
    process.send({ 'subscribe': query });
  });
  hubEvents.on('published', function onPublished(feed) {
    process.send({ 'publish': feed });
  });

  // Routes
  app.get('/', routes.index);
  app.get('/subscribe', function onGet(req, res) {
    res.send('Only POST subscriptions are supported.');
  });
  app.post('/subscribe', function onSubscribe(req, res) {
    routes.subscribe(req, res, hubEvents);
  });
  app.post('/publish', function onPublish(req, res) {
    routes.publish(req, res, hubEvents);
  });

  app.listen(3000);

  process.on('message', function onMessage(msg) {
    if (msg.subscribe) {
      factory.subscribe(msg.subscribe);
    }
    else if (msg.publish) {
      factory.publish(msg.publish)
    }
  });
}

