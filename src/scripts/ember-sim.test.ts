import { describe, expect, test } from 'bun:test';
import { FRAGMENT, UNIFORMS } from './ember-shader';
import {
	bufferScale,
	Coupling,
	frozenTime,
	MAX_DPR,
	measure,
	POUR,
	pour,
	Quality,
	SETTLED,
	sameLayout,
} from './ember-sim';

const box = (left: number, top: number, right: number, bottom: number) => ({
	left,
	top,
	right,
	bottom,
});

// Measured on the built page. 1440 × 900: frame top 603, copy right edge 1028.
const HERO = box(0, 76, 1440, 1576);
const FRAME = box(72, 603, 1368, 1413);
const COPY = box(412, 186, 1028, 466);
const desktop = () => measure(HERO, FRAME, COPY, 14);

// 390 × 844: the frame runs past the right edge of the screen and the copy spans the width.
const PHONE_HERO = box(0, 60, 390, 1368);
const PHONE_FRAME = box(32, 551, 374, 765);
const PHONE_COPY = box(24, 150, 366, 451);
const phone = () => measure(PHONE_HERO, PHONE_FRAME, PHONE_COPY, 14);

describe('measure', () => {
	test('desktop: the beam lands right of the copy and left of the corner', () => {
		const L = desktop();
		expect(L.frame).toEqual([72, 527, 1368, 1337]);
		expect(L.beamX).toBeGreaterThanOrEqual(0.74 * 1440);
		expect(L.beamX).toBeGreaterThanOrEqual(1028 + 110);
		expect(L.beamX).toBeLessThanOrEqual(1368 - 14 - 64);
		expect(L.source).toBe(0);
		expect(L.corner).toBeCloseTo(1368 - 14 - L.beamX + (Math.PI / 2) * 14, 6);
		expect(L.side).toBe(1337 - 527 - 14);
	});

	test('phone: the stream starts under the copy instead of crossing it', () => {
		const L = phone();
		expect(L.beamX).toBeGreaterThan(PHONE_COPY.left);
		expect(L.beamX).toBeLessThan(PHONE_COPY.right);
		expect(L.source).toBeGreaterThanOrEqual(PHONE_COPY.bottom - 60);
		expect(L.source).toBeLessThan(L.frame[1]);
		expect(L.beamX).toBeLessThanOrEqual(374 - 14 - 36);
	});

	test('the radius is clamped to the frame', () => {
		expect(measure(HERO, box(100, 600, 120, 610), COPY, 40).radius).toBe(5);
	});

	test('sameLayout compares every field that reaches the shader', () => {
		const a = desktop();
		expect(sameLayout(null, a)).toBe(false);
		expect(sameLayout(a, desktop())).toBe(true);
		expect(sameLayout(a, measure(HERO, FRAME, box(412, 186, 1028, 470), 14))).toBe(false);
		expect(sameLayout(a, measure(HERO, FRAME, COPY, 12))).toBe(false);
	});
});

describe('pour', () => {
	const L = desktop();
	const top = L.frame[1];

	test('descent: the head starts above the hero and accelerates onto the top edge', () => {
		const a = pour(0, L);
		expect(a.front).toBeLessThan(0);
		const quarter = pour(POUR.impact * 0.25, L).front - a.front;
		const last = pour(POUR.impact, L).front - pour(POUR.impact * 0.75, L).front;
		expect(last).toBeGreaterThan(quarter * 2);
		expect(pour(POUR.impact, L).front).toBeCloseTo(top, 6);
		expect(pour(0.3, L).runR).toBeLessThan(0);
		expect(pour(0.3, L).flash).toBe(0);
	});

	test('impact knee: a flash, and the light reaches the corner by the end of the knee', () => {
		const hit = pour(POUR.impact + 0.06, L);
		expect(hit.flash).toBeGreaterThan(0.5);
		expect(pour(0.7, L).runR).toBeGreaterThan(0);
		expect(pour(0.7, L).runR).toBeLessThan(L.corner);
		expect(pour(POUR.corner, L).runR).toBeCloseTo(L.corner, 6);
		expect(pour(POUR.corner, L).flash).toBeLessThan(0.15);
	});

	test('spill: the light runs down the whole side by the end of the spill', () => {
		const mid = pour(1.15, L).runR;
		expect(mid).toBeGreaterThan(L.corner);
		expect(mid).toBeLessThan(L.corner + L.side);
		expect(pour(POUR.spilled, L).runR).toBeGreaterThanOrEqual(L.corner + L.side);
	});

	test('every channel is monotonic through the load, then settles', () => {
		let prev = pour(0, L);
		for (let t = 0.01; t < POUR.settled; t += 0.01) {
			const next = pour(t, L);
			expect(next.front).toBeGreaterThanOrEqual(prev.front - 1e-9);
			expect(next.runR).toBeGreaterThanOrEqual(prev.runR - 1e-9);
			expect(next.runL).toBeGreaterThanOrEqual(prev.runL - 1e-9);
			expect(next.bloom).toBeGreaterThanOrEqual(prev.bloom - 1e-9);
			prev = next;
		}
		expect(prev.bloom).toBeGreaterThan(0.99);
		expect(pour(POUR.settled, L)).toEqual({ ...SETTLED, front: top });
		expect(pour(60, L).done).toBe(true);
	});

	test('the phone pour starts at the source, not above the hero', () => {
		const P = phone();
		expect(pour(0, P).front).toBeCloseTo(P.source - 30, 6);
	});
});

