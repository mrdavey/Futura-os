const fetch = require("node-fetch");
const { retry } = require("./retry")
const { internalHeaderAuthKey } = require("../constants");

/**
 * Makes an internal POST request to the desired endpoint
 * @param {String} url The endpoint to fetch
 * @param {{}} bodyData The body, as a JS Dictionary object
 * @returns {Object} If successful, returns JSON result as object
 * @returns {Error} If there is an error, an Error object will be returned
 */
exports.makeInternalRequest = async (url, bodyData) => {
	let header = {
		"Internal-Auth": internalHeaderAuthKey
	}
	return await retry(async () => await makeRequest(url, bodyData, header), `makeInternalRequest ${url}`).catch((e) => {
		throw e;
	});
};

/**
 * Makes an external request (POST or GET) to the desired endpoint
 * @param {String} url The endpoint to fetch
 * @param {{}} bodyData Optional. The body, as a JS Dictionary object
 * @param {{}} headers The headers to include. Note: `Content-Type JSON` is already included.
 * @param {String} method Optional. The method, i.e. `DELETE`
 * @returns {Object} If successful, returns JSON result as object
 * @returns {Error} If there is an error, an Error object will be returned
 */
exports.makeExternalRequest = async (url, bodyData, headers, method) => {
	return await retry(async () => await makeRequest(url, bodyData, headers, method), `makeExternalRequest ${url}`).catch((e) => {
		throw e;
	});
};

async function makeRequest(url, body, headers, method) {
	let newHeaders = {
		"Content-Type": "application/json",
		...headers
	};

	let fetchOptions = {}

	if (body) {
		fetchOptions = {
			method: "POST",
			body: JSON.stringify(body),
			headers: newHeaders
		}
	} else {
		fetchOptions = {
			method: method ? method : "GET",
			headers: newHeaders
		};
	}

	let response = await fetch(url, fetchOptions).catch((e) => {
		throw e;
	});

	let status = response.status;
	let statusText = response.statusText;

	if (!status === 200) {
		let error = Error(`Fetch error: ${status}: ${statusText}`);
		throw error;
	}

	let result = await response.json().catch(e => { 
		// No JSON response body returned
		return
	})
	return result
}