const { analyseText } = require("./sentimentController")
const { round } = require("../helpers/numbers")

const twitterColumns = [
    { name: "Text", primary: true, search: true, link: true },
    { name: "Score", sentiment: true },
    { name: "Comparative", sentiment: true },
    { name: "Positive", sentiment: true },
    { name: "Negative", sentiment: true },
    { name: "Ratio" },
    { name: "Retweets" },
    { name: "Favourites" },
    { name: "Created", parseFromTime: true },
    { name: "Fetched", parseTime: true },
]

async function processTwitterData(twitterData) {
    let consolidatedData = []
    let textArray = []

    let uniqueLinks = new Set()

    twitterData.map(timeStampedEntry => {
        let timestamp = timeStampedEntry.timeStamp

        // Get data of each twitter entry
        Object.keys(timeStampedEntry).map(key => {
            if (isNaN(key)) return null
            let entry = timeStampedEntry[key]
            let link = entry.id_str

            if (uniqueLinks.has(link)) return null
            
            uniqueLinks.add(link)

            let ratio = round(Number(entry.user.followers) / Number(entry.user.following))
            let retweets = entry.retweets
            let favourites = entry.favourites
            let created = entry.created

            let modEntry = { ...entry, link: `https://twitter.com/i/web/status/${link}`, ratio, retweets, favourites, timestamp, created }
            delete modEntry["url"]
            consolidatedData.push({ ...modEntry, timestamp })
            textArray.push(entry.text)
            return null
        })
        return null
    })

    let sentiment = await analyseText(textArray).catch(e => { throw e })
    let combined = consolidatedData.map((entry, index) => {
        return { ...entry, ...sentiment[index] }
    })

    return combined
}

export { twitterColumns, processTwitterData }