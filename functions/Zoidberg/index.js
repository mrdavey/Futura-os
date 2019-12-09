const { makeInternalRequest } = require("../helpers/fetch")
const {
	onHttps,
	getKillSwitch,
	getWorkingCapital,
	toggleKillSwitch,
    setDefaultWorkingCapital,
    recordProfitsTaken,
    resetTradeCounter, 
    resetWorkingCapital
} = require("../Firebase");
const { externalHeaderAuthKey, killSwitchHeaderAuthKey, internalHeaderAuthKey, zoidbergGetKillSwitchEndpoint } = require("../constants");
const { log, logNews, logError } = require("../helpers/log");

//
// Kill switch
//

exports.toggleZoidbergKillSwitch = (isProd) => {
    return onHttps(async (req, res) => {
        let killSwitchAuth = req.get("KillSwitch-Auth");
        if (killSwitchAuth && killSwitchAuth === killSwitchHeaderAuthKey) {
            let result = await toggleKillSwitch(isProd);
            res.json({ killSwitch: result })
        } else {
            res.sendStatus(404)
        }
    })
}

exports.getZoidbergKillSwitch = (isProd) => {
	return onHttps(async (req, res) => {
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
			let result = await getKillSwitch(isProd);
			res.json({ killSwitch: result });
		} else {
			res.sendStatus(404);
		}
	});
};

exports.checkZoigbergKillSwitch = async () => {
    let result = await makeInternalRequest(zoidbergGetKillSwitchEndpoint);
    return result.killSwitch
}

//
// Working capital
// 

exports.setNewDefaultWorkingCapital = (isProd) => {
    return onHttps(async (req, res) => {
        let external = req.get("External-Auth");
        if (external && external === externalHeaderAuthKey) {
            let newWorkingCapital = Number(req.body.newWorkingCapital);
            await setDefaultWorkingCapital(isProd, newWorkingCapital).catch(e => {
                logError({ title: "Error in setNewDefaultWorkingCapital", message: e.message, details: e.stack });
                res.sendStatus(412);
                return
            });

            // Should also delete `currency-workingCapital` if currently no positions
            // Will auto-recreate doc using the new default if `currency-workingCapital` does not exist

			res.sendStatus(200);
		} else {
			res.sendStatus(404);
		}
    });
}

//
// Profits
//

exports.getProfits = (isProd) => {
    return onHttps(async (req, res) => {
        let external = req.get("External-Auth");
        if (external && external === externalHeaderAuthKey) {
            let currency = req.body.currency;
            let exchange = req.body.exchange;
            let pairedAsset = req.body.pairedAsset;

            let profits = await _getProfits(isProd, currency, exchange, pairedAsset).catch((e) => {
                logError({ title: "Error in getProfits", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
            res.json({ profits });
        } else {
            res.sendStatus(404);
        }
    });
}

exports.takeProfits = (isProd) => {
    return onHttps(async (req, res) => {
        let external = req.get("External-Auth");
        if (external && external === externalHeaderAuthKey) {
            let currency = req.body.currency;
            let exchange = req.body.exchange;
            let pairedAsset = req.body.pairedAsset;

            await _takeProfits(isProd, currency, exchange, pairedAsset).catch((e) => {
                logError({ title: "Error in takeProfits", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    });
}

//
// Internal
//

async function _getProfits(isProd, currency, exchange, pairedAsset) {
    let { currentWC, defaultWC } = await getWorkingCapital(isProd, currency, exchange, pairedAsset);
    console.log(currentWC, defaultWC)
    let profit = Number(currentWC) - Number(defaultWC)
    return profit
}

async function _takeProfits(isProd, currency, exchange, pairedAsset) {
    try {
        let profits = await _getProfits(isProd, currency, exchange, pairedAsset)
        logNews({
            title: `🦀 Zoidberg profits to be withdrawn`,
            message: `Profits for ${currency}-${pairedAsset} on ${exchange} are: ${profits}`,
            details: `🚨 Currently unimplemented, manually withdraw on ${exchange}: ${profits}`,
        });
        
        // TODO: - Placeholder for taking profits (requires trade permissions on CB)
        // Get payment methods on CB - https://docs.pro.coinbase.com/#payment-methods
        // withdraw EUR - https://docs.pro.coinbase.com/#withdrawals
    
        await recordProfitsTaken(isProd, currency, exchange, pairedAsset, profits)
        await resetWorkingCapital(isProd, currency, exchange, pairedAsset)
        await resetTradeCounter(isProd, currency, exchange, pairedAsset)
    } catch (e) {
        throw e
    }
}