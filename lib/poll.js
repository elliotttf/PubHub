/**
 * @fileoverview Polling engine for node.js
 */

var events = require('events');
var http = require('http');
var url = require('url');
var util = require('util');

/**
 * @constructor
 */
function PubHub(get, set) {
  this.get = url.parse(get);
  this.set = url.parse(set);
  this.changed = Date.now();
  this.data = '';
  this.listenLoopId = null;
}
util.inherits(PubHub, events.EventEmitter);

/**
 * Frequency to check for changes in milliseconds.
 * @const
 * @type {int}
 */
PubHub.REFRESH = 60000;

/**
 * Polls the get URL for changes.
 *
 * @emits changed
 */
PubHub.prototype.listen = function() {
  var self = this;
  var options = {
    'host': self.get.host,
    'path': self.get.path,
  };
  var getString = url.format(self.get);
  self.listenLoopId = setInterval(
    function listenLoop() {
      var req = http.get(options, function onReq(res) {
        console.log('Polling %s for changed data.', getString);
        var data = '';
        res.on('data', function onData(chunk) {
          data += chunk;
        });
        res.on('end', function onEnd() {
          if (data != self.data) {
            console.log('New data found on %s.', getString);
            self.data = data;
            self.changed = Date.now();
            self.emit('changed', data);
          }
        });
      });

      req.on('error', function onError(err) {
        console.log(err);
      });
    },
    PubHub.REFRESH
  );
};

/**
 *
 */
PubHub.prototype.publish = function() {
};

exports.PubHub = PubHub;

