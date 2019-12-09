const fetch = require("node-fetch")

let hermesLocalEndpoint = "http://localhost:3001";
let hermesRemoteEndpoint = "https://sentiment-aad7f.appspot.com";

async function analyseText(textArray) {
    try {
        let url = process.env.NODE_ENV === "development" ? hermesLocalEndpoint + "/analyse/" : hermesRemoteEndpoint + "/analyse/"
    
        let response = await fetch(url, { 
            method: "POST",
            body: JSON.stringify({textArray}),
            headers: { 'Content-Type': 'application/json' },
        })
    
        let result = await response.json().catch(e => {
            throw Error(`${response.status}: ${response.statusText}`)
        })
        return result
    } catch (e) {
        throw e
    }
}

async function getScore(text) {
    try {
        let url = process.env.NODE_ENV === "development" ? hermesLocalEndpoint + "/analyse/getScore" : hermesRemoteEndpoint + "/analyse/getScore"

        let response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({text}),
            headers: { 'Content-Type': 'application/json' },
        })

        let result = await response.json().catch(e => {
            throw Error(`${response.status}: ${response.statusText}`)
        })
        return result
    } catch (e) {
        throw e
    }
}

async function saveScore(word, score) {
    try {
        let url = process.env.NODE_ENV === "development" ? hermesLocalEndpoint + "/analyse/saveScore" : hermesRemoteEndpoint + "/analyse/saveScore"

        let response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ word, score }),
            headers: { 'Content-Type': 'application/json' },
        })

        if (response.status !== 200) {
            throw Error(`${response.status}: ${response.statusText}`)
        }
    } catch (e) {
        throw e
    }
}

export { analyseText, getScore, saveScore }