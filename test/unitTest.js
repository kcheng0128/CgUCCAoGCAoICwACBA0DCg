/**
 * Contains test cases
 */
'use strict';

// node JS modules
const assert = require('assert');

// 3rd party libraries
const fivebeans = require('fivebeans');
const BluebirdPromise = require('bluebird');
const MongoClient = require('mongodb').MongoClient;

const jobProcessing = require('../jobProcessing');
const beanstalkConfig = require('../config/beanstalkd');
const exchangeRateUtil = require('../util/exchangeRateUtil');
const exchangeRateSource = require('../model/exchangeRateSource');
const dbOperations = require('../dbOperations');
const dbConfig = require('../config/db');

/**
 * Test the methods related to ending condition of jobs
 */
const testEndConditions = function testEndConditions() {
	console.log('Starting end condition test');

	// Successful attempts : 9 attempts
	const payloadWith9SuccessfulAttempts = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 9,
			failed: 0
		}
	};
	assert.equal(false,
		jobProcessing.isPayloadFinishedSuccessfully(payloadWith9SuccessfulAttempts),
		'Payload processing should NOT end with 9 successful attempts');

	// Successful attempts : 10 attempts
	const payloadWith10SuccessfulAttempts = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 10,
			failed: 0
		}
	};
	assert.equal(true,
		jobProcessing.isPayloadFinishedSuccessfully(payloadWith10SuccessfulAttempts),
		'Payload processing should end with 10 successful attempts');

	// Failed attempts : 2 attempts
	const payloadWith2FailedAttempts = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 0,
			failed: 2
		}
	};
	assert.equal(false,
		jobProcessing.shouldDiscardFailedPayload(payloadWith2FailedAttempts),
		'Payload processing should NOT end with 2 failed attempts');

	// Failed attempts : 3 attempts
	const payloadWith3FailedAttempts = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 0,
			failed: 3
		}
	};
	assert.equal(true,
		jobProcessing.shouldDiscardFailedPayload(payloadWith3FailedAttempts),
		'Payload processing should end with 3 failed attempts');

	console.log('End condition test completed\r\n');
};

/**
 * Test the methods which update attempts being recorded in payload
 */
const testPayloadAttemptUpdate = function testPayloadAttemptUpdate() {
	console.log('Starting payload attempt update test');

	// Constructing new payload from old payload (brand new job) on success
	const newPayload = {
		from: 'HKD',
		to: 'USD'
	};
	const newPayloadAsString = JSON.stringify(newPayload);
	const expectedNewPayloadOnSucceed = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 1,
			failed: 0
		}
	};
	const expectedNewPayloadOnSucceedAsString = JSON.stringify(expectedNewPayloadOnSucceed);

	assert.equal(expectedNewPayloadOnSucceedAsString,
		JSON.stringify(jobProcessing.constructNewPayloadOnSuccessful(newPayload)),
		'New payload is not constructed as expected on succeed (1st trial)');

	assert.equal(newPayloadAsString,
		JSON.stringify(newPayload),
		'Old payload should NOT be modified when constructing the new payload on succeed (1st trial)');

	// Constructing new payload from old payload (job running the 2nd time) on success
	const updatedPayload = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 1,
			failed: 0
		}
	};
	const updatedPayloadAsString = JSON.stringify(updatedPayload);
	const expectedNewPayloadOnSucceedOfUpdatedPayload = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 2,
			failed: 0
		}
	};
	const expectedNewPayloadOnSucceedOfUpdatedPayloadAsString = JSON.stringify(expectedNewPayloadOnSucceedOfUpdatedPayload);

	assert.equal(expectedNewPayloadOnSucceedOfUpdatedPayloadAsString,
		JSON.stringify(jobProcessing.constructNewPayloadOnSuccessful(updatedPayload)),
		'New payload is not constructed as expected on succeed (2nd trial)');

	assert.equal(updatedPayloadAsString,
		JSON.stringify(updatedPayload),
		'Old payload should NOT be modified when constructing the new payload on succeed (2nd trial)');

	// Constructing new payload from old payload (brand new job) on failure
	const newPayload2 = {
		from: 'HKD',
		to: 'USD'
	};
	const newPayload2AsString = JSON.stringify(newPayload2);
	const expectedNewPayloadOnFailure = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 0,
			failed: 1
		}
	};
	const expectedNewPayloadOnFailureAsString = JSON.stringify(expectedNewPayloadOnFailure);

	assert.equal(expectedNewPayloadOnFailureAsString,
		JSON.stringify(jobProcessing.constructNewPayloadOnFailure(newPayload2)),
		'New payload is not constructed as expected on failure (1st trial)');

	assert.equal(newPayload2AsString,
		JSON.stringify(newPayload2),
		'Old payload should NOT be modified when constructing the new payload on failure (1st trial)');

	// Constructing new payload from old payload (job running the 2nd time) on failure
	const updatedPayload2 = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 0,
			failed: 1
		}
	};
	const updatedPayload2AsString = JSON.stringify(updatedPayload2);
	const expectedNewPayloadOnFailureOfUpdatedPayload = {
		from: 'HKD',
		to: 'USD',
		attempts: {
			successful: 0,
			failed: 2
		}
	};
	const expectedNewPayloadOnFailureOfUpdatedPayloadAsString = JSON.stringify(expectedNewPayloadOnFailureOfUpdatedPayload);

	assert.equal(expectedNewPayloadOnFailureOfUpdatedPayloadAsString,
		JSON.stringify(jobProcessing.constructNewPayloadOnFailure(updatedPayload2)),
		'New payload is not constructed as expected on failure (2nd trial)');

	assert.equal(updatedPayload2AsString,
		JSON.stringify(updatedPayload2),
		'Old payload should NOT be modified when constructing the new payload on failure (2nd trial)');

	console.log('Payload attempt update test completed\r\n');
};

