/**
 * Glassline: the simulation behind the hero shader. Everything here is plain math over the
 * measured ClientShot geometry, so it runs and tests without a DOM or a GL context.
 */

export const NSEG = 12;
export const TICK_MS = 130;
export const FALLBACK_MS = 600;
export const PIXEL_CEILING = 3.2e6;
export const CAP = 0.007;

export type Rect = [number, number, number, number];

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

/** Hero geometry in drawing-buffer pixels, origin at the hero's top-left. */
export interface Layout {
	w: number;
	h: number;
	px: number;
	shot: Rect;
	meter: Rect;
	band: [number, number];
	glassY: number;
	landX: number;
}

export function measure(hero: Box, frame: Box, meter: Box | null, copy: Box, px: number): Layout {
	const T = (r: Box): Rect => [
		(r.left - hero.left) * px,
		(r.top - hero.top) * px,
		(r.right - hero.left) * px,
		(r.bottom - hero.top) * px,
	];
	const shot = T(frame);
	return {
		w: Math.max(1, Math.round((hero.right - hero.left) * px)),
		h: Math.max(1, Math.round((hero.bottom - hero.top) * px)),
		px,
		shot,
		meter: meter ? T(meter) : shot,
		band: [(copy.top - hero.top - 16) * px, (copy.bottom - hero.top + 16) * px],
		glassY: shot[1],
		landX: (shot[0] + shot[2]) * 0.5,
	};
}

export function sameLayout(a: Layout | null, b: Layout): boolean {
	if (!a) return false;
	const eq = (x: readonly number[], y: readonly number[]) =>
		x.every((v, i) => Math.abs(v - (y[i] as number)) < 0.01);
	return (
		a.w === b.w &&
		a.h === b.h &&
		a.px === b.px &&
		eq(a.shot, b.shot) &&
		eq(a.meter, b.meter) &&
		eq(a.band, b.band)
	);
}

export interface Profile {
	slices: number;
	rung: number;
	tick: number;
	lenMin: number;
	lenSpan: number;
	maxRungs: number;
	rungLife: number;
	packets: boolean;
	gain: number;
	pointer: boolean;
	narrow: boolean;
}

/** Breakpoints follow the page's own: 767 px (phone) and 1199 px. */
export function profileFor(viewportW: number): Profile {
	if (viewportW <= 767) {
		return {
			slices: 3,
			rung: 18,
			tick: 34,
			lenMin: 80,
			lenSpan: 40,
			maxRungs: 3,
			rungLife: 2.4,
			packets: false,
			gain: 1.15,
			pointer: false,
			narrow: true,
		};
	}
	const wide = viewportW >= 1200;
	return {
		slices: wide ? 5 : 4,
		rung: wide ? 29 : 26,
		tick: wide ? 58 : 48,
		lenMin: wide ? 120 : 100,
		lenSpan: wide ? 70 : 50,
		maxRungs: NSEG,
		rungLife: 3.8,
		packets: true,
		gain: 1,
		pointer: true,
		narrow: false,
	};
}

export interface Tier {
	dpr: number;
	slices: number;
	packets: boolean;
	dither: boolean;
}

export const TIERS: readonly Tier[] = [
	{ dpr: 2, slices: 5, packets: true, dither: true },
	{ dpr: 1.25, slices: 4, packets: true, dither: true },
	{ dpr: 1, slices: 3, packets: false, dither: false },
	{ dpr: 1, slices: 3, packets: false, dither: false },
];
export const STILL_TIER = 3;

export function bufferScale(o: {
	dpr: number;
	cssW: number;
	cssH: number;
	tier: number;
	narrow: boolean;
	cores: number;
}): number {
	let s = Math.min(o.dpr || 1, 2);
	if (o.narrow && o.cores <= 4) s = Math.min(s, 1.5);
	s = Math.min(s, (TIERS[o.tier] ?? (TIERS[0] as Tier)).dpr);
	const ceiling = Math.sqrt(PIXEL_CEILING / Math.max(1, o.cssW * o.cssH));
	return Math.max(0.5, Math.min(s, ceiling));
}

/**
 * Adaptive quality: a rolling mean of the RAF interval. Tiers only step down within a session.
 */
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

