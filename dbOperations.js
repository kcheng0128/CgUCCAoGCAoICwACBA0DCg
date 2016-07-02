'use strict';

// 3rd party library
const MongoClient = require('mongodb').MongoClient;

// own module
const dbConfig = require('./config/db');
const logger = require('./util/logger');

const url = 'mongodb://' + dbConfig.host + ':' + dbConfig.port + '/' + dbConfig.database;

/**
 * Asynchronously store exchange rate to database
 *
 * @param {string} fromCurrency			the 'from' currecy for finding exchange rate
 * @param {string} toCurrency			the 'to' currency for finding exchange rate
 * @return {Promise}					a promise which performs the storage
 */
module.exports.storeExchangeRate = function storeExchangeRate(fromCurrency, toCurrency, rate) {
	return MongoClient.connect(url)
		.then(function afterConnected(db) {
			let record = {
				from: fromCurrency,
				to: toCurrency,
				rate: rate,
				created_at: Date.now()
			};

			let exchangeRateCollection = db.collection(dbConfig.collections.exchangeRate);
			return exchangeRateCollection.insertOne(record).then(function afterInsertion(r) {
				db.close();
				if (r.insertedCount !== 1) {
					// should not enter here
					logger.error('Unable to insert record ' + JSON.stringify(record));
					throw new Error('Exchange rate record is not inserted');
				} else {
					logger.info('Inserted record ' + JSON.stringify(record));
				}
			});
		});
};