/**
 * Test the method which connects and watch the designated tube of a fivebeans client (the consumer)
 */
const consumerSetupTest = function consumerSetupTest() {
	console.log('Starting consumer setup test');

	let connectionReady = false;

	const consumer = new fivebeans.client(beanstalkConfig.server.host, beanstalkConfig.server.port);
	return jobProcessing.connectAndSetupConsumer(consumer, beanstalkConfig.tubeName,
		function onConnectionReady() {
			connectionReady = true;
		}, function onConnnectionClose() {
			connectionReady = false;
		})
		.then(function validateConnection(value) {
			if (!connectionReady) {
				return BluebirdPromise.reject('Connection of consumer is likely not ready yet or onConnectionReady is not executed');
			} else {
				return BluebirdPromise.resolve(value);
			}
		})
		.then(function validateWatchingTubes(value) {
			consumer.list_tubes_watched(function listTubeWatchedCallback(errorWhenListingTubes, tubelist) {
				if (errorWhenListingTubes) {
					console.error('Unable to list the watching tubes of consumer.');
					return BluebirdPromise.reject(errorWhenListingTubes);
				} else if (tubelist instanceof Array && tubelist.length === 1 && tubelist[0] === beanstalkConfig.tubeName) {
					return BluebirdPromise.resolve(beanstalkConfig.tubeName);
				} else {
					return BluebirdPromise.reject('Watching unexpected tubes ' + JSON.stringify(tubelist));
				}
			});
		}).then(function validateConnection(tubeName) {
			if (!connectionReady) {
				console.error('Connection closed');
				return BluebirdPromise.reject('Connection of consumer closed unexpectedly');
			} else {
				console.log('Consumer setup test completed\r\n');
				return BluebirdPromise.resolve(true);
			}
		});
};

/**
 * Test the method which connects and use the designated tube of a fivebeans client (the producer)
 */
const producerSetupTest = function producerSetupTest() {
	console.log('Starting producer setup test');

	let connectionReady = false;

	const producer = new fivebeans.client(beanstalkConfig.server.host, beanstalkConfig.server.port);
	return jobProcessing.connectAndSetupProducer(producer, beanstalkConfig.tubeName,
		function onConnectionReady() {
			connectionReady = true;
		}, function onConnnectionClose() {
			connectionReady = false;
		})
		.then(function validateConnection(value) {
			if (!connectionReady) {
				return BluebirdPromise.reject('Connection of producer is likely not ready yet or onConnectionReady is not executed');
			} else {
				return BluebirdPromise.resolve(value);
			}
		})
		.then(function validateWatchingTubes(value) {
			producer.list_tube_used(function listTubeWatchedCallback(errorWhenListingTubes, tubename) {
				if (errorWhenListingTubes) {
					console.error('Unable to list the used tubes of producer.');
					return BluebirdPromise.reject(errorWhenListingTubes);
				} else if (tubename === beanstalkConfig.tubeName) {
					return BluebirdPromise.resolve(beanstalkConfig.tubeName);
				} else {
					return BluebirdPromise.reject('Watching unexpected tubes ' + tubename);
				}
			});
		}).then(function validateConnection(tubeName) {
			if (!connectionReady) {
				console.error('Producer connection closed');
				return BluebirdPromise.reject('Connection of producer closed unexpectedly');
			} else {
				console.log('Producer setup test completed\r\n');
				return BluebirdPromise.resolve(true);
			}
		});
};

