const m = require("moment");

const { corr } = require("../helpers/correlation-pearsons");
const {
	onCreateExtended,
	onHttps,
	getLatestPricesWithTimestamp,
	getPosition,
	getPrevAnchor,
	saveNewPrevAnchor,
	getEnvMode,
	getEnvValue,
	getProfits,
	getTradeSettings,
	getWorkingCapital
} = require("../Firebase");
const { getLatestSentiment, getSpecificPriceData } = require("../Firebase/storage");
const { checkZoigbergKillSwitch } = require("../Zoidberg");
const { log, logNews, logError } = require("../helpers/log");
const { round } = require("../helpers/numbers")
const { mapAsync, sequentialPromisesResolution, sleep } = require("../helpers/asyncIterators");
const { makeInternalRequest } = require("../helpers/fetch");
const { fryBuyEndpoint, frySellEndpoint } = require("../constants");

/**
 * Creates a new sentiment/price entry and submits it to Leela
 * This is automatically called when a new `sentiment` doc is added
 */
exports.onSentimentAdded = (isProd) => {
	return onCreateExtended("sentiment/{currency}/scores/{docId}", async (snap, context) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({message: "Zoidberg kill switch is active"})
			res.sendStatus(412);
			return;
		}

		// Sleep for random amount of time, to ensure no clashes with doc/storage file creations
		let sleepTime = Math.random() * 60 * 1000 // within 1 min sleep
		log({message: `Sleeping for ${sleepTime}`})
		await sleep(sleepTime)

		let currency = context.params.currency
		
		let sentimentData = snap.data();
		let averageScore = sentimentData.averageScore;
		let timeStamp = m(sentimentData.timeStamp.toDate())

		// let exchanges = ["coinbase", "coinbaseEUR"]
		let exchanges = ["coinbaseEUR"]

		await sequentialPromisesResolution(exchanges, async (exchange) => {
			let exchangeMsg = `*${exchange === "coinbase" ? "coinbaseUSD" : exchange} ${currency}*: `;
			try {
				let latestPrice = await getLatestPricesWithTimestamp(timeStamp)
				let coinbasePrice = latestPrice[currency][exchange].price
				let pairedAsset = latestPrice[currency][exchange].pairedAsset

				let entry = {
					price: coinbasePrice,
					score: averageScore,
					timeStamp,
					currency,
					exchange,
					pairedAsset
				}

				log({ message: `${exchange}: Using entry: ${JSON.stringify(entry)}` })

				await leelaDecide(isProd, entry, null, exchangeMsg);
			} catch (e) {
				logError({
					title: `Error on automated Leela call`,
					postToSlack: true,
					message: `${exchangeMsg} ${e.message}`,
					details: e.stack
				});
			}
			
			// We don't need the 5 sec rest for the last exchange entry
			if (exchange !== exchanges[exchanges.length - 1]) {
				log({ message: " --- Sleeping for 5 sec..."})
				await sleep(5000)
			}
		})
    })
}

/**
 * Used for testing and backtesting, using only a submitted Sentiment Data entry 
 * Requires: A POST request to the associated endpoint, with body: `{ currency, entry }`
 * `currency` should be similar to "BTC" or "ETH"
 * `entry` should be the standard sentiment entry format, requiring at least { averageScore, timeStamp }
 */