export const spring = (v: number, target: number, dt: number, tau: number) =>
	v + (target - v) * (1 - Math.exp(-dt / tau));

const ease = (p: number, k: number) => 1 - (1 - p) ** k;

// Never under one buffer pixel: when the pixel ceiling scales the buffer down and CSS stretches
// it, thinner cores alias into crawl.
const core = (k: number, px: number) => Math.max(1, k * px);

interface Traffic {
	packet: boolean;
	born: number;
	life: number;
	e: number;
	side: number;
	rung: number;
	len: number;
	drop: boolean;
	parity: boolean;
	done: boolean;
}

interface Landing {
	born: number;
	e: number;
	split: number;
}

export const STILL = {
	rungs: [
		{ rise: 26, alpha: 0.2 },
		{ rise: 86, alpha: 0.13 },
		{ rise: 152, alpha: 0.08 },
		{ rise: 224, alpha: 0.045 },
	],
	slices: [
		{ side: -1, p: 0.62, rung: 1 },
		{ side: 1, p: 0.48, rung: 2 },
	],
	impact: 0.35,
	split: 1.1,
};

/**
 * Traffic on the glassline: slices, packets and history rungs, all packed into the shader's
 * `uSeg`/`uSegB` arrays. Time is the caller's clock in ms; it only has to be monotonic.
 */
export class FluxSim {
	readonly segA = new Float32Array(NSEG * 4);
	readonly segB = new Float32Array(NSEG * 4);
	impact = 0;
	split = 0;
	flare = 0;
	waveR = 0;
	waveE = 0;
	runY = 0;
	runE = 0;
	/** Slots filled by the last step. */
	count = 0;

	private live: Traffic[] = [];
	private landings: Landing[] = [];
	private rungs: Landing[] = [];
	private latency = 0.5;
	private lastFault = Number.NEGATIVE_INFINITY;
	private tick = 0;
	private seed: number;
	private profile = profileFor(1440);
	private slices = 5;
	private packets = true;

	constructor(seed = 0x9e3779b1) {
		this.seed = seed >>> 0;
	}

	rnd(): number {
		this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
		return this.seed / 4294967296;
	}

	configure(profile: Profile, tier: number) {
		const t = TIERS[tier] ?? (TIERS[0] as Tier);
		this.profile = profile;
		this.slices = Math.min(profile.slices, t.slices);
		this.packets = profile.packets && t.packets;
	}

	get flightMs() {
		return 760 * (0.84 + 0.32 * this.latency);
	}

	telemetry(now: number, t: Telemetry) {
		this.latency = Math.min(1, Math.max(0, (t.g2g - 7.4) / 2.5));
		const seq = t.seq ?? this.tick;
		this.tick = seq + 1;
		const fault = t.spike && now - this.lastFault > 4200;
		if (fault) this.lastFault = now;
		if (seq % 8 === 1 || fault) this.beat(now, fault);
		else if (seq % 2 === 0 && this.packets) this.packet(now);
	}

	beat(now: number, fault = false) {
		const n = this.slices;
		const mid = n >> 1;
		for (let i = 0; i < n; i++) {
			const side = i % 2 === 0 ? -1 : 1;
			const drop = fault && i === mid;
			this.push({ born: now + i * 34, side, rung: n - 1 - i, drop });
			if (drop) {
				this.push({
					born: now + i * 52 + 150,
					side: -side,
					rung: n - 1 - i,
					parity: true,
					life: 640,
					e: 0.62,
					len: this.profile.lenMin + this.profile.lenSpan * 0.43,
				});
			}
		}
	}

	/** One extra slice, for the primary CTA. */
	fire(now: number) {
		this.push({ born: now, side: this.rnd() < 0.5 ? -1 : 1, rung: 1 });
	}

	private push(o: Partial<Traffic> & { born: number; side: number }) {
		const p = this.profile;
		this.live.push({
			packet: false,
			life: this.flightMs,
			e: 0.95,
			rung: 0,
			len: p.lenMin + p.lenSpan * this.rnd(),
			drop: false,
			parity: false,
			done: false,
			...o,
		});
		while (this.live.length > 26) this.live.shift();
	}

