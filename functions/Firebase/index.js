const m = require("moment");

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

const { retry } = require("../helpers/retry")
const { log } = require("../helpers/log");
const { btcDefaultSettings, ethDefaultSettings, positionsCollection, farnsworthCollection, defaultZoidbergWorkingCapital } = require("../constants");

const farnsworthCollectionId = (isProd) => isProd ? farnsworthCollection.prod : farnsworthCollection.dev;
const positionsCollectionId = (isProd) => isProd ? positionsCollection.prod : positionsCollection.dev;

const runtimeOpts = {
	timeoutSeconds: 300,
	memory: "512MB"
};

/**
 * Used for direct http calls to an endpoint
 * @param {function} callback `(req, res)` are returned to the callback.
 */
exports.onHttps = (callback) => functions.https.onRequest(callback);

/**
 * Used for direct http calls to an endpoint, with extended timeout and memory allocation
 * @param {function} callback `(req, res)` are returned to the callback.
 */
exports.onHttpsExtended = (callback) => functions.runWith(runtimeOpts).https.onRequest(callback);

/**
 * Used for calling a function on a continual schedule
 * @param {Number} minutes How often the function should be called every number of minutes
 * @param {function} callback `(context)` is returned to the callback.
 */
exports.onSchedule = (minutes, callback) => functions.pubsub.schedule(`every ${minutes} minutes`).onRun(callback)

/**
 * Used for calling a function on a continual schedule (in hours)
 * @param {Number} hours How often the function should be called every number of minutes
 * @param {function} callback `(context)` is returned to the callback.
 */
exports.onScheduleHours = (hours, callback) => functions.pubsub.schedule(`every ${hours} hours`).timeZone("Europe/London").onRun(callback)

/**
 * Used for calling a function at a specified time
 * @param {String} cronSyntax The specified time, in cron syntax. See: https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules
 * @param {function} callback `(context)` is returned to the callback.
 */
exports.onDate = (cronSyntax, callback) =>
	functions
		.runWith(runtimeOpts)
		.pubsub.schedule(cronSyntax)
		.timeZone("Europe/London")
		.onRun(callback);
        
/**
 * Called on a Firestore doc update
 * @param {String} documentPath The path, including the collectionIds, of the doc
 * @param {function} callback `(change, context)` are returned to the callback. `change` is for the changes. E.g. `change.after.data()`. `context` is for the context data, if any is attached, including `{parameter}` in doc path.
 */
exports.onUpdate = (documentPath, callback) => functions.firestore.document(documentPath).onUpdate(callback)

/**
 * Called on a Firestore doc creation
 * @param {String} documentPath The path, including the collectionIds, of the doc
 * @param {function} callback `(snap, context)` are returned to the callback. `snap` is for the doc. E.g. `snap.data()`. `context` is for the context data, if any is attached, including `{parameter}` in doc path.
 */
exports.onCreate = (documentPath, callback) => functions.firestore.document(documentPath).onCreate(callback)

/**
 * Called on a Firestore doc creation, with an extended timeout and memory allocation
 * @param {String} documentPath The path, including the collectionIds, of the doc
 * @param {function} callback `(snap, context)` are returned to the callback. `snap` is for the doc. E.g. `snap.data()`. `context` is for the context data, if any is attached, including `{parameter}` in doc path.
 */
exports.onCreateExtended = (documentPath, callback) => functions.runWith(runtimeOpts).firestore.document(documentPath).onCreate(callback);

exports.getEnvMode = functions.config().env.mode;
exports.getEnvValue = functions.config().env.value;

/******************************************************
 *********************** Leela ************************
 *****************************************************/

/**
 * Gets the currently open position, if there is one (i.e. we've bought and waiting to sell)
 * @returns {{}} See currentPosition example in Firestore
 */
