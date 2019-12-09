const { getCurrentSettings } = require("./dataController")
const { round } = require("../helpers/numbers")

/**
 * There are the default optimised BTC settings, based on the period 7/5/2019 - 30/6/2019
 */
let btcDefaultSettings = {
    numIntervalsToUse: 240,
	correlationThreshold: 0.05,
	correlationInterval: 384,
	dailyStoplossThreshold: 0.04,
	weeklyStoplossThreshold: 2 * 0.06,
	profitThreshold: 1.03,
    lossThreshold: 0.97,
    created: 1561852800
};

/**
 * There are the default optimised ETH settings, based on the period 7/5/2019 - 30/6/2019
 */
let ethDefaultSettings = {
    numIntervalsToUse: 240,
	correlationThreshold: 0.32,
	correlationInterval: 384,
	dailyStoplossThreshold: 0.04,
	weeklyStoplossThreshold: 2 * 0.06,
	profitThreshold: 1.03,
	lossThreshold: 0.97,
    created: 1561852800
};

exports.createRandomSettings = async (currency, iterations, maxNumberOfIntervalsToUse, maxInterval) => {
    // This should be dynamic in the future
    let mostRecentOptimalSettings = await getCurrentSettings(currency, "coinbaseEUR", "EUR")
    let defaultSettings = currency === "BTC" ? btcDefaultSettings : ethDefaultSettings

    let greedyMode = false; // To be set-able in the future

    if (!mostRecentOptimalSettings.created) {
        mostRecentOptimalSettings["created"] = Date.now()
    }

    if (!mostRecentOptimalSettings.numIntervalsToUse){
        mostRecentOptimalSettings["numIntervalsToUse"] = maxNumberOfIntervalsToUse
    }

    console.log(`Using as default: ${JSON.stringify(mostRecentOptimalSettings)}`)
    
    let settings = [
        { ...mostRecentOptimalSettings },
        { ...defaultSettings }
    ]

    for (i = 0; i < iterations - 2; i++) {

        let iterationFraction = Number(i / iterations)

        /**
         * Number of intervals to use
         * The number of intervals (i.e. an interval happens every 30 min when sentiment is fetched) 
         * in the past to use in backtesting. This decides how far back in time we should go when
         * slicing the rawData and correaltionData for sequential promise resolution.
         * Between 2 (2 x 30min interval =  1 hour) and `maxNumberOfIntervalsToUse`
         */
        let minNumIntervalsToUse = 2
        let maxNumIntervalsToUse = maxNumberOfIntervalsToUse
        let numIntervalsToUse = getValue(maxNumberOfIntervalsToUse, minNumIntervalsToUse, maxNumIntervalsToUse, 0, iterationFraction)
        
        /**
         * Correlation Threshold
         * The minimum threshold for an algo decision to be made. 
         * If the correlation is below this for the chosen interval, then no execution will take place.
         * Between 0.01 and 1.
         */
        let minCorrThreshold = 0.01
        let maxCorrThreshold = greedyMode ? 0.4 : 0.600
        let correlationThreshold = getValue(mostRecentOptimalSettings.correlationThreshold, minCorrThreshold, maxCorrThreshold, 2, iterationFraction)
        
        /**
         * Correlation Interval
         * When calculating the adaptive correlation, how far back should we consider in the correlation calculation?
         * Between 48 (one day) and `maxInterval`
         */
        let minCorrInterval = 48
        let maxCorrInterval = maxInterval
        let correlationInterval = getValue(mostRecentOptimalSettings.correlationInterval, minCorrInterval, maxCorrInterval, 0, iterationFraction);
        
        /**
         * Daily stop loss threshold
         * The loss threshold per day when trading activity should stop, from the working capital pool.
         * Between 0 and 1
         */
        let minDailyStopLossThreshold = 0
        let maxDailyStopLossThreshold = 0.1
        let dailyStoplossThreshold = getValue(mostRecentOptimalSettings.dailyStoplossThreshold, minDailyStopLossThreshold, maxDailyStopLossThreshold, 2, iterationFraction);
        
        /**
         * Weekly stop loss threshold
         * The loss threshold per week when trading activity should stop, from the working capital pool.
         * Between 0 and 1
         */
        let minWeekStopLossThreshold = dailyStoplossThreshold
        let maxWeekStopLossThreshold = 0.4
        let weeklyStoplossThreshold = getValue(mostRecentOptimalSettings.weeklyStoplossThreshold, minWeekStopLossThreshold, maxWeekStopLossThreshold, 2, iterationFraction);
        
        /**
         * Profit threshold
         * The min percentage threshold for when a trade should close (i.e. stop gain), from its initial buy price.
         * Between 1 and unlimited (realisticly under 1.1)
         */
        let minProfitThreshold = 1.005
        let maxProfitThreshold = greedyMode ? 1.1 : 1.03
        let profitThreshold = getValue(mostRecentOptimalSettings.profitThreshold, minProfitThreshold, maxProfitThreshold, 3, iterationFraction);
        
        /**
         * Loss threshold
         * The percentage threshold for when a trade should close (i.e. stop loss), from its initial buy price.
         * Between 0 (realistically above 0.95) and 1 (realisticly under 0.99)
         */
        let minLossThreshold = greedyMode ? 0.955 : 0.97
        let maxLossThreshold = 0.99
        let lossThreshold = getValue(mostRecentOptimalSettings.lossThreshold, minLossThreshold, maxLossThreshold, 3, iterationFraction);
    
        settings.push({
            numIntervalsToUse,
			correlationThreshold,
			correlationInterval,
			dailyStoplossThreshold,
			weeklyStoplossThreshold,
			profitThreshold,
            lossThreshold,
            created: Date.now()
		});
    }

    return settings
}

/**
 * Randomly uses the default value or a random value within the min/max range
 * @param defaultValue The default value to use, if not randomising
 * @param min The minimum range value to use, when randomising
 * @param max The maximum range value to use, when randomising
 * @param decimals The number of significant digits to use/return
 * @param iterationFraction The fraction to add to the random number, so that later iterations are more likely to use random number
 */
function getValue(defaultValue, min, max, decimals, iterationFraction) {
    return Math.random() + iterationFraction >= 0.5 ? getRandomNumber(min, max, decimals) : defaultValue
}

function getRandomNumber(min, max, decimals=2) {
    return Number(round((Math.random() * (max - min) + min), decimals))
}