/**
 * Contains methods which process the exchange rate job
 */
'use strict';

// 3rd party libraries
const BluebirdPromise = require('bluebird');

// own module
const logger = require('./util/logger');

// Information of processing attempts to be added to subsequence payload (using property 'attempts')
const initialAttempts = {
	successful: 0,
	failed: 0
};

/**
 * Asynchronously reserve a job using the provided fivebeans consumer
 *
 * @param {fivebean.client} fivebeansConsumer	A fivebean client which has connected to beanstalk server and watching the correct tube
 * @return {bluebrid Promise}					A promise which performs job reservation, the value returned is an object of jobId and
 *													the payload of the reserved job. Sample : {jobId:123, payload: {from: "HKD", to: "USD"}}
 */
module.exports.reserveJob = function reserveJob(fivebeansConsumer) {
	return BluebirdPromise.fromCallback(function reserveJobCallback(callback) {
		// Consumer: reserving job
		fivebeansConsumer.reserve(function reserveCallback(errorWhenReserving, jobId, payload) {
			logger.info('Consumer reserved job ' + jobId + ' with payload ' + payload);

			callback(errorWhenReserving, {
				jobId: jobId,
				payload: JSON.parse(payload)
			});
		});
	});
};

/**
 * Asynchronously bury a job using the provided fivebeans consumer
 *
 * @param {fivebean.client} fivebeansConsumer	A fivebean client which has connected to beanstalk server and watching the correct tube
 * @return {bluebrid Promise}					A promise which performs job burying, the value returned is an object of jobId and
 *													the payload of the reserved job. Sample : {jobId:123, payload: {from: "HKD", to: "USD"}}
 */
module.exports.buryJob = function buryJob(fivebeansConsumer, jobData, defaultJobPriority) {
	return BluebirdPromise.fromCallback(function buryJobCallback(callback) {
		// Consumer: burying the reserved job
		fivebeansConsumer.bury(jobData.jobId, defaultJobPriority, function buryCallback(errorWhenBurying) {
			logger.info('Consumer buried job ' + jobData.jobId);

			callback(errorWhenBurying, jobData);
		});
	});
};

/**
 * Asynchronously destory a job using the provided fivebeans consumer
 *
 * @param {fivebean.client} fivebeansConsumer	A fivebean client which has connected to beanstalk server and watching the correct tube
 * @return {bluebrid Promise}					A promise which performs job destorying, the value returned is the job id of the destoryed job
 */
module.exports.destroyJob = function destroyJob(fivebeansConsumer, jobData) {
	return BluebirdPromise.fromCallback(function destroyJobCallback(callback) {
		// Consumer: deleting the reserved job
		fivebeansConsumer.destroy(jobData.jobId, function destroyCallback(errorWhenDestorying) {
			logger.info('Consumer destroyed job ' + jobData.jobId);

			callback(errorWhenDestorying, jobData.jobId);
		});
	});
};

/**
 * Asynchronously put a job using the provided fivebeans producer
 *
 * @param {fivebean.client} fivebeansProducer	A fivebean client which has connected to beanstalk server and use the correct tube
 * @param {object} payload						The payload of the job to be put
 * @param {number} jobPriority 					The priorty of the job
 * @param {number} delay						The delay of the job
 * @param {number} timeToRun					The time to run of the job
 * @return {bluebrid Promise}					A promise which performs job putting, the value returned is the job id of the successfully put job
 */
module.exports.putJob = function putJob(fivebeansProducer, payload, jobPriority, delay, timeToRun) {
	return BluebirdPromise.fromCallback(function putJobCallback(callback) {
		fivebeansProducer.put(jobPriority, delay, timeToRun, JSON.stringify(payload), callback);
	});
};

/**
 * Construct a new payload and update the successful attempt count without modifying the original payload
 *
 * @param {object} payload 		the original payload to be cloned as the new payload
 * @return {object}				the new payload with the successful attempt count updated
 */
