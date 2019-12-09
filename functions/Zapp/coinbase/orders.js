const m = require("moment");
const { convertToFirebaseTimestamp, convertMomentToFirebaseTimestamp, getEnvMode, getWorkingCapital, getPosition, recordTradeForBacktestFarnsworth, saveNewBuyPosition, updatePosition, updateWorkingCapital, updateTradeCounter } = require("../../Firebase");

const { log, logNews, logError } = require("../../helpers/log");
const { getDecimalNumbers, round } = require("../../helpers/numbers")
const { makeCoinbaseCall, getProducts } = require("./helpers");

let ordersEndpoint = "/orders"

exports.cbSubmitBuyOrder = async (isProd, entry, amountToBuy, workingCapital, lossThreshold) => {
    log({ message: "Attempting buy on CB..." });

    if (getEnvMode === "backtest") {
        console.log("In backtest mode")
        let amountBought = Number(amountToBuy)
        let buyPrice = Number(entry.price)
		let newEntry = { ...entry, amountBought, buyPrice, buyFees: amountBought * buyPrice * 0.0025, orderId: "buyOrderId", lossThreshold };
        
        // Record current position
        await saveNewBuyPosition(isProd, entry.currency, entry.exchange, entry.pairedAsset, newEntry, workingCapital, entry.timeStamp).catch(
			(e) => {
				throw e;
			}
        );
		return;
	}

	let productId = `${entry.currency}-${entry.pairedAsset}`;
	let productProperties = await getCbProducts("coinbase", productId).catch((e) => {
		throw e;
	});
	let quoteDecimals = getDecimalNumbers(productProperties.quoteIncrement);
	let baseDecimals = getDecimalNumbers(productProperties.baseIncrement);

	if (amountToBuy >= productProperties.minSize && amountToBuy <= productProperties.maxSize) {
		let priceToBuy = round(entry.price, quoteDecimals);
		amountToBuy = round(amountToBuy, baseDecimals);
		log({ message: `Buying at rounded price:  ${priceToBuy}, original price: ${entry.price}, amountToBuy: ${amountToBuy}` });

		// Market order
		let body = {
			type: "market",
			funds: round(Number(amountToBuy) * Number(priceToBuy), 2), // limits the amount of fiat
			size: amountToBuy, // limits the amount of BTC
			side: "buy",
			product_id: productId
		};

        let result = await makeCoinbaseCall(ordersEndpoint, body).catch((e) => {
			throw e;
		});

		let resultString = JSON.stringify(result);
		let orderId = result.id;

		if (orderId) {
            let newEntry = { ...entry, amountBought: Number(amountToBuy), buyPrice: Number(priceToBuy), orderId, lossThreshold };
			await saveNewBuyPosition(isProd, entry.currency, entry.exchange, entry.pairedAsset, newEntry, workingCapital, entry.timeStamp).catch(
				(e) => {
					throw e;
				}
			);

            logNews({
				title: `🙏 Zapp ${productId} buy order submitted`,
				message: `Buying ${amountToBuy} at ${entry.price} on ${entry.exchange}`,
				// details: resultString,
			});
		} else {
			logError({ title: `Zapp error placing buy on ${entry.exchange}`, message: `Response: ${resultString}` });
		}
	} else {
		logError({
			title: `Zapp error placing buy on ${entry.exchange}`,
			message: `Didn't satisfy pre-conditions, amountToBuy: ${amountToBuy}, minSize: ${minSize}, maxSize: ${maxSize}`
		});
	}
};

