/**
 * Strip terminal auto-responses that Bun's libvterm-backed `Bun.Terminal` can
 * incorrectly merge into the PTY master read stream. Those bytes are meant for
 * the child process (injected as input), not for the host that forwards output.
 *
 * @see https://bun.com/reference/bun/Terminal — no options to disable this behavior.
 */

/** xterm-style DCS terminal version / identify, terminated with ST or BEL */
const DCS_VERSION_OR_IDENT = /\x1bP>\|[^\x07\x1b]*(?:\x1b\\|\x07)/g;

/** Primary DA-style responses (CSI ? ... c) */
const PRIMARY_DA_RESPONSE = /\x1b\[\?[0-9;]*c/g;

/** Secondary DA-style responses (CSI > ... c) */
const SECONDARY_DA_RESPONSE = /\x1b\[>[0-9;]*c/g;

export function stripBunTerminalAutoResponses(input: string): string {
	return input
		.replace(DCS_VERSION_OR_IDENT, '')
		.replace(PRIMARY_DA_RESPONSE, '')
		.replace(SECONDARY_DA_RESPONSE, '');
}

/**
 * Peel trailing bytes that might be an incomplete escape when chunks split
 * across PTY reads. Everything before the peel is stripped and returned;
 * the suffix is held until the next `push`.
 */
function peelIncompleteSuffix(s: string): {work: string; carry: string} {
	if (s.length === 0) {
		return {work: '', carry: ''};
	}
	if (s.endsWith('\x1b')) {
		return {work: s.slice(0, -1), carry: '\x1b'};
	}
	const lastP = s.lastIndexOf('\x1bP');
	if (lastP !== -1) {
		const tail = s.slice(lastP);
		if (!/\x1b\\|\x07/.test(tail)) {
			return {work: s.slice(0, lastP), carry: tail};
		}
	}
	const csiMatch = s.match(/\x1b\[(?:\?|>)[0-9;]*$/);
	if (csiMatch && csiMatch.index !== undefined) {
		return {work: s.slice(0, csiMatch.index), carry: csiMatch[0]};
	}
	return {work: s, carry: ''};
}

export function createBunTerminalOutputSanitizer(): {
	push: (chunk: string) => string;
	flush: () => string;
} {
	let carry = '';
	return {
		push(chunk: string): string {
			const combined = carry + chunk;
			const {work, carry: next} = peelIncompleteSuffix(combined);
			carry = next;
			return stripBunTerminalAutoResponses(work);
		},
		flush(): string {
			const out = stripBunTerminalAutoResponses(carry);
			carry = '';
			return out;
		},
	};
}
