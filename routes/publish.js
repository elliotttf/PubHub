/**
 * @fileoverview handles publish notifications from feeds.
 */

/**
 * Exports the publish route.
 *
 * @param {object} req
 *   The request object.
 * @param {object} res
 *   The response object.
 * @param {EventEmitter} hubEvents
 *   Event emitter to notify the factory with.
 */
exports.publish = function(req, res, hubEvents) {
  console.log('Incoming publish notification.');
  if (req.form) {
    req.form.complete(function(err, fields, files) {
      respond(fields, res, hubEvents);
    });
  }
  else {
    respond(params.body, res, hubEvents);
  }
};

/**
 * Handles the actual publish notification.
 *
 * @param {object} fields
 *   The POST fields.
 * @param {object} res
 *   The response object.
 * @param {EventEmitter} hubEvents
 *   Event emitter to notify the factory with.
 */
function respond(fields, res, hubEvents) {
  var valid = true;
  if (typeof fields['hub.mode'] === 'undefined' || fields['hub.mode'] !== 'publish') {
    valid = false;
  }
  if (typeof fields['hub.url'] === 'undefined') {
    valid = false;
  }
  if (!valid) {
    res.send('Invalid publish notification', 500);
    return;
  }

  // Respond and notify the factory of new content.
  res.send('Thanks.', 204);
  hubEvents.emit('published', fields['hub.url']);
}

