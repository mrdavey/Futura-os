const fetch = require("node-fetch");
const moment = require("moment");
const l = require("./logController");

const id = process.env.API_TWITTER_ID
const pass = process.env.API_TWITTER_PASSWORD
const bearerToken = process.env.API_TWITTER_BEARER_TOKEN

async function _getBearerToken() {
    let headers = {
		Authorization: `Basic ${Buffer.from(id + ":" + pass).toString("base64")}`,
		"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
	};

    let response = await fetch("https://api.twitter.com/oauth2/token", {
		method: "POST",
        body: "grant_type=client_credentials",
		headers: headers
    });
    
    let json = await response.json();
    let bearerToken = json.access_token;
    return bearerToken;
}

//
// Standard search - older API, not as feature rich, not real time
//

async function _getStandardSearch(encodedQuery) {
    let headers = {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json"
    };

    let response = await fetch(`https://api.twitter.com/1.1/search/tweets.json${encodedQuery}`, {
		method: "GET",
		headers: headers
	}).catch((e) => {
		throw Error(`Fetch error for Twitter standard: ${e.message}`);
	});

    let json = await response.json().catch((e) => {
		throw Error(`JSON response error for Twitter standard: ${e.message}`);
	});
    return json;
}

async function _performStandardSearch(query, pages, quietMode) {
    let encodedQuery = encodeURI("?q=" + query + "&lang=en&count=150&result_type=recent");

    let pageCount = 0;
    let combinedJson = [];

    do {
        let json = await _getStandardSearch(encodedQuery).catch((e) => {
			throw e;
		});
		combinedJson = combinedJson.concat(json.statuses)

        if (json.search_metadata && json.search_metadata.next_results !== undefined) {
            encodedQuery = json.search_metadata.next_results;
            if (!quietMode) {
                l.log({
                    title: "🤓 Twitter controller",
                    message: ` - Standard next token: ${encodedQuery}`
                }); 
            }
		} else {
			encodedQuery = undefined;
            if (!quietMode) {
                l.log({
                    title: "🤓 Twitter controller",
                    message: ` - No next token`
                }); 
            }
        }

        if (encodedQuery == undefined) {
            pageCount = pages;
        } else {
            pageCount++;
        }

	} while (pageCount <= pages);
    return combinedJson;
}

//
// Premium search - supports extended tweets, real time
//

async function _postPremiumSearch(body) {
	let headers = {
		Authorization: `Bearer ${bearerToken}`,
		"Content-Type": "application/json"
	};

	let response = await fetch("https://api.twitter.com/1.1/tweets/search/30day/dev.json", {
		method: "POST",
		body: JSON.stringify(body),
		headers: headers
	}).catch(e => { throw Error(`Fetch error for Twitter premium: ${e.message}`) });

    let status = response.status;
    let statusText = response.statusText;

    if (status === 200) {
        let json = await response.json().catch(e => { throw Error(`JSON response error for Twitter premium: ${e.message}`) });
        return json;
    } else {
        return { status, statusText }
    }
}

async function _performPremiumSearch(query, pages, quietMode) {
    let timeLimit = moment.utc().subtract(6, 'hours').format('YYYYMMDDHHmm')

    let body = {
		query: query,
		maxResults: 100,
		fromDate: timeLimit
    };
    
    let pageCount = 0;
    let combinedJson = [];

    let json = await _postPremiumSearch(body).catch(e => { throw e });
    if (json.status !== undefined) {
        if (!quietMode) { 
            // l.logError({
            //     title: "🤓 Twitter Premium controller",
            //     message: ` - Error occured: ${json.status}, ${json.statusText}`
            // })
        }
        return [];
    }
    combinedJson = combinedJson.concat(json.results)

    //
    // We only want to grab 1 page of twitter results in Sandbox, so below is commented out
    //

    // do {
    //     let json = await _postPremiumSearch(body).catch(e => { throw e });
    //     if (json.status !== undefined) {
    //         if (!quietMode) { 
    //             l.logError({
    //                 title: "🤓 Twitter Premium controller",
    //                 message: ` - Error occured: ${json.status}, ${json.statusText}`
    //             })
    //         }
    //         break
    //     }
    //     combinedJson = combinedJson.concat(json.results)

    //     if (json.next !== null) {
    //         body.next = json.next;
    //         pageCount++;
    //         if (!quietMode) { 
    //             l.log({
    //                 title: "🤓 Twitter controller",
    //                 message: ` - Premium next token: ${json.next}`
    //             });
    //         }
    //     } else {
    //         combinedJson.next = null;
    //         pageCount = pages;
    //         if (!quietMode) { 
    //             l.log({
    //                 title: "🤓 Twitter controller",
    //                 message: ` - No next token ${json}`
    //             }) 
    //         };
    //     }
    // } while (pageCount < pages);

    return combinedJson;
}

