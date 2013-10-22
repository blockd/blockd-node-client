// CONFIGURATION ====================================================

var settings = {
	
	///
	/// The default timeout for a lock request
	///
	defaultTimeout : 2000,
	
	///
	/// Port on which the system will listen for connections
	///
	port : 11311,

	///
	/// Defines the default lock mode
	///
	defaultLockMode: "W",
	
	///
	/// Sets the default reader greed for a readerWriter lock
	///
	defaultReaderGreed : false
};


// UTILITIES ====================================================

///
/// Utiltity function for logging
///
function log(data)
{
	console.log("Blockd Client: " + data + "\n");
}

///
/// Writes the given data to the given socket, suppressing all errors
/// Returns true if write successful; otherwise, returns false
///
function writeSafe(socket, data) {
	
	try
	{
		socket.write(data);
		return true;
	}
	catch(err)
	{
		log("Error writing to socket:" + err.message);
		return false;
	}
}

///
/// Writes the given JSON data to the socket, suppressing all errors from the write
/// NOTE: This will NOT suppress errors from stringifying the data
///
function writeJsonSafe(socket, data) {

	return writeSafe(socket, JSON.stringify(data) + "\n");
}

// Include UUID library
var uuid = require('node-uuid');

///
/// returns a unique string
///
function nonce() {
	return uuid.v1();
}

// TYPES ====================================================

// Bring in network library
var net = require('net');

///
/// A simple data structure for tracking the callback and meta-data
///
var PromiseCallback = function(callback, removes, after) {
	
	this.callback = callback;
	this.removePromise = removes || false;
	this.afterCallback = after;
};

///
/// Encapsulates an action into an object that performs callbacks
///
var Promise = function(parentCollection, actor) {

	this.nonce = nonce();
	log("Created promise with nonce " + this.nonce);

	this.collection = parentCollection;
	this.actor = actor;

	this.callbacks = Object.create(null);
	this.statusToCallback = Object.create(null);

	///
	/// Defines a new function that takes a callback
	/// Functions should be of the form:
	/// function(actor, data) { }
	///
	this.define = function(name, removePromise, after) {
		var promise = this;
		// save the function for later and return this object
		this[name] = function(callback) {

			this.callbacks[name] = new PromiseCallback(callback, removePromise, after);
			return promise;
		};
	};

	///
	/// Fires the given function on this promise using the given data
	/// function(actor, data) { }
	///
	this.fire = function(name, data) {

		var callback = this.callbacks[name];
		if(callback === undefined) {
			log("Cannot find function named: " + name);
		} else {
			callback.callback(data, this.actor);

			// Call after function if present
			if(callback.afterCallback !== undefined)
				callback.afterCallback(data, this.actor);

			// Removes this promise if indicated
			if(callback.removePromise)
				this.collection.remove(this.nonce);
		}
	};

	///
	/// Registers a mapping from a status name to a callback function
	///
	this.defineForStatus = function(status, name, remove, after) {

		status = status.toUpperCase();
		this.statusToCallback[status] = name;
		this.define(name, remove, after);
	};

	///
	/// Fires the given callback associated with the status, if defined
	///
	this.fireForStatus = function(status, data) {

		var name = this.statusToCallback[status];
		this.fire(name, data);
	};

	///
	/// Applies the nonce of this promise, then writes JSON to the socket
	///
	this.writeJson = function(socket, data) {

		data.nonce = this.nonce;
		writeJsonSafe(socket, data);
	};
}

///
/// This holds onto all active promises 
///
var PromiseCollection = function() {

	// Collection of promises, indexed by nonce
	this.promises = Object.create(null);

	///
	/// Adds a promise to the collection
	///
	this.create = function(actor) {
		var ret = new Promise(this, actor);
		this.promises[ret.nonce] = ret;
		return ret;
	};

	///
	/// Removes promise with the given nonce 
	///
	this.remove = function(nonce) {

		if(this.promises[nonce] != undefined) {
			delete this.promises[nonce];
		}
	};

	///
	/// Fires the promise for the given nonce, using the given data
	///
	this.fire = function(nonce, data) {

		var promise = this.promises[nonce];
		if(promise === undefined)
			log("No promise for nonce " + nonce);
		else
			promise.fireForStatus(data.status, data);
	}
}

