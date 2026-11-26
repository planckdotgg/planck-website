import { describe, expect, test } from 'bun:test';
import { FRAGMENT } from './flux-shader';
import {
	bufferScale,
	FALLBACK_MS,
	FluxSim,
	type Layout,
	measure,
	NSEG,
	profileFor,
	Quality,
	STILL,
	sameLayout,
	type Telemetry,
	TelemetryClock,
	TICK_MS,
} from './flux-sim';

const box = (left: number, top: number, right: number, bottom: number) => ({
	left,
	top,
	right,
	bottom,
});

// 1440 × 900 desktop, measured on the built page: frame top 603, width 1296.
const HERO = box(0, 76, 1440, 1576);
const FRAME = box(72, 603, 1368, 1413);
const METER = box(1046, 1240, 1398, 1440);
const COPY = box(486, 186, 954, 466);
const desktop = (px = 1) => measure(HERO, FRAME, METER, COPY, px);

const segments = (sim: FluxSim) => {
	const out: { y: number; x0: number; x1: number; e: number; dir: number; soft: number }[] = [];
	for (let i = 0; i < NSEG; i++) {
		const e = sim.segA[i * 4 + 3] as number;
		if (e <= 0.0015) continue;
		out.push({
			y: sim.segA[i * 4] as number,
			x0: sim.segA[i * 4 + 1] as number,
			x1: sim.segA[i * 4 + 2] as number,
			e,
			dir: Math.sign(sim.segB[i * 4 + 3] as number),
			soft: Math.abs(sim.segB[i * 4 + 3] as number),
		});
	}
	return out;
};

const tel = (seq: number, over: Partial<Telemetry> = {}): Telemetry => ({
	g2g: 8.4,
	spike: false,
	seq,
	...over,
});

describe('measure', () => {
	test('maps ClientShot rects into hero-relative buffer pixels', () => {
		const L = desktop(2);
		expect(L.w).toBe(2880);
		expect(L.h).toBe(3000);
		expect(L.shot).toEqual([144, 1054, 2736, 2674]);
		expect(L.glassY).toBe(1054);
		expect(L.landX).toBe(1440);
		expect(L.band).toEqual([(186 - 76 - 16) * 2, (466 - 76 + 16) * 2]);
		expect(L.meter).toEqual([(1046 - 0) * 2, (1240 - 76) * 2, 1398 * 2, (1440 - 76) * 2]);
	});

	test('falls back to the frame when there is no meter', () => {
		const L = measure(HERO, FRAME, null, COPY, 1);
		expect(L.meter).toEqual(L.shot);
	});

	test('sameLayout notices a moved frame but not float noise', () => {
		const a = desktop();
		expect(sameLayout(a, desktop())).toBe(true);
		expect(sameLayout(null, a)).toBe(false);
		const moved = measure(HERO, box(72, 640, 1368, 1450), METER, COPY, 1);
		expect(sameLayout(a, moved)).toBe(false);
	});
});

describe('profiles', () => {
	test('follow the page breakpoints', () => {
		expect(profileFor(1440)).toMatchObject({ slices: 5, rung: 29, tick: 58, packets: true });
		expect(profileFor(1000)).toMatchObject({ slices: 4, rung: 26, tick: 48, packets: true });
		expect(profileFor(390)).toMatchObject({
			slices: 3,
			rung: 18,
			tick: 34,
			maxRungs: 3,
			rungLife: 2.4,
			packets: false,
			gain: 1.15,
			pointer: false,
		});
	});
});

describe('bufferScale', () => {
	const base = { dpr: 2, cssW: 1440, cssH: 500, tier: 0, narrow: false, cores: 8 };
	test('caps devicePixelRatio at 2', () => {
		expect(bufferScale({ ...base, dpr: 3 })).toBe(2);
	});
	test('holds the drawing buffer under the pixel ceiling', () => {
		const s = bufferScale({ ...base, cssH: 1500 });
		expect(1440 * 1500 * s * s).toBeLessThanOrEqual(3.2e6 + 1);
	});
	test('quality tiers and weak phones lower the scale', () => {
		expect(bufferScale({ ...base, tier: 1 })).toBe(1.25);
		expect(bufferScale({ ...base, tier: 2 })).toBe(1);
		expect(bufferScale({ ...base, cssW: 390, narrow: true, cores: 4 })).toBe(1.5);
	});
});

