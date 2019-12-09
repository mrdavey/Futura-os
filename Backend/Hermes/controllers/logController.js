const { postMessage } = require("./slackController");

exports.log = async ({title, message, details, postToSlack=false}) => {
    console.log(`${title || ""} ${message || ""} ${details || ""}`)
    if (postToSlack) {
        postMessage({ title, message, details, type: "status" })
    }
};

exports.logNews = async ({title, message, details, postToSlack=true}) => {
    console.log(`${title || ""} ${message || ""} ${details || ""}`)
    if (postToSlack) {
        postMessage({ title, message, details, type: "news" })
    }
}; 

exports.logError = async ({title, message, details, postToSlack=true}) => {
    console.log(`${title || ""} ${message || ""} ${details || ""}`)
    if (postToSlack) {
        postMessage({ title, message, details, type: "error" })
    }
}; 