const fetch = require("node-fetch");
const Sentiment = require("sentiment");
const sentiment = new Sentiment();

const { saveSentimentData, getExtraWords, saveExtraWords } = require("./firebaseController");
const { getSubreddit } = require("./redditController");
const { performStandardSearch, performPremiumSearch } = require("./twitterController");
const { searchNews } = require("./bingNewsController");
const { retry } = require("./retryController")
const { updateExtraWordCache, getExtraWordCache } = require("./cacheController")

const l = require("./logController");
const h = require("../helpers");

function _getTotals(arrayOfResults) {
    let nonZeroResults = arrayOfResults.filter((result) => result.analysed.length > 0);
    let cumulativeScoresOnly = nonZeroResults.map((result) => result.cumulativeScore);
    let cumulativeComparativeOnly = nonZeroResults.map((result) => result.cumulativeComparative);

    let totalCumulativeScore = cumulativeScoresOnly.reduce((a, b) => a + b);
    let totalCumulativeComparative = cumulativeComparativeOnly.reduce((a, b) => a + b);

    let averageScore = totalCumulativeScore / nonZeroResults.length;
    let averageComparative = totalCumulativeComparative / nonZeroResults.length;

    return { totalCumulativeScore, totalCumulativeComparative, averageScore, averageComparative };
}

async function _createRecord(
	dateId,
	searchKey,
	averageScore,
	averageComparative,
	totalCumulativeScore,
	totalCumulativeComparative,
	twitter_premium,
	twitter_standard,
	reddit,
	news
) {
	let data = {
		asset: searchKey,
		averageScore,
		averageComparative,
		totalCumulativeScore,
		totalCumulativeComparative,
		scoreDetails: {
			twitter_premium_cumulativeScore: twitter_premium.cumulativeScore,
			twitter_premium_cumulativeComparative: twitter_premium.cumulativeComparative,
			twitter_standard_cumulativeScore: twitter_standard.cumulativeScore,
			twitter_standard_cumulativeComparative: twitter_standard.cumulativeComparative,
			reddit_cumulativeScore: reddit.cumulativeScore,
			reddit_cumulativeComparative: reddit.cumulativeComparative,
			news_cumulativeScore: news.cumulativeScore,
			news_cumulativeComparative: news.cumulativeComparative
		}
    };
    
    let assetKey = h.getAssetKey(searchKey);
    await retry(async () => await saveSentimentData(dateId, assetKey, data), "sentimentController saveSentimentData").catch(e => { throw e });
};

async function _replaceScore(word, score) {
	let extraWords = await retry(async () => await getExtraWords(), "sentimentController _replaceScore getExtraWords").catch(e => { throw e });
	extraWords[word.toLowerCase()] = score
	let sortedKeys = Object.keys(extraWords).sort()
	let sortedDict = {}
	sortedKeys.map(key => sortedDict[key] = extraWords[key])

	await retry(async () => await saveExtraWords(sortedDict), "sentimentController _replaceScore saveExtraWords").catch(e => { throw e });

	l.log({
		title: "🤓 Sentiment controller",
		message: `Added/modified \`${word}: ${score}\``, 
		postToSlack: true
	})
}

