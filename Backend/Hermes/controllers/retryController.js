const retry = require('async-retry')
const { log } = require('./logController')

let maxAttempts = 10
/**
 * More in documentation: https://github.com/zeit/async-retry#readme
 * @param fn The function to async retry
 * @param fnName The name of the function
 */
exports.retry = async (fn, fnName) => {
    return await retry(async () => {
        return await fn()
    }, {
        retries: maxAttempts, 
        onRetry: (e, attempt) => {
            log({
                title: `🤓 Hermes Retrying ${fnName}`,
                message: `${attempt}: ${e.message}`,
                postToSlack: true
            })
        }
    })
}