/**
 * A util class which helps to retrieve exchange rate from specified exchange rate source
 */
'use strict';

// nodeJS modules
const http = require('http');
const StringDecoder = require('string_decoder').StringDecoder;

// 3rd party libaries
// const co = require('co');
const bluebirdPromise = require('bluebird');

const logger = require('./logger');

/**
 * Find the exchange rate using the specified source of the specified 'from' and 'to' currency.
 *
 * @param {class} exchangeRateSource	an ExchangeRateSource (see /model/exchangeRateSource.js) for getting the exchange rate
 * @param {string} fromCurrency			the 'from' currecy for finding exchange rate
 * @param {string} toCurrency			the 'to' currency for finding exchange rate
 * @return {string}						the exchange rate rounded off to 2 decimal places with type string
 */
module.exports.findExchangeRate = function findExchangeRate(exchangeRateSource, fromCurrency, toCurrency) {
	// Call the selected exchange rate source
	return new Promise(function (resolve, reject) {
		let url = exchangeRateSource.getRequestUrl(fromCurrency, toCurrency);
		logger.info('Going to send request to ' + url);

		http.get(url, function onRequestCallBack(res) {
			// Successful request
			logger.debug('Got response of code ' + res.statusCode);

			let decoder = new StringDecoder('utf8');
			let responseAsString = '';
			res.on('data', function onData(chunk) {
				responseAsString = responseAsString + decoder.write(chunk);
				// logger.debug('Received chunk\r\n' + chunk);
			});

			res.on('end', function onEnd() {
				// Received whole response
				let getExchangeRatePromisified = bluebirdPromise.promisify(exchangeRateSource.getExchangeRate);

				getExchangeRatePromisified(responseAsString, fromCurrency, toCurrency)
					.then(function onFullfillment(value) {
						logger.debug('exchangeRateSource.getExchangeRate fulfilled');

						resolve(String(value.toFixed(2)));
					}).catch(function onError(err) {
						logger.error('exchangeRateSource.getExchangeRate has error');

						reject(err);
					});
			});
		}).on('error', function onRequestError(e) {
			// Request with error
			logger.error('Encountered error when sending request');
			logger.error(e);

			reject(e);
		});
	});
};
