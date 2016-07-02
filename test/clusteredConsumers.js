'use strict';

// node JS modules
const cluster = require('cluster');

// 3rd party libraries
const fivebeans = require('fivebeans');

// own content
// const logger = require('../util/logger');
const beanstalkdConfig = require('../config/beanstalkd');
const jobConsumption = require('./jobConsumption');

// try concurrent consumer
if (cluster.isMaster) {
	// Master
	console.log('Master going to fork workers');

	// Create two workers
	for (let i = 0; i < 2; i++) {
		cluster.fork();
	}

	console.log('2 workers created by master');

	cluster.on('exit', (worker, code, signal) => {
		console.log('worker with PID ' + worker.process.pid + ' exited with code ' + code);
	});
} else {
	// Slave
	const consumerName = 'Consumer ' + cluster.worker.id;

	console.log('Slave with PID ' + cluster.worker.process.pid + ' of worker ID ' + cluster.worker.id + ' is running');

	let consumer = new fivebeans.client(beanstalkdConfig.server.host, beanstalkdConfig.server.port);

	consumer.on('connect', function onConnect() {
		console.log(consumerName + ' is connected');

		jobConsumption.reserveAndDeleteJob(consumerName, consumer);
	}).on('error', function onError(errOfConsumer) {
		console.log(consumerName + ' encountered error ' + errOfConsumer);
	}).on('close', function onClose() {
		console.log(consumerName + ' connection closed');
	}).connect();
}
