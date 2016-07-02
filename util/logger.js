'use strict';

// 3rd party libraries
const winston = require('winston');

const logConfig = require('../config/logConfig');

winston.add(
	winston.transports.File, logConfig
);
winston.exitOnError = false;

module.exports.log = function log(level, message) {
	winston.log(level, message);
};

module.exports.debug = function debug(message) {
	winston.debug(message);
};

module.exports.verbose = function verbose(message) {
	winston.verbose(message);
};

module.exports.info = function info(message) {
	winston.info(message);
};

module.exports.warn = function warn(message) {
	winston.warn(message);
};

module.exports.error = function error(message) {
	winston.error(message);
};

