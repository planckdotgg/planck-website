import { FRAGMENT, UNIFORMS, type Uniform, VERTEX } from './flux-shader';
import {
	bufferScale,
	CAP,
	FluxSim,
	type Layout,
	measure,
	type Profile,
	profileFor,
	Quality,
	STILL_TIER,
	sameLayout,
	spring,
	type Telemetry,
	TelemetryClock,
	TIERS,
} from './flux-sim';

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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function build(gl: GL): Promise<Renderer | null> {
	const prog = gl.createProgram();
	const shaders = [
		[gl.VERTEX_SHADER, VERTEX],
		[gl.FRAGMENT_SHADER, FRAGMENT],
	] as const;
	if (!prog) return null;
	for (const [type, src] of shaders) {
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
	const meter = hero?.querySelector<HTMLElement>('[data-shot-meter]') ?? null;
	const copy = hero?.querySelector<HTMLElement>('.hero__copy');
	if (!hero || !frame || !copy) return;

	const reduce = matchMedia('(prefers-reduced-motion: reduce)');
	const hover = matchMedia('(hover: hover)');
	const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
	const quality = new Quality(!!nav.connection?.saveData || matchMedia('(update: slow)').matches);
	const sim = new FluxSim();
	const clock = new TelemetryClock(() => sim.rnd());

	let gl: GL | null = null;
	let renderer: Renderer | null = null;
	let layout: Layout | null = null;
	let profile: Profile = profileFor(innerWidth);
	let heroPage = { x: 0, y: 0 };
	let glassCss = '';
	let impactCss = '';

	let raf = 0;
	let visible = false;
	let last = 0;
	let simT = 0;
	const t0 = performance.now();
	let lastInput = t0;
	let skip = false;

	// Pointer state is in CSS px relative to the hero; it is scaled at upload.
	let lx = Number.NaN;
	let ptrX = 0;
	let ptrY = 0;
	let ptrTX = 0;
	let ptrTY = 0;
	let ptrIn = 0;
	let ptrInT = 0;
	let onShot = 0;
	let onShotT = 0;
	let drive = 0;
	let driveT = 0;
	let aimX = 0;
	let aimUntil = 0;

	const still = () => reduce.matches || quality.tier >= STILL_TIER;
	const pointerOn = () => profile.pointer && hover.matches;

	const setFlat = (on: boolean) => {
		hero.classList.toggle('hero--flat', on);
		hero.classList.toggle('is-flux', !on && !!renderer);
	};

	const draw = (lean: number) => {
		const r = renderer;
		const L = layout;
		if (!r || !L) return;
		const { gl, loc } = r;
		const px = L.px;
		gl.uniform2f(loc.uRes, L.w, L.h);
		gl.uniform1f(loc.uPx, px);
		gl.uniform1f(loc.uTime, (performance.now() - t0) / 1000);
		gl.uniform4f(loc.uShot, ...L.shot);
		gl.uniform1f(loc.uShotR, 14 * px);
		gl.uniform4f(loc.uMeter, ...L.meter);
		gl.uniform1f(loc.uMeterR, 12 * px);
		gl.uniform2f(loc.uBand, L.band[0], L.band[1]);
		gl.uniform1f(loc.uGlassY, L.glassY);
		gl.uniform1f(loc.uLandX, lean);
		gl.uniform1f(loc.uTickX, L.landX);
		gl.uniform1f(loc.uTick, profile.tick);
		gl.uniform2f(loc.uPtr, ptrX * px, ptrY * px);
		gl.uniform1f(loc.uOnShot, onShot);
		gl.uniform1f(loc.uImpact, sim.impact);
		gl.uniform1f(loc.uSplit, sim.split);
		gl.uniform1f(loc.uFlare, sim.flare);
		gl.uniform1f(loc.uWaveR, sim.waveR);
		gl.uniform1f(loc.uWaveE, sim.waveE);
		gl.uniform1f(loc.uRunY, sim.runY);
		gl.uniform1f(loc.uRunE, sim.runE);
		gl.uniform1f(loc.uGain, profile.gain * (1 + 0.3 * drive));
		gl.uniform1f(loc.uCap, CAP);
		gl.uniform1f(loc.uDither, (TIERS[quality.tier] ?? TIERS[0])?.dither ? 1 : 0);
		gl.uniform4fv(loc.uSeg, sim.segA);
		gl.uniform4fv(loc.uSegB, sim.segB);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		const impact = (Math.round(Math.min(1, sim.impact) * 50) / 50).toString();
		if (impact !== impactCss) {
			impactCss = impact;
			frame.style.setProperty('--flux-impact', impact);
		}
	};

	const renderLive = () => {
		if (!layout) return;
		sim.step(simT, layout, lx * layout.px);
		draw(lx * layout.px);
	};

	let stillDrawn = false;
	const renderStill = () => {
		if (!layout) return;
		stillDrawn = true;
		lx = layout.landX / layout.px;
		sim.still(layout, layout.landX);
		draw(layout.landX);
	};

	const sync = (force = false) => {
		const h = hero.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		const glass = `${(f.top - h.top).toFixed(1)}px`;
		if (glass !== glassCss) {
			glassCss = glass;
			hero.style.setProperty('--glass-y', glass);
		}
		if (!renderer || !gl) return;
		const vw = innerWidth;
		profile = profileFor(vw);
		sim.configure(profile, quality.tier);
		const px = bufferScale({
			dpr: devicePixelRatio,
			cssW: h.width,
			cssH: h.height,
			tier: quality.tier,
			narrow: profile.narrow,
			cores: navigator.hardwareConcurrency || 8,
		});
		const next = measure(
			h,
			f,
			meter?.getBoundingClientRect() ?? null,
			copy.getBoundingClientRect(),
			px,
		);
		heroPage = { x: h.left + scrollX, y: h.top + scrollY };
		const resized = !layout || layout.w !== next.w || layout.h !== next.h;
		if (resized) {
			canvas.width = next.w;
			canvas.height = next.h;
			gl.viewport(0, 0, next.w, next.h);
		}
		const changed = !sameLayout(layout, next);
		if (layout && !Number.isNaN(lx)) lx += next.landX / next.px - layout.landX / layout.px;
		else lx = next.landX / next.px;
		layout = next;
		// Resizing the buffer clears it, so redraw now rather than show one blank or stale frame.
		if (!(changed || resized || force)) return;
		if (still()) renderStill();
		else if (raf || resized || force) renderLive();
	};

	const loop = (t: number) => {
		raf = requestAnimationFrame(loop);
		// The first callback's timestamp can precede the performance.now() taken in start().
		const ms = Math.max(0, t - last);
		last = t;
		if (document.hasFocus() && quality.sample(ms)) {
			sync(true);
			if (still()) {
				update();
				return;
			}
		}
		const dt = Math.min(0.05, ms / 1000);
		simT += dt * 1000;
		ptrX = spring(ptrX, ptrTX, dt, 0.16);
		ptrY = spring(ptrY, ptrTY, dt, 0.16);
		ptrIn = spring(ptrIn, ptrInT, dt, 0.22);
		onShot = spring(onShot, onShotT, dt, 0.28);
		drive = spring(drive, driveT, dt, 0.12);
		if (layout) {
			const land = layout.landX / layout.px;
			const target =
				simT < aimUntil
					? Math.min(layout.shot[2], Math.max(layout.shot[0], aimX * layout.px)) / layout.px
					: land + (ptrX - land) * 0.1 * ptrIn;
			lx = spring(lx, target, dt, 0.16);
		}
		clock.due(simT, (at, tel) => sim.telemetry(at, tel));
		// The motion is slow enough that 30 fps after 20 s without input is invisible.
		if (t - lastInput > 20000) {
			skip = !skip;
			if (skip) return;
		}
		renderLive();
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
		clock.external(simT);
		sim.telemetry(simT, { g2g: d?.g2g ?? 8.4, spike: !!d?.spike, seq: d?.seq });
	};
	const onTelemetryState = (e: Event) => {
		if (!(e as CustomEvent<{ running?: boolean }>).detail?.running) clock.stopped();
	};

	const local = (e: PointerEvent) => ({ x: e.pageX - heroPage.x, y: e.pageY - heroPage.y });
	const inShot = (x: number, y: number) => {
		if (!layout) return false;
		const [l, t, r, b] = layout.shot;
		const px = layout.px;
		return x * px > l && x * px < r && y * px > t && y * px < b;
	};
	const onMove = (e: PointerEvent) => {
		if (e.pointerType === 'touch' || !pointerOn()) return;
		const p = local(e);
		ptrTX = p.x;
		ptrTY = p.y;
		ptrInT = 1;
		onShotT = inShot(p.x, p.y) ? 1 : 0;
		lastInput = performance.now();
	};
	const onLeave = () => {
		ptrInT = 0;
		onShotT = 0;
	};
	const onDown = (e: PointerEvent) => {
		lastInput = performance.now();
		if (!raf || e.pointerType === 'mouse') return;
		aimX = local(e).x;
		aimUntil = simT + sim.flightMs + 400;
		sim.beat(simT);
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
	visualViewport?.addEventListener('resize', () => sync(), { passive: true });
	document.fonts.ready.then(() => sync());
	if (!gl) return;

	io.observe(hero);
	document.addEventListener('visibilitychange', update);
	reduce.addEventListener('change', update);
	document.addEventListener('planck:telemetry', onTelemetry);
	document.addEventListener('planck:telemetry-state', onTelemetryState);
	hero.addEventListener('pointermove', onMove, { passive: true });
	hero.addEventListener('pointerleave', onLeave, { passive: true });
	hero.addEventListener('pointerdown', onDown, { passive: true });
	for (const btn of hero.querySelectorAll<HTMLElement>('.hero__ctas .btn')) {
		const primary = btn.classList.contains('btn--primary');
		const on = () => {
			driveT = primary ? 1 : 0.4;
			lastInput = performance.now();
			if (primary && raf) sim.fire(simT);
		};
		const off = () => {
			driveT = 0;
		};
		btn.addEventListener('pointerenter', on);
		btn.addEventListener('focus', on);
		btn.addEventListener('pointerleave', off);
		btn.addEventListener('blur', off);
	}
	if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
		new PerformanceObserver((list) => {
			if (!raf || simT < 2000) return;
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

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas.hero__flux'))
	mount(canvas);
