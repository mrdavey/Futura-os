/**
 * calculates pearson correlation: https://gist.github.com/matt-west/6500993#gistcomment-2743187
 * @param {[number]} d1
 * @param {[number]} d2
 */
exports.corr = (n1, n2) => {
	let { min, pow, sqrt } = Math;
	let add = (a, b) => a + b;
	let n = min(n1.length, n2.length);
	if (n === 0) {
		return 0;
	}
	[n1, n2] = [n1.slice(0, n), n2.slice(0, n)];
	let [sum1, sum2] = [n1, n2].map((l) => l.reduce(add));
	let [pow1, pow2] = [n1, n2].map((l) => l.reduce((a, b) => a + pow(b, 2), 0));
	let mulSum = n1.map((n, i) => n * n2[i]).reduce(add);
	let dense = sqrt((pow1 - pow(sum1, 2) / n) * (pow2 - pow(sum2, 2) / n));
	if (dense === 0) {
		return 0;
	}
	return (mulSum - (sum1 * sum2) / n) / dense;
}
