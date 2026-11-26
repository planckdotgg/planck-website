import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { applyKey, combine, InputDelay, NEUTRAL, releaseAll } from './input';
import { layer, parseScene, SHAPE_COUNT } from './scene';
import {
	createState,
	GATE_HALF_WIDTH,
	type Gate,
	idealU,
	RACER_Z,
	type SimState,
	START_U,
	step,
	threads,
	U_MAX,
} from './sim';
import { depthToY, innerAt, outerAt, trackPoint, uAt, yToDepth } from './track';

const DT = 1 / 240;

function run(state: SimState, seconds: number, input = NEUTRAL) {
	for (let t = 0; t < seconds; t += DT) step(state, input, DT);
}

describe('InputDelay', () => {
	test('returns neutral before anything was pressed', () => {
		const d = new InputDelay();
		expect(d.sample(100, 4)).toEqual(NEUTRAL);
	});

	test('applies a press only after the latency has passed', () => {
		const d = new InputDelay();
		d.push(1000, { steer: -1, brake: false });
		expect(d.sample(1044, 45).steer).toBe(0);
		expect(d.sample(1045, 45).steer).toBe(-1);
		expect(d.sample(1004, 4).steer).toBe(-1);
	});

	test('a release is delayed the same way', () => {
		const d = new InputDelay();
		d.push(0, { steer: 1, brake: false });
		d.push(500, NEUTRAL);
		expect(d.sample(530, 45).steer).toBe(1);
		expect(d.sample(545, 45).steer).toBe(0);
	});

	test('pruning keeps the state that was held before the horizon', () => {
		const d = new InputDelay(100);
		d.push(0, { steer: -1, brake: true });
		d.push(50, { steer: 1, brake: false });
		for (let t = 60; t < 2000; t += 16) d.sample(t, 4);
		expect(d.sample(2000, 45)).toEqual({ steer: 1, brake: false });
	});

	test('a sample that prunes old states still returns the held state', () => {
		const d = new InputDelay(100);
		d.push(0, { steer: -1, brake: false });
		d.push(50, { steer: 1, brake: true });
		expect(d.sample(2000, 0)).toEqual({ steer: 1, brake: true });
		expect(d.sample(2001, 0)).toEqual({ steer: 1, brake: true });
	});

	test('timestamps never run backwards', () => {
		const d = new InputDelay();
		d.push(100, { steer: 1, brake: false });
		d.push(90, { steer: -1, brake: false });
		expect(d.sample(100, 0).steer).toBe(-1);
	});
});

describe('combine', () => {
	test('keys and pointers steer; two pointers on both sides brake', () => {
		expect(combine({ left: true, right: false, brake: false }, { left: 0, right: 0 })).toEqual({
			steer: -1,
			brake: false,
		});
		expect(combine({ left: false, right: false, brake: false }, { left: 1, right: 1 })).toEqual({
			steer: 0,
			brake: true,
		});
		expect(combine({ left: false, right: false, brake: true }, { left: 0, right: 1 })).toEqual({
			steer: 1,
			brake: true,
		});
	});
});

describe('applyKey', () => {
	test('a steer key released while the latency radio has focus is let go', () => {
		const keys = { left: false, right: false, brake: false };
		expect(applyKey(keys, 'ArrowLeft', true)).toBe(true);
		expect(keys.left).toBe(true);
		expect(applyKey(keys, 'ArrowLeft', false, true)).toBe(true);
		expect(keys.left).toBe(false);
	});

	test('an arrow press the radio uses itself does not steer', () => {
		const keys = { left: false, right: false, brake: false };
		expect(applyKey(keys, 'ArrowRight', true, true)).toBe(false);
		expect(keys.right).toBe(false);
	});

	test('releaseAll drops every held key', () => {
		const keys = { left: true, right: true, brake: true };
		releaseAll(keys);
		expect(keys).toEqual({ left: false, right: false, brake: false });
	});
});

describe('track', () => {
	test('rails meet the art at the bottom edge and near the apex', () => {
		expect(innerAt(516).x).toBeCloseTo(74, 0);
		expect(outerAt(516).x).toBeCloseTo(916, 0);
		expect(innerAt(240).x).toBeGreaterThan(700);
		expect(outerAt(240).x).toBeGreaterThan(innerAt(240).x);
	});

	test('depth and row convert both ways', () => {
		for (const z of [1, 2.5, 10, 30]) expect(yToDepth(depthToY(z))).toBeCloseTo(z, 6);
		expect(depthToY(1)).toBe(516);
	});

	test('uAt inverts trackPoint on the inner edge row', () => {
		const p = trackPoint(0, 400);
		expect(uAt(p.x, 400)).toBeCloseTo(0, 6);
	});
});