exports.cbSubmitSellOrder = async (isProd, entry, position) => {
    log({ message:"Attempting sell on cb..."})

    if (getEnvMode === "backtest") {
        let amountBought = Number(position.amountBought);
        let sellPrice = Number(entry.price);
        let sellFees = amountBought * sellPrice * 0.0025
        let currency= entry.currency
        let exchange= entry.exchange
        let pairedAsset= entry.pairedAsset;

        let { currentWC, defaultWC } = await getWorkingCapital(isProd, currency, exchange, pairedAsset);

        let grossProfit = (amountBought * sellPrice) - Number(currentWC) - Number(sellFees) - Number(position.buyFees);
        log({ message: `${grossProfit > 0 ? "Gross Profit" : "Gross Loss"}: ${grossProfit} (sell fee: ${sellFees})` });

        let newWorkingCapital = await _topUpWorkingCapital(isProd, currentWC, defaultWC, grossProfit, currency, exchange, pairedAsset);

        let updatedPosition = {
			hasPosition: false,
			amountSold: amountBought,
			endWorkingCapital: newWorkingCapital,
			sellFees,
			sellPrice,
			// sellTimeStamp: convertMomentToFirebaseTimestamp(m()),
			grossProfit,
			sellOrderId: "sellOrderId",
			orderId: null,
			doneReason: ""
		};
        await updatePosition(isProd, currency, exchange, pairedAsset, updatedPosition);
        await updateTradeCounter(isProd, currency, exchange, pairedAsset);
        await recordTradeForBacktestFarnsworth(entry, position, updatedPosition)
        
		return;
	}
    
    try {
        let amountBought = position.amountBought;
        let exchange = entry.exchange;
        let settled = position.settled;

        // Check if sell order has settled
        if (!settled) {
            logNews({ title: `Zapp ${exchange} sell info`, message: `Current order is not yet settled, checking again according to Zapp autocheck`, details: JSON.stringify(position)})
            return
        }

        // Cancel stop orders (if there are any)
        await cancelStopOrder(isProd, entry.currency, exchange, entry.pairedAsset);

        // Make sure we're using the right product specs in the order
        let productId = `${entry.currency}-${entry.pairedAsset}`;
        let productProperties = await getCbProducts("coinbase", productId)

        let decimals = getDecimalNumbers(productProperties.quoteIncrement);
        let priceToSell = round(entry.price, decimals)
        log({ message: `Selling at rounded price:  ${priceToSell}, original price: ${entry.price}, amountBought: ${amountBought}` });

        // Place the sell order

        // Market order
        // let body = {
		// 	type: "market",
        //     funds: round(Number(priceToSell) * Number(amountBought), 2), // limits the amount of fiat
        //     size: amountBought, // limits the amount of BTC
		// 	side: "sell",
		// 	product_id: productId
        // };
        
        // Limit order
        let body = {
            type: "limit",
            price: Number(priceToSell),
            size: amountBought, // limits the amount of BTC
			side: "sell",
			product_id: productId
		};

        let result = await makeCoinbaseCall(ordersEndpoint, body).catch((e) => {
			throw e;
		});

        let resultString = JSON.stringify(result);
        let orderId = result.id
        
        if (orderId) {
            let data = { orderId, sellOrderId: orderId, sellPrice: priceToSell, sellScore: entry.score, doneReason: "", settled: false };
            await updatePosition(isProd, entry.currency, exchange, entry.pairedAsset, data)

            logNews({
				title: `🙏 Zapp ${productId} sell order submitted`,
				message: `Selling ${amountBought} at ${entry.price} on ${exchange}`,
				// details: resultString,
			});
        } else {
            logError({ title: `Zapp error placing buy on ${exchange}`, message: `Response: ${resultString}` });
        }
    } catch (e) {
        throw e
    }
}

/**
 * Checks the currentPositions doc and evaluates the status of the order
 */
