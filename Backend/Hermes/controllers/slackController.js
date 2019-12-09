const fetch = require("node-fetch");

const TYPES = { error: "error", status: "status", news: "news" };

exports.postMessage = async ({ title, message, details, type = TYPES.error }) => {
    try {
        return await _postMessage({ title, message, details, type });
    } catch (e) {
        console.log(`Slack error occured: ${e.toString()}\nOriginal data: ${title}, ${message}, ${details}.\n`)
        return false;
    }
};

async function _postMessage({ title, message, details, type }) {
    let headers = {
        "Content-Type": "application/json"
    };

    let bodyString = "";

    if (title !== undefined) bodyString += `*${title}* `;
    if (message !== undefined & details === undefined) bodyString += `${message}`;
    if (message === undefined & details !== undefined) bodyString += `\`${details}\``;
    if ((message !== undefined) & (details !== undefined)) bodyString += `\`${message}\` \n\`\`\`${details}\`\`\``;

    let endpoint = process.env.SLACK_WEBHOOK_ENDPOINT + process.env.SLACK_WEBOOK_CHANNEL_STATUS // Status channel
    if (type === TYPES.error) endpoint = process.env.SLACK_WEBHOOK_ENDPOINT + process.env.SLACK_WEBOOK_CHANNEL_ERROR
    if (type === TYPES.news) endpoint = process.env.SLACK_WEBHOOK_ENDPOINT + process.env.SLACK_WEBOOK_CHANNEL_NEWS

    try {
        await fetch(endpoint,
            {
                method: "POST",
                body: JSON.stringify({ text: bodyString }),
                headers: headers
            }
        );
    } catch (e) {
        console.log(e.message);
    }
}