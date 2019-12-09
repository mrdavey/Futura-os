const m = require("moment");

const admin = require("firebase-admin");
const db = admin.firestore();

const { onUpdate } = require("../Firebase");
const { checkZoigbergKillSwitch } = require("../Zoidberg");
const { positionsCollection, farnsworthCollection } = require("../constants")
const { log, logNews, logError } = require("../helpers/log");
const { round } = require("../helpers/numbers")

/**
 * Creates a new audit doc for Farnsworth.
 * Note: this only fires on `update` of the `currentPosition` doc, not on `create`.
 * @param {String} pairedAsset The asset pair (i.e. USD / EUR / PAX)
 */
exports.recordTrade = (isProd, pairedAsset) => {
	let farnsworthCollectionId = isProd ? farnsworthCollection.prod : farnsworthCollection.dev;
	let documentPath = (isProd ? positionsCollection.prod : positionsCollection.dev) + `/{currency}/{exchange}/${pairedAsset}-currentPosition`;

	return onUpdate(documentPath, async (change, context) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			return null
		}

		let newData = change.after.data();
		let exchange = context.params.exchange;
		let currency = context.params.currency;

		// Only record trade when a done reason is recorded
		if (newData.doneReason && newData.doneReason !== "") {
			if (newData.hasPosition) {
				let timeStamp = m(newData.buyTimeStamp.toDate()).toISOString();
				return db
					.collection(farnsworthCollectionId)
					.doc(currency)
					.collection(`${pairedAsset}-${exchange}`)
					.doc(timeStamp)
					.set(newData, { merge: true });
			} else {
				let oldData = change.before.data();
				let timeStamp = m(oldData.buyTimeStamp.toDate()).toISOString();
				return db
					.collection(farnsworthCollectionId)
					.doc(currency)
					.collection(`${pairedAsset}-${exchange}`)
					.doc(timeStamp)
					.set(newData, { merge: true });
			}
		}
		return null
	});
};

/**
 * Creates a new profits record for Farnsworth.
 * Note: this only fires on `update` of the `currentWorkingCapital` doc, not on `create`.
 * @param {String} pairedAsset The asset pair (i.e. USD / EUR / PAX)
 */
exports.recordProfit = (isProd, pairedAsset) => {
    let farnsworthCollectionId = isProd ? farnsworthCollection.prod : farnsworthCollection.dev;
	let documentPath = (isProd ? positionsCollection.prod : positionsCollection.dev) + `/{currency}/{exchange}/${pairedAsset}-currentWorkingCapital`;
	
	return onUpdate(documentPath, async (change, context) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			return false
		}

		let newData = change.after.data();
		let newWC = newData.currentWC;
		let newDefaultWC = newData.defaultWC;

		if (Number(newWC) - Number(newDefaultWC) === 0) {
			logNews({
				title: "👴 Farnsworth",
				message: `Default working capital === Current working capital (${newDefaultWC})`,
				details: "Were profits recently taken? Double check working capital",
			});
			return false
		}

		let exchange = context.params.exchange;
		let currency = context.params.currency;

		let oldData = change.before.data();
		let oldWC = oldData.currentWC;
		let oldDefaultWC = oldData.defaultWC;

		let profit = Number(newWC) - Number(oldWC);
		let netRunningProfit = Number(newWC) - Number(oldDefaultWC);

		logNews({
			title: "👴 Farnsworth",
			message: `We just made a *gross ${profit > 0 ? "profit" : "loss"}* of ${round(profit, 2)} ${pairedAsset}!, with a running net ${
				netRunningProfit > 0 ? "profit" : "loss"
			} of ${round(netRunningProfit, 2)} ${pairedAsset}`,
		});
		let timeStamp = admin.firestore.Timestamp.now();

		let day = m(timeStamp.toDate()).format("YYYY-MM-DD");
		let week = m(timeStamp.toDate()).format("YYYY-w");
		let month = m(timeStamp.toDate()).format("YYYY-MM");

		let refDaily = db
			.collection(farnsworthCollectionId)
			.doc("profits")
			.collection("daily")
			.doc(currency)
			.collection(`${pairedAsset}-${exchange}`)
			.doc(day);
		let dailyDoc = await refDaily.get().catch(e => {
			logError({ title: "Farnsworth error getting daily doc", message: e.message, details: e.stack })
			return
		});
		if (dailyDoc.exists) {
			refDaily.update({ profit: admin.firestore.FieldValue.increment(profit) });
		} else {
			refDaily.set({ profit });
		}

		let refWeekly = db
			.collection(farnsworthCollectionId)
			.doc("profits")
			.collection("weekly")
			.doc(currency)
			.collection(`${pairedAsset}-${exchange}`)
			.doc(week);
		let weeklyDoc = await refWeekly.get().catch((e) => {
			logError({ title: "Farnsworth error getting weekly doc", message: e.message, details: e.stack });
			return
		});
		if (weeklyDoc.exists) {
			refWeekly.update({ profit: admin.firestore.FieldValue.increment(profit) });
		} else {
			refWeekly.set({ profit });
		}

		let refMonthly = db
			.collection(farnsworthCollectionId)
			.doc("profits")
			.collection("monthly")
			.doc(currency)
			.collection(`${pairedAsset}-${exchange}`)
			.doc(month);
		let monthlyDoc = await refMonthly.get().catch((e) => {
			logError({ title: "Farnsworth error getting monthly doc", message: e.message, details: e.stack });
			return
		});
		if (monthlyDoc.exists) {
			refMonthly.update({ profit: admin.firestore.FieldValue.increment(profit) });
		} else {
			refMonthly.set({ profit });
		}
		return true;
	});
}

