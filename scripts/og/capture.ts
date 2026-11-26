/**
 * Captures the home page's ClientShot window at its native 1440 × 900, 2× DPR, into
 * src/assets/og/client.png, the source of the marketing cards. Needs Chrome and a fresh build:
 *
 *   bun run build && bun scripts/og/capture.ts
 *
 * PLANCK_CHROME overrides the browser path. Run `bun run og` afterwards.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
	process.env.PLANCK_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = new URL('../../', import.meta.url).pathname;
const DIST = join(root, 'dist');
const OUT = join(root, 'src/assets/og/client.png');

// The frame alone at the client's own 1440 px width, so one CSS px is one client px: no meter
// overlay, no glow, no border or shadow (the card draws its own).
const STYLE = `
	.shot { padding-inline: 0 !important; }
	.shot__stack { width: 1440px !important; max-width: 1440px !important; }
	.shot__glow, [data-shot-meter], .hero__beam, .hero__beam-flat, .wash { display: none !important; }
	.shot__frame { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
`;

const server = Bun.serve({
	port: 0,
	hostname: '127.0.0.1',
	fetch(req) {
		const path = new URL(req.url).pathname;
		const file = Bun.file(join(DIST, path === '/' ? 'index.html' : path));
		return file.size ? new Response(file) : new Response('not found', { status: 404 });
	},
});
const profile = mkdtempSync(join(tmpdir(), 'planck-og-'));
const chrome = Bun.spawn(
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

try {
	const reader = (chrome.stderr as ReadableStream<Uint8Array>).getReader();
	let log = '';
	let url = '';
	while (!url) {
		const { value, done } = await reader.read();
		if (done) throw new Error(`Chrome exited: ${log}`);
		log += new TextDecoder().decode(value);
		url = log.match(/DevTools listening on (ws:\/\/\S+)/)?.[1] ?? '';
	}
	const ws = new WebSocket(url);
	await new Promise((ok, fail) => {
		ws.addEventListener('open', ok);
		ws.addEventListener('error', fail);
	});
	let id = 0;
	const pending = new Map<number, (m: { result?: unknown; error?: unknown }) => void>();
	ws.addEventListener('message', (e) => {
		const m = JSON.parse(String(e.data));
		if (m.id !== undefined) pending.get(m.id)?.(m);
	});
	const send = <T>(method: string, params: object = {}, sessionId?: string) =>
		new Promise<T>((ok, fail) => {
			const n = ++id;
			pending.set(n, (m) =>
				m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result as T),
			);
			ws.send(JSON.stringify({ id: n, method, params, sessionId }));
		});

	const { targetId } = await send<{ targetId: string }>('Target.createTarget', {
		url: 'about:blank',
	});
	const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', {
		targetId,
		flatten: true,
	});
	const s = <T>(m: string, p: object = {}) => send<T>(m, p, sessionId);
	const evaluate = async <T>(expression: string) =>
		(
			await s<{ result: { value: T } }>('Runtime.evaluate', {
				expression,
				awaitPromise: true,
				returnByValue: true,
			})
		).result.value;

	await s('Page.enable');
	await s('Emulation.setDeviceMetricsOverride', {
		width: 1600,
		height: 1200,
		deviceScaleFactor: 2,
		mobile: false,
	});
	await s('Emulation.setEmulatedMedia', {
		features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
	});
	await s('Page.navigate', { url: `http://127.0.0.1:${server.port}/` });
	for (let i = 0; i < 100 && (await evaluate<string>('document.readyState')) !== 'complete'; i++) {
		await Bun.sleep(50);
	}
	const rect = await evaluate<{
		x: number;
		y: number;
		width: number;
		height: number;
	}>(`(async () => {
		const style = document.createElement('style');
		style.textContent = ${JSON.stringify(STYLE)};
		document.head.append(style);
		await document.fonts.ready;
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const r = document.querySelector('[data-shot-frame]').getBoundingClientRect();
		return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
	})()`);
	if (Math.round(rect.width) !== 1440 || Math.round(rect.height) !== 900) {
		throw new Error(`client frame is ${rect.width}×${rect.height}, expected 1440×900`);
	}
	const { data } = await s<{ data: string }>('Page.captureScreenshot', {
		format: 'png',
		captureBeyondViewport: true,
		clip: { ...rect, scale: 1 },
	});
	await Bun.write(OUT, Buffer.from(data, 'base64'));
	console.log('src/assets/og/client.png');
	ws.close();
} finally {
	chrome.kill();
	server.stop(true);
	rmSync(profile, { recursive: true, force: true });
}
