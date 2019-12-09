const admin = require("firebase-admin");
const bucket = admin.storage().bucket();
const db = admin.firestore();
const m = require("moment");

const { retry } = require("../helpers/retry")
const { mapAsync, sleep } = require("../helpers/asyncIterators")

const { log, logError } = require("../helpers/log");

/**
 * Used for fixing gStorage price or sentiment files, if we are missing/duplicate data for some reason
 */
exports.fixFileForCertainDay = async (req, res) => {
    // let firstDay = m("2019-04-25T00:00:00.000Z").utc(); // beginning of time when futura started
    let firstDay = m("2019-11-04T00:00:00.000Z").utc();
    let startDate = admin.firestore.Timestamp.fromDate(firstDay.startOf("day").toDate());
    // let endDate = admin.firestore.Timestamp.fromDate(firstDay.endOf("day").toDate()); // For single day

    let lastDay = m().utc(); // For all time records
    // let lastDay = m("2019-05-07T00:00:00.000Z").utc(); // For specific date
    let endDate = admin.firestore.Timestamp.fromDate(lastDay.endOf("day").toDate());

    let currency = "BTC"
    // let currency = "ETH"
    // let type = "sentiment"
    let type = "prices"

    let ref = db.collection(type)

    if (type === "sentiment") {
        ref = ref
            .doc(currency)
            .collection("scores")
    }
    let snapshot = await ref
        .where("timeStamp", "<=", endDate)
        .where("timeStamp", ">=", startDate)
        .orderBy("timeStamp", "desc")
        .get()
        .catch((e) => {
            let message = `Error in storage fixFileForCertainDay ${e.message}`;
            throw Error(message);
        });

    let docs = snapshot.docs

    if (docs.length < 1) {
        log({ message: "No valid docs returned from storage. Something is wrong..." })
        return null
    }

    let data = []
    if (type === "sentiment") {
        data = docs.map(doc => doc.data())
    } else {
        data = docs.map(doc => {
            let allData = doc.data()
            return { ...allData[currency], timeStamp: allData.timeStamp }
        })
    }

    // Save the data we just fetched to gStorage

    // By Day...
    let dayGroupedEntries = _entriesGroupedByDay(data);
    await _saveEntriesByGroup("day", dayGroupedEntries, currency, type, false).catch((e) => {
		logError({ title: "Error in storage fixFileForCertainDay", message: e.message, details: e.stack });
		throw e;
    });
    
    // By Week...
    // let weekGroupedEntries = _entriesGroupedByWeek(data);
    // await _saveEntriesByGroup("week", weekGroupedEntries, currency, type, false).catch((e) => {
	// 	let message = `Error in storage fixFileForCertainDay: ${e.message}`;
	// 	throw Error(message);
	// });

    res.json({ startDate, endDate })
    return null
}

//
// Bender
//

/**
 * Fetches price data based on intervals from storage and firestore (where relevant)
 * @param {Number} numberOfEntries How many price entries to fetch in the past
 * @param {Number} latestTimestamp The unix timestamp in ms. Optional, will use the latest price entry if omitted.
 */
exports.getLatestPrices = async (currency, numberOfEntries, latestTimestamp) => {
    let type = "prices";
    let ref = db.collection(type);
    let entries = await retry(async () => await _fetchFromStorageAndFirestore(ref, currency, type, numberOfEntries || 384, latestTimestamp), `storage getLatestPrices`).catch((e) => {
        let message = `Error in Storage getLatestPrices: ${e.message}`;
        throw Error(message)
    });
    return entries;
};

/**
 * Fetches sentiment data based on intervals from storage and firestore (where relevant)
 * @param {String} currency The currency to fetch, used for saving data to gStorage. E.g. `BTC`
 * @param {Number} numberOfEntries How many price entries to fetch in the past
 * @param {Number} latestTimestamp The unix timestamp in ms. Optional, will use the latest price entry if omitted.
 */
