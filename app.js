
/**
 * Module dependencies.
 */

var cp = require('child_process');
var form = require('connect-form');
var events = require('events');
var express = require('express');
var routes = require('./routes');

var app = module.exports = express.createServer(
  form({ keepExtensions: true })
);

// Configuration

app.configure(function(){
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

// Start the hub factory.
var factory = cp.fork('./factory.js');
function killFactory(signal) {
  factory.removeAllListeners('exit');
  factory.kill(signal);
  process.exit();
}

var hubEvents = new events.EventEmitter();
hubEvents.on('subscribed', function onSubscribed(query) {
  factory.send({ 'subscribed': query });
});
hubEvents.on('published', function onPublished(feed) {
  factory.send({ 'published': feed });
});

// If the factory died, we should die too!
// We assume that any exit of the factory is unexpected.
factory.on('exit', function seppuku(code, signal) {
  console.log('Factory died unexpectedly!');
  process.exit(1);
});

// Kill the factory if we're exiting.
process.on('SIGHUP', function onSIGHUP() {
  killFactory('SIGHUP');
});
process.on('SIGINT', function onSIGINT() {
  killFactory('SIGINT');
});
process.on('SIGKILL', function onSIGKILL() {
  killFactory('SIGKILL');
});
process.on('SIGTERM', function onSIGTERM() {
  killFactory('SIGTERM');
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
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