exports.getPosition = async (isProd, currency, exchange, pairedAsset) => {
    let doc = await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
		.doc(pairedAsset + "-currentPosition")
        .get(), `firebase getPosition`)
        .catch(e => {
            let message = `Error in firebase getPosition: ${e.message}`;
            throw Error(message)
        });
    
    return doc.exists ? doc.data() : null;
}

/**
 * Gets previous anchor data from Firestore
 * @returns {{}} See prevAnchor example in Firestore
 */
exports.getPrevAnchor = async (isProd, currency, exchange, pairedAsset) => {
    let doc = await retry(async () => await db
		.collection(positionsCollectionId(isProd))
		.doc(currency)
		.collection(exchange)
		.doc(pairedAsset + "-prevAnchor")
		.get(), `firebase getPrevAnchor`)
		.catch((e) => {
            let message = `Error in firebase getPrevAnchor: ${e.message}`;
			throw Error(message);
		});
	return doc.data();
};

/**
 * Updates the prevAnchor data in Firestore
 * @param {{}} anchor Dictionary object with price, timestamp, and score to use. Should be the entry.
 */
exports.saveNewPrevAnchor = async (isProd, currency, exchange, pairedAsset, anchor) => {
	let timeStamp;
	let price;
	let score;

	if (anchor.hasPosition === false) {
		timeStamp = anchor.sellTimeStamp;
		price = anchor.sellPrice;
		score = anchor.sellScore;
        log({ message: "used anchor with false position"});
	} else if (anchor.hasPosition === true) {
		timeStamp = anchor.buyTimeStamp;
		price = anchor.buyPrice;
		score = anchor.buyScore;
        log({ message: "used anchor with true position"});
	} else {
		timeStamp = anchor.timeStamp;
		price = anchor.price;
		score = anchor.score;
	}

	try {
        await retry(async () => await db
            .collection(positionsCollectionId(isProd))
			.doc(currency)
			.collection(exchange)
            .doc(pairedAsset + "-prevAnchor")
			.set({
				price,
				score,
				timeStamp: timeStamp instanceof admin.firestore.Timestamp ? timeStamp : admin.firestore.Timestamp.fromDate(new Date(timeStamp))
			}), `firebase saveNewPrevAnchor`)
	} catch (e) {
        let message = `Error in firebase saveNewPrevAnchor: Anchor used: ${anchor}, Error: ${e.message}`;
        throw Error(message);
	}
};

/**
 * Get the profits for a certain interval period
 * @param {String} typeRange Either `daily`, `weekly`, `monthly`
 * @param {String} dateISO The ISO version of the typeRange date, using Moment.js
 */
exports.getProfits = async (isProd, currency, exchange, pairedAsset, typeRange, dateISO) => {
    let ref = db
        .collection(farnsworthCollectionId(isProd))
		.doc(currency)
		.collection(exchange)
		.doc(pairedAsset + "-profits")
		.collection(typeRange)
		.doc(dateISO);
    let doc = await retry(async () => await ref.get(), `firebase getProfits`).catch((e) => {
        let message = `Error in firebase getProfits doc: ${e.message}`;
        throw Error(message);
    });

    if (doc.exists) {
        return doc.data().profit;
    } else {
        return 0;
    }
};

/**
 * Gets the latest price of assets that are the same, or within 10 minutes before, `timeStamp`
 * @param {Date} timeStamp The JS Date object
 */
exports.getLatestPricesWithTimestamp = async (timeStamp) => {
    let latestTimeStamp = timeStamp;
    let beforeTimeStamp = m(timeStamp).subtract(12, 'minutes');

    let firebaseLatest = admin.firestore.Timestamp.fromDate(latestTimeStamp.toDate());
    let firebaseEarliest = admin.firestore.Timestamp.fromDate(beforeTimeStamp.toDate());

    let snapshot = await retry(async () => await db
        .collection("prices")
        .where("timeStamp", ">=", firebaseEarliest)
        .where("timeStamp", "<=", firebaseLatest)
        .orderBy("timeStamp", "desc")
        .limit(1)
        .get(), `firebase getLatestPricesWithTimestamp`)
        .catch((e) => {
            let message = `Error in firebase getLatestPricesWithTimestamp: ${e.message}`;
            throw Error(message);
        });

    let docs = snapshot.docs
    if (docs.length < 1) {
        log({ message: "No valid price data returned! Something is wrong..." })
        return null
    }

    let latestPriceEntry = docs[0].data();
    return latestPriceEntry;
}

