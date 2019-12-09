const NodeCache = require("node-cache")
const extraWordCache = new NodeCache({ stdTTL: 1800 }) // 30min

exports.updateExtraWordCache = (newWords) => {
    extraWordCache.set("extraWords", newWords)
    console.log("Updated word cache", Date.now())
}

exports.getExtraWordCache = () => {
    console.log("Getting from word cache", Date.now())
    return extraWordCache.get("extraWords")
}

const maRecentPriceCache = new NodeCache({ stdTTL: 240 }) // 4min

exports.updateMAPriceCache = (priceData) => {
    maRecentPriceCache.set("maPriceData", priceData)
    // console.log("Updated MA price cache", Date.now())
}

exports.getMAPriceCache = () => {
    // console.log("Getting from MA price cache", Date.now())
    return maRecentPriceCache.get("maPriceData")
}