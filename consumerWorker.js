/**
 * The entry point of the consumer worker
 */
'use strict';

// 3rd party libraries
const fivebeans = require('fivebeans');
const BluebirdPromise = require('bluebird');

// own module content
const beanstalkConfig = require('./config/beanstalkd');
const exchangeRateSource = require('./model/exchangeRateSource');
const exchangeRateUtil = require('./util/exchangeRateUtil');
const jobProcessing = require('./jobProcessing');
const dbOperations = require('./dbOperations');

/**
 * Asynchronously reserve a job using the provided fivebeans consumer, process it, destory it and reput new job
 * to the beanstalk server if needed using the provided fivebeans producer.
 *
 * @param {fivebean.client} fivebeansConsumer	A fivebean client which has connected to beanstalk server and watching the designated tube
 * @param {fivebean.client} fivebeansProducer	A fivebean client which has connected to beanstalk server and using the designated tube
 * @return {bluebrid Promise}					A promise which processes a single job that can be reserved
 */
const processJob = function processJob(fivebeansConsumer, fivebeansProducer) {
	console.log('Processing job...');
	return jobProcessing.reserveJob(fivebeansConsumer)
		.then(function afterReservingJob(jobData) {
			// Consumer successfully reserved a job
			console.log('Consumer is going to bury job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload));

			return jobProcessing.buryJob(fivebeansConsumer, jobData, beanstalkConfig.test.defaultPriority);
		}).then(function afterBuryingJob(jobData) {
			// Consumer successfully reserved a job
			console.log('Consumer is going to handle job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload));

			return exchangeRateUtil.findExchangeRate(exchangeRateSource.XeDotComExchangeRateSource, jobData.payload.from, jobData.payload.to)
				.then(function afterFindExchangeRateSuccessful(exchangeRate) {
					console.log('Exchange Rate = ' + exchangeRate);
					// Save to database
					return dbOperations.storeExchangeRate(jobData.payload.from, jobData.payload.to, exchangeRate)
						.then(function afterStoringExchangeRate() {
							let payload = jobProcessing.constructNewPayloadOnSuccessful(jobData.payload);
							// Check if job needs to be reput and reput if needed
							if (jobProcessing.isPayloadFinishedSuccessfully(payload)) {
								console.log('Job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload) + ' succeeded 10 times.  No furthur processing.');
								return BluebirdPromise.resolve(jobData);
							} else {
								// Put updated jobs to tube upon finding exchange rate successfully
								return jobProcessing.putJob(fivebeansProducer, payload, beanstalkConfig.test.defaultPriority, 60, beanstalkConfig.test.defaultTimeToRun)
								.then(function afterReputJobSuccessful(reputJobId) {
									console.log('Successful job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload) + ' is reput as job ' + reputJobId + ' with payload ' + JSON.stringify(payload));
								});
							}
						}).then(function afterGettingExchangeRate() {
							// Consumer successfully reserved a job
							console.log('Consumer is going to delete job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload));

							return jobProcessing.destroyJob(fivebeansConsumer, jobData);
						}).then(function afterDestoryingJob(jobId) {
							// Consumer successfully deleted the reserved job
							console.log('Job ' + jobId + ' is deleted successfully');
						});
				}).catch(function onErrorWhenFindingExchangeRateAndHandling(error) {
					console.log('Failed when finding exchange rate due to the problem of ' + error);

					let payload = jobProcessing.constructNewPayloadOnFailure(jobData.payload);
					// Put updated jobs to tube upon failure in finding exchange rate
					if (jobProcessing.shouldDiscardFailedPayload(payload)) {
						console.log('Job ' + jobData.jobId + ' with payload ' + jobData.payload + ' failed 3 times.  It remains buried.');
						return BluebirdPromise.resolve(jobData);
					} else {
						// Put updated jobs to tube upon finding exchange rate successfully
						return jobProcessing.putJob(fivebeansProducer, payload, beanstalkConfig.test.defaultPriority, 3, beanstalkConfig.test.defaultTimeToRun)
						.then(function afterReputJobSuccessful(reputJobId) {
							console.log('Failed job ' + jobData.jobId + ' with payload ' + JSON.stringify(jobData.payload) + ' is reput as job ' + reputJobId + ' with payload ' + JSON.stringify(payload));
						});
					}
				});
		});
};

// flags / promise for flow control
let isConsumerReady = false;
let isProducerReady = false;

let exchangeRateSourceToUse = exchangeRateSource.XeDotComExchangeRateSource;

// create consumer and setup
const consumer = new fivebeans.client(beanstalkConfig.server.host, beanstalkConfig.server.port);
const producer = new fivebeans.client(beanstalkConfig.server.host, beanstalkConfig.server.port);

/**
 * Perform looping of the connection of consumer and producer (when not connected), as well as the method consuming the job
 *
 * @param {ExchangeRateSource} exchangeRateSourceUsed	A ExchangeRateSource (see /model/exchangeRateSource.js) that should be used
 * @param {function} consumeJob							A function which consumes job
 * @param {object} value								The value returned from last promise
 * @return {bluebrid Promise}							A promise which loops the connection of consumer and producer, as well as the method consuming the job
 */
let eventLoop = BluebirdPromise.method(function eventLoopInner(exchangeRateSourceUsed, consumeJob, value) {
	console.log('In event loop');
	if (!isConsumerReady) {
		return jobProcessing.connectAndSetupConsumer(consumer, beanstalkConfig.tubeName,
			function onConnectionReady() {
				// let the event loop perform other actions
				isConsumerReady = true;
			}, function onConnectionClose() {
				// let the event loop connects the producer again
				isConsumerReady = false;
			}).then(eventLoop.bind(null, exchangeRateSourceUsed, consumeJob));
	} else if (!isProducerReady) {
		return jobProcessing.connectAndSetupProducer(producer, beanstalkConfig.tubeName,
			function onConnectionReady() {
				// let the event loop perform other actions
				isProducerReady = true;
			}, function onConnectionClose() {
				// let the event loop connects the producer again
				isProducerReady = false;
			}).then(eventLoop.bind(null, exchangeRateSourceUsed, consumeJob));
	} else {
		return consumeJob(consumer, producer).then(eventLoop.bind(null, exchangeRateSourceUsed, consumeJob));
	}
});

eventLoop(exchangeRateSourceToUse, processJob)
.catch(function (error) {
	console.log('Exit with error ' + error);
});

// Wait for the result
const waitInterval = 1000; // 1s
let totalWaitInterval = 0;

let wait = function wait() {
	setTimeout(function waitWrapper() {
		totalWaitInterval += waitInterval;
		wait();
	}, waitInterval);
	console.log('Waited ' + totalWaitInterval / 1000 + 's');
};

wait();
