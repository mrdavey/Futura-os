const fetch = require("node-fetch");

/**
 * Makes an internal POST request to the desired endpoint
 * @param {String} url The endpoint to fetch
 * @param {{}} bodyData The body, as a JS Dictionary object
 * @returns {Object} If successful, returns JSON result as object
 * @returns {Error} If there is an error, an Error object will be returned
 */
exports.makeInternalRequest = async (url, bodyData) => {
	let header = {
		"Internal-Auth": process.env.FUTURA_AUTH_INTERNAL
	};
	return await makeRequest(url, bodyData, header).catch((e) => {
		throw e;
	});
};

exports.makeUnauthenticatedRequest = async (url, bodyData) => {
	return await makeRequest(url, bodyData, []).catch((e) => {
		throw e;
	});
}

exports.makeAuthenticatedRequest = async (url, bodyData, authName, authKey) => {
	let header = {
		[authName]: authKey
	}

	return await makeRequest(url, bodyData, header).catch((e) => {
		throw e;
	});
}

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