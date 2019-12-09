const { getEnvValue, getTradeSettings, onHttps, setTradeSettings } = require("../Firebase");
const { saveBacktestSettingsToBuckets } = require("../Firebase/storage")
const { getBacktestResults, recordOptimalTradeSettingResult } = require("../Farnsworth")
const { makeInternalRequest } = require("../helpers/fetch")
const { round } = require("../helpers/numbers")

const { log, logError } = require("../helpers/log")
const { internalHeaderAuthKey, functionsEndpoint } = require("../constants");

exports.backtesetingSetProductionOptimalTradeSettings = () => {
    return onHttps(async (req, res) => {
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let currency = req.body.currency
            let exchange = req.body.exchange
            let pairedAsset = req.body.pairedAsset

            try {
                let mostOptimal = await _getBacktestOptimalTradeSettings(currency, exchange, pairedAsset)

                if (!mostOptimal.settings) {
                    throw Error(`Settings not found is mostOptimal object: ${mostOptimal}`)
                }

                let body = { currency, exchange, pairedAsset, mostOptimal }
                let setOptimalProdEndpoint = functionsEndpoint + "/fenderSetOptimalSettings"
                await makeInternalRequest(setOptimalProdEndpoint, body)
                res.json(mostOptimal);
            } catch (e) {
                logError({ title: `Error with Fender setOptimalTradeSettings`, message: e.message, details: e.stack });
                res.sendStatus(404);
            }
        } else {
            res.sendStatus(404);
        }
    })
}

exports.setOptimalTradeSettingsProd = () => {
    return onHttps(async (req, res) => {
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let currency = req.body.currency
            let exchange = req.body.exchange
            let pairedAsset = req.body.pairedAsset
            let mostOptimal = req.body.mostOptimal

            try {
                let savedOptimalProd = await _setOptimalTradeSettings(mostOptimal, currency, exchange, pairedAsset)
                res.json(savedOptimalProd);
            } catch (e) {
                logError({ title: `Error with Fender setOptimalTradeSettings`, message: e.message, details: e.stack });
                res.sendStatus(404);
            }
        } else {
            res.sendStatus(404);
        }
    })
}

exports.getOptimalTradeSettings = () => {
    return onHttps(async (req, res) => {
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let currency = req.body.currency
            let exchange = req.body.exchange
            let pairedAsset = req.body.pairedAsset

            try {
                let isProd = getEnvValue === "prod" ? true : false
                let result = await getTradeSettings(isProd, currency, exchange, pairedAsset)
                res.json(result);
            } catch (e) {
                logError({ title: `Error with Fender getOptimalTradeSettings`, message: e.message, details: e.stack });
                res.sendStatus(404);
            }
        } else {
            res.sendStatus(404);
        }
    })
}

const _getBacktestOptimalTradeSettings = async (currency, exchange, pairedAsset) => {
    let allResults = await getBacktestResults(currency, pairedAsset, exchange)

    let mostOptimal = allResults.reduce((prev, current) => {
        if (Number(current.alpha) >= Number(prev.alpha)) {
            return current
        } else {
            return prev
        }
    }, allResults[0])

    log({
        title: `🤖 Fender update ${currency}-${pairedAsset} ${exchange} trade settings`,
        message: `Most optimal with *alpha: ${round(mostOptimal.alpha)} %*, return on WC: ${round(mostOptimal.percentReturnWC)} %, # trades: ${mostOptimal.numberOfTrades}, ID: ${mostOptimal.id}`,
        details: JSON.stringify(mostOptimal.settings),
        overrideQuietMode: true,
        postToSlack: true
    })

    await saveBacktestSettingsToBuckets(exchange, currency, pairedAsset, allResults)
    
    return mostOptimal
}

const _setOptimalTradeSettings = async (mostOptimal, currency, exchange, pairedAsset) => {
    let isProd = getEnvValue === "prod" ? true : false
    await setTradeSettings(isProd, currency, exchange, pairedAsset, mostOptimal.settings).catch(e => { throw Error(`Error setting trade settings for ${exchange}-${pairedAsset}: ${e.message}`)})
    // For now we set it manually... need to work out a solution for converting USD <-> EUR prices for backup entries
    await setTradeSettings(isProd, currency, "coinbaseEUR", "EUR", mostOptimal.settings).catch(e => { throw Error(`Error setting trade settings for ${exchange}-${pairedAsset}: ${e.message}`) })
    
    await recordOptimalTradeSettingResult(mostOptimal).catch(e => { throw Error(`Error recording most optimal trade settings result: ${JSON.stringify(mostOptimal)}: ${e.message}`) })
    return mostOptimal
}