async function _analyse(text, extraWordsCache) {
	// Fetch words from cache if needed
	let extraWords = extraWordsCache
	if (!extraWords) {
		// Repeat cache check for Scruffy
		extraWords = getExtraWordCache()
		if (!extraWords) {
			extraWords = await retry(async () => await getExtraWords(), "sentimentController _analyse getExtraWords").catch(e => { throw e })
			updateExtraWordCache(extraWords)
		};
	}

    let options = {
		extras: extraWords
	};

	// Clean up text for duplicate words
	let uniqueWords = text.toLowerCase().split(' ').filter((item, i, allItems) => {
		return i == allItems.indexOf(item);
	}).join(' ');

	// Clean up text from other characters
	uniqueWords = uniqueWords.replace(/'/g, ' ').replace(/"/g, ' ').replace(/`/g, ' ').replace(/\./g, '').replace(/\,/g, '').replace(/\(/g, ' ').replace(/\)/g, ' ').replace(/\:/g, ' ').replace(/;/g, ' ')

	let result = await sentiment.analyze(uniqueWords, options)
	return result
}

async function _analyseText(text, extraWordsCache) {
	let result = await _analyse(text, extraWordsCache).catch(e => { throw e });

    let positive = result.positive;
    let negative = result.negative;
    let score = result.score;
    let comparative = result.comparative;

    return { text, positive, negative, score, comparative };
}

async function _analyseResultsArray(results, extraWordsCache) {
    let cumulativeScore = 0;
	let cumulativeComparative = 0;

	let analysed = await h.mapAsync(results, async function(result) {
		let analysis = await _analyseText(result.text, extraWordsCache).catch(e => { throw e });
		cumulativeScore += analysis.score;
		cumulativeComparative += analysis.comparative;

        return { ...result, ...analysis };
    });

    return { analysed, cumulativeScore, cumulativeComparative };
}

async function _analyseSubreddit(subreddit, quietMode, extraWordsCache) {
	let results = await retry(async () => await getSubreddit(subreddit, quietMode), "sentimentController getSubreddit").catch(e => { throw e });

	let redditBucketData = {
		included: results.threads,
		excluded: results.ignored_threads,
		stats: {
			total_analysed: results.total_analysed,
			total_curated: results.total_curated,
			total_sticky: results.total_sticky,
			total_self: results.total_self
		}
	};

	let { analysed, cumulativeScore, cumulativeComparative } = await _analyseResultsArray(results.threads, extraWordsCache).catch(e => { throw e });
	return { reddit: { analysed, results, cumulativeScore, cumulativeComparative }, redditBucketData};
}

async function _analyseTwitter(isPremium, searchKey, pages, quietMode, extraWordsCache) {
    let results = isPremium
		? await retry(async () => await performPremiumSearch(searchKey, pages, quietMode || false), "sentimentController performPremiumSearch").catch(e => { throw e })
		: await retry(async () => await performStandardSearch(searchKey, pages, quietMode || false), "sentimentController performStandardSearch").catch(e => { throw e })

	let bucketData = {
		included: results.tweets,
		excluded: {
			ignored_tweets: results.ignored_tweets,
			ignored_retweets: results.ignored_retweets
		},
		stats: {
			total_analysed: results.total_analysed,
			total_curated: results.total_curated
		}
	};

	let { analysed, cumulativeScore, cumulativeComparative } = await _analyseResultsArray(results.tweets, extraWordsCache).catch(e => { throw e });
	return { result: { analysed, results, cumulativeScore, cumulativeComparative }, bucketData};
}

async function _analyseNews(searchKey, quietMode, extraWordsCache) {
	let results = await retry(async () => await searchNews(searchKey, quietMode || false), "sentimentController searchNews").catch(e => { throw e });

	let newsBucketData = {
		included: results.articles,
		excluded: {
			old_articles: results.oldArticles,
			ignored_articles: results.ignoredArticles
		},
		stats: {
			total_analysed: results.articles.length + results.oldArticles.length + results.ignoredArticles.length,
			total_curated: results.oldArticles.length + results.ignoredArticles.length
		}
	};

	let { analysed, cumulativeScore, cumulativeComparative } = await _analyseResultsArray(results.articles, extraWordsCache).catch(e => { throw e });
	return { news: { analysed, results, cumulativeScore, cumulativeComparative }, newsBucketData };
}

async function _analyseAllSources(dateId, searchKey, quietMode, twitterPremium) {
	let extraWords = getExtraWordCache()

	if (!extraWords) {
		extraWords = await retry(async () => await getExtraWords(), "sentimentController _analyseAllSources getExtraWords").catch(e => { throw e })
		updateExtraWordCache(extraWords)
	};

	let pages = 4;

	l.log({
		title: "🤓 Sentiment controller",
		message: `Analysing Twitter Standard for ${searchKey}`
	})
	let twitterStandardResult = await _analyseTwitter(false, searchKey, pages, quietMode, extraWords).catch(e => { throw Error(`_analyseTwitter: ${e.message}`) });
	let twitter_standard = twitterStandardResult.result;
	let twitterStandardBucketData = twitterStandardResult.bucketData;

	l.log({
		title: "🤓 Sentiment controller",
		message: `Analysing Reddit for ${searchKey}`
	})
	let { reddit, redditBucketData } = await _analyseSubreddit(searchKey, quietMode, extraWords).catch(e => { throw Error(`_analyseSubreddit: ${e.message}`) });

	l.log({
		title: "🤓 Sentiment controller",
		message: `Analysing Bing News for ${searchKey}`
	})
	let { news, newsBucketData } = await _analyseNews(searchKey, quietMode, extraWords).catch(e => { throw Error(`_analyseNews: ${e.message}`) });
	
	let twitter_premium = {
			cumulativeScore: 0,
			cumulativeComparative: 0,
			analysed: []
		};

	let twitterPremiumBucketData;

	if (twitterPremium) {
		l.log({
			title: "🤓 Sentiment controller",
			message: `Analysing Twitter Premium for ${searchKey}`
		})
		let twitterPremiumResult = await _analyseTwitter(true, searchKey, 1, quietMode, extraWords).catch(e => { throw Error(`_analyseTwitterPremium: ${e.message}`) });
		twitter_premium = twitterPremiumResult.result;
		twitterPremiumBucketData = twitterPremiumResult.bucketData;
	}

	let { totalCumulativeScore, totalCumulativeComparative, averageScore, averageComparative } = _getTotals([
		reddit,
		twitter_premium,
		twitter_standard,
		news
	]);

	await _createRecord(
		dateId,
		searchKey,
		averageScore,
		averageComparative,
		totalCumulativeScore,
		totalCumulativeComparative,
		twitter_premium,
		twitter_standard,
		reddit,
		news
	).catch(e => { throw Error(`_createRecord: ${e.message}`) });

	let sentimentBucketData = [
		{ currency: searchKey, source: "twitterStandard", data: twitterStandardBucketData },
		{ currency: searchKey, source: "reddit", data: redditBucketData },
		{ currency: searchKey, source: "news", data: newsBucketData }
	]

	if (twitterPremiumBucketData) {
		sentimentBucketData.push({ currency: searchKey, source: "twitterPremium", data: twitterPremiumBucketData })
	}

	return sentimentBucketData
}

async function saveDataToBucket(data) {
	let body = { allData: data }
	await retry(async () => await fetch(process.env.FIREBASE_FUNCTIONS_ENDPOINT + "/benderSaveSentiment", {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			"Hermes-Auth": process.env.FUTURA_AUTH_HERMES
		}
	}), "sentimentController saveDataToBucket").catch((e) => { throw e });

	l.log({
		title: "🤓 Sentiment controller",
		message: "Data saved to buckets"
	})
}