exports.addSentiment = () => {
	return onHttps(async (req, res) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			res.sendStatus(412);
			return;
		}

		res.set("Access-Control-Allow-Origin", "localhost");
		res.set("Access-Control-Allow-Headers", "*");

		if (getEnvValue === "prod") {
			log({ message: "Running backtest in prod! Are you sure?" });
			res.sendStatus(412);
			return;
		}

		let currency = req.body.currency;

		if (currency === "BTC") {
			let data = req.body.entry;
			let averageScore = data.averageScore;
			let timeStamp = m(data.timeStamp); // convert to Date object

			try {
				let latestPrice = await getLatestPricesWithTimestamp(timeStamp);
				let exchange = "coinbase";
				let coinbasePrice = latestPrice[currency][exchange].price;
				let pairedAsset = latestPrice[currency][exchange].pairedAsset;

				let entry = {
					price: coinbasePrice,
					score: averageScore,
					timeStamp,
					currency,
					exchange,
					pairedAsset
				};

				await leelaDecide(false, entry);
				res.sendStatus(200);
			} catch (e) {
				logError({ title: "Error on manual Leela call", message: e.message, details: e.stack });
				res.sendStatus(404)
			}
		} else {
			res.sendStatus(200);
		}
	})
}

const { recordBacktestResult } = require("../Farnsworth");

/**
 * Used for backtesting, using both sentiment and price data
 * Requires: A POST request to the associated endpoint, with body: `{currency, [sentiment], [prices]}`
 * `currency` should be similar to "BTC" or "ETH"\
 * `[sentiment]` should be an array of sentiment scores in graphing format, requiring at least [averageScore, timeStamp]
 * `[prices]` should be an array of prices in graphing format, requiring at least [price, timeStamp]
 * @note Remember to set backtest env value in `.runtimeconfig.json`
 */
exports.backtest = () => {
	return onHttps(async (req, res) => {

		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			res.sendStatus(412);
			return
		}
		
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Headers", "*");

		if (getEnvValue === "prod") {
			log({ message: "Running backtest in prod! Are you sure?" });
			res.sendStatus(412);
			return;
		}

		if (getEnvMode === "backtest") {
			console.log("In backtesting mode...")
		}

		let backtestId = req.body.id
		let backtestIdPrefix = req.body.idPrefix
		let currency = req.body.currency
		let entryData = req.body.entryData; // [[timeStamp, score, price]]
		let correlationData = req.body.correlationData;
		let settings = req.body.settings;

		let exchange = "coinbase"
		let pairedAsset = `USD-${backtestId}`

		try {
			let startTime = Date.now();
			let entries = await mapAsync(entryData, async (data, index) => {
				let slicedCorrelationData = correlationData.slice(index, settings.correlationInterval + index);

				let entry = {
					price: data[2],
					score: data[1],
					timeStamp: m(data[0]),
					currency,
					exchange,
					pairedAsset,
					correlationData: slicedCorrelationData
				};
				return entry;
			})

			await sequentialPromisesResolution(entries, (entry) => leelaDecide(false, entry, settings, `BACKTEST-${backtestId}-${exchange}: `))

			let startEntry = entries.shift();
			let endEntry = entries.pop();
			await recordBacktestResult(
				false,
				currency,
				exchange,
				pairedAsset,
				startTime,
				startEntry,
				endEntry,
				settings,
				backtestIdPrefix
			);
		} catch (e) {
			logError({ title: "Error on backtesting Leela call", message: e.message, details: e.stack });
			res.sendStatus(400);
			return
		}
		
		res.sendStatus(200);
	})
}

/**
 * Determines whether an action should be forwarded to Fry
 * Note: We only take the previous sentiment score in consideration when making buys. 
 *       We don't act on a sudden drop in sentiment, only  rises in sentiment score.
 * @param {{}} entry A dictionary with `price`, `score`, `timeStamp`, `currency`, `exchange`, `pairedAsset`.
 * @param {{}} backtestSettings The settings dict to use, only when backtesting
 * @param {String} exchangeMsg A message indicating which exchange this decision is referring to
 */