/**
 * Test the methods which retrieve exchange rates
 */
const testExchangeRateRetrieval = function () {
	console.log('Starting find exchange rate test');

	const dummyExchangeRateSourceRoundDown = class DummyExchangeRateSource {
		static getRequestUrl(fromCurrency, toCurrency) {
			return 'http://www.xe.com/currencyconverter/convert/?Amount=1&From=' + fromCurrency + '&To=' + toCurrency;
		}
		static getExchangeRate(responseAsString, fromCurrency, toCurrency, callback) {
			setImmediate(function asyncExecution() {
				callback(undefined, 0.054);
			});
		}
	};
	const dummyExchangeRateSourceRoundUp = class DummyExchangeRateSource {
		static getRequestUrl(fromCurrency, toCurrency) {
			return 'http://www.xe.com/currencyconverter/convert/?Amount=1&From=' + fromCurrency + '&To=' + toCurrency;
		}
		static getExchangeRate(responseAsString, fromCurrency, toCurrency, callback) {
			setImmediate(function asyncExecution() {
				callback(undefined, 0.056);
			});
		}
	};

	return exchangeRateUtil.findExchangeRate(dummyExchangeRateSourceRoundDown, 'HKD', 'USD')
	.then(function (exchangeRate) {
		assert.strictEqual(String(0.05), exchangeRate, 'Exchange rate should be a string rounded to 2 decimal places (round down test)');

		return exchangeRateUtil.findExchangeRate(dummyExchangeRateSourceRoundUp, 'HKD', 'USD');
	}).then(function (exchangeRate) {
		assert.strictEqual(String(0.06), exchangeRate, 'Exchange rate should be a string rounded to 2 decimal places (round up test)');

		return exchangeRateUtil.findExchangeRate(exchangeRateSource.XeDotComExchangeRateSource, 'USD', 'HKD');
	}).then(function (exchangeRate) {
		let exchangeRateAsNumber = Number(exchangeRate);
		if (exchangeRateAsNumber < 7.7 || exchangeRateAsNumber > 7.8) {
			throw new Error('Exchange rate of USD to HKD from XE.com not within expected range. Exchange rate found = ' + exchangeRate);
		}

		console.log('Find exchange rate test completed\r\n');
		return BluebirdPromise.resolve(true);
	});
};

/**
 * Test the method which stores data to the database
 */
const testDBStorage = function testDBStorage() {
	console.log('Starting DB storage test');

	const startTime = Date.now();
	const searchCriteria = {
		from: 'from',
		to: 'to',
		rate: 'rate',
		created_at: {
			$gte: startTime
		}
	};

	return dbOperations.storeExchangeRate('from', 'to', 'rate')
		.then(function databaseCheck() {
			console.log('Connecting to DB after storage');

			const url = 'mongodb://' + dbConfig.host + ':' + dbConfig.port + '/' + dbConfig.database;

			return MongoClient.connect(url);
		}).then(function afterConnected(db) {
			console.log('Connected to DB after storage');

			let exchangeRateCollection = db.collection(dbConfig.collections.exchangeRate);
			return exchangeRateCollection.find(searchCriteria)
			.toArray().then(function checkArray(docs) {
				if (docs.length < 1) {
					throw new Error('Exchange rate record is not inserted');
				} else {
					console.log(docs.length + ' records found');
				}
				docs.forEach(function (element, index, array) {
					assert.equal('from', element.from, 'From-currency field value is incorrect');
					assert.equal('to', element.to, 'To-currency field value is incorrect');
					assert.equal('rate', element.rate, 'Rate field value is incorrect');
				});

				console.log('Passed checking of inserted DB record(s), going to delete the data');

				return exchangeRateCollection.deleteMany(searchCriteria);
			}).then(function afterDeleting(results) {
				db.close();
				console.log('Result of deleting = ' + results);

				console.log('DB storage test completed\r\n');
			});
		});
};

// Run the tests (synchronous tests)
testEndConditions();
testPayloadAttemptUpdate();

// Run the tests (asynchronous tests)
Promise.all([
	consumerSetupTest(),
	producerSetupTest(),
	testExchangeRateRetrieval(),
	testDBStorage()
]).then(function () {
	console.log('Asynchronous tests finished');
	process.exit();
}).catch(function (error) {
	console.error('Certain asynchronous test has error ' + error);
	process.exit(1);
});
