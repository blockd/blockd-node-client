Blockd Node Client
=============
The node client for a simple distributed lock server in Node.js

What is Blockd?
-------------
Need to coordinate resources between multiple applications, but instances running on different servers? Don't like complicated APIs? Have a more than passing affinity for Dolph Lundgren?

Blockd allows multiple clients to acquire and release "locks", just simple string identifiers, using a simple asynchronous API. It supports variable timeout and reader-writer locking, plus the ability to immediately 

Blockd was created by Flex Rental Solutions to manage real-time availability of documents in our system across multiple instances of a Java app. We needed a simple solution.

Why Node?
-------------
When tracking through SQL and memcache didn't work, we turned to Node.Js. Its simple TCP support made it easy to prototype. The single-threaded event loop model meant blockd could forego using locks internally.

What does this client do?
-------------
This client is the Node.js implementation of asynchronous communication with the Blockd server. It features a simplified promise-based API for locking and releasing, supporting all features of the server in one simple package.

Examples
-------------
A simple example of creating a client connection, passing the port and host address:

```javascript
var client = new BlockdClient(11311, "localhost");
```

Then proceed with opening the connection and acquiring a lock:

```javascript
client.open().then(function() {

	client.acquire("HELLO").then(function() { 

			// Do work with the resource

		});
	});
```

After completing interaction with the resource, the app can release (and close once done interacting with the system) the connection as follows:

```javascript
client.release("HELLO").then(function() {

		// Do work with the resource now that it is released

		client.close().then(function() {

			// Do any work after the client closes
		});
	});
```
