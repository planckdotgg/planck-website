/**
 * Glassline acceptance in a real Chrome against the built site. Opt-in, because it needs a
 * Chrome binary and a fresh `bun run build`:
 *
 *   bun run build && PLANCK_BROWSER_TEST=1 bun test src/scripts/flux.browser.test.ts
 *
 * PLANCK_CHROME overrides the browser path; PLANCK_SHOTS=dir saves screenshots.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUN = process.env.PLANCK_BROWSER_TEST === '1';
const CHROME =
	process.env.PLANCK_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = join(import.meta.dir, '../../dist');
const SHOTS = process.env.PLANCK_SHOTS;

// Runs before any page script: counts draws, keeps the drawing buffer readable, stubs WebGL
// away on ?nogl, and sums layout shifts.
const PROBE = `(() => {
	const f = (window.__flux = { draws: 0, cls: 0, gl: null, prog: null });
	for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (!P) continue;
		const draw = P.prototype.drawArrays;
		P.prototype.drawArrays = function (...a) { f.draws++; f.gl = this; return draw.apply(this, a); };
		const use = P.prototype.useProgram;
		P.prototype.useProgram = function (p) { f.prog = p; return use.call(this, p); };
	}
	const get = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (type, attrs) {
		if (!String(type).startsWith('webgl')) return get.call(this, type, attrs);
		if (location.search.includes('nogl')) return null;
		return get.call(this, type, { ...attrs, preserveDrawingBuffer: true });
	};
	new PerformanceObserver((l) => {
		for (const e of l.getEntries()) if (!e.hadRecentInput) f.cls += e.value;
	}).observe({ type: 'layout-shift', buffered: true });
})();`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RemoteValue {
	value?: unknown;
	description?: string;
}

interface Msg {
	id?: number;
	method?: string;
	sessionId?: string;
	params?: {
		type?: string;
		args?: RemoteValue[];
		exceptionDetails?: { text?: string; exception?: RemoteValue };
	};
	result?: unknown;
	error?: unknown;
}

interface Reply {
	targetId: string;
	sessionId: string;
	data: string;
	result: RemoteValue;
	exceptionDetails?: unknown;
}

class CDP {
	private id = 0;
	private pending = new Map<number, { ok: (v: Reply) => void; fail: (e: Error) => void }>();
	readonly listeners = new Set<(m: Msg) => void>();

	private constructor(private ws: WebSocket) {
		ws.addEventListener('message', (e) => {
			const m = JSON.parse(String(e.data)) as Msg;
			if (m.id !== undefined) {
				const p = this.pending.get(m.id);
				this.pending.delete(m.id);
				if (m.error) p?.fail(new Error(JSON.stringify(m.error)));
				else p?.ok(m.result as Reply);
			} else for (const l of this.listeners) l(m);
		});
	}

	static connect(url: string) {
		return new Promise<CDP>((ok, fail) => {
			const ws = new WebSocket(url);
			ws.addEventListener('open', () => ok(new CDP(ws)));
			ws.addEventListener('error', () => fail(new Error(`cannot reach ${url}`)));
		});
	}

	send(method: string, params: object = {}, sessionId?: string): Promise<Reply> {
		const id = ++this.id;
		this.ws.send(JSON.stringify({ id, method, params, sessionId }));
		return new Promise((ok, fail) => this.pending.set(id, { ok, fail }));
	}

	close() {
		this.ws.close();
	}
}

interface PageOpts {
	width: number;
	height: number;
	dpr?: number;
	mobile?: boolean;
	reduce?: boolean;
	query?: string;
}

let server: ReturnType<typeof Bun.serve> | undefined;
let chrome: ReturnType<typeof Bun.spawn> | undefined;
let cdp: CDP | undefined;
let profile = '';

async function open(o: PageOpts) {
	const c = cdp as CDP;
	const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
	const s = (m: string, p: object = {}) => c.send(m, p, sessionId);
	const errors: string[] = [];
	const listen = (m: Msg) => {
		if (m.sessionId !== sessionId) return;
		const d = m.params?.exceptionDetails;
		if (m.method === 'Runtime.exceptionThrown') {
			errors.push(d?.exception?.description ?? d?.text ?? 'exception');
		}
		if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
			errors.push((m.params.args ?? []).map((a) => String(a.value ?? a.description)).join(' '));
		}
	};
	c.listeners.add(listen);
	await s('Page.enable');
	await s('Runtime.enable');
	const metrics = (w: number, h: number) =>
		s('Emulation.setDeviceMetricsOverride', {
			width: w,
			height: h,
			deviceScaleFactor: o.dpr ?? 2,
			mobile: !!o.mobile,
		});
	await metrics(o.width, o.height);
	if (o.reduce) {
		await s('Emulation.setEmulatedMedia', {
			features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
		});
	}
	await s('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
	await s('Page.navigate', { url: `http://127.0.0.1:${server?.port}/${o.query ?? ''}` });

	const evaluate = async <T>(expression: string): Promise<T> => {
		const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
		return r.result.value as T;
	};
	for (let i = 0; i < 100; i++) {
		const state = await evaluate<string>(
			`(() => { const h = document.querySelector('.hero'); return h && (h.classList.contains('is-flux') || h.classList.contains('hero--flat')) ? 'ready' : document.readyState })()`,
		).catch(() => 'loading');
		if (state === 'ready') break;
		await sleep(50);
	}
	return {
		evaluate,
		errors,
		metrics,
		s,
		shot: async (name: string) => {
			if (!SHOTS) return;
			const { data } = await s('Page.captureScreenshot', { format: 'png' });
			await Bun.write(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
		},
		close: async () => {
			c.listeners.delete(listen);
			await c.send('Target.closeTarget', { targetId });
		},
	};
}

const frames = (n: number) =>
	`new Promise((r) => { let i = ${n}; const f = () => (--i <= 0 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`;

const draws = `window.__flux.draws`;

// Worst added luminance of the canvas inside the .hero__copy rect, decoded from sRGB.
const COPY_MAX_Y = `(() => {
	const f = window.__flux, gl = f.gl, cv = document.querySelector('canvas.hero__flux');
	const h = cv.closest('.hero').getBoundingClientRect();
	const c = document.querySelector('.hero__copy').getBoundingClientRect();
	const sx = cv.width / h.width, sy = cv.height / h.height;
	const x0 = Math.floor((c.left - h.left) * sx), x1 = Math.ceil((c.right - h.left) * sx);
	const y0 = Math.floor((c.top - h.top) * sy), y1 = Math.ceil((c.bottom - h.top) * sy);
	const w = x1 - x0, hh = y1 - y0, px = new Uint8Array(w * hh * 4);
	gl.readPixels(x0, cv.height - y1, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
	const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
	let max = 0;
	for (let i = 0; i < px.length; i += 4) {
		const y = 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
		if (y > max) max = y;
	}
	return max;
})()`;

// The uniforms the shader actually holds, against a fresh DOM measure.
const GEOMETRY = `(() => {
	const f = window.__flux, gl = f.gl, p = f.prog, cv = document.querySelector('canvas.hero__flux');
	const u = (n) => gl.getUniform(p, gl.getUniformLocation(p, n));
	const h = cv.closest('.hero').getBoundingClientRect();
	const fr = document.querySelector('[data-shot-frame]').getBoundingClientRect();
	const s = cv.width / h.width;
	return { glassY: u('uGlassY'), want: (fr.top - h.top) * s, shotL: u('uShot')[0], wantL: (fr.left - h.left) * s,
		px: u('uPx'), tick: u('uTick'), bufW: cv.width, bufH: cv.height, cssW: h.width, cssH: h.height };
})()`;

describe.skipIf(!RUN)('Glassline in Chrome', () => {
	beforeAll(async () => {
		server = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch(req) {
				const path = new URL(req.url).pathname;
				const file = Bun.file(join(DIST, path === '/' ? 'index.html' : path));
				return file.size ? new Response(file) : new Response('not found', { status: 404 });
			},
		});
		profile = mkdtempSync(join(tmpdir(), 'planck-flux-'));
		chrome = Bun.spawn(
			[
				CHROME,
				'--headless=new',
				'--remote-debugging-port=0',
				`--user-data-dir=${profile}`,
				'--no-first-run',
				'--hide-scrollbars',
				'about:blank',
			],
			{ stderr: 'pipe', stdout: 'ignore' },
		);
		const reader = (chrome.stderr as ReadableStream<Uint8Array>).getReader();
		let text = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) throw new Error(`Chrome exited: ${text}`);
			text += new TextDecoder().decode(value);
			const m = text.match(/DevTools listening on (ws:\/\/\S+)/);
			if (m?.[1]) {
				cdp = await CDP.connect(m[1]);
				break;
			}
		}
	}, 30000);

	afterAll(() => {
		cdp?.close();
		chrome?.kill();
		server?.stop(true);
		if (profile) rmSync(profile, { recursive: true, force: true });
	});

	test('desktop: copy stays under the luminance ceiling, with and without the CTA drive', async () => {
		const p = await open({ width: 1440, height: 900, dpr: 2 });
		expect(
			await p.evaluate<boolean>(`document.querySelector('.hero').classList.contains('is-flux')`),
		).toBe(true);
		let worst = 0;
		for (let i = 0; i < 14; i++) {
			await sleep(170);
			worst = Math.max(worst, await p.evaluate<number>(COPY_MAX_Y));
		}
		await p.shot('desktop-1440');
		const btn = await p.evaluate<{ x: number; y: number }>(
			`(() => { const r = document.querySelector('.hero__ctas .btn--primary').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
		);
		await p.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btn.x, y: btn.y });
		for (let i = 0; i < 14; i++) {
			await sleep(170);
			worst = Math.max(worst, await p.evaluate<number>(COPY_MAX_Y));
		}
		await p.shot('desktop-1440-cta');
		console.log(`worst added Y inside .hero__copy: ${worst.toFixed(5)}`);
		expect(worst).toBeGreaterThan(0);
		expect(worst).toBeLessThanOrEqual(0.0075);
		expect(await p.evaluate<number>('window.__flux.cls')).toBe(0);
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);

	test('desktop: the baseline sits on the frame top and re-derives on resize', async () => {
		const p = await open({ width: 1440, height: 900, dpr: 2 });
		for (const [w, h, mobile] of [
			[1440, 900, false],
			[768, 1024, false],
			[390, 844, true],
			[2560, 1080, false],
		] as const) {
			await p.s('Emulation.setDeviceMetricsOverride', {
				width: w,
				height: h,
				deviceScaleFactor: 2,
				mobile,
			});
			await p.evaluate(frames(1));
			const g = await p.evaluate<Record<string, number>>(GEOMETRY);
			console.log(`${w}x${h}`, JSON.stringify(g));
			expect(Math.abs((g.glassY as number) - (g.want as number))).toBeLessThan(1);
			expect(Math.abs((g.shotL as number) - (g.wantL as number))).toBeLessThan(1);
			expect(g.px).toBeLessThanOrEqual(2);
			expect((g.bufW as number) * (g.bufH as number)).toBeLessThanOrEqual(3.2e6 * 1.01);
			expect(g.tick).toBe(w <= 767 ? 34 : w >= 1200 ? 58 : 48);
		}
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);

	test('the loop stops off-screen and when the tab hides, and resumes', async () => {
		const p = await open({ width: 1440, height: 900, dpr: 1 });
		await sleep(300);
		const a = await p.evaluate<number>(draws);
		await sleep(300);
		expect(await p.evaluate<number>(draws)).toBeGreaterThan(a);

		await p.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
		await sleep(400);
		const off = await p.evaluate<number>(draws);
		await sleep(600);
		expect(await p.evaluate<number>(draws)).toBe(off);
		await p.evaluate(`window.scrollTo(0, 0)`);
		await sleep(400);
		expect(await p.evaluate<number>(draws)).toBeGreaterThan(off);

		const hide = (on: boolean) =>
			p.evaluate(
				`Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${on} }); document.dispatchEvent(new Event('visibilitychange'))`,
			);
		await hide(true);
		await sleep(200);
		const hidden = await p.evaluate<number>(draws);
		await sleep(600);
		expect(await p.evaluate<number>(draws)).toBe(hidden);
		await hide(false);
		await sleep(300);
		expect(await p.evaluate<number>(draws)).toBeGreaterThan(hidden);
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);

	test('reduced motion draws exactly one frame', async () => {
		const p = await open({ width: 1440, height: 900, dpr: 2, reduce: true });
		await sleep(2000);
		await p.shot('reduced-motion');
		expect(await p.evaluate<number>(draws)).toBe(1);
		expect(
			await p.evaluate<boolean>(`document.querySelector('.hero').classList.contains('is-flux')`),
		).toBe(true);
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);

	for (const query of ['?noflux=1', '?nogl=1']) {
		test(`${query} shows the CSS twin with no layout shift`, async () => {
			const p = await open({ width: 1440, height: 900, dpr: 2, query });
			await sleep(800);
			const r = await p.evaluate<Record<string, unknown>>(`(() => {
				const h = document.querySelector('.hero');
				const flat = h.querySelector('.hero__flux-flat');
				return { flat: h.classList.contains('hero--flat'), flux: h.classList.contains('is-flux'),
					canvas: !!h.querySelector('canvas.hero__flux'), shown: getComputedStyle(flat).display,
					glass: h.style.getPropertyValue('--glass-y'),
					frameTop: document.querySelector('[data-shot-frame]').getBoundingClientRect().top - h.getBoundingClientRect().top,
					cls: window.__flux.cls };
			})()`);
			await p.shot(`flat${query.replace(/\W/g, '-')}`);
			expect(r).toMatchObject({ flat: true, flux: false, canvas: false, shown: 'block', cls: 0 });
			expect(Math.abs(Number.parseFloat(String(r.glass)) - (r.frameTop as number))).toBeLessThan(1);
			expect(p.errors).toEqual([]);
			await p.close();
		}, 30000);
	}

	test('context loss falls back flat, and a restore brings the shader back', async () => {
		const p = await open({ width: 1440, height: 900, dpr: 1 });
		await sleep(300);
		await p.evaluate(
			`window.__lose = window.__flux.gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext()`,
		);
		await sleep(300);
		const lost = await p.evaluate<Record<string, unknown>>(
			`({ flat: document.querySelector('.hero').classList.contains('hero--flat'), shown: getComputedStyle(document.querySelector('.hero__flux')).display, draws: window.__flux.draws })`,
		);
		expect(lost).toMatchObject({ flat: true, shown: 'none' });
		await sleep(400);
		expect(await p.evaluate<number>(draws)).toBe(lost.draws as number);
		await p.evaluate(`window.__lose.restoreContext()`);
		await sleep(1200);
		const back = await p.evaluate<Record<string, unknown>>(
			`({ flat: document.querySelector('.hero').classList.contains('hero--flat'), flux: document.querySelector('.hero').classList.contains('is-flux'), draws: window.__flux.draws })`,
		);
		expect(back).toMatchObject({ flat: false, flux: true });
		expect(back.draws as number).toBeGreaterThan(lost.draws as number);
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);

	test('phone 390x844: geometry follows the cropped frame, copy stays legible', async () => {
		const p = await open({ width: 390, height: 844, dpr: 3, mobile: true });
		await sleep(1500);
		const g = await p.evaluate<Record<string, number>>(GEOMETRY);
		console.log('390x844@3', JSON.stringify(g));
		expect(Math.abs((g.glassY as number) - (g.want as number))).toBeLessThan(1);
		expect(g.px).toBeLessThanOrEqual(2);
		expect(g.tick).toBe(34);
		let worst = 0;
		for (let i = 0; i < 10; i++) {
			await sleep(200);
			worst = Math.max(worst, await p.evaluate<number>(COPY_MAX_Y));
		}
		console.log(`phone worst added Y inside .hero__copy: ${worst.toFixed(5)}`);
		expect(worst).toBeLessThanOrEqual(0.0075);
		await p.shot('phone-390');
		expect(await p.evaluate<number>('window.__flux.cls')).toBe(0);
		expect(p.errors).toEqual([]);
		await p.close();
	}, 30000);
});
