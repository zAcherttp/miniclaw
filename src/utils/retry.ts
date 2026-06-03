/**
 * Base delay in milliseconds for exponential backoff (first retry waits this long).
 */
export const RETRY_BASE_MS = 1000;

/**
 * Maximum delay cap in milliseconds for exponential backoff.
 */
export const RETRY_CAP_MS = 10_000;

/**
 * Calculates the exponential backoff delay for a given attempt number.
 * Delay formula: min(RETRY_BASE_MS * 2^(attempt - 1), RETRY_CAP_MS)
 *
 * @param attempt 1-indexed attempt number (1 = first retry)
 * @returns Delay in milliseconds
 */
export function calcRetryDelay(attempt: number): number {
	return Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS);
}
