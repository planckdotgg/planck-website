import type { ControlInput } from './input';
import { uAt, yToDepth } from './track';

/** Where the racer sits in the hero art; the demo starts from this pose. */
export const RACER_ANCHOR = { x: 600, y: 360 } as const;
export const RACER_Z = yToDepth(RACER_ANCHOR.y);
export const START_U = uAt(RACER_ANCHOR.x, RACER_ANCHOR.y);

export const SPAWN_Z = 30;
export const DESPAWN_Z = 0.85;
export const GATE_SPACING = 13.5;
export const GATE_HALF_WIDTH = 0.15;
export const U_MIN = 0.06;
export const U_MAX = 0.94;

const CRUISE = 9;
const AIRBRAKE = 5;
/** Outward slide per second at cruise speed; it grows with the square of speed, as in a turn. */
const DRIFT = 0.24;
const STEER = 0.95;
/** How fast lateral velocity follows the controls (1/s). */
const RESPONSE = 14;
const SPEED_RESPONSE = 2.4;
const MAX_BANK = 0.28;

export type GateResult = 'pending' | 'threaded' | 'missed';

export interface Gate {
	id: number;
	z: number;
	center: number;
	halfWidth: number;
	result: GateResult;
}

export interface SimState {
	time: number;
	u: number;
	vu: number;
	speed: number;
	bank: number;
	/** Distance travelled along the track, in depth units. */
	travel: number;
	gates: Gate[];
	nextGateAt: number;
	nextId: number;
	threaded: number;
	missed: number;
	streak: number;
	/** Seconds since the racer last touched a rail; Infinity if never. */
	sinceScrape: number;
	/** Seconds since the last gate was judged, and how it went. */
	sinceGate: number;
	lastGate: GateResult;
	seed: number;
	lastCenter: number;
}

export function createState(seed = 0x9e3779b9): SimState {
	const state: SimState = {
		time: 0,
		u: START_U,
		vu: 0,
		speed: CRUISE,
		bank: 0,
		travel: 0,
		gates: [],
		nextGateAt: 0,
		nextId: 1,
		threaded: 0,
		missed: 0,
		streak: 0,
		sinceScrape: Number.POSITIVE_INFINITY,
		sinceGate: Number.POSITIVE_INFINITY,
		lastGate: 'pending',
		seed: seed >>> 0,
		lastCenter: START_U,
	};
	// Two gates are already on the track so the first one arrives within a second or so.
	let z = RACER_Z + 9;
	for (; z < SPAWN_Z; z += GATE_SPACING) spawn(state, z);
	state.nextGateAt = z - SPAWN_Z;
	return state;
}

function spawn(state: SimState, z: number) {
	state.gates.push({
		id: state.nextId++,
		z,
		center: nextCenter(state),
		halfWidth: GATE_HALF_WIDTH,
		result: 'pending',
	});
}

/** mulberry32: small deterministic PRNG so a run (and its tests) repeat exactly. */
function random(state: SimState): number {
	state.seed = (state.seed + 0x6d2b79f5) >>> 0;
	let t = state.seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Gates hug the inner half of the turn, each within reach of the last. */
function nextCenter(state: SimState): number {
	const lo = Math.max(0.17, state.lastCenter - 0.26);
	const hi = Math.min(0.6, state.lastCenter + 0.26);
	const c = lo + (hi - lo) * random(state);
	state.lastCenter = c;
	return c;
}

export function threads(gate: Gate, u: number): boolean {
	return Math.abs(u - gate.center) <= gate.halfWidth - 0.02;
}

export function step(state: SimState, input: ControlInput, dt: number) {
	state.time += dt;
	state.sinceScrape += dt;
	state.sinceGate += dt;

	const target = input.brake ? AIRBRAKE : CRUISE;
	state.speed += (target - state.speed) * (1 - Math.exp(-SPEED_RESPONSE * dt));

	const load = (state.speed / CRUISE) ** 2;
	const steer = Math.max(-1, Math.min(1, input.steer));
	const want = steer * STEER + DRIFT * load;
	state.vu += (want - state.vu) * (1 - Math.exp(-RESPONSE * dt));
	state.u += state.vu * dt;
	if (state.u > U_MAX || state.u < U_MIN) {
		state.u = Math.max(U_MIN, Math.min(U_MAX, state.u));
		state.vu = 0;
		state.speed *= 1 - 1.5 * dt;
		state.sinceScrape = 0;
	}

	const bankTarget = -steer * MAX_BANK;
	state.bank += (bankTarget - state.bank) * (1 - Math.exp(-8 * dt));

	const dz = state.speed * dt;
	state.travel += dz;

	for (const gate of state.gates) {
		const before = gate.z;
		gate.z -= dz;
		if (gate.result === 'pending' && before >= RACER_Z && gate.z < RACER_Z) {
			gate.result = threads(gate, state.u) ? 'threaded' : 'missed';
			state.lastGate = gate.result;
			state.sinceGate = 0;
			if (gate.result === 'threaded') {
				state.threaded++;
				state.streak++;
			} else {
				state.missed++;
				state.streak = 0;
			}
		}
	}
	state.gates = state.gates.filter((g) => g.z > DESPAWN_Z);

	if (state.travel >= state.nextGateAt) {
		spawn(state, SPAWN_Z - (state.travel - state.nextGateAt));
		state.nextGateAt += GATE_SPACING;
	}
}

/** The racing line: the lateral position the next gates ask for, interpolated by depth. */
export function idealU(state: SimState, z: number): number {
	const ahead = state.gates.filter((g) => g.result === 'pending').sort((a, b) => a.z - b.z);
	if (ahead.length === 0) return state.lastCenter;
	let prevZ = RACER_Z;
	let prevU = (ahead[0] as Gate).center;
	for (const g of ahead) {
		if (z <= g.z) {
			const t = g.z === prevZ ? 1 : (z - prevZ) / (g.z - prevZ);
			return prevU + (g.center - prevU) * Math.max(0, Math.min(1, t));
		}
		prevZ = g.z;
		prevU = g.center;
	}
	return prevU;
}
