/**
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index', { title: 'PubHub' })
};

exports.subscribe = require('./subscribe.js').subscribe;

