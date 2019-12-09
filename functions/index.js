require("dotenv").config();

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp({
	credential: admin.credential.applicationDefault(),
	databaseURL: process.env.FIREBASE_DATABASEURL,
	storageBucket: process.env.FIREBASE_STORAGEBUCKET
});
const { recordTrade, recordProfit } = require("./Farnsworth");
const { onSentimentAdded, backtest } = require("./Leela");
const { plzSell, plzBuy } = require("./Fry");
const { coinbaseBuy, coinbaseSell, coinbaseCheckOrderContinual, coinbaseAutoUpdateStopLossOrder, coinbaseCheckOrder } = require("./Zapp");
const { consolidateWeekStorageFiles, getPrices, getSentiment, getSpecificPrices, saveSentimentToBuckets } = require("./Bender");
const { getProfits, getZoidbergKillSwitch, takeProfits, toggleZoidbergKillSwitch, setNewDefaultWorkingCapital } = require("./Zoidberg");
const { getOptimalTradeSettings, backtesetingSetProductionOptimalTradeSettings, setOptimalTradeSettingsProd } = require("./Fender");
const { startVM, stopVM, stopVMAutomated } = require("./Turanga")

let isProd = false
if (functions.config().env.value === "prod") {
	isProd = true // changing this will have consequences! 😱 (i.e. will deal with real money)
}

// EUR
exports.farnsworthRecordTradeEUR = recordTrade(isProd, "EUR")
exports.farnsworthRecordProfitEUR = recordProfit(isProd, "EUR")
exports.zappAutoCbUpdateStopLossEUR = coinbaseAutoUpdateStopLossOrder(isProd, "coinbaseEUR", "EUR")
exports.zappAutoCbCheckBtcEur = coinbaseCheckOrderContinual(isProd, "BTC", "coinbaseEUR", "EUR");
exports.zappAutoCbCheckEthEur = coinbaseCheckOrderContinual(isProd, "ETH", "coinbaseEUR", "EUR");


// USD
exports.farnsworthRecordTradeUSD = recordTrade(isProd, "USD")
exports.farnsworthRecordProfitUSD = recordProfit(isProd, "USD")
exports.zappAutoCbCheckBtcUsd = coinbaseCheckOrderContinual(isProd, "BTC", "coinbase", "USD");
exports.zappAutoCbUpdateStopLossUSD = coinbaseAutoUpdateStopLossOrder(isProd, "coinbase", "USD")

// Automations
exports.leelaDecideOnSentimentAdded = onSentimentAdded(isProd)

exports.fryPleaseBuy = plzBuy(isProd)
exports.fryPleaseSell = plzSell(isProd)

exports.zappCbBuy = coinbaseBuy(isProd)
exports.zappCbSell = coinbaseSell(isProd)

exports.benderConsolidateWeek = consolidateWeekStorageFiles()

exports.turangaStartup = startVM()
exports.turangaShutdown = stopVM()
exports.turangaShutdownAutomated = stopVMAutomated()

// Callable
exports.zoidbergToggleKillSwitch = toggleZoidbergKillSwitch(isProd)
exports.zoidbergGetKillSwitch = getZoidbergKillSwitch(isProd)
exports.zoidbergSetNewDefaultWC = setNewDefaultWorkingCapital(isProd)
exports.zoidbergGetProfits = getProfits(isProd);
exports.zoidbergTakeProfits = takeProfits(isProd);

exports.zappCbCheck = coinbaseCheckOrder(isProd) // For direct http checking of orders

exports.benderSaveSentiment = saveSentimentToBuckets()
exports.benderGetPriceData = getPrices()
exports.benderGetSpecificPriceData = getSpecificPrices();
exports.benderGetSentimentData = getSentiment()

exports.fenderSetOptimalSettings = setOptimalTradeSettingsProd();
exports.fenderGetOptimalSettings = getOptimalTradeSettings();

// Dev
if (functions.config().env.value === "dev") {
	exports.leelaBacktest = backtest();
	
	exports.fenderBacktestingSetProductionOptimalSettings = backtesetingSetProductionOptimalTradeSettings();
	
	/**
	 * Fixes for when something goes wrong
	 */
	// const { fixFileForCertainDay } = require("./Firebase/storage");
	// exports.fixCertainStorageFile = functions.https.onRequest((req, res) => fixFileForCertainDay(req, res));
	// const { addSentiment } = require("./Leela");
	// exports.leelaAddSentiment = addSentiment()

	// const { temp } = require("./Firebase")
	// exports.temp = temp()
}
