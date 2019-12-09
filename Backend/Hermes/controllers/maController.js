const { ma, ema } = require("moving-averages")
const { getMostRecentPrices } = require("./firebaseController")
const { updateMAPriceCache, getMAPriceCache } = require("./cacheController")

const h = require("../helpers")

const TYPE_SMA = 'SMA'
const TYPE_EMA = 'EMA'

// let prices = {
//     timeStamp: 123456789,
//     BTC: {
//         coinbase: {
//             price: 24522,
//             assetKey: "BTC",
//             pairedAsset: "PAX",
//             exchange: "coinbase",
//             SMA: [
//                 { hours: 2, value: 23423 },
//                 { hours: 4, value: 23423 },
//                 { hours: 12, value: 23423 },
//                 { hours: 24, value: 23423 },
//             ],
//             EMA: [
//                 // ...
//             ]
//             // ...
//         },
//         // ...
//     },
//     // ...
// }

/**
 * Make sure that `previousPrices` is using the correct number of entries, 
 * that correspond to the max hours we're fetching.
 */
exports.getMA = async (currency, priceDict) => {

    // get latest prices from firestore
    let docs = await getMostRecentPrices(1)
    let recentPricesForCurrency = docs[0][currency]

    if (!recentPricesForCurrency) return null; // If it is a new currency we just added, skip MA

    await h.sequentialPromisesResolution(Object.keys(priceDict), (async exchange => {
        let prevExchangeRecord = recentPricesForCurrency[exchange]
        if (!prevExchangeRecord) return null; // If it is a new exchange we just added, skip

        let prevSMA = prevExchangeRecord["SMA"] // We only work with 'Simple Moving Averages' at the moment

        if (prevSMA) {
            // We have a previous moving average record, so don't need to calculate from zero
            console.log(`Previous SMA for ${currency} ${exchange} found, recalculating new SMA`)

            let newSMAs = prevSMA.map(entry => {
                let hours = entry.hours
                let prevMA = entry.value

                if (prevMA) {
                    let newValue = priceDict[exchange].price
    
                    let newSMA = getNewSMA(prevMA, hours, newValue)
                    return { hours, value: newSMA }
                } else {
                    return { hours, value: null}
                }
            })

            priceDict[exchange] = { ...priceDict[exchange], SMA: newSMAs }

        } else {

            // No previous MA, so create new one from scratch
            console.log(`No previous SMA for ${currency} ${exchange}, calculating from scratch`)

            let entriesToFetch = 168 * 12 // Using max of 168 hrs (12 prices per hour)
            let previousPrices = getMAPriceCache()

            if (!previousPrices) {
                console.log("MA cache is empty, fetching...")
                previousPrices = await getMostRecentPrices(entriesToFetch)
                updateMAPriceCache(previousPrices)
            } else {
                console.log("Using MA cache data")
            }

            let prevCurrencyPrices = []
            previousPrices.map(entry => {
                if (entry[currency][exchange]) {
                    prevCurrencyPrices.push(entry[currency][exchange].price)
                }
                return null
            })

            let halfHour = getMA(prevCurrencyPrices, 0.5, TYPE_SMA)
            let oneHour = getMA(prevCurrencyPrices, 1, TYPE_SMA)
            let twoHour = getMA(prevCurrencyPrices, 2, TYPE_SMA)
            let fourHour = getMA(prevCurrencyPrices, 4, TYPE_SMA)
            let twelveHour = getMA(prevCurrencyPrices, 12, TYPE_SMA)
            let twentyFourHour = getMA(prevCurrencyPrices, 24, TYPE_SMA) // 1d
            let seventyTwoHour = getMA(prevCurrencyPrices, 72, TYPE_SMA) // 3d
            let oneSixEightHour = getMA(prevCurrencyPrices, 168, TYPE_SMA) // 7d

            priceDict[exchange] = { 
                ...priceDict[exchange],
                SMA: [
                    { hours: 0.5, value: halfHour },
                    { hours: 1, value: oneHour },
                    { hours: 2, value: twoHour },
                    { hours: 4, value: fourHour },
                    { hours: 12, value: twelveHour },
                    { hours: 24, value: twentyFourHour },
                    { hours: 72, value: seventyTwoHour },
                    { hours: 168, value: oneSixEightHour }
                ]
            }
        }
    }))

    return priceDict
}

//
// Prices taken every 5 min, therefore 12 entries per hour
//
function getMA(data, hours, type = TYPE_SMA) {
    let numberOfEntries = hours * 12

    if (data.length < numberOfEntries) {
        console.log(`Not enough price entries (has: ${data.length}, should have: ${numberOfEntries}) to calculate the ${hours} hours SMA`)
        return null
    }

    let dataToUse = data.slice(0, numberOfEntries + 1)
    let maEntries;
    switch (type) {
        case TYPE_EMA:
            maEntries = ema(dataToUse, numberOfEntries) // not current used
        default:
            maEntries = ma(dataToUse, numberOfEntries) // Simple Moving Average
    }

    return maEntries.pop()
}

function getNewSMA(prevMA, hours, newValue) {
    return prevMA + ((newValue - prevMA) / (hours * 12))
}