const leelaDecide = async (isProd, entry, backtestSettings, exchangeMsg) => {
	let currency = entry.currency
	let exchange = entry.exchange
	let pairedAsset = entry.pairedAsset

	let settings;
	if (backtestSettings) {
		settings = backtestSettings
	} else {
		settings = await getTradeSettings(isProd, currency, exchange, pairedAsset).catch((e) => {
			throw e;
		});
	}

	let dateId = entry.timeStamp; // Formatted to be matchable to scores and prices
	log({ message: `Evaluating for dateId: ${m(dateId).utc()}` })
	let position = await getPosition(isProd, currency, exchange, pairedAsset).catch(e => { throw e });
	if (!position) {
		log({ message: "No valid position available yet. Using submitted entry instead."})
		position = {
			hasPosition: false,
			buyPrice: entry.price,
			buyScore: entry.score,
			buyTimeStamp: entry.timeStamp
		};
	}

	let prevAnchor = await getPrevAnchor(isProd, currency, exchange, pairedAsset).catch((e) => {
		throw e;
	});
	
	if (!prevAnchor) {
		log({ message: `No prevAnchor found. Creating new record with current position.`})
		await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
			throw e;
		});
		return;
	}

	let currentScore = round(entry.score, 2);
	let currentPrice = round(entry.price, 2);
	let prevAnchorScore = round(prevAnchor.score, 2);
	let prevAnchorPrice = round(prevAnchor.price, 2);
	let buyPrice = round(position.buyPrice, 2);
	let profitThreshold = round(buyPrice * settings.profitThreshold, 2);
	let lossThresholdPrice = round(buyPrice * settings.lossThreshold)
	let priceIndicator = currentPrice > prevAnchorPrice ? `👆 ${position.hasPosition ? `Profit at: ${profitThreshold}` : ""}` : `👇 ${position.hasPosition ? `Loss at: ${lossThresholdPrice}` : ""}`
	let priceStatus = position.hasPosition ? 
		currentPrice > buyPrice ? "📈" : "📉"
		: ""

	// Don't do anything if we don't have a position and we have a new score low
	if (!position.hasPosition && entry.score < prevAnchor.score) {
		log({
			title: "👁 Leela",
			message: `${exchangeMsg}🧘‍♀️ Meditating. Lower sentiment score than previous: ${currentScore} vs ${prevAnchorScore}. FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}).`,
			postToSlack: true
		});
		await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
			throw e;
		});
		return;
	}

	let correlation = null;
	if (settings.correlationInterval > 0) {
		correlation = await _calculateAdaptiveCorrelation(currency, exchange, entry.timeStamp, settings.correlationInterval, entry.correlationData).catch((e) => {
			throw e;
		});
		log({ message: `Correlation: ${correlation}` });
	}

	// If we have no current position...
	if (!position.hasPosition) {

		if (correlation && correlation < settings.correlationThreshold) {
			log({
				title: "👁 Leela",
				message: `${exchangeMsg}🙅‍♀️ Below correlation threshold (${
					settings.correlationThreshold
					}) for buy, current correlation: ${correlation}. FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}). `,
				postToSlack: true
			});
			await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
				throw e;
			})
			return;
		}

		// Broke 0 && above 0, check if no stop loss in place
		let { defaultWC } = await getWorkingCapital(isProd, currency, exchange, pairedAsset)

		let isStopLossForDay = await _isStopLossForDay(
			isProd,
			Date.now(),
			defaultWC,
			settings.dailyStoplossThreshold,
			currency,
			exchange,
			pairedAsset,
			exchangeMsg
		).catch((e) => {
			logError({
				title: `${exchangeMsg}Error with _isStopLossForDay`,
				message: `Couldn't work out if stop loss for day is enabled. Returning true`,
				details: e.message
			});
			return true;
		});

		let isStopLossForWeek = await _isStopLossForWeek(
			isProd,
			Date.now(),
			defaultWC,
			settings.weeklyStoplossThreshold,
			currency,
			exchange,
			pairedAsset,
			exchangeMsg
		).catch((e) => {
			logError({
				title: `${exchangeMsg}Error with _isStopLossForWeek`,
				message: `Couldn't work out if stop loss for week is enabled. Returning true`,
				details: e.message
			});
			return true;
		});

		if (
			entry.score > prevAnchor.score &&
			!(isStopLossForDay) &&
			!(isStopLossForWeek)
		) {
			logNews({
				title: "👁 Leela",
				message: `${exchangeMsg}🥳 Sentiment is higher than previous (${currentScore} vs ${prevAnchorScore}), buying at ${currentPrice}, correlation: ${round(correlation, 4)}`,
				postToSlack: true
			});

			let body = { entry, lossThreshold: settings.lossThreshold };
			try {
				await makeInternalRequest(fryBuyEndpoint, body);
				await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry);
				return;
			} catch (e) {
				console.log(e.stack)
				throw Error(`Was meant to buy but had error: ${e.message}. See console for stack trace.`)
			}
		}
		
		log({
			title: "👁 Leela",
			message: `${exchangeMsg}🧘‍♀️ Meditating. Sentiment scores: ${currentScore} vs ${prevAnchorScore}. FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}).`,
			postToSlack: true
		});
		await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry)
	} else {
		// We have a position...

		// ... check if we need to stop loss
		if (entry.price < position.buyPrice * settings.lossThreshold) {
			logNews({
				title: "👁 Leela",
				message: `${exchangeMsg}😱 Cutting losses... FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}), buy price: ${buyPrice}`,
				postToSlack: true
			});
			let body = { entry, position }
			try {
				await makeInternalRequest(frySellEndpoint, body);
				await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry)
				return;
			} catch (e) {
				console.log(e.stack)
				throw Error(`Was meant to cut losses and sell but had error: ${e.message}. See console for stack trace.`)
			}
		}

		// ... Seems to be safe, continue on....

		// Take profits if we're 1% above our intended profit threshold, no matter what
		let takeProfits = entry.price >= (position.buyPrice * settings.profitThreshold * 1.01)
		let isAboveProfitThreshold = entry.price > position.buyPrice * settings.profitThreshold;

		if (!takeProfits) {
			// We're below our taking profits threshold, so have space to increase...

			// Check if price has been increasing... If it has, then ride the wave 🏄‍♂️
			if (entry.price > prevAnchor.price) {
				log({
					title: "👁 Leela",
					message: `${exchangeMsg}🏄‍♂️${priceStatus} Riding the price wave. FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}), buy price: ${buyPrice}`,
					postToSlack: true
				});
				await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
					throw e;
				})
				return;
			}
	
			// Check if sentiment is correlated...
			if (correlation && correlation >= settings.correlationThreshold) {
				// ...ride the score up if it is correlated
				if (entry.score >= prevAnchor.score) {
					log({
						title: "👁 Leela",
						message: `${exchangeMsg}🏄‍♀️${priceStatus} Riding the sentiment wave (${currentScore} vs ${prevAnchorScore}). FYI prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}), buy price: ${buyPrice}${
							isAboveProfitThreshold ? " (👏 Above profit threshold!)" : ""
						}`,
						postToSlack: true
					});
					await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
						throw e;
					});
					return;
				} else {
					await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry).catch((e) => {
						throw e;
					});
				}
			}
			//... otherwise if not correlated OR score is not higher...
		}

		// If reached our profit threshold, then take profits
		if (isAboveProfitThreshold) {
			logNews({
				title: "👁 Leela",
				message: `${exchangeMsg}🤑 Ready to sell at price: ${currentPrice} with sentiment score: ${currentScore}. Profit threshold: ${
					settings.profitThreshold
				}, current ratio: ${round(currentPrice / buyPrice, 2)}`,
				postToSlack: true
			});
			let body = { entry, position }
			try {
				await makeInternalRequest(frySellEndpoint, body);
				await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry)
				return;
			} catch (e) {
				console.log(e.stack)
				throw Error(`Was meant to sell but had error: ${e.message}. See console for stack trace.`)
			}
		} else {
			// ... We haven't reached profit threshold, and no stop loss tripped
			log({
				title: "👁 Leela",
				message: `${exchangeMsg}🧘‍♀️${priceStatus} Meditating. Haven't reached profit threshold yet. FYI correlation: ${round(correlation, 3)}, prices: ${currentPrice} vs ${prevAnchorPrice} (${priceIndicator}), buy price: ${buyPrice}`,
				postToSlack: true
			});
			await saveNewPrevAnchor(isProd, currency, exchange, pairedAsset, entry)
		}
	}
};

