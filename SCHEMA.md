Until I can find a better way to automatically install the schema, here are the table definitions:

```
CREATE TABLE subscriptions (
feed VARCHAR(256),
changed BIGINT UNSIGNED NOT NULL DEFAULT 0,
data VARCHAR(32),
contentType VARCHAR(32),
push TINYINT UNSIGNED NOT NULL DEFAULT 0,
PRIMARY KEY (feed));
```

```
CREATE TABLE subscribers (
feed VARCHAR(256),
callback VARCHAR(256),
created BIGINT UNSIGNED NOT NULL DEFAULT 0,
lease_seconds INT UNSIGNED NOT NULL DEFAULT 0,
secret VARCHAR(64),
verify_token VARCHAR(64),
PRIMARY KEY (feed,callback));
```
