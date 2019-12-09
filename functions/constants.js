const functions = require("firebase-functions");

exports.hermesHeaderAuthKey = process.env.FUTURA_AUTH_HERMES;
exports.internalHeaderAuthKey = process.env.FUTURA_AUTH_INTERNAL;
exports.killSwitchHeaderAuthKey = process.env.FUTURA_AUTH_KILLSWITCH;
exports.externalHeaderAuthKey = process.env.FUTURA_AUTH_EXTERNAL;

exports.functionsEndpoint = process.env.FIREBASE_FUNCTIONS_ENDPOINT;

if (functions.config().env.value === "prod") {
    exports.quietMode = false;
    exports.positionsCollection = { prod: "positions", dev: "positions-dev" };
    exports.farnsworthCollection = { prod: "farnsworth", dev: "farnsworth-dev" };
    exports.fryBuyEndpoint = this.functionsEndpoint + "/fryPleaseBuy";
    exports.frySellEndpoint = this.functionsEndpoint + "/fryPleaseSell";
    exports.zappBuyCoinbaseEndpoint = this.functionsEndpoint + "/zappCbBuy";
    exports.zappSellCoinbaseEndpoint = this.functionsEndpoint + "/zappCbSell";
    exports.zoidbergGetKillSwitchEndpoint = this.functionsEndpoint + "/zoidbergGetKillSwitch";
    exports.benderGetPriceEndpoint = this.functionsEndpoint + "/benderGetPriceData";
    exports.benderGetSpecificPricesEndpoint = this.functionsEndpoint + "/benderGetSpecificPriceData";
    exports.benderGetSentimentEndpoint = this.functionsEndpoint + "/benderGetSentimentData";
    exports.coinbaseEndpoint = "https://api.pro.coinbase.com";
} else {
    let port = 5001 // 5001 === emulator, 5000 === serve

    exports.quietMode = true;
    exports.positionsCollection = { prod: "positions-local", dev: "positions-local-dev" };
    exports.farnsworthCollection = { prod: "farnsworth-local", dev: "farnsworth-local-dev" };
    exports.fryBuyEndpoint = `http://localhost:${port}/${process.env.FIREBASE_PROJECT_ID}/${process.env.FIREBASE_FUNCTIONS_REGION}/fryPleaseBuy`;
    exports.frySellEndpoint = `http://localhost:${port}/${process.env.FIREBASE_PROJECT_ID}/${process.env.FIREBASE_FUNCTIONS_REGION}/fryPleaseSell`;
    exports.zappBuyCoinbaseEndpoint = `http://localhost:${port}/${process.env.FIREBASE_PROJECT_ID}/${process.env.FIREBASE_FUNCTIONS_REGION}/zappCbBuy`;
    exports.zappSellCoinbaseEndpoint = `http://localhost:${port}/${process.env.FIREBASE_PROJECT_ID}/${process.env.FIREBASE_FUNCTIONS_REGION}/zappCbSell`;
    exports.zoidbergGetKillSwitchEndpoint = `http://localhost:${port}/${process.env.FIREBASE_PROJECT_ID}/${process.env.FIREBASE_FUNCTIONS_REGION}/zoidbergGetKillSwitch`;
    exports.benderGetPriceEndpoint = this.functionsEndpoint + "/benderGetPriceData"; // localhost does not return all the JSON for some reason
    exports.benderGetSpecificPricesEndpoint = this.functionsEndpoint + "/benderGetSpecificPriceData"; // localhost does not return all the JSON for some reason
    exports.benderGetSentimentEndpoint = this.functionsEndpoint + "/benderGetSentimentData"; // localhost does not return all the JSON for some reason
    exports.coinbaseEndpoint = "https://api-public.sandbox.pro.coinbase.com";
}

exports.defaultZoidbergWorkingCapital = 1000;

exports.btcDefaultSettings = {
    correlationThreshold: 0.05,
    correlationInterval: 384,
    dailyStoplossThreshold: 0.04,
    weeklyStoplossThreshold: 2 * 0.06,
    profitThreshold: 1.03,
    lossThreshold: 0.97,
}

exports.ethDefaultSettings = {
    correlationThreshold: 0.32,
    correlationInterval: 384,
    dailyStoplossThreshold: 0.04,
    weeklyStoplossThreshold: 2 * 0.06,
    profitThreshold: 1.03,
    lossThreshold: 0.97,
}