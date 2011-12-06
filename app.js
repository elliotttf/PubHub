
/**
 * Module dependencies.
 */

var Factory = require('./factory.js').Factory;
var form = require('connect-form');
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
var factory = new Factory();

// Routes
app.get('/', routes.index);
app.post('/subscribe', function onSubscribe(res, req) {
  routes.subscribe(res, req, factory);
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