exports.cbCheckOrder = async (isProd, exchange, currency, pairedAsset) => {
    try {
        let { currentOrder, doneReason, lossThreshold } = await getCurrentCbOrder(isProd, currency, exchange, pairedAsset);
        
        if (doneReason) {
            log({
				title: `Already settled`,
                message: `Evaluated for ${currency}-${exchange}-${pairedAsset} with doneReason: ${doneReason}. Waiting for Leela action..`,
			});
            return null;
        }

        if (!currentOrder) {
			log({ title: `No valid orderId to check`, message: `Evaluated for ${currency}-${exchange}-${pairedAsset}` });
			return null;
        }

        let settled = currentOrder.settled;
        if (settled) {
            let fillFees = Number(currentOrder.fill_fees)
            let side = currentOrder.side
            let doneReason = currentOrder.done_reason;
            let filledSize = Number(currentOrder.filled_size || 1);

            let isLimit = currentOrder.type === "limit"
            let fillPrice = isLimit
				? Number(round(currentOrder.executed_value / currentOrder.filled_size, 2))
				: Number(round(Number(currentOrder.funds || 0) / filledSize, 2));

            log({ message: ` --- DEBUG: isLimit: ${isLimit}, fillPrice: ${fillPrice}`})

            if (side === "buy") {

                //
                // Just completed a BUY order, so set up emergency stop loss
                //

                let stopLossEntry = await cbCreateStopLoss({
					currency,
					pairedAsset,
					buyPrice: fillPrice,
					amountToSell: filledSize,
					lossThreshold
				});
                let stopOrderId = stopLossEntry.id

                let entry = {
					amountBought: filledSize,
					buyPrice: fillPrice,
					buyFees: fillFees,
					settled: true,
					doneReason,
					orderId: stopOrderId,
					stopOrderId
				};
                await updatePosition(isProd, currency, exchange, pairedAsset, entry);
            } else {

                //
                // Just completed a SELL order
                //
                
                let position = await getPosition(isProd, currency, exchange, pairedAsset)
                let positionTimeStamp = convertToFirebaseTimestamp(position.buyTimeStamp);
                
                // Cancel stop orders (if there are any)
                await cancelStopOrder(isProd, currency, exchange, pairedAsset);

                let { currentWC, defaultWC } = await getWorkingCapital(isProd, currency, exchange, pairedAsset);

                log({ message: `Working capital status before: ${currentWC}`});

                let grossProfit = Number(currentOrder.executed_value) - Number(currentWC) - Number(fillFees)
					// - Number(position.buyFees);
                log({ message: `sellAmount: ${filledSize}, currentWC: ${currentWC}, sellFees: ${fillFees}, position.buyFees: ${position.buyFees}, sell price: ${fillPrice}`})
                log({ message: `${grossProfit > 0 ? "Gross Profit" : "Gross Loss"}: ${grossProfit} (sell fee: ${fillFees})`});

                let tradeTime = m().diff(m(positionTimeStamp.toDate()));
                log({ message: `tradeTime (m): ${tradeTime / 1000 / 60}`});

                let newWorkingCapital = await _topUpWorkingCapital(isProd, currentWC, defaultWC, grossProfit, currency, exchange, pairedAsset);

                let updatedPosition = {
					hasPosition: false,
					amountSold: filledSize,
					endWorkingCapital: newWorkingCapital,
					sellFees: fillFees,
                    sellPrice: fillPrice,
                    sellTimeStamp: convertMomentToFirebaseTimestamp(m()),
					grossProfit,
                    sellOrderId: currentOrder.id,
                    orderId: null,
					doneReason
                };
                await updatePosition(isProd, currency, exchange, pairedAsset, updatedPosition);
                await updateTradeCounter(isProd, currency, exchange, pairedAsset);
            }

            log({ title: "currentOrder", message: JSON.stringify(currentOrder)})

            if (doneReason === "filled") {
                logNews({
                    title: `👨‍🚀 Zapp auto ${currentOrder.product_id} ${isLimit ? "limit" : "market"} ${side} order filled`,
					message: `${side === "buy" ? "Bought" : "Sold"} ${filledSize} ${
						currentOrder.product_id
                    } with fillPrice: ${fillPrice}, actual price: ${round(currentOrder.executed_value / currentOrder.filled_size, 2)}`,
                    details: JSON.stringify(currentOrder)
				});
            } else {
                logError({
					title: `🤷‍♂️ Zapp auto ${currentOrder.product_id} ${side} order not filled`,
                    message: `${side === "buy" ? "Buy" : "Sell"} order did not fill`,
                    details: JSON.stringify(currentOrder),
                    postToSlack: true
				});
            }
            
            return currentOrder
        } else if (currentOrder.message) {
            logError({
                title: `Zapp order error`,
                message: currentOrder.message,
                details: JSON.stringify(currentOrder),
                postToSlack: true
            });
            return null
        } else if (currentOrder.stop) {
            log({ message: `${exchange}-${currency}-${pairedAsset} stop ${currentOrder.stop} order not filled: ${currentOrder.status}, stop price: ${currentOrder.stop_price}`})
            return null
        } else {
            log({ message: `${exchange}-${currency}-${pairedAsset} order not yet filled: ${currentOrder.status}`})
            console.log(JSON.stringify(currentOrder))
            return null
        }
    } catch (e) {
        throw e
    }
};

