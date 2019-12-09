const fetch = require("node-fetch")

const { savePriceData } = require("./firebaseController");
const { retry } = require("./retryController")
const { getMA } = require("./maController")
const l = require("./logController");
const h = require("../helpers");

let EXCHANGE_COINBASE = "coinbase";
let EXCHANGE_BINANCE = "binance";
let EXCHANGE_COINMARKETCAP = "coinmarketcap";
let EXCHANGE_AVERAGE = "average";

async function _createRecord(id, data) {
    await retry(async () => await savePriceData(id, data)).catch(e => { throw Error(`Create record error in firebase for ${id}: ${e.message}`) });
}

async function _getCoinbasePrice(assetKey, currency) {
    const cbEndPoint = `https://api.pro.coinbase.com/products/${assetKey}-${currency}/ticker`;

    let response = await retry(async () => await fetch(cbEndPoint), "priceController _getCoinbasePrice").catch(e => { throw Error(`Fetch error for Coinbase ${assetKey}-${currency} price: ${e.message}`)});
    let data = await response.json().catch(e => { throw Error(`JSON response error for Coinbase ${assetKey}-${currency} price: ${e.message}`) });
    let price = Number(data.price)
    if (!price || Number.isNaN(price)) throw Error(`Coinbase price for ${assetKey}-${stableCoin} is not valid: ${data.price}`)

    return { exchange: EXCHANGE_COINBASE, assetKey, pairedAsset: currency, price};
}

async function _getBinancePrice(assetKey, stableCoin) {
    const binanceEndPoint = `https://api.binance.com/api/v3/avgPrice?symbol=${assetKey}${stableCoin}`;
    let response = await retry(async () => await fetch(binanceEndPoint), "priceController _getBinancePrice").catch(e => { throw Error(`Fetch error for Binance ${assetKey}:${stableCoin} price: ${e.message}`) });
    let data = await response.json().catch((e) => {
		throw Error(`JSON response error for Binance ${assetKey}:${stableCoin} price: ${e.message}`);
	});
    let price = Number(data.price)
    if (!price || Number.isNaN(price)) throw Error(`Binance price for ${assetKey}-${stableCoin} is not valid: ${data.price}`)

    return { exchange: EXCHANGE_BINANCE, assetKey, pairedAsset: stableCoin, price };

}

async function _getCoinMarketCapPrices(assetKeys) {
    let cmcEnpoint = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${assetKeys.join(",")}`;
    let response = await retry(async () => await fetch(cmcEnpoint, {
		method: "GET",
		headers: {
            'X-CMC_PRO_API_KEY': process.env.API_KEY_COINMARKETCAP
		}
    }), "priceController _getCoinMarketCapPrices").catch(e => { throw Error(`Fetch error for CoinMarketCap ${assetKeys.join(",")} price: ${e.message}`) });

    let data = await response.json().catch((e) => {
		throw Error(`JSON response error for CoinMarketCap ${assetKeys.join(",")} price: ${e.message}`);
	});

    let prices = {};
    assetKeys.filter(async assetKey => {
        let assetData = data.data[assetKey];
        let quoteUsd = assetData.quote.USD;
        let price = Number(quoteUsd.price)
        if (!price || Number.isNaN(price)) throw Error(`CoinMarketCap price for ${assetKey} is not valid: ${quoteUsd.price}`);
        prices[assetKey] = { exchange: EXCHANGE_COINMARKETCAP, assetKey, pairedAsset: "USD", price };
    })
    
    return prices;
}

function _getAveragePrice(assetKey, arrayOfPrices) {
    let sum = arrayOfPrices.reduce((a, b) => Number(a) + Number(b));
    let averagePrice = sum / arrayOfPrices.length;

    return { exchange: EXCHANGE_AVERAGE, assetKey, pairedAsset: "USD", price: averagePrice };
}

async function _fetchLatestPrices(assetKey) {
    let coinbase; // USD, leave as is due to historic data
    let coinbaseEUR;
    let binanceUSDT;
    let binancePAX;

    coinbase = await _getCoinbasePrice(assetKey, "USD").catch((e) => {
        l.logError({
                title: "🤓 Hermes Price controller warning",
                message: `Error getting Coinbase ${assetKey}-USD: ${e.message}`
        })
	});
    
    coinbaseEUR = await _getCoinbasePrice(assetKey, "EUR").catch((e) => {
        l.logError({
                title: "🤓 Hermes Price controller warning",
                message: `Error getting Coinbase ${assetKey}-EUR: ${e.message}`
        })
    });
    
    binanceUSDT = await _getBinancePrice(assetKey, "USDT").catch((e) => {
        l.logError({
                title: "🤓 Hermes Price controller warning",
                message: `Error getting Binance ${assetKey}-USDT: ${e.message}`
        })
    });
    binancePAX = await _getBinancePrice(assetKey, "PAX").catch((e) => {
        l.logError({
                title: "🤓 Hermes Price controller warning",
                message: `Error getting Binance ${assetKey}-PAX: ${e.message}`
        })
    });

    let validPrices = []
    if (coinbase) validPrices.push(coinbase.price);
    if (coinbaseEUR) validPrices.push(coinbaseEUR.price);
    if (binanceUSDT) validPrices.push(binanceUSDT.price);
    if (binancePAX) validPrices.push(binancePAX.price);

    let average = _getAveragePrice(assetKey, validPrices);

    let validDict = { average };

    if (coinbase) validDict.coinbase = coinbase;
    if (coinbaseEUR) validDict.coinbaseEUR = coinbaseEUR;
	if (binanceUSDT) validDict.binanceUSDT = binanceUSDT;
	if (binancePAX) validDict.binancePAX = binancePAX;

    let validDictWithMAs = await getMA(assetKey, validDict)

    return validDictWithMAs;
}

async function _getExchangePrices(assetKeys) {
    let prices = {};

    await h.sequentialPromisesResolution(assetKeys, (async assetKey => {
        console.log(`Getting prices for ${assetKey}`)
        let assetPrices = await _fetchLatestPrices(assetKey).catch(e => {
            // Don't throw an error, only notify
            l.logError({
                title: "🤓 Hermes Price controller warning",
                message: `${e.message}. Continuing with other price fetches...`
            }) 
        })
        prices[assetKey] = assetPrices;
    }))

    let cmcPrices;
    cmcPrices = await _getCoinMarketCapPrices(assetKeys).catch(e => {
        l.logError({
            title: "🤓 Hermes Price controller warning",
            message: `Error getting CMC ${assetKey} prices: ${e.message}. Continued with others...`, 
        }) 
    });

    let combinedPrices = {};
    await h.mapAsync(assetKeys, async (assetKey) => {
        if (cmcPrices) {
            combinedPrices[assetKey] = { ...prices[assetKey], coinmarketcap: cmcPrices[assetKey] };
        } else {
            combinedPrices[assetKey] = { ...prices[assetKey] };
        }
    });
    
    return combinedPrices;
}

exports.getPrices = async (dateId) => {
    try {
        let assetKeys = [h.getAssetKey("ethereum"), h.getAssetKey("bitcoin")];
        let prices = await _getExchangePrices(assetKeys);
        await _createRecord(dateId, prices);
    } catch (e) {
        l.logError({
            title: "🤓 Hermes Price controller error",
            message: e.message,
            details: e.stack,
        })
    }
}