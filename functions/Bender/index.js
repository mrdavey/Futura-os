const { consolidateWeekStorageFiles, getLatestPrices, getLatestSentiment, getSpecificPriceData, saveSentimentDataToBuckets } = require("../Firebase/storage");
const { onHttpsExtended, onDate } = require("../Firebase");
const { log, logError } = require("../helpers/log");
const { mapAsync } = require("../helpers/asyncIterators")
const { hermesHeaderAuthKey, internalHeaderAuthKey } = require("../constants");

/**
 * Fetches price data based on intervals from storage and firestore (where relevant)
 */
exports.getPrices = () => {
	return onHttpsExtended(async (req, res) => {
		let internal = req.get("Internal-Auth");
		if (internal && internal === internalHeaderAuthKey) {
			let currency = req.body.currency;
			let numberOfEntries = req.body.numberOfEntries;
			let timeStamp = req.body.timeStamp;

			try {
				let entries = await getLatestPrices(currency, numberOfEntries, timeStamp);
				res.json(entries);
			} catch (e) {
				logError({ title: `Error with Bender getPrices`, message: e.message, details: e.stack });
				res.sendStatus(404);
			}
		} else {
			res.sendStatus(404);
		}
	});
}

/**
 * Returns price data that is matched to the given timestamps
 */
exports.getSpecificPrices = () => {
	return onHttpsExtended(async (req, res) => {
		let internal = req.get("Internal-Auth");
		if (internal && internal === internalHeaderAuthKey) {
			let timeStamps = req.body.timeStamps;
			let currency = req.body.currency;

			try {
				let entries = await getSpecificPriceData(currency, timeStamps);
				res.json(entries)
			} catch (e) {
				logError({ title: `Error with Bender getPrices`, message: e.message, details: e.stack });
				res.sendStatus(404);
			}
		} else {
			res.sendStatus(404);
		}
	});
}

/**
 * Fetches sentiment data based on intervals from storage and firestore (where relevant)
 */
exports.getSentiment = () => {
	return onHttpsExtended(async (req, res) => {
		let internal = req.get("Internal-Auth");
		if (internal && internal === internalHeaderAuthKey) {
			let currency = req.body.currency;
			let numberOfEntries = req.body.numberOfEntries;
			let timeStamp = req.body.timeStamp;

			try {
				let entries = await getLatestSentiment(currency, numberOfEntries, timeStamp);
				res.json(entries)
			} catch (e) {
				logError({ title: `Error with Bender getPrices`, message: e.message, details: e.stack });
				res.sendStatus(404);
			}
		} else {
			res.sendStatus(404);
		}
	});
}

/**
 * Used by Hermes to save raw sentiment data to Storage, immediately after it has been 
 * processed for sentiment analysis (and the scores have been recorded in firestore)
 */
exports.saveSentimentToBuckets = () => {
    return onHttpsExtended(async (req, res) => {
		let hermes = req.get("Hermes-Auth");
		if (hermes && hermes === hermesHeaderAuthKey) {
			let allData = req.body.allData;

			try {
				await mapAsync(allData, async (entry) => {
					let data = entry.data;
					let currency = entry.currency;
					let source = entry.source;

					if (!data.included || !data.excluded || !data.stats || !currency || !source) {
						logError({
							title: "Bender saving error",
							message: `Data does not have the required fields: ${JSON.stringify(req.body)}`
						});
						return;
					}

					log({ message: `Saving data for ${currency}-${source} to buckets` });
					await saveSentimentDataToBuckets(currency, source, data).catch((e) => {
						logError({ title: `Error with Bender save for ${currency}-${source}`, message: e.message, details: e.stack });
						return;
					});
				});
			} catch (e) {
				logError({ title: `Error with Bender save in mapAsync`, message: e.message, details: e.stack });
				res.sendStatus(404);
			}
			res.sendStatus(200);
		} else {
			res.sendStatus(404);
		}
	});
}

/**
 * Called once a week to consolidate the daily sentiment and price files into a single 'week' file
 */
exports.consolidateWeekStorageFiles = () => {
	let sundayTwoOhFive = "5 2 * * 0"; // London time
	return onDate(sundayTwoOhFive, async (context) => {
		await consolidateWeekStorageFiles("BTC", "sentiment")
		await consolidateWeekStorageFiles("BTC", "prices")
		await consolidateWeekStorageFiles("ETH", "sentiment")
		await consolidateWeekStorageFiles("ETH", "prices")
	})
}