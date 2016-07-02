'use strict';

// 3rd party libraries
// const bluebirdPromise = require('bluebird');

// own content
// const logger = require('../util/logger');
const beanstalkdConfig = require('../config/beanstalkd');

module.exports.reserveAndDeleteJob = function reserveAndDeleteJob(consumerName, consumer) {
	console.log('Running consumer ' + consumerName);

	new Promise(function watchDesignatedTube(resolve, reject) {
		//  Consumer: watch the designated tube
		consumer.watch(beanstalkdConfig.tubeName, function watchCallback(errorWhenWatchingTube, noOfWatchingTube) {
			if (errorWhenWatchingTube) {
				reject(errorWhenWatchingTube);
			} else {
				resolve(noOfWatchingTube);
			}
		});
	}).then(function afterWatchingDesignatedTube(noOfWatchingTube) {
		// Consumer successfully watched the designed tube
		console.log(consumerName + ' is watching ' + noOfWatchingTube + ' tubes');

		if (noOfWatchingTube > 2) {
			throw 'Watching more than two tubes';
		}

		return new Promise(function ensureOnlyWatchingDesignatedTube(resolve, reject) {
			if (noOfWatchingTube === 1) {
				// only one tube, continue immediately
				resolve(false);
			} else {
				// more than one tube, ignore the default tube
				consumer.ignore('default', function ignoredDefaultTubeCallback(errorWhenIgnoringTube, noOfWatchingTubeAfterIgnore) {
					// console.log('Type of noOfWatchingTubeAfterIgnore=' + typeof noOfWatchingTubeAfterIgnore);

					if (errorWhenIgnoringTube) {
						reject(errorWhenIgnoringTube);
					} else if (noOfWatchingTubeAfterIgnore === 1 || noOfWatchingTubeAfterIgnore === '1') { // return value is a string
						resolve(true);
					} else {
						consumer.list_tubes_watched(function listTubeWatchedCallback(errorWhenListingTubes, tubelist) {
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
	}).then(function afterEnsuringWatchingDesignatedTube(ignoredDefaultTube) {
		// Consumer successfully ensured that the designed tube is the only tube watched
		if (ignoredDefaultTube) {
			console.log('Ignored tube noOfWatchingTube');
		}

		return new Promise(function reserveJob(resolve, reject) {
			// Consumer 1: reserving job
			// TODO: change to reserve()
			consumer.reserve_with_timeout(30, function reserveCallback(errorWhenReserving, jobId, payload) {
				if (errorWhenReserving) {
					reject(errorWhenReserving);
				} else {
					console.log(consumerName + ' received job ' + jobId + ' with payload ' + payload);
					resolve({
						jobId: jobId,
						payload: JSON.parse(payload)
					});
				}
			});
		});
	}).then(function afterReservingJob(jobData) {
		// Consumer successfully reserved a job
		console.log(consumerName + ' is going to bury job ' + jobData.jobId + ' with payload ' + jobData.payload);

		return new Promise(function buryJob(resolve, reject) {
			// Consumer: burying the reserved job
			consumer.bury(jobData.jobId, beanstalkdConfig.test.defaultPriority, function reserveCallback(errorWhenBurying) {
				if (errorWhenBurying) {
					reject(errorWhenBurying);
				} else {
					// wait to pretend processing job, see if job is consumed by another consumer
					setTimeout(function pretendProcessingJob() {
						resolve(jobData);
					}, 2000);
				}
			});
		});
	}).then(function afterBuryingJob(jobData) {
		// Consumer successfully reserved a job
		console.log(consumerName + ' is going to delete job ' + jobData.jobId + ' with payload ' + jobData.payload);

		return new Promise(function destoryJob(resolve, reject) {
			// Consumer: deleting the reserved job
			consumer.destroy(jobData.jobId, function reserveCallback(errorWhenDestorying) {
				if (errorWhenDestorying) {
					reject(errorWhenDestorying);
				} else {
					resolve(jobData.jobId);
				}
			});
		});
	}).then(function afterDestoryingJob(jobId) {
		// Consumer successfully deleted the reserved job
		console.log('Job ' + jobId + ' is deleted successfully');
	}).catch(function onConsumerError(consumerError) {
		console.log('Problem encounter when running ' + consumerName + ': ' + consumerError);
	});
};