/**
 * Cancels current stop loss and creates a new stop loss, dependant on new trade settings
 */

exports.createNewStopLoss = async (isProd, exchange, currency, pairedAsset, newSettings) => {
    try {
        let currentPosition = await cancelStopOrder(isProd, currency, exchange, pairedAsset);
        let hasPosition = currentPosition.hasPosition
    
        if (hasPosition) {
            let stopLossEntry = await cbCreateStopLoss({
                currency,
                pairedAsset,
                buyPrice: currentPosition.buyPrice,
                amountToSell: currentPosition.amountBought,
                lossThreshold: newSettings.lossThreshold
            });
            
            log({ message: `Updated stop loss order for ${exchange}-${currency}-${pairedAsset}`, postToSlack: true })
            
            let stopOrderId = stopLossEntry.id
            let entry = { orderId: stopOrderId, stopOrderId };
            await updatePosition(isProd, currency, exchange, pairedAsset, entry);
        } else {
            log({ message: `No stop loss update needed for ${exchange}-${currency}-${pairedAsset}` })
        }
    } catch (e) {
        throw e
    }
}

/**
 * Creates an emergency stop loss order in Coinbase.
 * The actual stop loss is checked by Leela every 'checking interval', to ensure backtesting results are
 * as close as possible to reality, and hence the continually updated trade settings.
 * 
 * This emergency stop loss is only used as a hard stop in case a sudden dip beyond our preferred stop loss.
 */
async function cbCreateStopLoss({ currency, pairedAsset, buyPrice, amountToSell, lossThreshold}) {
    let emergencyLossThreshold = lossThreshold - (lossThreshold * 0.015) // 1.5% below desired lossThreshold
    let productId = `${currency}-${pairedAsset}`;
    let productProperties = await getCbProducts("coinbase", productId).catch((e) => {
        throw e;
    });

    let baseDecimals = getDecimalNumbers(productProperties.baseIncrement);

    if (amountToSell >= productProperties.minSize && amountToSell <= productProperties.maxSize) {
        let priceToSell = round(Number(buyPrice) * Number(emergencyLossThreshold), 2);
        amountToSell = round(amountToSell, baseDecimals);

        // Stop losss limit order
        let body = {
            size: amountToSell,
            price: priceToSell,
            side: "sell",
            product_id: productId,
            stop: "loss",
            stop_price: round(Number(priceToSell) * 1.0005, 2) // Post the limit order when 0.05% `pairedAsset` units from our priceToSell
        };

        let result = await makeCoinbaseCall(ordersEndpoint, body).catch(e => {
            throw e
        });

        return result;
    } else {
        throw Error(`Amount to sell is not correct, amountToSell: ${amountToSell}, minSize: ${productProperties.minSize}, maxSize: ${productProperties.maxSize}`);
    }
}