exports.getLatestSentiment = async (currency, numberOfEntries, latestTimestamp) => {
    let type = "sentiment";
    let ref = db
        .collection(type)
        .doc(currency)
        .collection("scores");
    let entries = await retry(async () => await _fetchFromStorageAndFirestore(ref, currency, type, numberOfEntries || 384, latestTimestamp), `storage getLatestSentiment`).catch((e) => {
        let message = `Error in Storage getLatestSentiment: ${e.message}`;
		throw Error(message);
    });

    return entries;
};


/**
 * Gets all the unique close price matches for a set of timestamps. Used for calculating adaptive correlations.
 * @param {[Date]} timeStamps An array of timestamps to fetch
 */
exports.getSpecificPriceData = async (currency, timeStamps) => {

    async function getModifiedPricesCache(numberOfPrices) {

        let pricesCache = await exports.getLatestPrices(currency, numberOfPrices, timeStamps[0])
        let modifiedPricesCache = {}

        pricesCache.map(priceEntry => {
            let key = m(priceEntry.timeStamp._seconds * 1000).toISOString()
            modifiedPricesCache[key] = priceEntry;
            return null
        })

        log({
            title: `Debug storage getSpecificPriceData for ${currency}`,
            message: `timeStamps: ${timeStamps.length}, numberOfPricesToFetch: ${numberOfPrices}, pricesCache: ${pricesCache.length}, modifiedPricesCache: ${Object.keys(modifiedPricesCache).length}`
        });

        return modifiedPricesCache
    }

    async function getPriceData(modifiedPricesCache, allowError) {
        let missingEntryCounter = 0

        let priceData = await mapAsync(timeStamps, async (timeStamp) => {

            let docId = m(timeStamp).toISOString();
            let data = modifiedPricesCache[docId]

            if (data) {
                return data;
            } else {
                data = await _getValidPriceDoc(modifiedPricesCache, timeStamp)

                if (!data) {
                    missingEntryCounter++

                    if (allowError) {
                        let message = `Invalid data for timeStamp: ${timeStamp}. This will cause issues with adaptive correlation calculations!`;
                        throw Error(message)
                    }
                }
                return data
            }
        });
        return { missingEntryCounter, priceData }
    }

    try {
        // We fetch 7.5 times the number of price entries (6 price entries per sentiment timestamp (5 min in 30min), with a buffer of 1.5)
        let numberOfPricesToFetch = Math.round(timeStamps.length * 7.5);

        let modifiedPricesCache = await getModifiedPricesCache(numberOfPricesToFetch)
        let { missingEntryCounter, priceData } = await getPriceData(modifiedPricesCache)
        
        // For some reason, sometimes the correct amount of entries are not fetched. Try again with larger modified price cache
        if (missingEntryCounter > 0) {
            modifiedPricesCache = await getModifiedPricesCache(numberOfPricesToFetch + missingEntryCounter * 6.5)
            let { priceData } = await getPriceData(modifiedPricesCache, true)
            return priceData
        } else {
            return priceData;
        }
    } catch (e) {
        let message = `Error in firebase getSpecificPriceData: ${e.message}`;
        throw Error(message)
    }
}

/**
* 
* @param {String} currency The currency being evaluated, e.g. BTC
* @param {String} source The source of the data, e.g. reddit
* @param {Dictionary} data The data to save in dictionary format, with the keys: `included`, `excluded`, `stats`.
*/
exports.saveSentimentDataToBuckets = async (currency, source, data) => {
    let timeStamp = m().utc()
    let fileDate = timeStamp.format("YYYY-MM-DD");

    let included = { timeStamp, ...data.included }
    let excluded = { timeStamp, ...data.excluded }
    let stats = { timeStamp, ...data.stats }

    try {
        await retry(async () => await _saveSentimentDataToBucket(currency, fileDate, source, "included", included), `_saveSentimentDataToBucket included`)
        await retry(async () => await _saveSentimentDataToBucket(currency, fileDate, source, "excluded", excluded), `_saveSentimentDataToBucket excluded`)
        await retry(async () => await _saveSentimentDataToBucket(currency, fileDate, source, "stats", stats), `_saveSentimentDataToBucket stats`)
    } catch (e) {
        logError({ title: "[FUNCTIONS] Error in saving sentiment data to buckets, trying again", message: e.message, details: e.stack })
        setTimeout(this.saveSentimentDataToBuckets, 2000, currency, source, data)
    }
}

