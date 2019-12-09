const { getSentiment } = require("./sentimentController");
const { getPrices } = require("./priceController");

exports.getSentimentData = async (req, res) => {
    let cronJob = req.get("X-Appengine-Cron");
    if (cronJob) {
        // Remove seconds and ms from time
        let dateId = new Date();
        dateId.setSeconds(0, 0);
        dateId = dateId.toISOString();

        await getSentiment(dateId);
        return res.send("success in running getSentimentData");
    }
    return res.send("Not valid cron job")
}

exports.getPriceData = async (req, res) => {
	let cronJob = req.get("X-Appengine-Cron");
	if (cronJob) {
		// Remove seconds and ms from time
		let dateId = new Date();
		dateId.setSeconds(0, 0);
		dateId = dateId.toISOString();

		await getPrices(dateId);
		return res.send("success in running getPriceData");
	}
	return res.send("Not valid cron job");
};