/**
 * Calculates the correlation of the most recent number of sentiment and pricing scores.
 * At the moment it should only really calculate correlation with USD based assets
 * @param {m.Timestamp} fromTimestamp The timeStamp to use when fetching entries from the past
 */
async function _calculateAdaptiveCorrelation(currency, exchange, fromTimestamp, interval, correlationData) {
	let exchangeToUse = "coinbase" // Use USD correlations for now
	
	if(!correlationData) {
		// We're running a live adaptive correlation
		let sData = await getLatestSentiment(currency, interval, fromTimestamp).catch((e) => {
			throw e;
		});
	
		let dateIds = sData.map(sEntry => {
			return m(sEntry.timeStamp._seconds * 1000).toDate();
		})

		let pData = await getSpecificPriceData(currency, dateIds).catch((e) => {
			console.log(` --- DEBUG: FYI Date IDs used: ${JSON.stringify(dateIds)}`)
			throw e;
		});

		let scores = [];
		let prices = [];
		let correlation;
	
		sData.map((entry, index) => {
			scores.push(entry.averageScore);
			if (pData[index] === undefined) {
				log({message: `Undefined at ${index} for ${currency}. pData: ${JSON.stringify(pData)}`})
			}
			let exchangePrice = pData[index][exchangeToUse];
			if (exchangePrice) {
				prices.push(exchangePrice.price);
			} else {
				let averagePrice = pData[index]["average"]
				if (averagePrice) {
					prices.push(averagePrice.price);
				} else {
					let coinmarketcapPrice = pData[index]["coinmarketcap"];
					if (coinmarketcapPrice) {
						prices.push(coinmarketcapPrice.price);
					} else {
						let message = "Adaptive correlation error: No price found for CMC! See console logs for more info."
						throw Error(message)
					}
				}
			}
			return null;
		})
	
		console.log("prices:", JSON.stringify(prices))
		console.log("scores:", JSON.stringify(scores))
		
		correlation = corr(scores, prices);
		return correlation;
	} else {
		// We're running a backtest
		let sDataAverageScores = correlationData.map(entry => entry[1])
		let pDataCoinbase = correlationData.map(entry => entry[2])
		let correlation = corr(sDataAverageScores, pDataCoinbase)
		return correlation
	}
}


