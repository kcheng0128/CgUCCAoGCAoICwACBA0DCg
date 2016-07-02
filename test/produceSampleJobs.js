'use strict';

// 3rd party libraries
const fivebeans = require('fivebeans');
// const bluebirdPromise = require('bluebird');

// own content
// const logger = require('../util/logger');
const beanstalkdConfig = require('../config/beanstalkd');

const hkdUsdJob = {
	from: 'HKD',
	to: 'USD'
};

const jpyHkdJob = {
	from: 'JPY',
	to: 'HKD'
};

let producer = new fivebeans.client(beanstalkdConfig.server.host, beanstalkdConfig.server.port);

producer.on('connect', function onConnect() {
	console.log('connected to server ' + beanstalkdConfig.server.host + ':' + beanstalkdConfig.server.port);

	new Promise(function useDesignatedTube(resolve, reject) {
		// Producer : Use designated tube
		producer.use(beanstalkdConfig.tubeName, function callbackForUse(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	}).then(function afterUsingDesignatedTube(tubeName) {
		// Producer sucessfully used designated tube
		console.log('Use tube ' + tubeName + ' fulfilled.');

		return new Promise(function put1stJob(resolve, reject) {
			// Producer : put 1st job
			producer.put(beanstalkdConfig.test.defaultPriority, 0, beanstalkdConfig.test.defaultTimeToRun,
					JSON.stringify(hkdUsdJob),
					function put1stJobCallback(errorPutting1stJob, jobId1) {
						if (errorPutting1stJob) {
							reject(errorPutting1stJob);
						} else {
							resolve(jobId1);
						}
					});
		});
	}).then(function afterPut1stJob(jobId1) {
		// Producer successfully put 1st job
		console.log('1st job has ID ' + jobId1);

		return new Promise(function put1stJob(resolve, reject) {
			// Producer : put the 2nd job (delay by 3s)
			producer.put(beanstalkdConfig.test.defaultPriority, 3, beanstalkdConfig.test.defaultTimeToRun,
					JSON.stringify(jpyHkdJob),
					function put1stJobCallback(errorPutting2ndJob, jobId2) {
						if (errorPutting2ndJob) {
							reject(errorPutting2ndJob);
						} else {
							resolve(jobId2);
						}
					});
		});
	}).then(function afterPut2ndJob(jobId2) {
		// Producer successfully put 2nd job
		console.log('2nd job has ID ' + jobId2);

		process.exit();
	}).catch(function onProducerConsumerError(producerConsumerError) {
		console.log('Problem encounter by producer or consumers ' + producerConsumerError);
		
		process.exit(1);
	})
}).on('error', function onError(err) {
	console.log('beanstalkd producer encountered error ' + err);
}).on('close', function onClose() {
	console.log('beanstalkd producer connection closed');
}).connect();

