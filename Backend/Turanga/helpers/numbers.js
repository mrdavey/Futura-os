exports.round = (value, decimals = 2) => {
    if (value) {
        return Number(Math.round(Number(value) + "e" + decimals) + "e-" + decimals).toFixed(decimals);
    } else {
        return 0
    }
};

exports.getDecimalNumbers = (value) => {
    return `${value}`.split(".")[1].length || 0;
}

exports.numberWithCommas = (number) => {
    var parts = number.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

exports.currencyFormat = (value) => {
    let rounded = round(value)
    return numberWithCommas(rounded);
}

exports.getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}