/**
 * Ember Beam: the timeline and geometry behind the hero shader. Plain math over the measured
 * ClientShot frame, so it runs and tests without a DOM or a GL context. Lengths are CSS px with
 * the origin at the hero's top-left.
 */

export const PIXEL_CEILING = 3.2e6;
export const MAX_DPR = 1.75;

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** What `src/scripts/shot.ts` publishes on every meter tick. */
export interface Telemetry {
	g2g: number;
	sample?: number;
	spike: boolean;
	seq?: number;
}

export interface Layout {
	w: number;
	h: number;
	frame: [number, number, number, number];
	radius: number;
	copy: [number, number, number, number];
	beamX: number;
	/** Where the stream becomes visible: the hero top, or just under the copy when it would cross it. */
	source: number;
	/** Path length from the landing point along the top edge to the start of the right side. */
	corner: number;
	side: number;
	left: number;
}

/**
 * The beam lands right of the copy and left of the frame's top-right corner, so the light that
 * runs along the top has room to reach the corner and pour down the side.
 */
export function measure(hero: Box, frame: Box, copy: Box, radius: number): Layout {
	const rel = (r: Box): [number, number, number, number] => [
		r.left - hero.left,
		r.top - hero.top,
		r.right - hero.left,
		r.bottom - hero.top,
	];
	const w = Math.max(1, hero.right - hero.left);
	const h = Math.max(1, hero.bottom - hero.top);
	const f = rel(frame);
	const c = rel(copy);
	const r = Math.max(0, Math.min(radius, (f[2] - f[0]) / 2, (f[3] - f[1]) / 2));
	const narrow = w <= 767;
	const visibleRight = Math.min(f[2], w);
	const want = narrow ? visibleRight - 0.22 * w : Math.max(0.74 * w, c[2] + 110);
	const lo = f[0] + r + 24;
	const hi = Math.min(f[2] - r - (narrow ? 36 : 64), w - 24);
	const beamX = Math.max(lo, Math.min(hi, want));
	const crosses = beamX > c[0] - 60 && beamX < c[2] + 60;
	const source = crosses ? Math.min(c[3] + 14, f[1] - 40) : 0;
	return {
		w,
		h,
		frame: f,
		radius: r,
		copy: c,
		beamX,
		source,
		corner: f[2] - r - beamX + (Math.PI / 2) * r,
		side: Math.max(0, f[3] - f[1] - r),
		left: Math.max(0, Math.min(beamX - (f[0] + r), narrow ? 220 : 460)),
	};
}

export function sameLayout(a: Layout | null, b: Layout): boolean {
	if (!a) return false;
	const near = (x: number, y: number) => Math.abs(x - y) < 0.01;
	return (
		near(a.w, b.w) &&
		near(a.h, b.h) &&
		near(a.radius, b.radius) &&
		near(a.beamX, b.beamX) &&
		near(a.source, b.source) &&
		a.frame.every((v, i) => near(v, b.frame[i] as number)) &&
		a.copy.every((v, i) => near(v, b.copy[i] as number))
	);
}

/** Seconds into the load. Descent, impact knee, then the spill down the right bezel. */
export const POUR = { impact: 0.55, corner: 0.95, spilled: 1.65, settled: 1.8 } as const;

export interface Pour {
	/** The y of the falling head. */
	front: number;
	/** How far the light has run from the landing point toward and down the right side. */
	runR: number;
	/** How far it has run left along the top. */
	runL: number;
	flash: number;
	bloom: number;
	done: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number, k = 3) => 1 - (1 - clamp01(x)) ** k;
const smooth = (x: number) => {
	const t = clamp01(x);
	return t * t * (3 - 2 * t);
};

export const SETTLED: Pour = {
	front: Number.POSITIVE_INFINITY,
	runR: 1e5,
	runL: 1e5,
	flash: 0,
	bloom: 1,
	done: true,
};

