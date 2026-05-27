import type { BaseMessage } from "@langchain/core/messages";

export interface TokenEstimate {
	tokens: number;
	chars: number;
	breakdown: {
		text: number;
		code: number;
		cjk: number;
		extendedLatin: number;
		whitespace: number;
	};
}

const RATES = {
	/** ASCII prose: slightly conservative to prevent limit-breaks */
	textCharsPerToken: 3.8,
	/** Code / symbols: denser subword splits */
	codeCharsPerToken: 3.2,
	/** CJK (Chinese/Japanese/Korean) */
	cjkCharsPerToken: 1.5,
	/** Latin extended / Diacritic-heavy (Vietnamese, Polish, etc.) */
	extendedLatinCharsPerToken: 3.0,
	/** Whitespace & control chars (merged by modern BPE) */
	whitespaceOverhead: 0.05,
} as const;

/**
 * Heuristic: returns true if the chunk looks like source code.
 * Checks for common code patterns (braces, semicolons, arrows, imports, etc.)
 */
function isCodeLike(chunk: string): boolean {
	const codePatterns =
		/[{};]|=>|->|import\s|export\s|function\s|const\s|let\s|var\s|class\s|def\s|return\s/;
	const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) return false;

	let codeLineCount = 0;
	for (const line of lines) {
		if (codePatterns.test(line)) codeLineCount++;
	}
	// If more than 30% of non-empty lines match code patterns, treat as code
	return codeLineCount / lines.length > 0.3;
}

/**
 * Returns true if the Unicode code point falls in a CJK block.
 * Covers CJK Unified Ideographs and common extensions.
 */
function isCJK(cp: number): boolean {
	return (
		(cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
		(cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Extension A
		(cp >= 0x20000 && cp <= 0x2a6df) || // CJK Unified Ideographs Extension B
		(cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
		(cp >= 0x2f800 && cp <= 0x2fa1f) || // CJK Compatibility Ideographs Supplement
		(cp >= 0x3000 && cp <= 0x303f) || // CJK Symbols and Punctuation
		(cp >= 0x3040 && cp <= 0x309f) || // Hiragana
		(cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
		(cp >= 0xac00 && cp <= 0xd7af) // Hangul Syllables
	);
}

/**
 * Returns true if the Unicode code point is in Latin Extended / diacritic-heavy
 * ranges (Vietnamese, Polish, Czech, Turkish, etc.).
 */
function isExtendedLatin(cp: number): boolean {
	return (
		(cp >= 0x00c0 && cp <= 0x024f) || // Latin Extended-A & B + Latin-1 Supplement letters
		(cp >= 0x1e00 && cp <= 0x1eff) || // Latin Extended Additional (Vietnamese)
		(cp >= 0x0250 && cp <= 0x02af) || // IPA Extensions
		(cp >= 0x1d00 && cp <= 0x1d7f) || // Phonetic Extensions
		(cp >= 0x1d80 && cp <= 0x1dbf) || // Phonetic Extensions Supplement
		(cp >= 0x2c60 && cp <= 0x2c7f) || // Latin Extended-C
		(cp >= 0xa720 && cp <= 0xa7ff) // Latin Extended-D
	);
}

/**
 * Content-aware token estimator.
 *
 * Splits input into chunks and classifies each character as text, code, CJK,
 * extended Latin, or whitespace, then applies per-category token ratios for
 * a more accurate estimate than a flat chars/4 heuristic.
 */
export function estimateTokens(text: string): TokenEstimate {
	if (!text)
		return {
			tokens: 0,
			chars: 0,
			breakdown: { text: 0, code: 0, cjk: 0, extendedLatin: 0, whitespace: 0 },
		};

	const chunks = text.split(/\n{2,}|(?=```)|(?<=```\w*\n)/);

	let textChars = 0;
	let codeChars = 0;
	let cjkChars = 0;
	let extLatinChars = 0;
	let wsChars = 0;

	for (const chunk of chunks) {
		const isCode = isCodeLike(chunk) || /^```/.test(chunk.trim());

		for (const char of chunk) {
			const cp = char.codePointAt(0) ?? 0;

			// Whitespace: cp < 33 covers space, tab, newline, CR, etc.
			if (cp < 33 || cp === 0xa0) {
				wsChars++;
				continue;
			}

			if (isCJK(cp)) {
				cjkChars++;
				continue;
			}
			if (isExtendedLatin(cp)) {
				extLatinChars++;
				continue;
			}
			if (isCode) {
				codeChars++;
				continue;
			}
			textChars++;
		}
	}

	const textTokens = Math.ceil(textChars / RATES.textCharsPerToken);
	const codeTokens = Math.ceil(codeChars / RATES.codeCharsPerToken);
	const cjkTokens = Math.ceil(cjkChars / RATES.cjkCharsPerToken);
	const extLatinTokens = Math.ceil(
		extLatinChars / RATES.extendedLatinCharsPerToken,
	);
	const wsTokens = Math.ceil(wsChars * RATES.whitespaceOverhead);

	return {
		tokens: textTokens + codeTokens + cjkTokens + extLatinTokens + wsTokens,
		chars: text.length,
		breakdown: {
			text: textTokens,
			code: codeTokens,
			cjk: cjkTokens,
			extendedLatin: extLatinTokens,
			whitespace: wsTokens,
		},
	};
}

/**
 * Estimates the total token count for an array of LangChain messages.
 * Extracts text content from each message and sums token estimates.
 */
export function estimateMessagesTokens(messages: BaseMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		let text: string;
		if (typeof msg.content === "string") {
			text = msg.content;
		} else if (Array.isArray(msg.content)) {
			text = msg.content
				.map((item) => {
					if (typeof item === "string") return item;
					if (typeof item === "object" && item !== null && "text" in item)
						return (item as { text: string }).text;
					return "";
				})
				.join("");
		} else {
			text = "";
		}

		// Include tool call arguments in token count
		const toolCalls = extractToolCalls(msg);
		if (toolCalls && toolCalls.length > 0) {
			text += JSON.stringify(toolCalls);
		}

		total += estimateTokens(text).tokens;
	}
	return total;
}

function extractToolCalls(message: BaseMessage): unknown[] | null {
	if (!("tool_calls" in message)) return null;
	const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
	return Array.isArray(toolCalls) ? toolCalls : null;
}

/**
 * Formats a token count as a human-readable string with comma separators.
 * e.g. 220000 → "220,000"
 */
export function formatTokens(count: number): string {
	return count.toLocaleString("en-US");
}