// We always set the most optimal into production to be used immediately!
exports.recordOptimalTradeSettingResult = async (mostOptimal) => {
	let pairedAssetFixed = mostOptimal.pairedAsset.length < 4 ? mostOptimal.pairedAsset : mostOptimal.pairedAsset.substring(0, 4)
	if (pairedAssetFixed.slice(-1) === "-") {
		pairedAssetFixed = mostOptimal.pairedAsset.substring(0, 3);
	}

	await db
		.collection("farnsworth")
		.doc("backtest-results")
		.collection(`${mostOptimal.currency}-${pairedAssetFixed}-${mostOptimal.exchange}`)
		.doc(`${Date.now()}`)
		.set(mostOptimal)
		.catch((e) => {
			logError({ title: "Farnsworth error creating optimal trade setting result", message: e.message, details: e.stack });
		});
}

// Only used by the emulators

exports.recordBacktestResult = async (isProd, currency, exchange, pairedAsset, startTime, startEntry, endEntry, settings, backtestIdPrefix) => {
	let killSwitchIsActive = await checkZoigbergKillSwitch();
	if (killSwitchIsActive) {
		log({ message: "Zoidberg kill switch is active" });
		return;
	}

	let positionsCollectionId = isProd ? positionsCollection.prod : positionsCollection.dev;
	let doc = await db
		.collection(positionsCollectionId)
		.doc(currency)
		.collection(exchange)
		.doc(pairedAsset + "-currentWorkingCapital")
		.get()
		.catch((e) => {
			logError({ title: "Farnsworth error recording backtest result", message: e.message, details: e.stack });
		});

	log({ message: "--- Backtesting completed ---" });

	let startDate = m(startEntry.timeStamp);
	let endDate = m(endEntry.timeStamp);
	let fbStartDate = admin.firestore.Timestamp.fromDate(startDate.toDate());
	let fbEndDate = admin.firestore.Timestamp.fromDate(endDate.toDate());

	let endTime = Date.now();
	let backtestTime = (endTime - startTime) / 1000 / 60;

	let startPrice = startEntry.price;
	let endPrice = endEntry.price;

	let priceVolatilityRange = endPrice - startPrice;
	let beta = (endPrice / startPrice - 1) * 100;

	let data;

	log({ message: `Backtesting results for ${startDate.toISOString()} to ${endDate.toISOString()}`, logDuringBacktest: true });

	if (doc.exists) {
		let tradeCounter = await db
			.collection(positionsCollectionId)
			.doc(currency)
			.collection(exchange)
			.doc(pairedAsset + "-tradeCounter")
			.get()
			.catch((e) => {
				logError({ title: "Farnsworth error recording tradeCounter for backtest", message: e.message, details: e.stack });
			});

		let numberOfTrades = tradeCounter.exists ? tradeCounter.data().completed : 0;
		let currentWC = doc.data().currentWC;
		let defaultWC = doc.data().defaultWC;

		let profit = currentWC - defaultWC;
		let growth = (currentWC / defaultWC - 1) * 100;

		if (growth === 0) {
			growth = 1.0;
		} // We didn't make or loose any money

		let alpha = growth - beta;

		log({ message: `Alpha: ${alpha}, Beta: ${beta}`, logDuringBacktest: true });
		log({ message: `Profit: $${profit}, price volatility: $${priceVolatilityRange}`, logDuringBacktest: true });
		log({ message: `Total number of completed trades: ${numberOfTrades}`, logDuringBacktest: true });
		log({ message: `Backtest took ${backtestTime} minutes`, logDuringBacktest: true });

		data = {
			startDate: fbStartDate,
			endDate: fbEndDate,
			startWC: defaultWC,
			endWC: currentWC,
			backtestTime,
			alpha,
			beta,
			priceVolatilityRange,
			profit,
			percentReturnWC: growth,
			currency,
			pairedAsset,
			exchange,
			numberOfTrades,
			settings
		};
	} else {
		log({ message: `Could not find ${pairedAsset + "-currentWorkingCapital"} doc. Looks like no trades happened!`, logDuringBacktest: true });
		log({ message: `Alpha: ${1.0 - beta}, Beta: ${beta}`, logDuringBacktest: true });
		log({ message: `Profit: $0.00, price volatility: $${priceVolatilityRange}`, logDuringBacktest: true });
		log({ message: `Total number of completed trades: 0`, logDuringBacktest: true });
		log({ message: `Backtest took ${backtestTime} minutes`, logDuringBacktest: true });

		data = {
			startDate: fbStartDate,
			endDate: fbEndDate,
			backtestTime,
			alpha: 1.0 - beta,
			beta,
			priceVolatilityRange,
			profit: 0,
			percentReturnWC: 1.0,
			currency,
			pairedAsset,
			exchange,
			numberOfTrades: 0,
			settings,
		};
	}

	log({ message: `Settings: ${JSON.stringify(settings)}`, logDuringBacktest: true })

	let pairedAssetFixed = pairedAsset.length < 4 ? pairedAsset : pairedAsset.substring(0, 4)
	if (pairedAssetFixed.slice(-1) === "-") {
		pairedAssetFixed = pairedAsset.substring(0, 3);
	}

	let farnsworthRef = db
		.collection(farnsworthCollection.dev)
		.doc(currency)
		.collection(pairedAsset + "-" + exchange)

	let tradeRecords = []
	let tradeRecordsSnapshot = await farnsworthRef.get()

	tradeRecordsSnapshot.forEach(doc => {
		tradeRecords.push(doc.data())
	});

	data.tradeRecords = tradeRecords
	
	await db
		.collection("farnsworth")
		.doc("backtest-results")
		.collection(`${currency}-${pairedAssetFixed}-${exchange}`)
		.doc(pairedAsset)
		.set(data)
		.catch((e) => {
			logError({ title: "Farnsworth error creating backtest record result", message: e.message, details: e.stack });
		});

	log({ message: "--- Cleaning up post-backtesting ---" });
	let ref = db
		.collection(isProd ? positionsCollection.prod : positionsCollection.dev)
		.doc(currency)
		.collection(exchange);
	
	log({ message: "Deleting records created during backtesting..." });

	try {
		await ref.doc(pairedAsset + "-currentWorkingCapital").delete();
		await ref.doc(pairedAsset + "-currentPosition").delete();
		await ref.doc(pairedAsset + "-prevAnchor").delete();
		await ref.doc(pairedAsset + "-tradeCounter").delete();

		if (tradeRecordsSnapshot && tradeRecordsSnapshot.size > 0) {
			let batch = db.batch();
			tradeRecordsSnapshot.docs.forEach((doc) => {
				batch.delete(doc.ref);
			});

			await batch.commit()
		}
	} catch (e) {
		logError({ title: "Farnsworth error performing cleanup after backtest", message: e.message, details: e.stack });
	}

	log({ message: "--- Cleaning up complete ---" });
};

exports.getBacktestResults = async (currency, pairedAsset, exchange) => {
	let snapshot = await db
		.collection("farnsworth")
		.doc("backtest-results")
		.collection(`${currency}-${pairedAsset}-${exchange}`)
		.get();

	if (snapshot.empty) {
		log({ message: `No backtest results found for ${currency}-${pairedAsset}-${exchange}`})
		return null
	}

	let results = snapshot.docs.map(doc => {
		return { ...doc.data(), id: doc.id,  }
	})

	return results
}