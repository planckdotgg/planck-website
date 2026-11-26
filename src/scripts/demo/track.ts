/**
 * Geometry of the banked turn in the hero art, in the art's own 1296×516 pixel space.
 * A point on the track is (u, y): u runs 0 at the inner rail to 1 at the outer rail, y is the
 * screen row of the inner edge. The far end of the turn (the apex) is near y = 226.
 */
export const WORLD_W = 1296;
export const WORLD_H = 516;
export const APEX_Y = 226;

export interface Point {
	x: number;
	y: number;
}

type Cubic = [Point, Point, Point, Point];

// Inner rail and outer rail centerlines, copied from the art (the bright rail strokes).
const INNER: Cubic[] = [
	[
		{ x: 74, y: 516 },
		{ x: 194, y: 426 },
		{ x: 378, y: 332 },
		{ x: 574, y: 276 },
	],
	[
		{ x: 574, y: 276 },
		{ x: 706, y: 238 },
		{ x: 806, y: 228 },
		{ x: 872, y: 224 },
	],
];
const OUTER: Cubic[] = [
	[
		{ x: 910, y: 227 },
		{ x: 962, y: 256 },
		{ x: 1002, y: 312 },
		{ x: 998, y: 384 },
	],
	[
		{ x: 998, y: 384 },
		{ x: 994, y: 436 },
		{ x: 962, y: 478 },
		{ x: 916, y: 516 },
	],
];

function cubicAt([a, b, c, d]: Cubic, t: number): Point {
	const m = 1 - t;
	const k0 = m * m * m;
	const k1 = 3 * m * m * t;
	const k2 = 3 * m * t * t;
	const k3 = t * t * t;
	return {
		x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x,
		y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y,
	};
}

/** Samples a rail into a table sorted by y, for x-at-y lookups. */
function table(curves: Cubic[]): Point[] {
	const pts: Point[] = [];
	for (const c of curves) for (let i = 0; i <= 96; i++) pts.push(cubicAt(c, i / 96));
	return pts.sort((p, q) => p.y - q.y);
}

const innerTable = table(INNER);
const outerTable = table(OUTER);

function xAt(tab: Point[], y: number): number {
	const first = tab[0] as Point;
	const last = tab[tab.length - 1] as Point;
	if (y <= first.y) return first.x;
	if (y >= last.y) return last.x;
	let lo = 0;
	let hi = tab.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if ((tab[mid] as Point).y <= y) lo = mid;
		else hi = mid;
	}
	const p = tab[lo] as Point;
	const q = tab[hi] as Point;
	const t = q.y === p.y ? 0 : (y - p.y) / (q.y - p.y);
	return p.x + (q.x - p.x) * t;
}

/** How far the outer end of a cross-section sits below its inner end (the bank). */
export function bankDrop(y: number): number {
	const t = Math.max(0, (y - 240) / 228);
	return 2 + 26 * t * t;
}

export function innerAt(y: number): Point {
	return { x: xAt(innerTable, y), y };
}

export function outerAt(y: number): Point {
	const oy = Math.min(WORLD_H, y + bankDrop(y));
	return { x: xAt(outerTable, oy), y: oy };
}

/** A point on the track surface. */
export function trackPoint(u: number, y: number): Point {
	const a = innerAt(y);
	const b = outerAt(y);
	return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export function trackWidth(y: number): number {
	const a = innerAt(y);
	const b = outerAt(y);
	return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance ahead of the camera (z ≥ 1) to screen row: z = 1 is the bottom edge. */
export function depthToY(z: number): number {
	return APEX_Y + (WORLD_H - APEX_Y) / z;
}

export function yToDepth(y: number): number {
	return (WORLD_H - APEX_Y) / (y - APEX_Y);
}

/** The u on row y nearest to x. */
export function uAt(x: number, y: number): number {
	const a = innerAt(y);
	const b = outerAt(y);
	return (x - a.x) / (b.x - a.x);
}