async function _isStopLossForDay(isProd, dateInt, defaultWC, dailyStoplossThreshold, currency, exchange, pairedAsset, exchangeMsg) {
	let day = m(dateInt).format("YYYY-MM-DD");
	let dailyGross = await getProfits(isProd, currency, exchange, pairedAsset, "daily", day).catch((e) => {
		throw e;
	});

	if (dailyGross < defaultWC * -dailyStoplossThreshold) {
		log({ title: "👁 Leela", message: `${exchangeMsg}✋ Stop loss locked for the day! We're down: ${dailyGross} 😢`, postToSlack: true });
		return true;
	} else {
		return false;
	}
}

async function _isStopLossForWeek(isProd, dateInt, defaultWC, weeklyStoplossThreshold, currency, exchange, pairedAsset, exchangeMsg) {
	let week = m(dateInt).format("YYYY-w");
	let weeklyGross = await getProfits(isProd, currency, exchange, pairedAsset, "weekly", week).catch((e) => {
		throw e;
	});

	if (weeklyGross < defaultWC * -weeklyStoplossThreshold) {
		log({ title: "👁 Leela", message: `${exchangeMsg}✋ Stop loss locked for the week! We're down: ${weeklyGross} 😭`, postToSlack: true });
		return true;
	} else {
		return false;
	}
}