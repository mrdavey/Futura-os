const { makeInternalRequest, makeUnauthenticatedRequest } = require("../helpers/fetch")

/**
 * Gets the relevant price and sentiment data, with most recent entry at beginning
 * @param {String} currency The cryptocurrency to fetch
 * @param {Number} numberOfEntries The number of entries to fetch, aligning with the number of sentiment entries
 */
exports.getRelevantData = async (currency, numberOfEntries) => {

    // Get sentiment data
    console.log("Getting sentiment data")
    let sentimentEndpoint = process.env.FIREBASE_FUNCTIONS_ENDPOINT + "/benderGetSentimentData";
    let timeStamp = Date.now()
    let body = { currency, numberOfEntries, timeStamp }
    let sentimentDataRaw = await makeInternalRequest(sentimentEndpoint, body).catch(e => { throw Error(`Error getting sentiment data: ${e.message}`)});

    let timeStamps = sentimentDataRaw.map(entry => entry.timeStamp._seconds * 1000)

    // Get relevant price data
    console.log("Getting price data")
    let pricesEndpoint = process.env.FIREBASE_FUNCTIONS_ENDPOINT + "/benderGetSpecificPriceData";
    let bodyPrice = { currency, timeStamps }
    let priceDataRaw = await makeInternalRequest(pricesEndpoint, bodyPrice).catch(e => { throw Error(`Error getting price data: ${e.message}`) });
    
    // Combine relevant data
    console.log("Combining data")
    let correlationData = timeStamps.map((timeStamp, index) => {
        let score = sentimentDataRaw[index]["averageScore"];
        let coinbase = priceDataRaw[index]["coinbase"]

        let price = coinbase ?
            coinbase.price :
            (priceDataRaw[index]["average"] ?
                priceDataRaw[index]["average"].price : 
                priceDataRaw[index]["coinmarketcap"].price
            )

        return [timeStamp, score, price]
    });

    return correlationData
}

exports.getCurrentSettings = async (currency, exchange, pairedAsset) => {
    let settingsEndpoint = process.env.FIREBASE_FUNCTIONS_ENDPOINT + "/fenderGetOptimalSettings";
    let body = { currency, exchange, pairedAsset }
    let settings = await makeInternalRequest(settingsEndpoint, body).catch((e) => {
		throw Error(`Error getting settings data: ${e.message}`);
	});
    
    return settings
}

exports.runBacktest = async (body) => {
    let backtestEndpoint = process.env.FIREBASE_FUNCTIONS_LOCALHOST_ENDPOINT + "/leelaBacktest"
    await makeUnauthenticatedRequest(backtestEndpoint, body).catch(e => {
        throw e
    })
}

exports.setOptimalSettingsInProduction = async (currency, exchange, pairedAsset) => {
    let fenderSetOptimalSettingsEndpoint = process.env.FIREBASE_FUNCTIONS_LOCALHOST_ENDPOINT + "/fenderBacktestingSetProductionOptimalSettings";
    let body = { currency, exchange, pairedAsset }
    
    await makeInternalRequest(fenderSetOptimalSettingsEndpoint, body).catch((e) => {
        throw Error(`Error with setting optimal settings in production: ${e.message}`);
    });
}