describe('Quality', () => {
	test('steps down on a slow mean and never back up', () => {
		const q = new Quality();
		for (let i = 0; i < 90; i++) q.sample(16.7);
		expect(q.tier).toBe(0);
		for (let i = 0; i < 90; i++) q.sample(24);
		expect(q.tier).toBe(1);
		for (let i = 0; i < 90; i++) q.sample(8);
		expect(q.tier).toBe(1);
		for (let i = 0; i < 90; i++) q.sample(45);
		expect(q.tier).toBe(2);
		for (let i = 0; i < 90; i++) q.sample(45);
		expect(q.tier).toBe(3);
	});
	test('three long tasks in a row stop the animation', () => {
		const q = new Quality();
		q.longTask();
		q.longTask();
		q.sample(16);
		q.longTask();
		expect(q.tier).toBe(0);
		q.longTask();
		q.longTask();
		expect(q.tier).toBe(3);
	});
	test('save-data starts at tier 2', () => {
		expect(new Quality(true).tier).toBe(2);
	});
});

describe('FluxSim', () => {
	const run = (sim: FluxSim, L: Layout, from: number, to: number, feed = true) => {
		for (let t = from; t <= to; t += 1000 / 60) {
			if (feed && Math.floor(t / TICK_MS) !== Math.floor((t - 1000 / 60) / TICK_MS)) {
				sim.telemetry(t, tel(Math.floor(t / TICK_MS)));
			}
			sim.step(t, L, L.landX);
		}
	};

	test('a beat launches one slice per configured slot, alternating sides', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.telemetry(0, tel(1));
		sim.step(200, L, L.landX);
		const segs = segments(sim);
		expect(segs).toHaveLength(5);
		expect(segs.map((s) => s.dir).sort()).toEqual([-1, -1, 1, 1, 1]);
		for (const s of segs) expect(s.y).toBeLessThanOrEqual(L.glassY);
	});

	test('slices land with their leading tip on the landing x and on the baseline', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.telemetry(0, tel(1));
		const flight = sim.flightMs;
		sim.step(flight * 0.999, L, L.landX);
		const [first] = segments(sim)
			.filter((s) => s.dir === 1)
			.sort((a, b) => Math.abs(a.x1 - L.landX) - Math.abs(b.x1 - L.landX));
		expect(first).toBeDefined();
		expect(Math.abs((first?.x1 ?? 0) - L.landX)).toBeLessThan(1);
		expect(Math.abs((first?.y ?? 0) - L.glassY)).toBeLessThan(1);
	});

	test('landings drive the impact, then history rungs rise above the glass', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.telemetry(0, tel(1));
		sim.step(sim.flightMs + 20, L, L.landX);
		expect(sim.impact).toBeGreaterThan(0.5);
		expect(sim.flare).toBeGreaterThan(0.5);
		expect(sim.split).toBeGreaterThan(1);
		sim.step(sim.flightMs + 1500, L, L.landX);
		expect(sim.impact).toBeLessThan(0.01);
		const rungs = segments(sim);
		expect(rungs.length).toBeGreaterThan(0);
		for (const r of rungs) {
			expect(r.y).toBeLessThan(L.glassY);
			expect(r.x1 - r.x0).toBeLessThan((L.shot[2] - L.shot[0]) * 0.52);
		}
	});

	test('higher latency flies slower', () => {
		const sim = new FluxSim();
		sim.telemetry(0, tel(0, { g2g: 7.4 }));
		const fast = sim.flightMs;
		sim.telemetry(0, tel(2, { g2g: 9.9 }));
		expect(sim.flightMs).toBeGreaterThan(fast * 1.3);
	});

	test('off-beat even ticks send packets on desktop and nothing on a phone', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.telemetry(0, tel(2));
		sim.step(100, L, L.landX);
		const segs = segments(sim);
		expect(segs).toHaveLength(1);
		expect(segs[0]?.y).toBe(L.glassY);

		const phone = new FluxSim();
		phone.configure(profileFor(390), 0);
		phone.telemetry(0, tel(2));
		phone.step(100, L, L.landX);
		expect(segments(phone)).toHaveLength(0);
	});

	test('a spike tears the middle slice and a parity slice recovers it from the other side', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.telemetry(0, tel(3, { spike: true }));
		sim.step(260, L, L.landX);
		expect(segments(sim)).toHaveLength(6);
		sim.step(sim.flightMs * 0.8, L, L.landX);
		// the torn slice has dropped out
		expect(segments(sim).length).toBeLessThan(6);

		let maxSplit = 0;
		for (let t = sim.flightMs; t < 2000; t += 5) {
			sim.step(t, L, L.landX);
			maxSplit = Math.max(maxSplit, sim.split);
		}
		expect(maxSplit).toBeGreaterThan(3);

		// rate limited: a second spike inside 4.2 s is an ordinary tick
		sim.telemetry(3000, tel(4, { spike: true }));
		sim.step(3050, L, L.landX);
		expect(segments(sim).filter((s) => s.y < L.glassY - 1 && s.e > 0.5)).toHaveLength(0);
	});

	test('rungs on a phone are capped at three', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(390), 0);
		run(sim, L, 0, 2600);
		const rungs = segments(sim).filter((s) => s.soft > 10);
		expect(rungs.length).toBeGreaterThan(0);
		expect(rungs.length).toBeLessThanOrEqual(3);
	});

	test('tier 2 keeps three slices and drops packets', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 2);
		sim.telemetry(0, tel(1));
		sim.step(200, L, L.landX);
		expect(segments(sim)).toHaveLength(3);
		sim.telemetry(1000, tel(2));
		sim.step(1100, L, L.landX);
		expect(segments(sim).filter((s) => s.y === L.glassY)).toHaveLength(0);
	});

	test('the still is the composed ladder, not a paused frame', () => {
		const L = desktop(2);
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		sim.still(L, L.landX);
		const segs = segments(sim);
		expect(segs).toHaveLength(STILL.slices.length + STILL.rungs.length);
		expect(sim.impact).toBe(0.35);
		expect(sim.split).toBeCloseTo(2.2);
		expect(sim.flare).toBe(0);
		const rungYs = segs.filter((s) => s.e < 0.5).map((s) => (L.glassY - s.y) / L.px);
		expect(rungYs).toEqual(STILL.rungs.map((r) => r.rise));
	});

	test('the frame never packs more than NSEG segments', () => {
		const L = desktop();
		const sim = new FluxSim();
		sim.configure(profileFor(1440), 0);
		for (let t = 0; t < 10000; t += 1000 / 60) {
			if (Math.floor(t / TICK_MS) !== Math.floor((t - 1000 / 60) / TICK_MS)) {
				sim.telemetry(t, tel(Math.floor(t / TICK_MS), { spike: Math.random() < 0.2 }));
			}
			sim.step(t, L, L.landX);
			expect(sim.count).toBeLessThanOrEqual(NSEG);
		}
	});
});

