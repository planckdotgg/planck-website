import sceneSvg from '../../assets/hero-scene.svg?raw';
import { applyKey, type ControlInput, combine, InputDelay, releaseAll } from './input';
import { Renderer } from './render';
import { parseScene } from './scene';
import { createState, type SimState, step } from './sim';

const DT = 1 / 240;
const LATENCY = { planck: 4, cloud: 45 } as const;
type Mode = keyof typeof LATENCY;

function setup(root: HTMLElement) {
	const dialog = root.querySelector<HTMLDialogElement>('[data-demo-dialog]');
	const stage = root.querySelector<HTMLElement>('[data-demo-stage]');
	const canvas = root.querySelector<HTMLCanvasElement>('[data-demo-canvas]');
	const telemetry = root.querySelector<HTMLElement>('[data-demo-telemetry]');
	const gatesOut = root.querySelector<HTMLElement>('[data-demo-gates]');
	const exit = root.querySelector<HTMLButtonElement>('[data-demo-exit]');
	const openers = [...root.querySelectorAll<HTMLButtonElement>('[data-demo-open]')];
	const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
	if (!dialog || !stage || !canvas || !telemetry || !gatesOut || !exit) return;

	let renderer: Renderer;
	try {
		renderer = new Renderer(canvas, parseScene(sceneSvg));
	} catch {
		return;
	}

	const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
	const delay = new InputDelay();
	const keys = { left: false, right: false, brake: false };
	const pointers = new Map<number, 'left' | 'right'>();
	let mode: Mode = 'planck';
	let state: SimState = createState();
	let frame = 0;
	let last = 0;
	let acc = 0;
	let fps = 60;
	let lastReadout = 0;
	let opener: HTMLElement | null = null;
	let running = false;
	let engaged = false;

	const current = (): ControlInput => {
		let left = 0;
		let right = 0;
		for (const side of pointers.values()) {
			if (side === 'left') left++;
			else right++;
		}
		return combine(keys, { left, right });
	};
	const record = (time: number) => delay.push(time, current());

	const readout = () => {
		telemetry.textContent = `${Math.round(fps)} FPS · 4:4:4 · ${LATENCY[mode]} ms (simulated)`;
		const judged = state.threaded + state.missed;
		gatesOut.textContent = `Gates ${state.threaded} / ${judged}`;
	};

	const selectMode = (next: Mode, focus = false) => {
		mode = next;
		dialog.dataset.mode = next;
		for (const r of radios) {
			const on = r.dataset.mode === next;
			r.setAttribute('aria-checked', String(on));
			r.tabIndex = on ? 0 : -1;
			if (on && focus) r.focus();
		}
		readout();
		if (dialog.open && !running) draw();
	};

	const draw = () => renderer.draw({ state, mode, reduced: reducedQuery.matches });

	const resize = () => {
		const rect = stage.getBoundingClientRect();
		renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
		draw();
	};

	const tick = (now: number) => {
		frame = requestAnimationFrame(tick);
		const elapsed = Math.min(100, now - last);
		if (elapsed > 0) fps += (1000 / elapsed - fps) * 0.08;
		const start = last;
		last = now;
		acc += elapsed / 1000;
		record(now);
		let k = 0;
		while (acc >= DT) {
			acc -= DT;
			k++;
			const at = Math.min(now, start + k * DT * 1000);
			step(state, delay.sample(at, LATENCY[mode]), DT);
		}
		draw();
		if (now - lastReadout > 250) {
			lastReadout = now;
			readout();
		}
	};

	const start = () => {
		cancelAnimationFrame(frame);
		running = true;
		last = performance.now();
		acc = 0;
		frame = requestAnimationFrame(tick);
	};
	const stop = () => {
		cancelAnimationFrame(frame);
		running = false;
	};
	// With reduced motion the run waits on a still frame until the player first steers or brakes.
	const mayRun = () => engaged || !reducedQuery.matches;
	const engage = () => {
		const input = current();
		if (input.steer === 0 && !input.brake) return;
		engaged = true;
		if (!running && dialog.open && !document.hidden) start();
	};
	const releaseControls = () => {
		releaseAll(keys);
		pointers.clear();
		record(performance.now());
	};

	const open = (from: HTMLElement) => {
		opener = from;
		state = createState((Math.random() * 2 ** 32) >>> 0);
		delay.clear();
		releaseAll(keys);
		pointers.clear();
		engaged = false;
		fps = 60;
		document.documentElement.classList.add('demo-open');
		dialog.showModal();
		stage.focus({ preventScroll: true });
		resize();
		readout();
		if (mayRun()) start();
	};

	const onKey = (e: KeyboardEvent, down: boolean) => {
		const inRadios = (e.target as HTMLElement).getAttribute?.('role') === 'radio';
		if (!applyKey(keys, e.code, down, inRadios && e.key.startsWith('Arrow'))) return;
		e.preventDefault();
		record(e.timeStamp);
		if (down) engage();
	};

	for (const b of openers) {
		b.hidden = false;
		b.addEventListener('click', () => open(b));
	}
	exit.addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => {
		stop();
		document.documentElement.classList.remove('demo-open');
		opener?.focus({ preventScroll: true });
	});
	dialog.addEventListener('keydown', (e) => onKey(e, true));
	dialog.addEventListener('keyup', (e) => onKey(e, false));
	window.addEventListener('blur', releaseControls);

	stage.addEventListener('pointerdown', (e) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		if ((e.target as Element).closest('button')) return;
		const rect = stage.getBoundingClientRect();
		pointers.set(e.pointerId, e.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
		stage.setPointerCapture(e.pointerId);
		record(e.timeStamp);
		engage();
	});
	const release = (e: PointerEvent) => {
		if (!pointers.delete(e.pointerId)) return;
		record(e.timeStamp);
	};
	stage.addEventListener('pointerup', release);
	stage.addEventListener('pointercancel', release);
	stage.addEventListener('contextmenu', (e) => e.preventDefault());

	radios.forEach((r, i) => {
		r.addEventListener('click', () => selectMode(r.dataset.mode as Mode));
		r.addEventListener('keydown', (e) => {
			if (
				e.key !== 'ArrowLeft' &&
				e.key !== 'ArrowRight' &&
				e.key !== 'ArrowUp' &&
				e.key !== 'ArrowDown'
			)
				return;
			e.preventDefault();
			const next = radios[(i + 1) % radios.length];
			if (next) selectMode(next.dataset.mode as Mode, true);
		});
	});

	new ResizeObserver(() => {
		if (dialog.open) resize();
	}).observe(stage);

	document.addEventListener('visibilitychange', () => {
		if (!dialog.open) return;
		if (document.hidden) {
			releaseControls();
			stop();
		} else if (mayRun()) start();
	});

	selectMode('planck');
	root.dataset.demoReady = '';
}

for (const root of document.querySelectorAll<HTMLElement>('[data-demo]')) setup(root);
