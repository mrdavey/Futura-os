export const round = (value, decimals = 2) => {
    return Number(Math.round(value + "e" + decimals) + "e-" + decimals).toFixed(decimals);
};

export const numberWithCommas = (number) => {
    var parts = number.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

export const currencyFormat = (value) => {
    let rounded = round(value)
    return numberWithCommas(rounded);
}

export const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}