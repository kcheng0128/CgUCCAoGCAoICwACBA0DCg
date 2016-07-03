/**
 * Contains classes which each provides a source of exchange rate (using HTTP Get) and the method to parse
 * the exchange rate from HTTP GET response.
 *
 * @typedef {object} ExchangeRateSource 	a class with the following interface
 * interface ExchangeRateSource {
 *
 *		getRequestUrl(fromCurrency, toCurrency) {
 *			// return an request option for sending the request
 *		}
 *
 *		getExchangeRate(responseAsString, fromCurrency, toCurrency, callback) {
 *			// parse the http response and return the exchange rate
 *	    }
 *
 * }
 *
 */
'use strict';

const logger = require('../util/logger');

class XeDotComExchangeRateSource {

	/**
	 * Get the request URL to retreive the exchange rate using HTTP GET.
	 *
	 * @param {string} fromCurrency			the 'from' currecy for finding exchange rate
	 * @param {string} toCurrency			the 'to' currency for finding exchange rate
	 */
	static getRequestUrl(fromCurrency, toCurrency) {
		// get the URL to send the request
		return 'http://www.xe.com/currencyconverter/convert/?Amount=1&From=' + fromCurrency + '&To=' + toCurrency;
	}

	/**
	 * Find the exchange rate from the response.  Callback will be triggered after the exchange rate is found
	 * or the parsing is finished (not found).
	 *
	 * @param {string} responseAsString		a response which is UTF-8 string
	 * @param {string} fromCurrency			the 'from' currecy for finding exchange rate
	 * @param {string} toCurrency			the 'to' currency for finding exchange rate
	 * @param {function} callback 			a callback function with first argument as error and second argument as data
	 */
	static getExchangeRate(responseAsString, fromCurrency, toCurrency, callback) {
		setImmediate(function asyncExecution() {
			// parse the http response and return the exchange rate
			logger.info('Finding exchange rate in response from ' + fromCurrency + ' to ' + toCurrency);
			logger.debug('Response:\r\n' + responseAsString);

			fromCurrency = fromCurrency.toUpperCase();
			toCurrency = toCurrency.toUpperCase();

			// Parse the response string
			let isInTag = false;

			let currentWord = '';
			let currentNumber = '';
			let numberArray = [];

			let fromCurrencyValue = undefined;
			let toCurrencyValue = undefined;

			let hasEqual = false;

			for (let i = 0; i < responseAsString.length; i++) {
				let currentChar = responseAsString.charAt(i);
				if (isInTag) {
					// within an HTML tag
					if (currentChar === '>') {
						// end skipping characters from the next one
						isInTag = false;

						logger.debug('end skipping tag');
					}
					continue;
				} else if (currentChar === '<') {
					// encounter the start of an HTML tag
					logger.debug('start skipping tag');
					// start skipping characters in tag
					isInTag = true;
					continue;
				} else if (currentChar === '=') {
					// encounter equal sign
					logger.debug(' EQUALS ');
					hasEqual = true;
				} else if ((currentChar >= 'a' && currentChar <= 'z') || (currentChar >= 'A' && currentChar <= 'Z')) {
					// alphabet
					currentWord = currentWord + currentChar;
				} else if ((currentChar >= '0' && currentChar <= '9') || (currentNumber.length > 0 && currentChar === '.')) {
					// part of a number
					currentNumber = currentNumber + currentChar;
				} else {
					// other non-alphanumeric character

					// Handle any number found
					if (currentNumber !== '') {
						logger.debug('currentNumber = ' + currentNumber);
						numberArray.push(currentNumber);
					}
					// clear the current number
					currentNumber = '';

					// Handle any word found
					if (currentWord !== '') {
						logger.debug('currentWord = ' + currentWord);

						// check current word against related currencies
						if (fromCurrencyValue === undefined && currentWord.toUpperCase() === fromCurrency) {
							logger.debug('Source Currency found');
							// check through the number array to get the last valid number
							fromCurrencyValue = getLastValidNumber(numberArray);
							logger.debug('Source Currency found, value = ' + fromCurrencyValue);
							if (fromCurrencyValue === undefined || fromCurrencyValue <= 0) {
								logger.verbose('Unable to find a valid value for currency ' + fromCurrency);
								logger.debug('numberArray=' + numberArray);
								// reset currency value for a new search
								toCurrencyValue = undefined;
								fromCurrencyValue = undefined;

								hasEqual = false;
							} else if (toCurrencyValue) {
								// result currency value is found already
								if (hasEqual) {
									// has equal in between, truely found
									logger.log(fromCurrencyValue + ' ' + fromCurrency + ' = ' + toCurrencyValue + ' ' + toCurrency);
									callback(undefined, toCurrencyValue / fromCurrencyValue);
								} else {
									logger.debug('One possible value pair: ' + fromCurrencyValue + ' ' + fromCurrency + ' = ' + toCurrencyValue + ' ' + toCurrency);

									// no requal between the currencies, reset currency values for a new search
									toCurrencyValue = undefined;
									fromCurrencyValue = undefined;

									hasEqual = false;
								}
							}
							// clear the number array
							numberArray = [];
						} else if (toCurrencyValue === undefined && currentWord.toUpperCase() === toCurrency) {
							logger.debug('Result Currency found');
							// check through the number array to get the last valid number
							toCurrencyValue = getLastValidNumber(numberArray);
							logger.debug('Result Currency found, value = ' + toCurrencyValue);
							if (toCurrencyValue === undefined || toCurrencyValue <= 0) {
								logger.verbose('Unable to find expected equal sign and unable to find a valid value for currency, perform search again');
								logger.debug('numberArray=' + numberArray);
								// reset currency value for a new search
								toCurrencyValue = undefined;
								fromCurrencyValue = undefined;

								hasEqual = false;
							} else if (fromCurrencyValue) {
								// source currency value is found already
								if (hasEqual) {
									// has equal in between, truely found
									logger.log(fromCurrencyValue + ' ' + fromCurrency + ' = ' + toCurrencyValue + ' ' + toCurrency);
									callback(undefined, toCurrencyValue / fromCurrencyValue);
								} else {
									logger.debug('One possible value pair: ' + fromCurrencyValue + ' ' + fromCurrency + ' = ' + toCurrencyValue + ' ' + toCurrency);

									// no requal between the currencies, reset currency values for a new search
									toCurrencyValue = undefined;
									fromCurrencyValue = undefined;

									hasEqual = false;
								}
							}
							// clear the number array
							numberArray = [];
						}
					}
					// clear the current word
					currentWord = '';
				}
			}

			// Finished looping but exchange rate not found
			callback('Unable to find exchange rate');
		});
	}
}

const getLastValidNumber = function getLastValidNumber(numberArray) {
	if (numberArray && numberArray.length > 0) {
		logger.debug('getLastValidNumber(): checking for numberArray ' + numberArray);

		for (let j = numberArray.length - 1; j >= 0; j--) {
			let value = parseFloat(numberArray[j]);

			logger.debug('raw number = ' + numberArray[j] + ', parsed value = ' + value);
			if (!isNaN(value)) {
				// is a valid number
				return value;
			}
		}
	}
	logger.debug('no valid value found from numberArray');
	return undefined;
};

module.exports.XeDotComExchangeRateSource = XeDotComExchangeRateSource;