exports.saveBacktestSettingsToBuckets = async (exchange, currency, pairedAsset, backtestResults) => {
    try {
        await retry(async () => await _bucketUpload(`backtestResults/${exchange}/${currency}-${pairedAsset}.json`, backtestResults), "_bucketUpload for backtest settings")
    } catch (e) {
        logError({ title: "[FUNCTIONS] Error ssaving backtest settings to buckets", message: e.message })
    }
}

//
// Internal
//

/**
 * Fetches relevant data from gStorage first, then fetches any missing data (based on
 * timeStamps) from Firestore.
 * @param {FirestoreRef} ref The ref object used for Firestore querying
 * @param {String} currency The currency to fetch, used for saving data to gStorage. E.g. `BTC`
 * @param {String} type The type of data, used for saving data to gStorage. E.g. `sentiment` or `prices`
 * @param {Number} numberOfEntries The number of entries we need to fetch. Note: Firestore will not include this limit.
 * @param {Date} latestTimestamp The timeStamp to fetch from. I.e. the latest timeStamp.
 */
async function _fetchFromStorageAndFirestore(ref, currency, type, numberOfEntries, latestTimestamp) {
    try {
        let dayFiles = await _getTimeTypeFiles("day", currency, type);
        
        if (dayFiles.length > 0) {
            let latestDay;
            if (latestTimestamp) {
                latestDay = m(latestTimestamp).toISOString()
            } else {
                latestDay = dayFiles
                    .sort()
                    .reverse()
                    .shift();
            }
    
            // Get from gStorage
            let relevantDaysData = await _loopThroughDays(numberOfEntries, latestDay, currency, type, latestTimestamp);
            log({ message: `Received ${relevantDaysData.length} from gStore by looping through days` })
            let mostRecentEntryDate = m(relevantDaysData[0].timeStamp._seconds * 1000);
            // Check if we have the latest entries, comparing now() and most recent
            // Sentiment happens every 30min, Prices every 5min
            let amountToAdd = type === "sentiment" ? 30 : 5;
            if (mostRecentEntryDate.add(amountToAdd, "minutes").isSameOrBefore(latestTimestamp ? m(latestTimestamp) : m())) {
                log({ message: "need to fetch from firebase" });
                let fbTimestamp = admin.firestore.Timestamp.fromDate(mostRecentEntryDate.subtract(amountToAdd, "minutes").toDate());
                let newRef = ref.where("timeStamp", ">", fbTimestamp);
                let missingData = await _getLatestFromFirestore(newRef, currency, type, latestTimestamp);
                let finalData = missingData.concat(relevantDaysData);
                return finalData.slice(0, numberOfEntries);
            } else {
                let entries = relevantDaysData.slice(0, numberOfEntries);
                log({ message: `We have enough data from gStorage: ${entries.length}` });
                return entries
            }
        } else {
            // Generally we don't want to re-create all sentiment files, we'd rather fail at this particular call
            throw Error(`No files were returned gStorage for type: ${type}, currency: ${currency}. Stopping...`)

            // The below should only be used when we want to re-download all firestore data
            // // We need to get the data directly from Firestore
            // log({ message: "Nothing in gStorage. Getting all new fresh data", postToSlack: true });
            // let freshData = await _getLatestFromFirestore(ref, currency, type);
            // return freshData;
        }
    } catch (e) {
        let message = `Error in storage _fetchFromStorageAndFirestore: ${e.message}`;
        throw Error(message);
    }
}

/**
 * 
 * @param {FirestoreRef} ref The ref object used for Firestore querying
 * @param {String} currency The currency to fetch, used for saving data to gStorage. E.g. `BTC`
 * @param {String} type The type of data, used for saving data to gStorage. E.g. `sentiment` or `prices`
 * @param {FirebaseTimestamp} fromTimestamp The timeStamp to fetch from. I.e. the latest timeStamp.
 */