module.exports.constructNewPayloadOnSuccessful = function constructNewPayloadOnSuccessful(payload) {
	let newPayload = Object.assign({}, payload);	// clone the payload (object references of properties remain unchanged)
	if (!newPayload.attempts) {
		logger.verbose('initializing attempt for payload ' + JSON.stringify(payload));
		newPayload.attempts = Object.assign({}, initialAttempts);	// clone the initialAttempts
	} else {
		newPayload.attempts = Object.assign({}, payload.attempts);	// clone the attempts
	}
	newPayload.attempts.successful = newPayload.attempts.successful + 1;
	return newPayload;
};

/**
 * Construct a new payload and update the failed attempt count without modifying the original payload
 *
 * @param {object} payload 		the original payload to be cloned as the new payload
 * @return {object}				the new payload with the failed attempt count updated
 */
module.exports.constructNewPayloadOnFailure = function constructNewPayloadOnFailure(payload) {
	let newPayload = Object.assign({}, payload);	// clone the payload (object references of properties remain unchanged)
	if (!newPayload.attempts) {
		logger.verbose('initializing attempt for payload ' + JSON.stringify(payload));
		newPayload.attempts = Object.assign({}, initialAttempts);	// clone the initialAttempts
	} else {
		newPayload.attempts = Object.assign({}, payload.attempts);	// clone the attempts
	}
	newPayload.attempts.failed = newPayload.attempts.failed + 1;
	return newPayload;
};

/**
 * Determine if the payload should end processing as it is finished successfully
 *
 * @param {object} payload 		the payload with updated attempt counts
 * @return {boolean}			true if the payload should end processing, false otherwise
 */
module.exports.isPayloadFinishedSuccessfully = function isPayloadFinishedSuccessfully(payload) {
	return payload.attempts.successful >= 10;
};

/**
 * Determine if the payload should end processing due to failures
 *
 * @param {object} payload 		the payload with updated attempt counts
 * @return {boolean}			true if the payload should end processing, false otherwise
 */
module.exports.shouldDiscardFailedPayload = function shouldDiscardFailedPayload(payload) {
	return payload.attempts.failed >= 3;
};

/**
 * Asynchonrously connect the consumer to beanstalk server and watch the designated tube. Set 'getReadyConsumer'
 * to the same promise for re-connection if disconnected.
 *
 * @param {fivebean.client} fivebeansConsumer	A fivebean client which should be connected to beanstalk server and watch the designated tube
 * @param {function} onConnectionReady			a function which performs desired action after connection is ready
 * @param {function} onConnnectionClose			a function which performs desired action after connection is closed
 * @return {Promise}							a promise that connects the consumer to beanstalk server and
 *													watches the designated tube. data returned is always true.
 */
module.exports.connectAndSetupConsumer = function connectAndSetupConsumer(fivebeansConsumer, tubeName, onConnectionReady, onConnnectionClose) {
	console.log('Connecting and setting up consumer...');
	return new BluebirdPromise(function (resolve, reject) {
		fivebeansConsumer.on('connect', function onConnect() {
			console.log('Consumer has connected');

			watchDesignatedTubeOnly(fivebeansConsumer, tubeName)
			.then(function (watchedTubeName) {
				console.log('Watching tube ' + watchedTubeName);

				onConnectionReady();

				resolve(true);
			}).catch(function onWatchTubeError(watchTubeError) {
				console.log('Problem encountered when watching designated tube : ' + watchTubeError);
				reject(watchTubeError);
			});
		}).on('error', function onError(errOfConsumer) {
			console.error('Consumer encountered error ' + errOfConsumer);
			reject(errOfConsumer);
		}).on('close', function onClose() {
			onConnnectionClose();

			console.warn('Consumer connection closed, trying to re-connect...');

			resolve(true);
		}).connect();
	});
};

/**
 * Asynchonrously connect the producer to beanstalk server and use the designated tube for reputting jobs.
 *
 * @param {fivebean.client} fivebeansProducer	A fivebean client which should be connected to beanstalk server and use the correct tube
 * @param {function} onConnectionReady			a function which performs desired action after connection is ready
 * @param {function} onConnnectionClose			a function which performs desired action after connection is closed
 * @return {Promise}							a promise that connects the consumer to beanstalk server and
 *													watches the designated tube. data returned is always true.
 */
