PubHub
======

A node.js implementation of a PubSub hub which allows one to many communication:

* one: the feed to subscribe to.
* many: the subscribers to respond to.

Dependencies
------------

This application requires MySQL as a persistant data store. To connect to the database copy the example\_local.json file to local.json and fill out the appropriate connection details.

Installation
------------

It's easiest to install PubHub with npm:

```
npm install
```

The specific packages used are listed in the package.json file.

Currently, you must manually create the MySQL database tables. See SCHEMA.md for the commands to do this.

After the database is created, copy example_local.json to local.json and fill out the appropriate connection settings.

Running
-------

```
node app.js
```

The server listens on port 3000 by default. You can add subscriptions by sending Pubsubhubbub subscribe requests to $HOST:3000/subscribe.
