const functions = require("firebase-functions");
const crypto = require('crypto');
const { makeExternalRequest } = require("../../helpers/fetch");
const { coinbaseEndpoint } = require("../../constants")

exports.getProducts = async () => {
    let requestPath = "/products"
    return await makeExternalRequest("https://api.pro.coinbase.com" + requestPath);
}

/**
 * Makes a call to the Coinbase Pro API
 * @param {String} requestPath The API feature that is being used
 * @param {{}} bodyData Optional. The data to use in the POST body
 * @param {String} method Optional. The method, i.e. `DELETE`
 */
exports.makeCoinbaseCall = async (requestPath, bodyData, method) => {
    let apiKey;
    let apiPass;

    if (functions.config().env.value === "prod") {
        apiKey = process.env.API_COINBASE_PROD_KEY
        apiPass = process.env.API_COINBASE_PROD_PASSWORD 
    } else {
        apiKey = process.env.API_COINBASE_DEBUG_KEY
        apiPass = process.env.API_COINBASE_DEBUG_PASSWORD
    }

    let timeStamp = Date.now() / 1000;

    let hmac = getHmac(timeStamp, requestPath, bodyData, bodyData ? "POST" : (method ? method : "GET"));

    let headers = {
        "CB-ACCESS-KEY": apiKey,
        "CB-ACCESS-SIGN": hmac,
        "CB-ACCESS-TIMESTAMP": timeStamp,
        "CB-ACCESS-PASSPHRASE": apiPass
    }

    console.log(`Using endpoint: ${coinbaseEndpoint}`);
    return await makeExternalRequest(coinbaseEndpoint + requestPath, bodyData, headers, method).catch(e => { throw e });
}

const getHmac = (timeStamp, requestPath, bodyData, method) => {
    let apiSecret;

    if (functions.config().env.value === "prod") {
        apiSecret = process.env.API_COINBASE_PROD_SECRET
    } else {
        apiSecret = process.env.API_COINBASE_DEBUG_SECRET
    }
    
    let bodyString;
    let preHash

    if (bodyData) {
        bodyString = JSON.stringify(bodyData);
        preHash = timeStamp + method + requestPath + bodyString;
    } else {
        preHash = timeStamp + method + requestPath;
    }

	// decode the base64 secret
	let key = Buffer(apiSecret, "base64");

	// create a sha256 hmac with the secret
	let hmac = crypto.createHmac("sha256", key);

	// sign the require message with the hmac
	// and finally base64 encode the result
	return hmac.update(preHash).digest("base64");
};