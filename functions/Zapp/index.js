const { onHttps, onSchedule, onUpdate, getPosition } = require("../Firebase");
const { checkZoigbergKillSwitch } = require("../Zoidberg");
const { cbSubmitBuyOrder, cbSubmitSellOrder, cbCheckOrder, createNewStopLoss } = require("./coinbase/orders");
const { log, logError } = require("../helpers/log");
const { internalHeaderAuthKey, positionsCollection } = require("../constants");

exports.coinbaseBuy = (isProd) => {
    return onHttps(async (req, res) => {
        let killSwitchIsActive = await checkZoigbergKillSwitch();
        if (killSwitchIsActive) {
            log({ message: "Zoidberg kill switch is active" })
            res.sendStatus(412);
            return
        }

        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let entry = req.body.entry;
            let amountToBuy = req.body.amountToBuy;
            let workingCapital = req.body.workingCapital;
            let lossThreshold = req.body.lossThreshold;

            if (!entry.price || !amountToBuy || !workingCapital || !lossThreshold) {
				logError({
					title: "Zapp Coinbase Buy error",
					message: `Entry does not have the required fields for a buy: ${JSON.stringify(entry)}`
				});
				res.sendStatus(412);
				return;
			}
            
            await cbSubmitBuyOrder(isProd, entry, amountToBuy, workingCapital, lossThreshold).catch((e) => {
				logError({ title: "Zapp Coinbase Buy error", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    })
}

exports.coinbaseSell = (isProd) => {
    return onHttps(async (req, res) => {
        let killSwitchIsActive = await checkZoigbergKillSwitch();
        if (killSwitchIsActive) {
            log({ message: "Zoidberg kill switch is active" })
            res.sendStatus(412);
            return
        }

        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let entry = req.body.entry;
            let position = req.body.position;
            let amountBought = position.amountBought;
            if (!entry.price || !amountBought) {
				logError({
					title: "Zapp Coinbase Sell error",
					message: `Entry does not have the required fields for a sell: ${JSON.stringify(entry)}`
				});
				res.sendStatus(412);
				return;
			}

            await cbSubmitSellOrder(isProd, entry, position).catch((e) => {
				logError({ title: "Zapp Coinbase Sell error", message: e.message, details: e.stack });
				res.sendStatus(412);
				return;
			});
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    })
}

exports.coinbaseCheckOrderContinual = (isProd, currency, exchange, pairedAsset) => {
    return onSchedule(4, async (context) => {
        let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" });
			return;
        }
        
        let result = await _checkCoinbaseOrder(isProd, exchange, currency, pairedAsset).catch(e => {
            logError({ title: `Error with coinbaseCheckOrderContinual`, message: e.message, details: e.stack })
            return
        });
        if (result) {
            log({ message: `Auotmated check for ${exchange}-${currency}-${pairedAsset}: ${JSON.stringify(result)}`})
        }
    })
};

exports.coinbaseAutoUpdateStopLossOrder = (isProd, exchange, pairedAsset) => {
    let documentPath = (isProd ? positionsCollection.prod : positionsCollection.dev) + `/{currency}/${exchange}/${pairedAsset}-tradeSettings`;

    return onUpdate(documentPath, async (change, context) => {
        let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" });
			return;
        }
        
        let newTradeSettings = change.after.data();
        let newLossThreshold = newTradeSettings.lossThreshold
        let oldTradeSettings = change.before.data();
        let oldLossThreshold = oldTradeSettings.lossThreshold

        let currency = context.params.currency;

        if (newLossThreshold !== oldLossThreshold) {
            await createNewStopLoss(isProd, exchange, currency, pairedAsset, newTradeSettings)
        } else {
            log({ message: "No change in lossThresholds" })
        }
    })
};

// Used for internal testing to get the status of orders via HTTP
exports.coinbaseCheckOrder = (isProd) => {
    return onHttps(async (req, res) => {
        let killSwitchIsActive = await checkZoigbergKillSwitch();
		if (killSwitchIsActive) {
			log({ message: "Zoidberg kill switch is active" });
			res.sendStatus(412);
			return;
        }
        
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            let exchange = req.body.exchange
            let currency = req.body.currency
            let pairedAsset = req.body.pairedAsset

            let result = await _checkCoinbaseOrder(isProd, exchange, currency, pairedAsset).catch(e => {
                logError({ title: `Error with coinbaseCheckOrder`, message: e.message, details: e.stack})
                res.sendStatus(412)
                return
            });
            if (result) {
                res.json(result)
            } else {
                res.sendStatus(412)
            }
        } else {
            res.sendStatus(404);
        }
    })
}

async function _checkCoinbaseOrder(isProd, exchange, currency, pairedAsset) {
    try {
        let existingPosition = await getPosition(isProd, currency, exchange, pairedAsset)
        if (existingPosition) {
            if (!exchange || !currency || !pairedAsset) {
                let message = `Field is missing: ${JSON.stringify(req.body)}`;
                throw Error(message)
            }
    
            let result = await cbCheckOrder(isProd, exchange, currency, pairedAsset)
            return result
        } else {
            let result = `No exisiting position for ${exchange}-${currency}-${pairedAsset}`;
            log({ message: result })
            return { result }
        }
    } catch (e) {
        let message = `Zapp Coinbase Check error: ${e.message}`;
        throw Error(message)
    }
}