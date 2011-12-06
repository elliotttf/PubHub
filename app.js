
/**
 * Module dependencies.
 */

var Factory = require('./factory.js').Factory;
var form = require('connect-form');
var events = require('events');
var express = require('express');
var mongoose = require('mongoose');
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
mongoose.connect('mongodb://localhost/pubhub');
mongoose.connection.on('error', function(err) {
  console.error(err);
});
var factory = new Factory();
var subscribeEvents = new events.EventEmitter();
subscribeEvents.on('subscribed', function onSubscribed(query) {
  factory.subscribe(query);
});

// Routes
app.get('/', routes.index);
app.post('/subscribe', function onSubscribe(res, req) {
  routes.subscribe(res, req, subscribeEvents);
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
