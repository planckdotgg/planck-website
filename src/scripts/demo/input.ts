export interface ControlInput {
	/** -1 steers toward the inner rail (left), +1 toward the outer rail (right). */
	steer: number;
	brake: boolean;
}

export const NEUTRAL: ControlInput = { steer: 0, brake: false };

/**
 * Holds timestamped control states and answers "what had the player pressed `latency` ms ago".
 * This is how the demo adds a fixed input delay without touching the simulation.
 */
export class InputDelay {
	private readonly times: number[] = [];
	private readonly inputs: ControlInput[] = [];

	constructor(private readonly horizonMs = 1000) {}

	push(timeMs: number, input: ControlInput) {
		const last = this.inputs[this.inputs.length - 1];
		if (last && last.steer === input.steer && last.brake === input.brake) return;
		const lastTime = this.times[this.times.length - 1];
		if (lastTime !== undefined && timeMs < lastTime) timeMs = lastTime;
		this.times.push(timeMs);
		this.inputs.push({ steer: input.steer, brake: input.brake });
	}

	/** The newest state recorded at or before `timeMs - latencyMs`. */
	sample(timeMs: number, latencyMs: number): ControlInput {
		const at = timeMs - latencyMs;
		let lo = 0;
		let hi = this.times.length - 1;
		let found = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if ((this.times[mid] as number) <= at) {
				found = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		const held = found < 0 ? NEUTRAL : (this.inputs[found] as ControlInput);
		this.prune(timeMs);
		return held;
	}

	clear() {
		this.times.length = 0;
		this.inputs.length = 0;
	}

	/** Drops states older than the horizon, keeping the newest one before it as the baseline. */
	private prune(nowMs: number) {
		const cutoff = nowMs - this.horizonMs;
		let drop = 0;
		while (drop + 1 < this.times.length && (this.times[drop + 1] as number) <= cutoff) drop++;
		if (drop > 0) {
			this.times.splice(0, drop);
			this.inputs.splice(0, drop);
		}
	}
}

/** Combines held keys and pointer sides into one control state. */
export function combine(
	keys: { left: boolean; right: boolean; brake: boolean },
	pointers: { left: number; right: number },
): ControlInput {
	const left = keys.left || pointers.left > 0;
	const right = keys.right || pointers.right > 0;
	const bothPointers = pointers.left > 0 && pointers.right > 0;
	return {
		steer: (right ? 1 : 0) - (left ? 1 : 0),
		brake: keys.brake || bothPointers,
	};
}