///
/// Client object for calling to the host
///
var BlockdClient = function(port, host) {

	var thisClient = this;

	thisClient.socket = null;
	thisClient.clientPromise = null;
	thisClient.promises = new PromiseCollection();
	
	// API ACTIONS	

	///
	/// Requests enlightenment from the server
	///
	this.wisdom = function() {

		log("Requesting wisdom from the Prince of Eternia");

		var ret = thisClient.promises.create(thisClient);
		ret.defineForStatus("WISDOM", "then", true);
		ret.writeJson(thisClient.socket, { command: "WISDOM" });

		return ret;
	};

	///
	/// Acquires the given lock
	///
	this.acquire = function(lockId, timeout, mode) {

		// validate arguments
		mode = mode || settings.defaultLockMode;
		timeout = timeout || settings.defaultTimeout;

		log("Acquiring blockd lock " + mode + " " + lockId + " with timeout " + timeout);

		var ret = thisClient.promises.create(thisClient);
		ret.defineForStatus("LOCKPENDING", "pending");
		ret.defineForStatus("LOCKED", "then");
		ret.defineForStatus("ACQUIRETIMEOUT", "timeout", true);
		ret.defineForStatus("RELEASED", "released", true);
		ret.writeJson(thisClient.socket, { 
				command: "ACQUIRE", 
				lockId: lockId, 
				timeout: timeout,
				mode: mode });

		return ret;
	};

	///
	/// Releases the given lock
	///
	this.release = function(lockId) {
		log("Releasing blockd lock " + lockId);

		var ret = thisClient.promises.create(thisClient);
		ret.defineForStatus("RELEASED", "then", true);
		ret.defineForStatus("NOLOCKTORELEASE", "noLock", true);
		ret.writeJson(thisClient.socket, { 
				command: "RELEASE", 
				lockId: lockId});

		return ret;
	};

	///
	/// Releases the given lock
	///
	this.releaseAll = function() {
		log("Releasing all locks for this connection ");

		var ret = thisClient.promises.create(thisClient);
		ret.defineForStatus("RELEASED", "then", true);
		ret.defineForStatus("NOLOCKSTORELEASEALL", "noLocks", true);
		ret.writeJson(thisClient.socket, { command: "RELEASEALL" });

		return ret;
	};

	///
	/// Shows the list of locks
	///
	this.show = function() {

		var ret = thisClient.promises.create(thisClient);
		ret.defineForStatus("SHOW", "then", true);
		ret.writeJson(thisClient.socket, { command: "SHOW" });

		return ret;
	};

	// CLIENT ACTIONS

	///
	/// Opens the client connection
	///
	this.open = function() {

		log("Opening socket to blockd server " + host + " on port " + port);

		if(thisClient.socket != null)
			return;

		thisClient.socket = net.createConnection(port, host);

		thisClient.clientPromise = thisClient.promises.create();

		// Define the mapping for the initial status and return
		thisClient.clientPromise.defineForStatus("IMUSTBLOCKYOU", "then");

		var promises = this.promises;
		
		thisClient.socket.on("data", function(json) {
			log("Blockd data received: " + json);

			var data = JSON.parse(json);

			// If this is not mapped, then fire for the client
			if(data.nonce === undefined || data.nonce.length == 0) {

				log("Fire client promise for status: " + data.status);
				thisClient.clientPromise.fireForStatus(data.status, data);

			} else {

				for(var i = 0; i < data.nonce.length; ++i) {
					var nonce = data.nonce[i];
					thisClient.promises.fire(nonce, data);
				}
			}
		});

		// Register callback for closing from other side
		thisClient.socket.on("close", function() {
			log("Blockd client connection closed from server-side");
		});

		return thisClient.clientPromise;
	};

	///
	/// Closes the client connection
	///
	this.close = function () {

		log("Closing socket to server");

		var promise = thisClient.promises.create(this);
		promise.defineForStatus("GOINPIECES", "then", true, function() {
			log("Closed socket");
			thisClient.socket.end();
			thisClient.socket = null;
		});

		var msg = {
			command: "QUIT"
		};
		
		promise.writeJson(thisClient.socket, msg);

		return promise;
	};
	
};

exports.BlockdClient = BlockdClient;

// TEMPORARY UNIT TESTING =============================================

var client = new BlockdClient(11311, "localhost");

client.open().then(function() {

		log("ONLINE!");

		client.wisdom().then(function(data) {

			log("Wisdom: " + data.quote);

			client.acquire("HELLO").then(function() { 

				log("Locked: HELLO");

				client.show().then(function(data) {
					
					log("Show: " + data);

					client.releaseAll().then(function() {

						log("Released: HELLO");

						client.close().then(function() {

							log("OFFLINE!");
						});
					});
				});				
			});
		});
	});



