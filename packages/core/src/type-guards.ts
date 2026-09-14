/**
 * Narrow an unknown value to a plain object so its fields can be read without casts. Arrays
 * are rejected: nothing we parse out of a config file is expressed as one at this level.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDisabledConfigValue(value: unknown): boolean {
   return value === false || (isRecord(value) && value.enabled === false);
}