async function _topUpWorkingCapital(isProd, currentWC, defaultWC, grossProfit, currency, exchange, pairedAsset) {
	try {
		let newWorkingCapital = Number(currentWC);

		if (grossProfit < 0) {
			newWorkingCapital = newWorkingCapital + grossProfit; // minus the gross from working cap
		}

		// Top up the workingCapital with profits so we're always using at least the amount we started with
		if (newWorkingCapital < defaultWC) {
			let topupRemaining = defaultWC - currentWC;
			log({ message: `💰 Need to top up: ${topupRemaining}` });

			if (grossProfit >= 0) {
				let profits = 0;

				if (grossProfit > topupRemaining) {
					profits = grossProfit - topupRemaining;
					newWorkingCapital = newWorkingCapital + grossProfit;
					log({ message: `💰 Topped up with profits. Remaining profits: ${profits}, adding to working capital base to compound.` });
					await updateWorkingCapital(isProd, currency, exchange, pairedAsset, newWorkingCapital);
				} else {
					newWorkingCapital = newWorkingCapital + grossProfit;
					log({ message: `💰 Topped up with profits. Used all profits of ${grossProfit}` });
					await updateWorkingCapital(isProd, currency, exchange, pairedAsset, newWorkingCapital);
				}
			} else {
				log({ message: `💰 Unable to topup, made a loss: ${grossProfit}` });
				// We already deducted the losses from the working capital futher up
				await updateWorkingCapital(isProd, currency, exchange, pairedAsset, newWorkingCapital);
			}
		} else {
			// Working capital is looking good, compound the profits with WC!
			if (grossProfit > 0) {
				newWorkingCapital = newWorkingCapital + grossProfit;
				log({ message: `💰 Working capital is healthy ${newWorkingCapital}, no need to top up with profits: ${grossProfit}.` });
			} else {
				log({ message: `💰 Working capital is healthy ${newWorkingCapital}, but made a loss ${grossProfit}.` });
			}
			await updateWorkingCapital(isProd, currency, exchange, pairedAsset, newWorkingCapital);
		}

		log({ message: `💰 Working capital running total ${newWorkingCapital}` });
		return newWorkingCapital;
	} catch (e) {
		throw e;
	}
}

async function getCurrentCbOrder(isProd, currency, exchange, pairedAsset) {
    try {
        let position = await getPosition(isProd, currency, exchange, pairedAsset);
        let orderId = position.orderId;
        let doneReason = position.doneReason;
        let stopOrderId = position.stopOrderId;
        let lossThreshold = position.lossThreshold;

        // If order is done and there is no stop order present
        if (doneReason && !stopOrderId) {
            log({message: `Done reason given: ${doneReason}`})
            return { doneReason };
		}

        if (orderId) {
            let endpoint = `/orders/${orderId}`
            let result = await makeCoinbaseCall(endpoint);
            return { currentOrder: result, lossThreshold };
        } else {
            return { currentOrder: null };
        }
    } catch (e) {
        throw e
    }
}

async function cancelStopOrder(isProd, currency, exchange, pairedAsset) {
    try {
        let position = await getPosition(isProd, currency, exchange, pairedAsset);
        let stopOrderId = position.stopOrderId;

        if (stopOrderId) {
            let endpoint = `/orders/${stopOrderId}`
            let method = "DELETE"
            let result = await makeCoinbaseCall(endpoint, null, method);
            log({ message: `Stop order cancelled with result: ${JSON.stringify(result)}`})
            delete position.stopOrderId
        } else {
            log({ message: "No stopOrderId available"})
        }
        return position
	} catch (e) {
		throw e;
	}
}

async function getCbProducts(exchange, productId) {
    try {
        let products = await getProducts();
        let productEntry = (products.filter((entry) => entry.id === productId))[0];

        let minSize = productEntry["base_min_size"]
        let maxSize = productEntry["base_max_size"];
        let baseIncrement = productEntry["base_increment"]; // BTC
        let quoteIncrement = productEntry["quote_increment"]; // EUR
        let status = productEntry["status"];

        if (status === "online") {
            return { minSize, maxSize, baseIncrement, quoteIncrement }
        } else {
            logError({ title: `Zapp error placing buy on ${exchange}`, message: `Couldn't get ${exchange} pricing info. ${exchange} returned status: ${status} for ${productId}` });
            throw Error(
				`Zapp error placing buy on ${exchange}, Message: Couldn't get ${exchange} pricing info. ${exchange} returned status: ${status} for ${productId}`
			);
        }
    } catch (e) {
        logError({ title: `Zapp error placing buy on ${exchange}`, message: e.message, details: e.stack });
        throw e
    }
}