/******************************************************
 *********************** Fender ************************
 *****************************************************/

/**
 * Get the latest optimal trade settings for a particular currency/exchange/pairedAsset combination
 */
exports.getTradeSettings = async (isProd, currency, exchange, pairedAsset) => {
    let doc = await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-tradeSettings")
        .get(), `firebase getTradeSettings`)
        .catch((e) => {
            let message = `Error in firebase getTradeSettings: ${e.message}`;
            throw Error(message);
        });
    
    if (!doc.exists || Object.keys(doc.data()).length === 0) {
        log({ message: `Trade settings were empty for ${currency}-${exchange}-${pairedAsset}, using default settings`})
        return currency === "ETH" ? ethDefaultSettings : btcDefaultSettings
    }
    
    return doc.data();
}

/**
 * Set the most optimal trade settings for a particular currency/exchange/pairedAsset combination
 */
exports.setTradeSettings = async (isProd, currency, exchange, pairedAsset, tradeSettings) => {
    await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-tradeSettings")
        .set(tradeSettings), `firebase setTradeSettings`)
        .catch((e) => {
            let message = `Error in firebase setTradeSettings: ${e.message}`;
            throw Error(message);
        });
}

/******************************************************
 *********************** Fry **************************
 *****************************************************/

exports.getWorkingCapital = async (isProd, currency, exchange, pairedAsset) => {
    let doc = await retry(async () => await db
        .collection(positionsCollectionId(isProd))
		.doc(currency)
		.collection(exchange)
        .doc(pairedAsset + "-currentWorkingCapital")
        .get(), `firebase getWorkingCapital`)
        .catch((e) => {
            let message = `Error in firebase getWorkingCapital: ${e.message}`;
            throw Error(message);
        });

    if (doc.exists) {
        return { currentWC: doc.data().currentWC, defaultWC: doc.data().defaultWC };
    } else {
        let defaultWC = await this.resetWorkingCapital(isProd, currency, exchange, pairedAsset);
        return { currentWC: defaultWC, defaultWC };
    }
}

exports.updateWorkingCapital = async (isProd, currency, exchange, pairedAsset, workingCapital, defaultWorkingCapital) => {
    let data = {}
    data["currentWC"] = workingCapital;
    if (defaultWorkingCapital) data["defaultWC"] = defaultWorkingCapital;

    await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-currentWorkingCapital")
        .set(data, { merge: true }), `firebase updateWorkingCapital`)
        .catch((e) => {
            let message = `Error in firebase updateWorkingCapital: ${e.message}`;
            throw Error(message);
        });
};

exports.updateTradeCounter = async (isProd, currency, exchange, pairedAsset) => {
    let ref = db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-tradeCounter")

    try {
        let doc = await retry(async () => await ref.get(), `firebase updateTradeCounter`)
        
        if (!doc.exists) {
            await ref.set({ completed: 1})
        } else {
            await ref.update({
                completed: admin.firestore.FieldValue.increment(1)
            })
        }
    } catch (e) {
        let message = `Error in firebase updateTradeCounter: ${e.message}`;
        throw Error(message);
    }
}

/******************************************************
 ********************** Zapp **************************
 *****************************************************/

