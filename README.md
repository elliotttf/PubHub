PubHub
======

A node.js implementation of a PubSub hub which allows one to many communication:

* one: the feed to subscribe to.
* many: the subscribers to respond to.

Dependencies
------------

This application requires mongodb or mysql as a persistant data store. To connect to the database copy the example\_local.json file to local.json and fill out the appropriate connection details.

Installation
------------

It's easiest to install PubHub with npm, the specific packages used are listed in the package.json file.

Running
-------

```
node app.js
```
