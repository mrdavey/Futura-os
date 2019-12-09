const Compute = require('@google-cloud/compute');
const { onDate, onScheduleHours, onHttps } = require("../Firebase");

const { log, logNews, logError } = require("../helpers/log");
const { internalHeaderAuthKey } = require("../constants");

const compute = new Compute();

exports.startVM = () => {
    return onScheduleHours(6, async (context) => {
        let zone = process.env.TURANGA_VM_REGION;
        let name = "turanga"

        try {
            let data = await compute
                .zone(zone)
                .vm(name)
                .start()
            
            await data[0]
    
            log({
                title: "👁 Turanga VM started",
                message: `Booting up...`,
                postToSlack: true
            })
        } catch (e) {
            logError({
                title: "👁 Turanga VM Error!",
                message: e.message,
                details: e.stack
            })
        }
    })
}

/**
 * This function is called from the VM, to shut itself down.
 * If the VM does not complete its task properly, then it may not call
 * this function. Hence see `stopVMAutomated()`
 */
exports.stopVM = () => {
    return onHttps(async (req, res) => {
        let internal = req.get("Internal-Auth");
        if (internal && internal === internalHeaderAuthKey) {
            await shutDownVM()
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    })
}

/**
 * This function is the emergency shutdown, so if something goes wrong, at least the
 * VM fully restarts once a day. 
 */
exports.stopVMAutomated = () => {
    return onDate("0 21 * * *", async () => { // 10pm (AMS) everyday
        await shutDownVM()
    })
}

async function shutDownVM() {
    let zone = process.env.TURANGA_VM_REGION;
    let name = "turanga"

    try {
        let data = await compute
            .zone(zone)
            .vm(name)
            .stop()

        await data[0]

        log({
            title: "👁 Turanga VM stopping",
            message: `Successfully shut down VM`,
            postToSlack: true
        })
    } catch (e) {
        logError({
            title: "👁 Turanga VM Error!",
            message: e.message,
            details: e.stack
        })
    }
}