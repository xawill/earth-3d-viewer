export const EPS_DECIMALS = 6;
export const EPS = Number('1e-' + EPS_DECIMALS);

// Rounds the provided value to the provided number of decimals
export function round(value: number, decimals: number): number {
	const valueString = value.toString();
	if (valueString.indexOf('e') === -1) {
		return Number(Math.round(Number(valueString + 'e' + decimals.toString())) + 'e-' + decimals);
	} else {
		// Either the number is huge or almost 0
		const [number, exponent] = valueString.split('e');
		return Number(Math.round(Number(number + 'e' + (parseInt(exponent) + decimals).toString())) + 'e-' + decimals);
	}
}