	private packet(now: number) {
		this.push({
			packet: true,
			born: now,
			side: this.rnd() < 0.5 ? -1 : 1,
			life: 520 * (0.8 + 0.5 * this.rnd()) * (0.84 + 0.32 * this.latency),
			e: 0.3 + 0.22 * this.rnd(),
			len: (26 + 40 * this.rnd()) * (0.85 + 0.3 * this.latency),
		});
	}

	/** Advances to `now` and packs the frame. `lx` is the leaned landing x in buffer px. */
	step(now: number, L: Layout, lx: number) {
		const { segA, segB } = this;
		segA.fill(0);
		segB.fill(0);
		let n = 0;
		const px = L.px;

		for (let i = this.live.length - 1; i >= 0; i--) {
			const s = this.live[i] as Traffic;
			const pr = (now - s.born) / s.life;
			if (pr >= 1) {
				if (!s.done) {
					s.done = true;
					if (!s.packet && !s.drop) {
						const born = s.born + s.life;
						this.landings.push({ born, e: s.e, split: s.parity ? 3.4 : 1.5 });
						this.rungs.push({ born, e: s.e, split: 0 });
					}
				}
				if (pr > 1.4) this.live.splice(i, 1);
				continue;
			}
			if (pr < 0 || n >= NSEG) continue;
			if (s.packet) this.packPacket(n, s, pr, L, lx);
			else this.packSlice(n, s, pr, L, lx);
			n++;
		}

		const p = this.profile;
		const half0 = (L.shot[2] - L.shot[0]) * 0.5;
		let kept = 0;
		for (let i = this.rungs.length - 1; i >= 0; i--) {
			const a = this.rungs[i] as Landing;
			const age = (now - a.born) / 1000;
			if (age > p.rungLife || kept >= p.maxRungs) {
				this.rungs.splice(i, 1);
				continue;
			}
			if (age < 0) continue;
			kept++;
			if (n >= NSEG) continue;
			this.packRung(
				n,
				L,
				lx,
				18 + 96 * age,
				half0 * (0.52 - 0.105 * age),
				a.e * Math.exp(-age / 1.45) * 0.2,
			);
			n++;
		}

		let impact = 0;
		this.split = 0;
		this.flare = 0;
		this.waveE = 0;
		this.waveR = 0;
		this.runE = 0;
		this.runY = 0;
		for (let i = this.landings.length - 1; i >= 0; i--) {
			const a = this.landings[i] as Landing;
			const age = (now - a.born) / 1000;
			if (age < 0) continue;
			if (age > 1) {
				this.landings.splice(i, 1);
				continue;
			}
			impact += a.e * Math.exp(-age / 0.115);
			this.flare = Math.max(this.flare, a.e * Math.exp(-age / 0.05));
			this.split = Math.max(this.split, a.split * px * Math.exp(-age / 0.08));
			const we = a.e * Math.exp(-age / 0.26) * 0.7;
			if (we > this.waveE) {
				this.waveE = we;
				this.waveR = age * 1650 * px;
			}
			const re = a.e * Math.exp(-age / 0.34) * 0.5;
			if (re > this.runE) {
				this.runE = re;
				this.runY = age * 960 * px;
			}
		}
		this.impact = Math.min(1.25, impact);
		this.count = n;
	}

	/** The reduced-motion still: a composed frame, not a paused one. */
	still(L: Layout, lx: number) {
		const { segA, segB } = this;
		segA.fill(0);
		segB.fill(0);
		let n = 0;
		const p = this.profile;
		for (const s of STILL.slices) {
			const t: Traffic = {
				packet: false,
				born: 0,
				life: 1,
				e: 0.95,
				side: s.side,
				rung: s.rung,
				len: p.lenMin + p.lenSpan * 0.5,
				drop: false,
				parity: false,
				done: false,
			};
			this.packSlice(n++, t, s.p, L, lx);
		}
		const half0 = (L.shot[2] - L.shot[0]) * 0.5;
		for (const r of STILL.rungs.slice(0, p.maxRungs)) {
			const age = (r.rise - 18) / 96;
			this.packRung(n++, L, lx, r.rise, half0 * (0.52 - 0.105 * age), r.alpha);
		}
		this.impact = STILL.impact;
		this.split = STILL.split * L.px;
		this.flare = 0;
		this.waveE = 0;
		this.waveR = 0;
		this.runE = 0;
		this.runY = 0;
		this.count = n;
	}