describe('Coupling', () => {
	test('low latency runs hotter than high latency', () => {
		const fast = new Coupling();
		const slow = new Coupling();
		fast.telemetry(0, { g2g: 7.4, spike: false });
		slow.telemetry(0, { g2g: 9.9, spike: false });
		for (let i = 0; i < 120; i++) {
			fast.step(1 / 60);
			slow.step(1 / 60);
		}
		expect(fast.energy).toBeGreaterThan(1.05);
		expect(slow.energy).toBeLessThan(0.95);
		expect(fast.energy).toBeLessThanOrEqual(1.2);
		expect(slow.energy).toBeGreaterThanOrEqual(0.82);
	});

	test('a spike starts one ripple, spikes are throttled, and the ripple ends', () => {
		const c = new Coupling();
		expect(c.ripple).toBe(-1);
		c.telemetry(10, { g2g: 8.4, spike: true });
		expect(c.ripple).toBe(0);
		c.step(0.5);
		c.telemetry(10.5, { g2g: 8.4, spike: true });
		expect(c.ripple).toBeCloseTo(0.5, 6);
		for (let i = 0; i < 200; i++) c.step(1 / 60);
		expect(c.ripple).toBe(-1);
		c.telemetry(14, { g2g: 8.4, spike: true });
		expect(c.ripple).toBe(0);
	});
});

describe('bufferScale', () => {
	test('device pixel ratio is capped', () => {
		expect(bufferScale({ dpr: 3, cssW: 390, cssH: 1300, tier: 0 })).toBe(MAX_DPR);
		expect(bufferScale({ dpr: 1, cssW: 1440, cssH: 1500, tier: 0 })).toBe(1);
		expect(bufferScale({ dpr: 2, cssW: 390, cssH: 1300, tier: 1 })).toBe(1.25);
	});

	test('the pixel ceiling bounds the buffer on large heroes', () => {
		const s = bufferScale({ dpr: 2, cssW: 2560, cssH: 1767, tier: 0 });
		expect(2560 * s * 1767 * s).toBeLessThanOrEqual(3.2e6 * 1.0001);
	});
});

describe('Quality', () => {
	test('a slow frame rate steps the tier down and never back up', () => {
		const q = new Quality();
		for (let i = 0; i < 90; i++) q.sample(33);
		expect(q.tier).toBe(2);
		for (let i = 0; i < 180; i++) q.sample(16);
		expect(q.tier).toBe(2);
	});
});

describe('frozenTime', () => {
	test.each([
		['', null],
		['?beamt=0.7', 0.7],
		['?beamt=0', 0],
		['?beamt=', null],
		['?beamt=-1', null],
		['?beamt=abc', null],
		['?beamt=1e9', 600],
	])('%s', (search, want) => {
		expect(frozenTime(search)).toBe(want);
	});
});

describe('shader', () => {
	const linear = (hex: string) =>
		[1, 3, 5].map((i) => {
			const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
			return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});

	test.each([
		['BONE', '#F2EFEA'],
		['AMBER', '#FFD1A3'],
		['EMBER', '#FF7A1F'],
		['DEEP', '#E85D0E'],
		['COOL', '#C9D9FF'],
	])('%s is the linear form of the brand colour %s', (name, hex) => {
		const m = FRAGMENT.match(new RegExp(`const vec3 ${name} = vec3\\(([^)]+)\\)`));
		const got = (m?.[1] ?? '').split(',').map(Number);
		const want = linear(hex);
		expect(got).toHaveLength(3);
		for (let i = 0; i < 3; i++)
			expect(Math.abs((got[i] as number) - (want[i] as number))).toBeLessThan(0.003);
	});

	test('every uniform the driver sets is declared', () => {
		for (const u of UNIFORMS) expect(FRAGMENT).toMatch(new RegExp(`uniform \\w+ ${u};`));
	});
});
