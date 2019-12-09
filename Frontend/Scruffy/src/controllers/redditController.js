const { analyseText } = require("./sentimentController")

const redditColumns = [
    { name: "Fetched", parseTime: true },
    { name: "Text", primary: true, search: true, link: true },
    { name: "Score", sentiment: true },
    { name: "Comparative", sentiment: true },
    { name: "Positive", sentiment: true },
    { name: "Negative", sentiment: true },
    { name: "Domain", search: true, contentLink: true },
    { name: "Created", parseFromTime: true },
    { name: "Upvotes" },
]

async function processRedditData(redditData) {
    let consolidatedData = []
    let textArray = []
    
    // Sometimes the links will be unique, other times the headings will be...
    let uniqueLinks = new Set()
    let uniqueHeadings = new Set()

    redditData.map(timeStampedEntry => {
        
        // Get data of each reddit entry
        Object.keys(timeStampedEntry).map(key => {
            if (isNaN(key)) return null
            let entry = timeStampedEntry[key]

            let link = entry.link
            if (uniqueLinks.has(link)) return null
            uniqueLinks.add(link)

            let heading = entry.text
            if (uniqueHeadings.has(heading)) return null
            uniqueHeadings.add(heading)
            
            let upVotes = entry.upVotes
            let created = entry.created_utc * 1000
            consolidatedData.push({ ...entry, timestamp: created, created, upvotes: upVotes })
            textArray.push(entry.text)
            return null
        })
        return null
    })

    let sentiment = await analyseText(textArray)
    let combined = consolidatedData.map((entry, index) => {
        return { ...entry, ...sentiment[index]}
    })

    return combined
}

export { redditColumns, processRedditData }