exports.getSentiment = async (dateId) => {
	try {

		// Currently, to stay within twitter sandbox limits (250 requests per 30 days)
		// we only call the twitter premium API 4 times a day (every 6 hours) x 2 assets (BTC + ETH).

		let parsedDate = new Date(dateId);
		let parsedHours = parsedDate.getUTCHours();
		let parsedMins = parsedDate.getUTCMinutes();

		let shouldGetTwitterPremium = (parsedHours % 6 === 0) && (parsedMins < 5); // give minutes buffer

		l.log({
			title: "🤓 Sentiment controller",
			message: "** Analysing for ethereum..."
		})
		let ethBucketData = await _analyseAllSources(dateId, "ethereum", false, shouldGetTwitterPremium).catch(e => {
			throw Error(`Error in _analyseAllSources for ${dateId}, ethereum, false, ${shouldGetTwitterPremium}: ${e.message}`)
		});

		l.log({
			title: "🤓 Sentiment controller",
			message: "** Analysing for bitcoin..."
		})
		let btcBucketData = await _analyseAllSources(dateId, "bitcoin", false, shouldGetTwitterPremium).catch(e => {
			throw Error(`Error in _analyseAllSources for ${dateId}, bitcoin, false, ${shouldGetTwitterPremium}: ${e.message}`)
		});

		l.log({
			title: "🤓 Sentiment controller",
			message: "** Saving sentiment bucket data"
		})
		let combinedBucketData = ethBucketData.concat(btcBucketData)
		await saveDataToBucket(combinedBucketData).catch(e => {
			throw Error(`Error in saveDataToBucket: ${e.message}`)
		});

		l.log({
			title: "🤓 Hermes Sentiment controller",
			message: "** Finished saving sentiment bucket data",
		})

	} catch (e) {
		l.logError({
			title: "🤓 Hermes Sentiment controller error",
			message: e.message,
			details: e.stack,
		})
	}
};

exports.analyseTextArray = async (req, res) => {
    let textArray = req.body.textArray;

	if (!textArray || textArray.length === 0) {
        return res.sendStatus(400)
	}

	let analysed = await h.mapAsync(textArray, async (text) => {
		let analysis = await _analyseText(text).catch(e => {
			l.logError({
				title: "🤓 Hermes Sentiment analyseTextArray error",
				message: e.message,
				details: e.stack,
			})
			return
		})
		return { text, ...analysis };
	})

    res.json(analysed);
}

exports.getScore = async (req, res) => {
	let text = req.body.text

	if (!text) {
		return res.status(400).send("No valid text")
	}

	let result = await _analyse(text).catch(e => {
		l.logError({
			title: "🤓 Hermes getScore error",
			message: e.message,
			details: e.stack,
		})
		return res.status(400).send(e.message)
	})
	res.json(result)
}

exports.saveScore = async (req, res) => {
	let word = req.body.word
	let score = Number(req.body.score)

	if (!word || !Number.isInteger(score)) {
		return res.status(400).send("No valid word or score")
	}

	console.log(word, score)
	await _replaceScore(word, score).catch(e => {
		l.logError({
			title: "🤓 Hermes saveScore error",
			message: e.message,
			details: e.stack,
		})
		return res.status(400).send(e.message)
	})
	res.sendStatus(200)
}