	/** The leading tip travels from beyond the page edge to the landing x as `ease(p, 2.1)`. */
	private packSlice(n: number, s: Traffic, pr: number, L: Layout, lx: number) {
		const o = n * 4;
		const px = L.px;
		const dir = -s.side;
		const e0 = s.side < 0 ? -0.1 * L.w : 1.1 * L.w;
		const head = e0 + (lx - e0) * ease(pr, 2.1);
		const len = s.len * px * (1 - 0.55 * ease(pr, 1.6));
		const tail = head - dir * len;
		const alive = s.drop && pr > 0.55 ? Math.max(0, 1 - (pr - 0.55) / 0.1) : 1;
		this.segA[o] = L.glassY - s.rung * this.profile.rung * px * (1 - pr * pr);
		this.segA[o + 1] = Math.min(head, tail);
		this.segA[o + 2] = Math.max(head, tail);
		this.segA[o + 3] =
			s.e * alive * Math.min(1, pr * 9) * (1 - (Math.max(0, pr - 0.93) / 0.07) * 0.5);
		this.segB[o] = core(1.15, px);
		this.segB[o + 1] = 2.4 * px;
		this.segB[o + 2] = 0.25 + 0.55 * pr;
		this.segB[o + 3] = dir * 2 * px;
	}

	private packPacket(n: number, s: Traffic, pr: number, L: Layout, lx: number) {
		const o = n * 4;
		const px = L.px;
		const dir = -s.side;
		const e0 = s.side < 0 ? -0.08 * L.w : 1.08 * L.w;
		const head = e0 + (lx - e0) * pr;
		const tail = head - dir * s.len * px;
		this.segA[o] = L.glassY;
		this.segA[o + 1] = Math.min(head, tail);
		this.segA[o + 2] = Math.max(head, tail);
		this.segA[o + 3] = s.e * Math.min(1, pr * 12) * (1 - Math.max(0, pr - 0.86) / 0.14);
		this.segB[o] = core(1, px);
		this.segB[o + 1] = 1.9 * px;
		this.segB[o + 2] = 0.1;
		this.segB[o + 3] = dir * 1.6 * px;
	}

	private packRung(n: number, L: Layout, lx: number, rise: number, half: number, e: number) {
		const o = n * 4;
		const px = L.px;
		this.segA[o] = L.glassY - rise * px;
		this.segA[o + 1] = lx - half;
		this.segA[o + 2] = lx + half;
		this.segA[o + 3] = e;
		this.segB[o] = core(0.95, px);
		this.segB[o + 1] = 1.7 * px;
		this.segB[o + 2] = 0.6;
		this.segB[o + 3] = 34 * px;
	}
}

/**
 * Feeds the sim from `planck:telemetry` events, and from its own 130 ms clock when the meter
 * goes quiet for 600 ms, so the hero never dies. External events always win.
 */
export class TelemetryClock {
	private lastEvent = Number.NEGATIVE_INFINITY;
	private next = 0;
	private internal = false;
	private seq = 0;
	private shown = 8.4;

	constructor(private rnd: () => number) {}

	external(now: number) {
		this.lastEvent = now;
		this.internal = false;
	}

	/** The meter announced it stopped: take over at once instead of waiting out the timeout. */
	stopped() {
		this.lastEvent = Number.NEGATIVE_INFINITY;
	}

	get isInternal() {
		return this.internal;
	}

	due(now: number, emit: (at: number, t: Telemetry) => void) {
		if (now - this.lastEvent < FALLBACK_MS) return;
		if (!this.internal) {
			this.internal = true;
			this.next = now;
		}
		while (this.next <= now) {
			const drift = (this.rnd() - 0.5) * 0.5 + (8.4 - this.shown) * 0.25;
			this.shown = Math.max(7.4, Math.min(9.9, this.shown + drift));
			emit(this.next, { g2g: this.shown, spike: this.rnd() < 0.035, seq: this.seq++ });
			this.next += TICK_MS;
		}
	}
}