exports.saveNewBuyPosition = async (isProd, currency, exchange, pairedAsset, entry, workingCapital, timeStamp) => {
    let fbTimeStamp = timeStamp instanceof admin.firestore.Timestamp ? timeStamp : admin.firestore.Timestamp.fromDate(m(timeStamp).toDate())

    let data = {
		hasPosition: true,
		amountBought: entry.amountBought,
		startWorkingCapital: workingCapital,
		buyPrice: entry.buyPrice,
		buyScore: entry.score,
		buyTimeStamp: fbTimeStamp,
		orderId: entry.orderId,
		buyOrderId: entry.orderId,
		settled: false,
        lossThreshold: entry.lossThreshold
    };
    
    if (this.getEnvMode === "backtest") {
        data["buyFees"] = entry.buyFees
    }

    await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-currentPosition")
        .set(data), `firebase saveNewBuyPosition`)
        .catch((e) => {
            let message = `Error in firebase saveNewBuyPosition: ${e.message}`;
            throw Error(message);
        });
};

exports.updatePosition = async (isProd, currency, exchange, pairedAsset, data) => {
    await retry(async () => await db
		.collection(positionsCollectionId(isProd))
		.doc(currency)
		.collection(exchange)
		.doc(pairedAsset + "-currentPosition")
        .set(data, { merge: true }), `firebase updatePosition`)
        .catch((e) => {
            let message = `Error in firebase updatePosition: ${e.message}`;
            throw Error(message);
        });
}

// Only used in backtesting by Turanga, to record trades
exports.recordTradeForBacktestFarnsworth = async (entry, position, updatedPosition) => {
    let timeStamp = m(entry.timeStamp).toISOString()
    await db
        .collection(farnsworthCollection.dev)
        .doc(entry.currency)
        .collection(`${entry.pairedAsset}-${entry.exchange}`)
        .doc(timeStamp)
        .set({ ...position, ...updatedPosition, sellTimeStamp: entry.timeStamp });
}


/******************************************************
 ********************* Zoidberg ***********************
 *****************************************************/

exports.getKillSwitch = async (isProd) => {
    let doc = await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc("Zoidberg")
        .get(), `firebase getKillSwitch`)
        .catch(e => {
            let message = `Error in firebase getKillswitch: ${e.message}`;
            throw Error(message);
        });

    return doc.exists ? doc.data().killSwitch : true;
}

exports.toggleKillSwitch = async (isProd) => {
    let killSwitch = await this.getKillSwitch(isProd)

    console.log(`Setting killSwitch to ${!killSwitch}`)
    await retry(async () => await db
		.collection(positionsCollectionId(isProd))
		.doc("Zoidberg")
		.set({ killSwitch: !killSwitch}, { merge: true }), `firebase toggleKillSwitch`)
		.catch((e) => {
            let message = `Error in firebase toggleKillSwitch: ${e.message}`;
            throw Error(message);
        });
    
    return !killSwitch;
};

/**
 * Returns the `Zoidberg` default working capital amount
 * If there is no Zoidberg default WC, then the `defaultZoidbergWorkingCapital`
 * in constants.js will be used instead.
 */
exports.getDefaultWorkingCapital = async (isProd) => {
    let doc = await retry(async () => await db
		.collection(positionsCollectionId(isProd))
		.doc("Zoidberg")
		.get(), `firebase getDefaultWorkingCapital`)
		.catch((e) => {
            let message = `Error in firebase getDefaultWorkingCapital: ${e.message}`;
            throw Error(message);
		});

    if (doc.exists) {
        return doc.data().defaultWC ? doc.data().defaultWC : defaultZoidbergWorkingCapital;
    } else {
        await this.setDefaultWorkingCapital(isProd, defaultZoidbergWorkingCapital);
        return defaultZoidbergWorkingCapital;
    }
};

/**
 * For setting the default working capital amount that will be used in all `new`
 * transactions, that don't already have a `defaultWC` value in their `-currentWorkingCapital` doc
 */
