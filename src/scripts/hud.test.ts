import { afterEach, beforeEach, expect, test } from 'bun:test';
import { autoHideHud } from './hud.ts';

type Listener = (e: Record<string, unknown>) => void;

function fakeElement() {
	const listeners: Record<string, Listener[]> = {};
	const el = {
		dataset: {} as Record<string, string>,
		focusWithin: false,
		children: new Set<unknown>(),
		addEventListener: (type: string, fn: Listener) => {
			listeners[type] ??= [];
			listeners[type].push(fn);
		},
		dispatch: (type: string, e: Record<string, unknown> = {}) => {
			for (const fn of listeners[type] ?? []) fn(e);
		},
		matches: (sel: string) => sel === ':focus-within' && el.focusWithin,
		contains: (node: unknown) => node === el || el.children.has(node),
		querySelector: () => null,
		setAttribute: () => {},
		getBoundingClientRect: () => ({ top: 0, height: 100 }),
		title: '',
	};
	return el;
}

const realClearTimeout = globalThis.clearTimeout;
let now = 0;
let timers = new Map<number, { at: number; fn: () => void }>();
let nextId = 1;
const advance = (ms: number) => {
	now += ms;
	for (const [id, t] of timers) {
		if (t.at > now) continue;
		timers.delete(id);
		t.fn();
	}
};

beforeEach(() => {
	now = 0;
	timers = new Map();
	const g = globalThis as Record<string, unknown>;
	g.window = {
		setTimeout: (fn: () => void, ms: number) => {
			timers.set(nextId, { at: now + ms, fn });
			return nextId++;
		},
	};
	g.document = { addEventListener: () => {} };
	g.clearTimeout = (id: number) => timers.delete(id);
});
afterEach(() => {
	globalThis.clearTimeout = realClearTimeout;
});

test('the unpinned HUD hides after focus leaves it, even when the idle timeout already passed', () => {
	const root = fakeElement();
	const area = fakeElement();
	const pill = fakeElement();
	area.children.add(pill);
	autoHideHud(root as never, area as never, pill as never, 2500);

	area.focusWithin = true;
	area.dispatch('focusin');
	advance(3000);
	expect(root.dataset.hudHidden).toBeUndefined();

	area.focusWithin = false;
	area.dispatch('focusout', { relatedTarget: null });
	advance(2499);
	expect(root.dataset.hudHidden).toBeUndefined();
	advance(1);
	expect(root.dataset.hudHidden).toBe('');
});
