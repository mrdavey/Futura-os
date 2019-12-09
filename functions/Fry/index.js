const { makeInternalRequest } = require("../helpers/fetch");
const { onHttps, getWorkingCapital } = require("../Firebase");
const { checkZoigbergKillSwitch } = require("../Zoidberg");
const { log, logNews, logError } = require("../helpers/log");
const { round } = require("../helpers/numbers");
const { internalHeaderAuthKey, zappBuyCoinbaseEndpoint, zappSellCoinbaseEndpoint } = require("../constants");
/**
 * Used by Leela to indicate a buy order should be placed
 * Requires: A POST request to the associated endpoint, with body: `{ entry }`
 * `entry` should be the sentiment/price entry format, requiring all fields: `price`, `score`, `timeStamp`, `currency`, `exchange`
 */
exports.plzBuy = (isProd) => {
	return onHttps(async (req, res) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			res.sendStatus(412);
			return
		}

		let internal = req.get("Internal-Auth");
		if (internal && internal === internalHeaderAuthKey) {
			let entry = req.body.entry;
			let lossThreshold = req.body.lossThreshold;
			if (
				!entry.price ||
				entry.score === undefined ||
				!entry.timeStamp ||
				!entry.currency ||
				!entry.exchange ||
				!entry.pairedAsset ||
				!lossThreshold
			) {
				logError({
					title: "Fry buy error",
					message: `Entry does not have the required fields for a buy: ${JSON.stringify(entry)}`
				});
				res.sendStatus(412);
				return;
			}

			await buyFry(isProd, entry, lossThreshold).catch((e) => {
				logError({ title: "Error with Fry buy", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
			res.sendStatus(200);
		} else {
			res.sendStatus(404);
		}
	})
}

/**
 * Used by Leela to indicate a sell order should be placed
 * Requires: A POST request to the associated endpoint, with body: `{ entry, position }`
 * `entry` should be the sentiment/price entry format, requiring all fields: `price`, `score`, `timeStamp`, `currency`, `exchange`
 * `position` should be the position entry format, requiring at least: `amountBought`, `buyFees`, `buyTimeStamp`
 */
exports.plzSell = (isProd) => {
	return onHttps(async (req, res) => {
		let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" })
			res.sendStatus(412);
			return
		}

		let internal = req.get("Internal-Auth");
		if (internal && internal === internalHeaderAuthKey) {
			let entry = req.body.entry;
			let position = req.body.position;

			if (!entry.price || entry.score === undefined || !entry.timeStamp || !entry.currency || !entry.exchange || !entry.pairedAsset) {
				logError({ message: `Entry does not have the required fields for a sell: ${JSON.stringify(entry)}`});
				res.sendStatus(412);
				return
			}

			if (!position.amountBought || !position.buyFees || !position.buyTimeStamp) {
				logError({ message: `Position does not have the required fields for a sell: ${JSON.stringify(position)}`});
				res.sendStatus(412);
				return
			}

			// let essentialEntry = {price: entry.price, score: entry.score, timeStamp: entry.timeStamp, currency: entry.currency, exchange: entry.exchange, pairedAsset: entry.pairedAsset}
			log({
				title: `😎 Fry ${entry.currency}-${entry.pairedAsset} sell`,
				message: `Setting up sell with price: ${entry.price} on ${entry.exchange}`,
				// details: `${JSON.stringify(essentialEntry)}`,
			});
			await sellFry(isProd, entry, position).catch((e) => {
				logError({ title: "Error with Fry sell", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
			res.sendStatus(200)
		} else { 
			res.sendStatus(404);
		}
	})
}

/**
 * Executes a sell order
 * @param {{}} entry Dictionary of `price`, `score`, `timeStamp`, `currency`, `exchange`, `pairedAsset` (i.e. the new data)
 * @param {{}} position Dictionary of data relevant to the position (i.e. the current position or prevAnchor)
 */
const sellFry = async (isProd, entry, position) => {
	try {
		// log({ message: `Selling at price: ${entry.price} with position:`, details: `${JSON.stringify(position)}`, postToSlack: true });
		let body = { entry, position };
		await makeInternalRequest(zappSellCoinbaseEndpoint, body);
	} catch (e) {
		throw e
	}
}

/**
 * Executes a buy order
 * @param {{}} entry Dictionary of `price`, `score`, `timeStamp`, `currency`, `exchange`, `pairedAsset`
 * @param {{}} position Dictionary of data relevant to the position (e.g. WC used)
 * @param {Number} lossThreshold The threshold limit for stop loss price
 */
const buyFry = async (isProd, entry, lossThreshold) => {
	try {
		let { currentWC } = await getWorkingCapital(isProd, entry.currency, entry.exchange, entry.pairedAsset);
		let buyAmount = currentWC / entry.price;
		
		logNews({ 
			title: `😎 Fry ${entry.currency}-${entry.pairedAsset} buy`, 
			message: `Buying at ${entry.price} ${entry.pairedAsset} on ${entry.exchange} with working capital: ${round(currentWC, 2)} ${entry.pairedAsset}` 
		});
		let body = { entry, amountToBuy: buyAmount, workingCapital: currentWC, lossThreshold };
		await makeInternalRequest(zappBuyCoinbaseEndpoint, body);
	} catch (e) {
		throw e;
	}
};