describe('simulation', () => {
	test('starts in the pose of the hero art', () => {
		const s = createState();
		expect(s.u).toBe(START_U);
		expect(START_U).toBeGreaterThan(0.2);
		expect(START_U).toBeLessThan(0.6);
	});

	test('with no input the turn pushes the racer to the outer rail', () => {
		const s = createState();
		run(s, 4);
		expect(s.u).toBe(U_MAX);
		expect(s.sinceScrape).toBeLessThan(0.1);
	});

	test('steering in holds the racer off the outer rail', () => {
		const s = createState();
		run(s, 0.3, { steer: -1, brake: false });
		expect(s.u).toBeLessThan(START_U);
		expect(s.sinceScrape).toBe(Number.POSITIVE_INFINITY);
	});

	test('the airbrake slows the racer and its drift', () => {
		const free = createState();
		const braked = createState();
		run(free, 1);
		run(braked, 1, { steer: 0, brake: true });
		expect(braked.speed).toBeLessThan(free.speed);
		expect(braked.u).toBeLessThan(free.u);
	});

	test('the racer banks into the steer', () => {
		const s = createState();
		run(s, 0.5, { steer: -1, brake: false });
		expect(s.bank).toBeGreaterThan(0.2);
	});

	test('gates spawn, travel toward the racer, and are judged once', () => {
		const s = createState(7);
		expect(s.gates.length).toBe(2);
		const first = s.gates[0] as Gate;
		const results: string[] = [];
		for (let t = 0; t < 3; t += DT) {
			first.center = s.u;
			const before = first.result;
			step(s, NEUTRAL, DT);
			if (first.result !== before) results.push(first.result);
		}
		expect(results).toEqual(['threaded']);
		expect(s.threaded).toBe(1);
		expect(s.gates.some((g) => g.id > 2)).toBe(true);
	});

	test('a racer outside the opening misses the gate', () => {
		const s = createState(3);
		s.gates.push({
			id: 99,
			z: RACER_Z + 0.01,
			center: 0.9,
			halfWidth: GATE_HALF_WIDTH,
			result: 'pending',
		});
		s.u = 0.2;
		step(s, { steer: 0, brake: false }, DT);
		expect(s.missed).toBe(1);
		expect(s.streak).toBe(0);
	});

	test('threads() honours the opening edge', () => {
		const gate: Gate = { id: 1, z: 5, center: 0.4, halfWidth: 0.15, result: 'pending' };
		expect(threads(gate, 0.4)).toBe(true);
		expect(threads(gate, 0.52)).toBe(true);
		expect(threads(gate, 0.56)).toBe(false);
	});

	test('the same seed gives the same course', () => {
		const a = createState(42);
		const b = createState(42);
		run(a, 6);
		run(b, 6);
		expect(a.gates.map((g) => g.center)).toEqual(b.gates.map((g) => g.center));
	});

	test('the racing line passes through pending gate centers', () => {
		const s = createState(11);
		run(s, 3);
		const gate = s.gates.find((g) => g.result === 'pending') as Gate;
		expect(idealU(s, gate.z)).toBeCloseTo(gate.center, 6);
	});

	test('a 45 ms delay leaves the racer wider than 4 ms on the same input', () => {
		const press = { steer: -1, brake: false };
		const outcome = (latencyMs: number) => {
			const s = createState();
			const d = new InputDelay();
			let ms = 0;
			for (let i = 0; i < 240; i++) {
				ms = i * DT * 1000;
				const pressed = i % 60 < 30;
				d.push(ms, pressed ? press : NEUTRAL);
				step(s, d.sample(ms, latencyMs), DT);
			}
			return s.u;
		};
		expect(outcome(45)).toBeGreaterThan(outcome(4));
	});
});

describe('scene', () => {
	const svg = readFileSync(new URL('../../assets/hero-scene.svg', import.meta.url), 'utf8');
	const shapes = parseScene(svg);

	test('reads every element of the hero art', () => {
		expect(shapes.length).toBe(SHAPE_COUNT);
	});

	test('layers land on the expected parts of the art', () => {
		const gate = layer(shapes, 'gate');
		expect(gate.some((s) => s.stroke === '#4CD69BF5')).toBe(true);
		const racer = layer(shapes, 'racer');
		expect(racer.some((s) => s.fill === '#FF7A1F')).toBe(true);
		const rails = layer(shapes, 'rails');
		expect(rails.every((s) => s.tag === 'path' && s.stroke)).toBe(true);
		expect(layer(shapes, 'centerline')[0]?.dash).toEqual([16, 14]);
	});

	test('circles and polygons become closed path data', () => {
		expect(shapes[0]?.d.startsWith('M')).toBe(true);
		expect(shapes[0]?.d.endsWith('Z')).toBe(true);
		const poly = shapes.find((s) => s.tag === 'polygon');
		expect(poly?.d).toMatch(/^M[\d.]+,[\d.]+ L/);
	});
});