export function pour(t: number, L: Layout): Pour {
	if (t >= POUR.settled) return { ...SETTLED, front: L.frame[1] };
	const top = L.frame[1];
	const start = L.source > 0 ? L.source - 30 : -0.06 * L.h - 40;
	// Gravity: the head accelerates on the way down.
	const fall = clamp01(t / POUR.impact) ** 1.7;
	const front = start + (top - start) * fall;
	const since = t - POUR.impact;
	let runR = -60;
	let runL = -60;
	let flash = 0;
	if (since >= 0) {
		const knee = POUR.corner - POUR.impact;
		const spill = POUR.spilled - POUR.corner;
		runR =
			t < POUR.corner
				? L.corner * easeOut(since / knee, 2)
				: L.corner + (L.side + 80) * smooth((t - POUR.corner) / spill);
		runL = L.left * easeOut(since / 0.7, 2.4);
		flash = Math.exp(-since / 0.2) * (1 - Math.exp(-since / 0.025));
	}
	const bloom = 0.25 + 0.75 * smooth((t - 0.15) / (POUR.settled - 0.15));
	return { front, runR, runL, flash, bloom, done: false };
}

/** Telemetry nudges the beam: low latency runs hotter, a spike sends a ripple down the stream. */
export class Coupling {
	energy = 1;
	ripple = -1;
	private target = 1;
	private lastSpike = Number.NEGATIVE_INFINITY;

	telemetry(now: number, t: Telemetry) {
		const lat = clamp01((t.g2g - 7.4) / 2.5);
		const jitter = t.sample === undefined ? 0 : 0.08 * (t.sample - 0.4);
		this.target = Math.min(1.2, Math.max(0.82, 1.1 - 0.2 * lat + jitter));
		if (t.spike && now - this.lastSpike > 1.6) {
			this.lastSpike = now;
			this.ripple = 0;
		}
	}

	step(dt: number) {
		this.energy = spring(this.energy, this.target, dt, 0.45);
		if (this.ripple >= 0) {
			this.ripple += dt;
			if (this.ripple > 2.4) this.ripple = -1;
		}
	}
}

export const spring = (v: number, target: number, dt: number, tau: number) =>
	v + (target - v) * (1 - Math.exp(-dt / tau));

export const TIER_DPR = [MAX_DPR, 1.25, 1, 1] as const;
export const STILL_TIER = 3;

export function bufferScale(o: { dpr: number; cssW: number; cssH: number; tier: number }): number {
	const s = Math.min(o.dpr || 1, TIER_DPR[o.tier] ?? MAX_DPR);
	const ceiling = Math.sqrt(PIXEL_CEILING / Math.max(1, o.cssW * o.cssH));
	return Math.max(0.5, Math.min(s, ceiling));
}

/** Adaptive quality: a rolling mean of the RAF interval. Tiers only step down within a session. */
export class Quality {
	tier = 0;
	private ring = new Float64Array(90);
	private n = 0;
	private sum = 0;
	private longRun = 0;

	constructor(slow = false) {
		if (slow) this.tier = 2;
	}

	reset() {
		this.n = 0;
		this.sum = 0;
		this.longRun = 0;
	}

	/** Returns true when the tier changed. */
	sample(intervalMs: number): boolean {
		if (intervalMs <= 20) this.longRun = 0;
		const i = this.n % this.ring.length;
		if (this.n >= this.ring.length) this.sum -= this.ring[i] as number;
		this.ring[i] = intervalMs;
		this.sum += intervalMs;
		this.n++;
		if (this.n < this.ring.length) return false;
		const mean = this.sum / this.ring.length;
		const want = mean > 40 ? 3 : mean > 28 ? 2 : mean > 20 ? 1 : 0;
		return this.lower(want);
	}

	longTask(): boolean {
		this.longRun++;
		return this.longRun >= 3 ? this.lower(STILL_TIER) : false;
	}

	private lower(want: number): boolean {
		if (want <= this.tier) return false;
		this.tier = want;
		this.reset();
		return true;
	}
}

/** `?beamt=0.7` freezes the load sequence at 0.7 s and draws that one frame, for QA captures. */
export function frozenTime(search: string): number | null {
	const v = new URLSearchParams(search).get('beamt');
	if (v === null || v.trim() === '') return null;
	const t = Number(v);
	return Number.isFinite(t) && t >= 0 ? Math.min(t, 600) : null;
}
