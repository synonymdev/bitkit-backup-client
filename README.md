# Backpack Client

This module contains the components needed to back up and restore to the backpack-server

See `example-client/index.js` for an example that performs typical backup steps to a known and running backpack server. It will...

* Query the server for available backups (for the clients slashtag, on the topic given)
* Back up some data with a given topic (including some additional metadata)
* Make another query to see that the backup exists
* Restore from the backup

It is recommended that you encrypt all data before sending it to the backup server for maximum security. The backup server can be configured to encrypt all data at rest, but it is still best practice to encrypt on the users device before sending it over the network to the backup server.

All data to be backed up should be labeled with a category - this it intended to help organise backed up data, allowing an application to backup many forms of data in smaller more managable units.

For testing you will also need to clone the backup-server repo and set that up.
