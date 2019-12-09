const express = require("express");

const { getRelevantData, runBacktest, setOptimalSettingsInProduction } = require("./controllers/dataController");
const { disableKillSwitch, shutdownTuranga } = require("./controllers/lifecycleController")
const { createRandomSettings } = require("./controllers/randomGenerator")
const { sequentialPromisesResolution } = require("./helpers/asyncIterators")
const { log, logError } = require("./helpers/log")

const app = express();
const port = 3000;

app.get("/", async (req, res) => {

    try {
        await disableKillSwitch()
        
        let currencies = ["ETH", "BTC"]

        await sequentialPromisesResolution(currencies, async (currency) => {
            // `maxNumberOfEntriesToFetch` should be larger than `maxNumberOfIntervalsToUse`
            let maxNumberOfEntriesToFetch = 1488 * 2 // 32 days of data = max of 16 days for correlationInterval
            let maxNumberOfIntervalsToUse = 768 // 48 intervals per day, therefore 31 days
            let iterations = 51

            log({
                title: "👁 Turanga 🏃‍♀️",
                message: `Running ${iterations} backtests to find the optimal trade settings for ${currency}, using a maximum of the previous ${maxNumberOfIntervalsToUse/48} days`,
                postToSlack: true
            })

            let randomSettings = await createRandomSettings(currency, iterations, maxNumberOfIntervalsToUse, maxNumberOfEntriesToFetch/2)
            let rawData = await getRelevantData(currency, maxNumberOfEntriesToFetch)
            let idPrefix = Date.now()
            
            let bodies = randomSettings.map((settings, index) => {
                let entryData = rawData.slice(0, settings.numIntervalsToUse).reverse();
                let correlationData = rawData.slice(0, settings.numIntervalsToUse + settings.correlationInterval).reverse();

                return {
                    id: `${idPrefix}-${index}`,
                    currency,
                    entryData,
                    correlationData,
                    settings,
                    idPrefix
                }
            })

            await sequentialPromisesResolution(bodies, async (body) => {
                log({ message: `Starting backtest for ${body.id}` })
                await runBacktest(body)
            }).catch(e => {
                throw e
            })

            let exchange = "coinbase"
            let pairedAsset = "USD"

            await setOptimalSettingsInProduction(currency, exchange, pairedAsset).catch(e => {
                throw e
            })

            log({
                title: "👁 Turanga 🏁",
                message: `Completed ${iterations} backtests for ${currency}, updating to the most optimal settings in production`,
                postToSlack: true
            })
        }).catch(e => {
            throw e
        })

        res.send("OK")

    } catch (e) {
        logError({ title: "Turanga error", message: e.message })
        res.status(400).send(e.message)
    } finally {
        await shutdownTuranga()
    }
});

app.listen(port, () => console.log(`Listening on port ${port}!`));