async function _getLatestFromFirestore(ref, currency, type, fromTimestamp) {
    try {
		let now = admin.firestore.Timestamp.fromDate(fromTimestamp ? m(fromTimestamp).toDate() : new Date());
		let snapshot = await ref
			.where("timeStamp", "<=", now)
			.orderBy("timeStamp", "desc")
			.get();

		let docs = snapshot.docs;
		if (docs.length < 1) {
			log({ message: "No valid docs returned from storage. Something is wrong..." });
			return null;
		}

        log({ message: `Received ${docs.length} ${type} entries from Firestore` });
        let data = []
        if (type === "sentiment") {
            data = docs.map(doc => doc.data())
        } else {
            data = docs.map(doc => {
                let allData = doc.data()
                return { ...allData[currency], timeStamp: allData.timeStamp }
            })
        }

		// Save the data we just fetched to gStorage
		let dayGroupedEntries = _entriesGroupedByDay(data);
		await _saveEntriesByGroup("day", dayGroupedEntries, currency, type);

		return data;
	} catch (e) {
		let message = `Error in storage _getLatestFromFirestore: ${e.message}`;
		throw Error(message);
	}
}

async function _loopThroughDays(numberOfEntries, startDate, currency, type, timeStamp) {
    let latestData = [];
    let entriesLeftToFetch = numberOfEntries
    let date = m(startDate).utc()
    /* eslint-disable no-await-in-loop */
    /* eslint-disable no-loop-func */
    while (entriesLeftToFetch > 0) {
        try {
            let moreData;
            let weekNumber = date.format("YYYY-w");
            let weekFileExists = await _checkForExistence(type, currency, "week", weekNumber);
            let dailyEntryThreshold = type === "sentiment" ? 144 : 864 // i.e. more than 3 days worth to fetch

            if (weekFileExists && entriesLeftToFetch >= dailyEntryThreshold) {
                log({ message: `Getting from week files for date: ${date}... (${entriesLeftToFetch} entries left to fetch)` });
                moreData = await _getDataFromBucket(currency, type, `week/${weekNumber}.json`)
                date = m(date).utc().subtract(1, "week");
            } else {
                log({ message: `Getting from day file for date: ${date}... (${entriesLeftToFetch} entries left to fetch)` });
                moreData = await _getDataFromBucket(currency, type, `day/${date.format("YYYY-MM-DD")}.json`);
                date = m(date).utc().subtract(1, "day");
            }

            if (timeStamp) {
                moreData = moreData.filter(entry => m(entry.timeStamp._seconds * 1000).isSameOrBefore(m(timeStamp)))
            }
            latestData = latestData.concat(moreData);
            entriesLeftToFetch = entriesLeftToFetch - moreData.length;
        } catch (e) {
            if (date.hour() === 0 && date.minute() === 0) {
                log({ title: `Intentional error with looping through days for date: ${date}`,  message: `${e.message}, continuing with other dates...` })
            } else {
                log({ title: `Error with looping through days for date: ${date}`,  message: `File probably hasn't been created yet: ${e.message}, continuing with other dates...` })
            }
            date = m(date).utc().subtract(1, "day");
        }
    }
    /* eslint-enable no-loop-func */
    /* eslint-enable no-await-in-loop */
    return new Promise((resolve, reject) => resolve(latestData))
}

async function _getTimeTypeFiles(timeType, currency, type) {
    let [files] = await bucket.getFiles({ prefix: `${type}/${currency}/${timeType}/`, delimiter: "/" }).catch(e => {
        let message = `Error in storage _getTimeTypeFiles: ${e.message}`;
        throw Error(message)
    });
    return files.map(file => file.name.split('/').pop().split('.').shift())
}

function _entriesGroupedByDay(entries) {
	return entries.reduce((prev, current) => {
		let day = m(current.timeStamp.toDate())
			.utc()
			.format("YYYY-MM-DD");
		(prev[day] = prev[day] || []).push(current);
		return prev;
	}, {});
}

function _entriesGroupedByWeek(entries) {
    return entries.reduce((prev, current) => {
        let week = m(current.timeStamp.toDate())
            .utc()
            .format("YYYY-w");
        (prev[week] = prev[week] || []).push(current);
        return prev;
    }, {});
}

