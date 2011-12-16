/**
 * @fileoverview Redis model definition.
 */

function Model(client, schema) {
  this.client = client;

  for (var x in schema.properties) {
    for (var y in this[x]) {
      if (y === 'type') {
        switch (this[x][y]) {
          case 'string':
            this[x] = '';
            break;
          case 'number':
            this[x] = 0;
            break;
          case 'integer':
            this[x] = 0;
            break;
          case 'boolean':
            this[x] = false;
            break;
          case 'object':
            this[x] = {};
            break;
          case 'array':
            this[x] = [];
            break;
          case 'null':
          case 'any':
            this[x][y] = null;
            break;
        }
      }
    }
  }

  // Assumes one uniqe per schema...
  for (var x in schema.uniqueItems) {
    if (typeof this[x] !== 'undefined') {
      this.key = x;
      break;
    }
  }

  return Redis.compile(client, this);
}

function Redis(client, schema) {
  this.client = client;
  this.schema = schema;
}


Redis.prototype.save = function(callback) {
  var self = this;
  var json = JSON.stringify(self);
  self.client.hset(self.schema.key, 'value', json, callback);
};

Redis.prototype.update = function(conditions, query, options, callback) {
  var self = this;
  if (typeof options === 'function') {
    callback = options;
  }
  if (typeof query['$set'] !== 'undefined') {
    for (var x in query['$set']) {
      self[x] = query['$set'][x];
    }
  }
  var json = JSON.stringify(self);
  self.client.hset(self.schema.key, 'value', json, callback);
};

Redis.prototype.remove = function(conditions, callback) {
  var self = this;
  self.client.hdel(self.schema.key, callback);
};

Redis.prototype.find = function(conditions, callback) {
  var self = this;
  self.client.keys('*', function allKeys(err, keys) {
    var docs = [];
    // TODO - make callback safe...
    for (var x in keys) {
      self.client.hget(keys[x], 'value', function onGet(gErr, doc) {
        docs.push(JSON.parse(doc));
      });
    }
    callback(err, docs);
  });
}

Redis.prototype.findOne = function(conditions, callback) {
  var self = this
  if (typeof conditions[self.schema.key] === 'undefined') {
    throw 'Cannot find without using the key.';
  }

  self.client.hget(conditions[self.schema.key], 'value', function onGet(err, doc) {
    callback(err, doc);
  });
};

Redis.compile = function(client, schema) {
  function redis() {
    Redis.apply(this, arguments);
  }

  redis.__proto__ = Redis;
  redis.prototype.__proto__ = Redis.prototype;

  return redis;
};

exports.Model = Model;
