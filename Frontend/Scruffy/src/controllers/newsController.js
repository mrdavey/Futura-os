const { analyseText } = require("./sentimentController")

const newsColumns = [
    { name: "Text", primary: true, search: true, link: true },
    { name: "Description", search: true },
    { name: "Score", sentiment: true },
    { name: "Comparative", sentiment: true },
    { name: "Positive", sentiment: true },
    { name: "Negative", sentiment: true },
    { name: "Published", parseFromTime: true },
    { name: "Fetched", parseTime: true },
]

async function processNewsData(newsData) {
    let consolidatedData = []
    let textArray = []

    let uniqueLinks = new Set()
    let uniqueTitles = new Set()

    newsData.map(timeStampedEntry => {
        let timestamp = timeStampedEntry.timeStamp

        // Get data of each news entry
        Object.keys(timeStampedEntry).map(key => {
            if (isNaN(key)) return null
            let entry = timeStampedEntry[key]
            let link = entry.url
            let text = entry.title

            if (uniqueLinks.has(link)) return null
            if (uniqueTitles.has(text)) return null
            
            uniqueLinks.add(link)
            uniqueTitles.add(text)

            let created = entry.published

            let modifiedEntry = {...entry, link, text, created }
            delete modifiedEntry["url"]
            consolidatedData.push({ ...modifiedEntry, timestamp })
            textArray.push(`${text} ${entry.description}`)
            return null
        })
        return null
    })

    let sentiment = await analyseText(textArray)
    let combined = consolidatedData.map((entry, index) => {
        delete sentiment[index]["text"]
        return { ...entry, ...sentiment[index] }
    })
    return combined
}

export { newsColumns, processNewsData }