/**
 * Saves Dict as JSON file in Google Storage buckets
 * @param {String} timeType The type of time grouping. E.g. `day` or `week`
 * @param {{}} groupedEntries A dictionary of arrays. E.g. `{ "2019-06-30": [ score: 20 ] }`
 * @param {String} currency The currency of the data. E.g. `BTC`
 * @param {String} type The type of the data. E.g. `sentiment` or `prices`
 * @param {Boolean} append Whether to append to an existing file (if it exists), or create a new one
 */
async function _saveEntriesByGroup(timeType, groupedEntries, currency, type, append=true) {
    try {
        let keys = await mapAsync(Object.keys(groupedEntries), async (key) => {
            await _saveDataToBucket(currency, type, `${timeType}/${key}.json`, groupedEntries[key], append);
            return key;
        });
        log({ message: `Saved ${keys.length} ${type} entries for ${currency} to a Firebase Storage JSON file.` });
        await sleep(1000) // Sleep for 1 second so files have time to be properly saved to Storage (and accessed immediately after)
        return keys
    } catch (e) {
        let message = `Error in storage _saveEntriesByGroup: ${e.message}`;
        throw Error(message)
    }
}

async function _getDataFromBucket(currency, type, filename) {
    return await _bucketDownload(`${type}/${currency}/${filename}`).catch((e) => {
		throw e;
	});
}

async function _saveDataToBucket(currency, type, filename, data, append=true) {
    try {
        if (append) {
            try {
                log({ message: `Attempting to combine with file: ${type}/${currency}/${filename}` });
                let existingData = await _getDataFromBucket(currency, type, filename)
                let combinedData = data.concat(existingData)
                log({ message: `Successfully combined with file: ${type}/${currency}/${filename}` });
                return await _bucketUpload(`${type}/${currency}/${filename}`, combinedData);
            } catch (e) {
                log({ message: `No existing file found for ${type}/${currency}/${filename}, creating new file...` });
            }
        }
        return await _bucketUpload(`${type}/${currency}/${filename}`, data);
    } catch (e) {
        let message = `Error in storage _saveDataToBucket: ${e.message}`;
        throw Error(message)
    }
}

/**
 * Check for the existence of a file in gStorage
 * @param {String} type The type of data to fetch, e.g. `sentiment` or `prices`
 * @param {String} currency The currency, e.g. `BTC` or `ETH`
 * @param {String} timeType The type of time file to get, e.g. `week` or `day`
 * @param {String} fileName The name of the file to check for existence
 */
async function _checkForExistence(type, currency, timeType, fileName) {
    let file = await _listFiles(`${type}/${currency}/${timeType}`, fileName);
    return file.length > 0 ? true : false
}

// Iterate to find a 'close enough' price
function _getValidPriceDoc(priceCache, timeStamp) {
    let counter = 0;
    let minutePrev = m(timeStamp).subtract(1, "m");
    let data;

    /* eslint-disable no-await-in-loop */
    /* eslint-disable no-loop-func */
    while (!data) {
        if (counter > 31) {
            logError({ title: `_getValidPriceDoc error`, message: `Counter is above 31 for timeStamp: ${timeStamp}, got to minutePrev: ${minutePrev}, exiting... This will likely cause issues with correlation calculations`, postToSlack: false });
            break
        }
        data = priceCache[minutePrev.toISOString()]
        if (data) {
            log({ title: `_getValidPriceDoc message`, message: `Found for timeStamp: ${timeStamp}, got to minutePrev: ${minutePrev}` });
            break;
        } else {
            minutePrev = minutePrev.subtract(1, "m");
            counter++;
        }
    }
    /* eslint-enable no-loop-func */
    /* eslint-enable no-await-in-loop */

    return new Promise((resolve, reject) => resolve(data));
}

/**
 * Get sentiment data from the relevant bucket
 * @param {String} currency The currency being evaluated, e.g. BTC
 * @param {String} date The string format of the date's day, e.g. 2019-09-11
 * @param {String} source The source of the data, e.g. reddit
 * @param {String} type The type that is requested, e.g. included/excluded/stats
 * @returns {Array} An array of dictionaries
 */
