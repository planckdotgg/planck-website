import { FRAGMENT, UNIFORMS, type Uniform, VERTEX } from './ember-shader';
import {
	bufferScale,
	Coupling,
	frozenTime,
	type Layout,
	measure,
	POUR,
	type Pour,
	pour,
	Quality,
	STILL_TIER,
	sameLayout,
	spring,
	type Telemetry,
} from './ember-sim';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

interface Renderer {
	gl: GL;
	loc: Record<Uniform, WebGLUniformLocation | null>;
}

const ATTRS: WebGLContextAttributes = {
	alpha: true,
	premultipliedAlpha: true,
	antialias: false,
	depth: false,
	stencil: false,
};
const COMPLETION_STATUS_KHR = 0x91b1;
const LEAN = 26;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function build(gl: GL): Promise<Renderer | null> {
	const prog = gl.createProgram();
	if (!prog) return null;
	for (const [type, src] of [
		[gl.VERTEX_SHADER, VERTEX],
		[gl.FRAGMENT_SHADER, FRAGMENT],
	] as const) {
		const sh = gl.createShader(type);
		if (!sh) return null;
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		gl.attachShader(prog, sh);
	}
	gl.linkProgram(prog);
	// Querying link status blocks until the driver finishes; poll first so the main thread stays free.
	if (gl.getExtension('KHR_parallel_shader_compile')) {
		while (!gl.isContextLost() && !gl.getProgramParameter(prog, COMPLETION_STATUS_KHR)) {
			await nextFrame();
		}
	}
	if (gl.isContextLost() || !gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
	gl.useProgram(prog);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const a = gl.getAttribLocation(prog, 'a');
	gl.enableVertexAttribArray(a);
	gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
	gl.clearColor(0, 0, 0, 0);
	const loc = {} as Renderer['loc'];
	for (const n of UNIFORMS) loc[n] = gl.getUniformLocation(prog, n);
	return { gl, loc };
}

function mount(canvas: HTMLCanvasElement) {
	const hero = canvas.closest<HTMLElement>('.hero');
	const frame = hero?.querySelector<HTMLElement>('[data-shot-frame]');
	const copy = hero?.querySelector<HTMLElement>('.hero__copy');
	if (!hero || !frame || !copy) return;

	const reduce = matchMedia('(prefers-reduced-motion: reduce)');
	const hover = matchMedia('(hover: hover) and (min-width: 768px)');
	const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
	const quality = new Quality(!!nav.connection?.saveData || matchMedia('(update: slow)').matches);
	const coupling = new Coupling();
	const frozen = frozenTime(location.search);

	let gl: GL | null = null;
	let renderer: Renderer | null = null;
	let layout: Layout | null = null;
	let px = 1;
	let glassCss = '';
	let beamCss = '';
	let impactCss = '';

	let raf = 0;
	let visible = false;
	let last = 0;
	// The load sequence starts at the first drawn frame, not at script start.
	let introT = frozen ?? -1;
	let time = frozen ?? 0;
	let lean = 0;
	let leanT = 0;
	let stillDrawn = false;

	const still = () => frozen !== null || reduce.matches || quality.tier >= STILL_TIER;

	const setFlat = (on: boolean) => {
		hero.classList.toggle('hero--flat', on);
		hero.classList.toggle('is-beam', !on && !!renderer);
	};

	const draw = (state: Pour) => {
		const r = renderer;
		const L = layout;
		if (!r || !L) return;
		const { gl, loc } = r;
		gl.uniform2f(loc.uRes, canvas.width, canvas.height);
		gl.uniform1f(loc.uPx, px);
		gl.uniform1f(loc.uTime, time);
		gl.uniform4f(loc.uFrame, ...L.frame);
		gl.uniform1f(loc.uRadius, L.radius);
		gl.uniform4f(loc.uCopy, ...L.copy);
		gl.uniform3f(loc.uBeam, L.beamX, lean, L.source);
		gl.uniform1f(loc.uFront, Math.min(state.front, L.frame[1]));
		gl.uniform2f(loc.uRun, state.runR, state.runL);
		gl.uniform3f(loc.uGlow, state.flash, state.bloom, coupling.energy);
		gl.uniform2f(loc.uRipple, Math.max(0, coupling.ripple), coupling.ripple >= 0 ? 1 : 0);
		gl.uniform1f(loc.uDither, quality.tier < 2 ? 1 : 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		const landed = state.front >= L.frame[1] - 1;
		const impact = landed ? Math.min(1, 0.55 + 0.45 * state.flash) * state.bloom : 0;
		const css = (Math.round(impact * 50) / 50).toString();
		if (css !== impactCss) {
			impactCss = css;
			frame.style.setProperty('--beam-impact', css);
		}
	};

	const state = (): Pour | null => {
		if (!layout) return null;
		if (still() && frozen === null) return pour(POUR.settled, layout);
		return pour(Math.max(0, introT), layout);
	};

	const render = () => {
		const s = state();
		if (s) draw(s);
	};

	const renderStill = () => {
		stillDrawn = true;
		render();
	};

	const sync = (force = false) => {
		const h = hero.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		const radius = Number.parseFloat(getComputedStyle(frame).borderTopRightRadius) || 0;
		const next = measure(h, f, copy.getBoundingClientRect(), radius);
		const glass = `${next.frame[1].toFixed(1)}px`;
		if (glass !== glassCss) {
			glassCss = glass;
			hero.style.setProperty('--glass-y', glass);
		}
		const beam = `${next.beamX.toFixed(1)}px`;
		if (beam !== beamCss) {
			beamCss = beam;
			hero.style.setProperty('--beam-x', beam);
		}
		if (!renderer || !gl) return;
		const nextPx = bufferScale({
			dpr: devicePixelRatio,
			cssW: next.w,
			cssH: next.h,
			tier: quality.tier,
		});
		const bw = Math.max(1, Math.round(next.w * nextPx));
		const bh = Math.max(1, Math.round(next.h * nextPx));
		const resized = canvas.width !== bw || canvas.height !== bh;
		if (resized) {
			canvas.width = bw;
			canvas.height = bh;
			gl.viewport(0, 0, bw, bh);
		}
		px = bw / next.w;
		const changed = !sameLayout(layout, next);
		layout = next;
		// Resizing the buffer clears it, so redraw now rather than show one blank or stale frame.
		if (!(changed || resized || force)) return;
		if (still()) renderStill();
		else if (raf || resized || force) render();
	};

	const loop = (now: number) => {
		raf = requestAnimationFrame(loop);
		// The first callback's timestamp can precede the performance.now() taken in start().
		const ms = Math.max(0, now - last);
		last = now;
		if (document.hasFocus() && quality.sample(ms)) {
			sync(true);
			if (still()) {
				update();
				return;
			}
		}
		const dt = Math.min(0.05, ms / 1000);
		if (introT < 0) introT = 0;
		else introT += dt;
		time += dt;
		lean = spring(lean, leanT, dt, 0.5);
		coupling.step(dt);
		render();
	};

	const start = () => {
		if (raf) return;
		last = performance.now();
		quality.reset();
		raf = requestAnimationFrame(loop);
	};
	const stop = () => {
		cancelAnimationFrame(raf);
		raf = 0;
	};

	const update = () => {
		if (!renderer) {
			stop();
			return;
		}
		if (still()) {
			stop();
			if (!stillDrawn) renderStill();
			return;
		}
		stillDrawn = false;
		if (visible && !document.hidden) start();
		else stop();
	};

	const onTelemetry = (e: Event) => {
		if (!raf) return;
		const d = (e as CustomEvent<Partial<Telemetry>>).detail;
		coupling.telemetry(time, {
			g2g: d?.g2g ?? 8.4,
			sample: d?.sample,
			spike: !!d?.spike,
		});
	};

	const onMove = (e: PointerEvent) => {
		if (e.pointerType !== 'mouse' || !hover.matches || !layout) return;
		const x = e.clientX - hero.getBoundingClientRect().left;
		leanT = Math.max(-1, Math.min(1, (x - layout.beamX) / 420)) * LEAN;
	};
	const onLeave = () => {
		leanT = 0;
	};

	const io = new IntersectionObserver(
		(entries) => {
			visible = entries.some((e) => e.isIntersecting);
			update();
		},
		{ rootMargin: '120px' },
	);
	const ro = new ResizeObserver(() => sync());

	const attach = async () => {
		if (!gl) return;
		renderer = await build(gl);
		if (!renderer) {
			setFlat(true);
			return;
		}
		layout = null;
		setFlat(false);
		sync(true);
		update();
	};

	if (new URLSearchParams(location.search).has('noflux')) {
		canvas.remove();
	} else {
		gl = (canvas.getContext('webgl2', ATTRS) as GL | null) ?? canvas.getContext('webgl', ATTRS);
	}
	if (!gl) {
		canvas.remove();
		setFlat(true);
	} else {
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault();
			renderer = null;
			stop();
			setFlat(true);
		});
		canvas.addEventListener('webglcontextrestored', () => {
			stillDrawn = false;
			void attach();
		});
	}

	ro.observe(hero);
	ro.observe(frame);
	addEventListener('resize', () => sync(), { passive: true });
	addEventListener('scroll', () => sync(), { passive: true });
	visualViewport?.addEventListener('resize', () => sync(), { passive: true });
	document.fonts.ready.then(() => sync());
	if (!gl) return;

	io.observe(hero);
	document.addEventListener('visibilitychange', update);
	reduce.addEventListener('change', update);
	document.addEventListener('planck:telemetry', onTelemetry);
	hero.addEventListener('pointermove', onMove, { passive: true });
	hero.addEventListener('pointerleave', onLeave, { passive: true });
	if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
		new PerformanceObserver((list) => {
			if (!raf || introT < 2) return;
			const n = list.getEntries().length;
			for (let i = 0; i < n; i++) {
				if (quality.longTask()) {
					sync(true);
					update();
					return;
				}
			}
		}).observe({ type: 'longtask' });
	}

	// Compiling the shader is the one expensive step; keep it out of the first paint.
	if ('requestIdleCallback' in window) requestIdleCallback(() => void attach(), { timeout: 800 });
	else setTimeout(() => void attach(), 200);
}

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas.hero__beam'))
	mount(canvas);
