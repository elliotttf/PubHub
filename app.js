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
var routes = require('./routes');
var util = require('util');

if (cluster.isMaster) {
  // Make sure the options file is present.
  try {
    require('fs').statSync('./local.json');
  }
  catch (error) {
    util.log(
      'You must create a local.json file with database configuration ' +
      'options. See example_local.json for an example.'
    );
    process.exit(1);
  }

  // Start the factory!
  var factory = new Factory();

  // Listen with no more processes than we have CPUs.
  for (var i = 0; i < require('os').cpus().length; i++) {
    var worker = cluster.fork();

    worker.on('message', function onMessage(msg) {
      if (msg.query) {
        factory.subscribe(msg.query);
      }
      else if (msg.feed) {
        factory.publish(msg.feed);
      }
    });
  }

  cluster.on('death', function onDeath(worker) {
    util.log('Worker ' + worker.pid + ' died. Restarting.');
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

  var hubEvents = new events.EventEmitter();
  hubEvents.on('subscribed', function onSubscribed(query) {
    process.send({ 'query': query });
  });
  hubEvents.on('published', function onPublished(feed) {
    process.send({ 'feed': feed });
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

  var optionsFile = require('fs').readFileSync('./local.json', 'utf8');
  var options = JSON.parse(optionsFile);
  var port = 3000;
  if (typeof options.port !== 'undefined') {
    port = options.port;
  }

  app.listen(port);
}

