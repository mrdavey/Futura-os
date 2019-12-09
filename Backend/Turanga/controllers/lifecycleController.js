const { makeInternalRequest, makeAuthenticatedRequest } = require("../helpers/fetch")

exports.disableKillSwitch = async () => {
    let getKillSwitchEndpoint = process.env.FIREBASE_FUNCTIONS_LOCALHOST_ENDPOINT + "/zoidbergGetKillSwitch"
    let killSwitchJson = await makeInternalRequest(getKillSwitchEndpoint).catch(() => {
        return { killSwitch: true }
    })

    if (killSwitchJson.killSwitch) {
        console.log("Disabling killSwitch in emulator")
        let auth = process.env.FUTURA_AUTH_KILLSWITCH

        let toggleKillSwitchEndpoint = process.env.FIREBASE_FUNCTIONS_LOCALHOST_ENDPOINT + "/zoidbergToggleKillSwitch";
        
        await makeAuthenticatedRequest(toggleKillSwitchEndpoint, null, "KillSwitch-Auth", auth).catch((e) => {
            throw Error(`Error toggling kill switch: ${e.message}`);
        });
    }
}

exports.shutdownTuranga = async () => {
    let shutdownEndpoint = process.env.FIREBASE_FUNCTIONS_ENDPOINT + "/turangaShutdown"
    await makeInternalRequest(shutdownEndpoint).catch((e) => {
        throw Error(`Error shutting down Turanga: ${e.message}`);
    });
}