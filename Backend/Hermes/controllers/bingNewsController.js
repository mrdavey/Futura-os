const { log, logError } = require("./logController");

const CognitiveServicesCredentials = require("ms-rest-azure").CognitiveServicesCredentials;
let credentials = new CognitiveServicesCredentials(process.env.API_AZURE_KEY);

const NewsSearchAPIClient = require("azure-cognitiveservices-newssearch");
let client = new NewsSearchAPIClient(credentials);

function _getToday() {
    let startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return startOfToday
}

function _processArticle(article) {
    return {
        title: article.name,
        url: article.url,
        description: article.description,
        published: article.datePublished,
        text: article.name + " " + article.description
    }
}

function _processNews(result) {
    let todayDate = _getToday();
    let ignoredArticles = [];
    let oldArticles = [];
    let todayArticles = [];
    
    result.value.filter(article => {
        let processedArticle = _processArticle(article);
        let articleText = processedArticle.text.toLowerCase()
        let containsGiveaway = articleText.includes("give away") || articleText.includes("giving away") || articleText.includes("giveaway") || articleText.includes("bonus");
        let containsHowTo = articleText.includes("how to") || articleText.includes("how-to");
        let containsTopList = articleText.includes("top 10");
        let containsSpam = articleText.includes("is here") || articleText.includes("introducing") || articleText.includes("sign up") || articleText.includes("sign-up");
        let containsStrangeGrammer =
            articleText.includes(" : ") || articleText.includes(" . ") || articleText.includes(" ? ") || articleText.includes(" , ");

        let containsStupid = articleText.includes("next-gen") || articleText.includes("next gen") || articleText.includes("next generation")
        
        let url = processedArticle.url
        let fromBadDomain = url.includes("theenterpriseleader") || url.includes("dispatchtribunal")

        if (containsGiveaway || containsHowTo || containsTopList || containsSpam || containsStrangeGrammer || containsStupid || fromBadDomain) {
            ignoredArticles.push(processedArticle);
        } else {
            if (new Date(processedArticle.published) >= todayDate) {
                todayArticles.push(processedArticle);
			} else {
                oldArticles.push(processedArticle);
			}
        }
    });
        
    return { articles: todayArticles, oldArticles: oldArticles, ignoredArticles };
}

async function _searchNews(query, market, quietMode) {
    if (!quietMode) {
        log({
            title: "🤓 Hermes searching news",
            message: `Running query for ${market} market...`
        })
    }
    let options = {
        acceptLanguage: "en-gb",
        count: 100,
        offset: 0,
        freshness: "Day",
        market: market,
        setLang: "EN",
        sortBy: "Date"
    }

    let result = await client.newsOperations.search(query, options).catch(e => { throw Error(`Search error in Bing news: ${e.message}`) });
    return _processNews(result);
}

/**
 * To double check results on web, use https://azure.microsoft.com/en-us/services/cognitive-services/bing-news-search-api/
 */
exports.searchNews = async (searchKey, quietMode) => {
	let query = "";
	switch (searchKey) {
		case "ethereum":
            query = 'intitle:ethereum || intitle:eth || ethereum near:20 cryptocurrency || ethereum near:20 cryptocurrencies';
			break;
		case "bitcoin":
            query = 'intitle:bitcoin || intitle:btc || bitcoin near:20 cryptocurrency || bitcoin near:20 cryptocurrencies';
			break;
		default:
            query = 'intitle:cryptocurrency | intitle: cryptocurrencies | "cryptocurrency" | "crytocurrencies';
			break;
	}

    let usNews;
    let articles;
    let oldArticles;
    let ignoredArticles;

    try {
        usNews = await _searchNews(query, "en-US", quietMode);
        articles = usNews.articles;
        oldArticles = usNews.oldArticles;
        ignoredArticles = usNews.ignoredArticles;

        if (!quietMode) {
            log({
                title: "🤓 Hermes searched news",
                message: `Using ${articles.length}, ignoring ${ignoredArticles.length} junk and ${oldArticles.length} old articles.`
            });
        }
    } catch (e) {
        logError({
            title: "🤓 Hermes news error",
            message: e.message, 
        });
        articles = [];
		oldArticles = [];
		ignoredArticles = [];
    }

	// English market news is the same
	// let gbNews = await _searchNews(query, "en-GB");
	// let auNews = await _searchNews(query, "en-AU");
	// let caNews = await _searchNews(query, "en-CA");

	// let articles = usNews.articles.concat(gbNews.articles, auNews.articles, caNews.articles);
	// let oldArticles = usNews.oldArticles.concat(gbNews.oldArticles, auNews.oldArticles, caNews.oldArticles);
	// let ignoredArticles = usNews.ignoredArticles.concat(gbNews.ignoredArticles, auNews.ignoredArticles, caNews.ignoredArticles);

	return { articles, oldArticles, ignoredArticles };
};