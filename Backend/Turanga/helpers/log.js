const { postMessage } = require("./slack");

exports.log = ({ title, message, details, postToSlack=false }) => {
    if (postToSlack) {
        postMessage({ title, message, details, type: "status" })
    }
    console.log(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
}

exports.logNews = ({ title, message, details, postToSlack=true }) => {
    if (postToSlack) {
        postMessage({ title, message, details, type: "news" })
    }
    console.log(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
}

exports.logError = async ({ title, message, details, postToSlack=true }) => {
    if (postToSlack) {
		await postMessage({ title, message, details, type: "error" });
	}
    console.error(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
};
