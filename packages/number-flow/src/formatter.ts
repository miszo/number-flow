// Merge the plus and minus sign types
export type OverridableNumberPartType =
	| Exclude<Intl.NumberFormatPartTypes, 'minusSign' | 'plusSign'>
	| 'sign'

export type NumberPartType = OverridableNumberPartType | 'prefix' | 'suffix'

// These need to be separated for the discriminated union to work:
// https://www.typescriptlang.org/play/?target=99&ssl=8&ssc=1&pln=9&pc=1#code/C4TwDgpgBAIglgczsKBeKBvKpIC4oDkcAdsBAhAE4FQA+hAZpQIYDGwcA9sQQNxQA3ZgBsArhHzFRAWwBGVKAF8AsACgc0AMIALZpTSZs4CYVa7q-QSPH4AzsEokEStWoaji7LsSgATTgDKwKIMDAAUYHrA+PBIKPQ6egCUmGpQUHAMUBFRAHQaaKjoRKTkVDS09JGUwPnGhcVMbBzcBCkYaelQ1cCdilAQwrbQHapd3VFQAPRTUAA8ALTY2nC2GbY8KImUADRQwnAA1tAAkgS+AwAekOzZAPxJfWqKQA
type IntegerPart = { type: NumberPartType & 'integer'; value: number }
type FractionPart = { type: NumberPartType & 'fraction'; value: number }
type DigitPart = IntegerPart | FractionPart
type SymbolPart = {
	type: Exclude<NumberPartType, 'integer' | 'fraction'>
	value: string
}

export type NumberPartKey = string
type KeyedPart = { key: NumberPartKey }
export type KeyedDigitPart = DigitPart & KeyedPart & { place: number }
export type KeyedSymbolPart = SymbolPart & KeyedPart
export type KeyedNumberPart = KeyedDigitPart | KeyedSymbolPart

export type Format = Omit<Intl.NumberFormatOptions, 'notation'> & {
	notation?: Exclude<Intl.NumberFormatOptions['notation'], 'scientific' | 'engineering'>
}

export type Value = Exclude<Parameters<typeof Intl.NumberFormat.prototype.formatToParts>[0], bigint>

export type Overrides = Partial<Record<OverridableNumberPartType, string>>

export function formatToData(
	value: Value,
	formatter: Intl.NumberFormat,
	overrides?: Overrides,
	prefix?: string,
	suffix?: string
) {
	const parts: Array<
		Omit<Intl.NumberFormatPart, 'type'> & { type: Intl.NumberFormatPartTypes | 'prefix' | 'suffix' }
	> = formatter.formatToParts(value)
	if (prefix) parts.unshift({ type: 'prefix', value: prefix })
	if (suffix) parts.push({ type: 'suffix', value: suffix })

	const pre: KeyedNumberPart[] = []
	const unkeyedInteger: Array<IntegerPart | SymbolPart> = [] // we do a second pass to key these from RTL
	const fraction: KeyedNumberPart[] = []
	const post: KeyedNumberPart[] = []

	const counts: Partial<Record<NumberPartType, number>> = {}
	const generateKey = (type: NumberPartType) =>
		`${type}:${(counts[type] = (counts[type] ?? -1) + 1)}`

	let valueAsString = ''
	let seenInteger = false,
		seenDecimal = false
	for (const part of parts) {
		// Merge plus and minus sign types (doing it this way appeases TypeScript)
		const type: NumberPartType =
			part.type === 'minusSign' || part.type === 'plusSign' ? 'sign' : part.type
		// We don't actually enforce the override type, so cast:
		const value = (overrides as Record<NumberPartType, string>)?.[type] ?? part.value

		valueAsString += value

		if (type === 'integer') {
			seenInteger = true
			unkeyedInteger.push(...value.split('').map((d) => ({ type, value: parseInt(d) })))
		} else if (type === 'group') {
			unkeyedInteger.push({ type, value })
		} else if (type === 'decimal') {
			seenDecimal = true
			fraction.push({ type, value, key: generateKey(type) })
		} else if (type === 'fraction') {
			fraction.push(
				...value.split('').map((d) => ({
					type,
					value: parseInt(d),
					key: generateKey(type),
					place: -1 - counts[type]!
				}))
			)
		} else {
			;(seenInteger || seenDecimal ? post : pre).push({
				type,
				value,
				key: generateKey(type)
			})
		}
	}

	const integer: KeyedNumberPart[] = []
	// Key the integer parts RTL, for better layout animations
	for (let i = unkeyedInteger.length - 1; i >= 0; i--) {
		const p = unkeyedInteger[i]!
		integer.unshift(
			p.type === 'integer'
				? {
						...p,
						key: generateKey(p.type),
						place: counts[p.type]!
					}
				: {
						...p,
						key: generateKey(p.type)
					}
		)
	}

	return {
		pre,
		integer,
		fraction,
		post,
		valueAsString,
		value: typeof value == 'string' ? parseFloat(value) : value
	}
}

export type Data = ReturnType<typeof formatToData>