exports.setDefaultWorkingCapital = async (isProd, wc) => {
    await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc("Zoidberg")
        .set({ defaultWC: wc }, { merge: true }), `firebase setDefaultWorkingCapital`)
        .catch((e) => {
            let message = `Error in firebase setDefaultWorkingCapital: ${e.message}`
            throw Error(message);
        });
}

/**
 * For resetting the `-currentWorkingCapital` doc, using the Zoidberg `defaultWC` value
 */
exports.resetWorkingCapital = async (isProd, currency, exchange, pairedAsset) => {
	let defaultWC = await this.getDefaultWorkingCapital(isProd);
	await this.updateWorkingCapital(isProd, currency, exchange, pairedAsset, defaultWC, defaultWC).catch((e) => {
		let message = `Error in firebase resetWorkingCapital: ${e.message}`
        throw Error(message);
	});
	return defaultWC;
};

/**
 * For resetting the `-tradeCounter` doc when taking profits
 */
exports.resetTradeCounter = async (isProd, currency, exchange, pairedAsset) => {
    await retry(async () => await db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-tradeCounter")
        .set({ completed: 0 }), `firebase resetTradeCounter`)
        .catch(e => {
            let message = `Error in firebase resetTradeCounter: ${e.message}`
            throw Error(message);
        })
}

exports.recordProfitsTaken = async (isProd, currency, exchange, pairedAsset, profits) => {
    let ref = db
        .collection(positionsCollectionId(isProd))
        .doc(currency)
        .collection(exchange)
        .doc(pairedAsset + "-profitsTaken")

    try {
        let doc = await retry(async () => await ref.get(), `firebase recordProfitsTaken`)

        // Increment totals field
        if (!doc.exists) {
            await ref.set({ total: Number(profits) })
        } else {
            await ref.update({
                total: admin.firestore.FieldValue.increment(Number(profits))
            })
        }

        // Add record to collection
        let date = m().utc()
        let fbDate = admin.firestore.Timestamp.fromDate(date.toDate());

        await ref
            .collection("records")
            .doc(date.toISOString())
            .set({
                timeStamp: fbDate,
                profit: Number(profits)
            })
        
    } catch (e) {
        let message = `Error in firebase recordProfitsTaken: ${e.message}`
        throw Error(message);
    }
}

/******************************************************
 **************** Firestore Querying ******************
 *****************************************************/

/**
 * Converts a dict timeStamp to the native Firebase timestamp format
 * @param {{}} timeStamp The dictionary version of a timestamp, consisting of `_seconds` and `_nanoseconds`
 */
exports.convertToFirebaseTimestamp = (timeStamp) => {
    return new admin.firestore.Timestamp(timeStamp["_seconds"], timeStamp["_nanoseconds"]);
}

/**
 * Converts a moment timeStamp to the native Firebase timestamp format
 * @param {{}} timeStamp The `moment` version of a timestamp
 */
exports.convertMomentToFirebaseTimestamp = (timeStamp) => {
    return admin.firestore.Timestamp.fromDate(timeStamp.toDate());
}


// For calculating capital recycle amount
// exports.temp = () => {
//     return this.onHttps(async (req, res) => {
//         let snapshot = await db
//             .collection("farnsworth")
//             .doc("BTC")
//             .collection("EUR-coinbaseEUR")
//             .get()
    
//         let total = 0
//         snapshot.forEach(doc => {
//             let data = doc.data()
//             let capitalDeployed = data.startWorkingCapital
//             total += Number(capitalDeployed)
//         })

//         console.log(total)
    
//         let snapshotEth = await db
//             .collection("farnsworth")
//             .doc("ETH")
//             .collection("EUR-coinbaseEUR")
//             .get()
    
//         snapshotEth.forEach(doc => {
//             let data = doc.data()
//             let capitalDeployed = data.startWorkingCapital
//             total += Number(capitalDeployed)
//         })
    
//         console.log(total)
//         return res.json(total)
//     })
// }