//
// Processing search results
//

function _processTweet(result) {
    let newDict = {
        text: null,
        created: result.created_at,
        user: {
            id: result.user.id,
            name: result.user.name,
            followers: result.user.followers_count,
            following: result.user.friends_count,
            description: result.user.description
        },
        entities: {
            hashtags: null,
            user_mentions: null,
            symbols: null
        },
        replies: result.reply_count,
        retweets: result.retweet_count,
        favourites: result.favorite_count,
        id_str: result.id_str
    };

    if (result.extended_tweet == null) {
        newDict.text = result.text
        newDict.entities.hashtags = result.entities.hashtags
        newDict.entities.user_mentions = result.entities.user_mentions,
            newDict.entities.symbols = result.entities.symbols
    } else {
        newDict.text = result.extended_tweet.full_text;
        newDict.hashtags = result.extended_tweet.entities.hashtags,
            newDict.user_mentions = result.extended_tweet.entities.user_mentions,
            newDict.symbols = result.extended_tweet.entities.symbols
    };

    return newDict;
}

function _processSearchResults(results, quietMode) {

    let ignoredRetweets = 0;
    let ignoredTweets = [];

    // Filter by getting rid of the trash tweets (RT, shillers, etc)
    let filteredList = results.filter(result => {
        let isExtended = result.extended_tweet == null ? false : true;
        let text = (isExtended ? result.extended_tweet.full_text : result.text).toLowerCase();
        let bioDescription = result.user.description || "";

        // Too many...
        let tooManyHashTags = (text.match(/#/g) || []).length >= 4
        let tooManyMentions = (text.match(/@/g) || []).length >= 4;
        let tooManySymbols = (text.match(/[$]/g) || []).length >= 2;
        let tooManyStars = (text.match(/[*]/g) || []).length >= 2;

        // Profiling...
        let shillerWithHashTags = (bioDescription.match(/#/g) || []).length >= 4;
        let coinInName = result.user.name.toLowerCase().includes("coin");
        let winnerInText = text.includes("winner");
        let isABot = bioDescription.toLowerCase().includes("bot");

        // Bad words...
        let forbiddenWords = ["etorro", "bestseller", "meetup", "sponsored", "honored", "giveaway", "earn interest", "subscribe"]
        let containsBadWord = forbiddenWords.some(word => text.includes(word))

        let shillingService = text.includes("join") && text.includes("free")

        // The positives...
        let goodRatio = result.user.friends_count / result.user.followers_count < 1;
        let minimumFollowers = result.user.followers_count > 100;

        if (result.retweeted_status != null) {
            ignoredRetweets++;
        }

        if (result.lang == "en" && 
            result.retweeted_status == null &&
            !tooManyHashTags &&
            !tooManyMentions &&
            !tooManySymbols &&
            !tooManyStars &&
            !shillerWithHashTags &&
            !coinInName &&
            !winnerInText &&
            !isABot &&
            !containsBadWord &&
            !shillingService &&
            goodRatio &&
            minimumFollowers
        ) {
                return true
            } else {
                ignoredTweets.push(_processTweet(result))
            }
    })

    if (!quietMode) { 
        l.log({
            title: "🤓 Twitter controller",
            message: ` - Ignored RTs: ${ignoredRetweets}`
        }); 
    }

    // Create curated list with data that we're interested in
    let curatedList = filteredList.map(tweet => {
        return _processTweet(tweet)
    })

    // Filter list by tweets that have some semblance of popularity
    let finalList = curatedList.filter(result => {
        if (result.replies > 1 ||
            result.retweets > 1 ||
            result.favourites > 1) {
                return true
            } else {
                ignoredTweets.push(result)
            }
    });

    if (!quietMode) { 
        l.log({
            title: "🤓 Twitter controller",
            message: ` - Total ignored tweets: ${ignoredTweets.length}`
        }); 
    }

    return {
		tweets: finalList,
        ignoredRetweets,
        ignored_tweets: ignoredTweets
	};
}

//
// Exports
//

exports.getBearerToken = async (req, res) => {
    let result = await _getBearerToken();
    res.json({bearerToken: result});
}

exports.performStandardSearch = async (searchKey, pages, quietMode) => {
    let query = "";

    switch (searchKey) {
        case "ethereum":
            query = "\"ethereum\" -RT -BTC -TRX -ETC -bitcoin -airdrop -(giving away) -giveaway -$ETH -classic -bot -listed -IEO";
            break;
        case "bitcoin":
            query = "bitcoin btc -RT -ETH -TRX -ETC -ethereum -airdrop -(giving away) -giveaway -$BTC -cash -bot -listed -satoshi -IEO";
            break;
        default:
            query = "cryptocurrency crypto -RT -airdrop -(giving away) -giveaway -bot -listed -satoshi -IEO";
            break;
    }

    try {
        let rawResults = await _performStandardSearch(query, pages, quietMode);
        if (!quietMode) { 
            l.log({
                title: "🤓 Twitter Standard controller",
                message: ` - Total statuses to analyse: ${rawResults.length}`
            }); 
        }
    
        let curatedResult = _processSearchResults(rawResults, quietMode);
        if (!quietMode) { 
            l.log({
                title: "🤓 Twitter Standard controller",
                message: ` - Statuses curated to ${curatedResult.tweets.length} tweets`
            }); 
        }
        
        return {
            tweets: curatedResult.tweets,
            ignored_tweets: curatedResult.ignored_tweets,
            total_analysed: rawResults.length, 
            total_curated: curatedResult.tweets.length,
            ignored_retweets: curatedResult.ignoredRetweets
        };
    } catch (e) {
        l.logError({
            title: "🤓 Twitter Standard controller error",
            message: `Error in Standard Search: ${e.message}`, 
        });
        
        return {
			tweets: [],
			ignored_tweets: [],
			total_analysed: 0,
			total_curated: 0,
			ignored_retweets: []
		};
    }
}

exports.performPremiumSearch = async (searchKey, pages, quietMode) => {
	let query = "";

	switch (searchKey) {
		case "ethereum":
			query = "ethereum OR ETH -(RT OR BTC OR TRX OR bitcoin OR airdrop OR classic OR (giving away) OR giveaway OR bot OR satoshi OR IEO)";
			break;
		case "bitcoin":
			query = "bitcoin OR BTC -(RT OR ETH OR TRX OR ethereum OR airdrop OR cash OR (giving away) OR giveaway OR bot OR satoshi OR IEO)";
			break;
		default:
			query = "cryptocurrency OR crypto -(RT OR airdrop OR (giving away) OR giveaway OR bot OR satoshi OR IEO)";
			break;
	}

    try {
        let rawResults = await _performPremiumSearch(query, pages, quietMode)
    
        if (!quietMode) {
            l.log({
                title: "🤓 Twitter Premium controller",
                message: ` - Total statuses to analyse: ${rawResults.length}`
            });
        }
    
        let curatedResult = _processSearchResults(rawResults, quietMode);
        if (!quietMode) {
            l.log({
                title: "🤓 Twitter Premium controller",
                message: ` - Statuses curated to ${curatedResult.tweets.length} tweets`
            });
        }
    
        return {
            tweets: curatedResult.tweets,
            ignored_tweets: curatedResult.ignored_tweets,
            total_analysed: rawResults.length,
            total_curated: curatedResult.tweets.length,
            ignored_retweets: curatedResult.ignoredRetweets
        };
    } catch (e) {
        l.logError({
            title: "🤓 Twitter Premium controller",
            message: `Error in Premium Search: ${e.message}`, 
            details: e.stack
        });

        return {
            tweets: [],
            ignored_tweets: [],
            total_analysed: 0,
            total_curated: 0,
            ignored_retweets: []
        }
    };
};