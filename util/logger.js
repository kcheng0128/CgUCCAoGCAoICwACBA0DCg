/**
 * Contains logging rated methods
 */
'use strict';

// 3rd party libraries
const winston = require('winston');

const logConfig = require('../config/logConfig');

winston.add(
	winston.transports.File, logConfig
);
winston.exitOnError = false;

/**
 * Log message using specified level.
 *
 * @param {string} level	the logging level
 * @param {string} message 	the message to log
 */
module.exports.log = function log(level, message) {
	winston.log(level, message);
};

/**
 * Log message using debug level.
 *
 * @param {string} message 	the message to log
 */
module.exports.debug = function debug(message) {
	winston.debug(message);
};

/**
 * Log message using verbose level.
 *
 * @param {string} message 	the message to log
 */
module.exports.verbose = function verbose(message) {
	winston.verbose(message);
};

/**
 * Log message using info level.
 *
 * @param {string} message 	the message to log
 */
module.exports.info = function info(message) {
	winston.info(message);
};

/**
 * Log message using warn level.
 *
 * @param {string} message 	the message to log
 */
module.exports.warn = function warn(message) {
	winston.warn(message);
};

/**
 * Log message using error level.
 *
 * @param {string} message 	the message to log
 */
module.exports.error = function error(message) {
	winston.error(message);
};