describe('TelemetryClock', () => {
	test('takes over after the meter has been quiet for 600 ms, and yields when it returns', () => {
		const ticks: number[] = [];
		const clock = new TelemetryClock(() => 0.5);
		clock.external(0);
		clock.due(FALLBACK_MS - 1, (at) => ticks.push(at));
		expect(ticks).toHaveLength(0);
		clock.due(FALLBACK_MS, (at) => ticks.push(at));
		expect(clock.isInternal).toBe(true);
		clock.due(FALLBACK_MS + 3 * TICK_MS, (at) => ticks.push(at));
		expect(ticks).toEqual([0, 1, 2, 3].map((i) => FALLBACK_MS + i * TICK_MS));

		clock.external(1200);
		clock.due(1300, (at) => ticks.push(at));
		expect(clock.isInternal).toBe(false);
		expect(ticks).toHaveLength(4);
	});

	test('a stopped meter hands over at once', () => {
		const ticks: number[] = [];
		const clock = new TelemetryClock(() => 0.5);
		clock.external(1000);
		clock.stopped();
		clock.due(1010, (at) => ticks.push(at));
		expect(ticks).toEqual([1010]);
	});

	test('internal ticks keep the meter statistics', () => {
		let seed = 1;
		const rnd = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		const seen: Telemetry[] = [];
		const clock = new TelemetryClock(rnd);
		for (let t = 0; t < TICK_MS * 4000; t += 16) clock.due(t, (_, x) => seen.push(x));
		expect(seen.length).toBeGreaterThan(3900);
		for (const t of seen) {
			expect(t.g2g).toBeGreaterThanOrEqual(7.4);
			expect(t.g2g).toBeLessThanOrEqual(9.9);
		}
		const spikes = seen.filter((t) => t.spike).length / seen.length;
		expect(spikes).toBeGreaterThan(0.02);
		expect(spikes).toBeLessThan(0.05);
	});
});

describe('shader colour', () => {
	const linear = (hex: string) =>
		[1, 3, 5].map((i) => {
			const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
	const constant = (name: string) => {
		const m = FRAGMENT.match(new RegExp(`const vec3 ${name} = vec3\\(([^)]+)\\)`));
		return (m?.[1] ?? '').split(',').map(Number);
	};

	test.each([
		['K10', '#C9D9FF'],
		['K40', '#FFD1A3'],
		['K30', '#FFB46B'],
		['ACC', '#FF7A1F'],
		['BONE', '#F2EFEA'],
	])('%s is the linear form of the brand token %s', (name, hex) => {
		const got = constant(name);
		const want = linear(hex);
		expect(got).toHaveLength(3);
		for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i] as number, 4);
	});

	test('no signal colour reaches the hero', () => {
		const consts = [...FRAGMENT.matchAll(/vec3\(([\d., ]+)\)/g)].map((m) => m[1]);
		for (const hex of ['#4CD69B', '#F2C94C', '#FF5A5A']) {
			const sig = linear(hex)
				.map((v) => v.toFixed(5))
				.join(', ');
			expect(consts).not.toContain(sig);
		}
	});
});
