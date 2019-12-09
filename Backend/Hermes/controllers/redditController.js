const fetch = require('node-fetch');
const l = require("./logController");

function processThread(thread) {
	return {
		text: thread.data.title,
		created: thread.data.created,
		created_utc: thread.data.created_utc,
		comments: thread.data.num_comments,
		domain: thread.data.domain,
		score: thread.data.score,
		downVotes: thread.data.downs,
		upVotes: thread.data.ups,
		author: thread.data.author_fullname,
		link: `https://www.reddit.com${thread.data.permalink}`,
		contentLink: thread.data.url
	};
}

async function getJson(subreddit, quietMode) {
    let response = await fetch(`https://www.reddit.com/r/${subreddit}.json?limit=150`).catch(e => { throw Error(`Fetch error for Reddit: ${e.message}`)});
	let json = await response.json().catch(e => { throw Error(`JSON response error for Reddit: ${e.message}`) });
	
	let ignoredThreads = [];
	let numberOfSticky = 0;
	let numberOfSelf = 0;
	let numberOfMedia = 0;

    let threadsArray = json.data.children;
    let filteredThreads = threadsArray.filter(thread => {
		if (thread.data.stickied == true) {
			numberOfSticky++;
			ignoredThreads.push(processThread(thread));
			return false
		}

		if (thread.data.domain.startsWith("self.")) {
			numberOfSelf++;
			ignoredThreads.push(processThread(thread));
			return false
		}

		if (thread.data.domain.startsWith("imgur") || thread.data.domain.startsWith("i.redd.it") || thread.data.domain.startsWith("v.redd.it") || thread.data.domain.startsWith("youtu")) {
			numberOfMedia++;
			ignoredThreads.push(processThread(thread))
			return false
		}

		return true
	});

	let finalThreads = filteredThreads.map((thread) => {
		return processThread(thread)
	});

	if (!quietMode) {
		l.log({
			title: "🤓 Reddit",
			message: ` - Imported ${finalThreads.length} threads from /r/${subreddit}`
		})
	}
	return { threads: finalThreads, ignored_threads: ignoredThreads, total_analysed: threadsArray.length, total_curated: finalThreads.length, total_sticky: numberOfSticky, total_self: numberOfSelf, total_media: numberOfMedia};
}

exports.getSubreddit = async (subreddit, quietMode) => {
	try {
		let threads = await getJson(subreddit, quietMode);
		return threads;
	} catch (e) {
		l.logError({
			title: "🤓 Reddit controller error",
			message: `Error getting ${subreddit}: ${e.message}`, 
		});
		return { threads: [], ignored_threads: [], total_analysed: 0, total_curated: 0, total_sticky: 0, total_self: 0 };
	}
};