module.exports.connectAndSetupProducer = function connectAndSetupProducer(fivebeansProducer, tubeName, onConnectionReady, onConnnectionClose) {
	console.log('Connecting and setting up producer...');
	return new BluebirdPromise(function (resolve, reject) {
		fivebeansProducer.on('connect', function onConnect() {
			console.log('Producer has connected');

			useDesignatedTube(fivebeansProducer, tubeName)
			.then(function (usedTubeName) {
				console.log('Using tube ' + usedTubeName);

				// getReadyProducer = undefined
				onConnectionReady();

				resolve(true);
			}).catch(function onWatchTubeError(useTubeError) {
				console.log('Problem encountered when using designated tube : ' + useTubeError);
				reject(useTubeError);
			});
		}).on('error', function onError(errOfProducer) {
			console.error('Producer encountered error ' + errOfProducer);
			reject(errOfProducer);
		}).on('close', function onClose() {
			// let the event loop the connection promise
			// getReadyProducer = connectAndSetupProducer;
			onConnnectionClose();

			console.warn('Producer connection closed, trying to re-connect...');

			resolve(true);
		}).connect();
	});
};

/**
 * Asynchonrously use the designated tube.
 *
 * @param {fivebean.client} fivebeansProducer	a fivebean client which has connection established already
 * @param {string} tubeName						the tube to use
 * @return {Promise}							a promise that uses the designated tube. data returned is the
 *													name of the tube that has been watched.
 */
const useDesignatedTube = function useDesignatedTube(fivebeansProducer, tubeName) {
	return BluebirdPromise.fromCallback(function watchDesignatedTube(callback) {
		fivebeansProducer.use(tubeName, callback);
	});
};

/**
 * Asynchonrously watch the designated tube and ensure only the designated tube
 * is watched (ignore default tube).
 *
 * @param {fivebean.client} fivebeansConsumer	a fivebean client which has connection established already
 * @param {string} tubeName						the only tube to watch
 * @return {Promise}							a promise that watches the designated tube. data returned is the
 *													name of the tube that has been watched.
 */
const watchDesignatedTubeOnly = function watchDesignatedTubeOnly(fivebeansConsumer, tubeName) {
	return BluebirdPromise.fromCallback(function watchDesignatedTube(callback) {
		//  Consumer: watch the designated tube
		fivebeansConsumer.watch(tubeName, callback);
	}).then(function afterWatchingDesignatedTube(noOfWatchingTube) {
		// Consumer successfully watched the designed tube
		console.log('Consumer is watching ' + noOfWatchingTube + ' tubes');

		if (noOfWatchingTube > 2) {
			throw 'Watching more than two tubes';
		}

		return new BluebirdPromise(function ensureOnlyWatchingDesignatedTube(resolve, reject) {
			if (noOfWatchingTube === 1) {
				// only one tube, continue immediately
				resolve(tubeName);
			} else {
				// more than one tube, ignore the default tube
				fivebeansConsumer.ignore('default', function ignoredDefaultTubeCallback(errorWhenIgnoringTube, noOfWatchingTubeAfterIgnore) {
					// ignore default tubes
					if (errorWhenIgnoringTube) {
						reject(errorWhenIgnoringTube);
					} else if (noOfWatchingTubeAfterIgnore === 1 || noOfWatchingTubeAfterIgnore === '1') { // return value is a string
						console.log('Default tube is ignored');
						resolve(tubeName);
					} else {
						fivebeansConsumer.list_tubes_watched(function listTubeWatchedCallback(errorWhenListingTubes, tubelist) {
							if (errorWhenListingTubes) {
								console.log('Still watching ' + noOfWatchingTubeAfterIgnore + ' tubes. Unable to list the watching tubes.');
								reject(errorWhenListingTubes);
							} else {
								reject('Still watching ' + noOfWatchingTubeAfterIgnore + ' tubes ' + tubelist);
							}
						});
					}
				});
			}
		});
	});
};