async function _getSentimentDataFromBucket(filename) {
	return await _bucketDownload(filename).catch((e) => {
		throw e;
	});
}

/**
 * Save sentiment data to the relevant bucket
 * @param {String} currency The currency being evaluated, e.g. BTC
 * @param {String} date The string format of the date's day, e.g. 2019-09-11
 * @param {String} source The source of the data, e.g. reddit
 * @param {String} type The type that is requested, e.g. included/excluded/stats
 * @param {Dictionary} data The data to save in dictionary format
 * @param {Boolean} append Whether to append to an existing file, or create a new one. Optional.
 */
async function _saveSentimentDataToBucket(currency, date, source, type, data, append = true) {
	let filename = `rawSentiment/${date}/${currency}/${source}/${type}.json`;
	try {
		if (append) {
			try {
				// log({ message: `Attempting to combine with file: ${filename}`});
                let existingData = await _getSentimentDataFromBucket(filename);
                let array = [data]
                let combinedData = array.concat(existingData);
                // log({ message: `Successfully combined with file: ${filename}` })
				return await _bucketUpload(filename, combinedData);
			} catch (e) {
				log({ message: `No existing file found for ${filename}, creating new file...`, details: e.message, postToSlack: false});
			}
		}
		return await _bucketUpload(filename, [data]);
	} catch (e) {
		throw e;
	}
}

// This should run every Sunday at 12am
exports.consolidateWeekStorageFiles = async (currency, type) => {
    let mutatingDate = m().utc().subtract(1, 'days') // Saturday 2:05am
    // Note: .startOf() and .endOf() mutates original
    let startDate = admin.firestore.Timestamp.fromDate(mutatingDate.utc().startOf("week").toDate());
    let endDate = admin.firestore.Timestamp.fromDate(mutatingDate.utc().endOf("week").toDate());

    console.log(`startDate: ${startDate.toDate()}, endDate:: ${endDate.toDate()}`);

    let ref = db.collection(type)

    if (type === "sentiment") {
        ref = ref
            .doc(currency)
            .collection("scores")
    }
    let snapshot = await ref
        .where("timeStamp", "<=", endDate)
        .where("timeStamp", ">=", startDate)
        .orderBy("timeStamp", "desc")
        .get()
        .catch((e) => {
            let message = `Error in storage consolidateWeekStorageFiles: ${e.message}`;
            throw Error(message);
        });

    let docs = snapshot.docs

    if (docs.length < 1) {
        logError({ title: "consolidateWeekStorageFiles", message: "No valid docs returned from storage. Something is wrong..." })
        return
    }

    let data = []
    if (type === "sentiment") {
        data = docs.map(doc => doc.data())
    } else {
        data = docs.map(doc => {
            let allData = doc.data()
            return { ...allData[currency], timeStamp: allData.timeStamp }
        })
    }

    // Save the data we just fetched to gStorage
    let weekGroupedEntries = _entriesGroupedByWeek(data);
    await _saveEntriesByGroup("week", weekGroupedEntries, currency, type, false).catch((e) => {
        let message = `Error in storage consolidateWeekStorageFiles: ${e.message}`;
        throw Error(message)
    });

    log({ title: `🤖 Bender Consolidated ${currency} ${type} weekly file`, message: `Successfully consolidated ${data.length} entries into single week file.`, postToSlack: true})
}

// DEFAULTS
async function _listFiles(folder, filter) {
    let [files] = await bucket.getFiles({ prefix: `${folder}/${filter}` })
    let fileNames = []
    files.map(file => fileNames.unshift(file.name))
    return fileNames
}

async function _bucketDownload(fileName) {
    let file = bucket.file(fileName);
    let result = await file.download().catch((e) => {
		throw e;
	});
    return JSON.parse(result[0]);
}

async function _bucketUpload(fileName, data) {
    let file = bucket.file(fileName);
    let jsonData = JSON.stringify(data)

    await file.save(jsonData, { resumable: false }).catch(e => {
        throw e
    })
}