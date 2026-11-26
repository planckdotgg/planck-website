/**
 * Keeps the session meter alive: a frame-time bar graph and a glass-to-glass figure that drift
 * the way a real 120 Hz session does, around the measured 8.4 ms p50.
 */
const BASE = 8.4;

function start(root: HTMLElement) {
	const graph = root.querySelector<HTMLElement>('[data-shot-graph]');
	const value = root.querySelector<HTMLElement>('[data-shot-g2g]');
	if (!graph || !value) return;

	const bars = [...graph.querySelectorAll<HTMLSpanElement>('span')];
	if (bars.length === 0) return;

	const samples = new Array(bars.length).fill(0).map(() => 0.3 + Math.random() * 0.22);
	let shown = BASE;
	let running = false;
	let timer = 0;

	const paint = () => {
		for (let i = 0; i < bars.length; i++) {
			const s = samples[i] as number;
			bars[i]?.style.setProperty('height', `${Math.round(s * 100)}%`);
			bars[i]?.classList.toggle('is-spike', s > 0.78);
		}
		value.textContent = shown.toFixed(1);
	};

	const step = () => {
		samples.shift();
		const spike = Math.random() < 0.035;
		samples.push(spike ? 0.8 + Math.random() * 0.18 : 0.28 + Math.random() * 0.26);
		const drift = (Math.random() - 0.5) * 0.5 + (BASE - shown) * 0.25;
		shown = Math.max(7.4, Math.min(9.9, shown + drift));
		paint();
	};

	const run = (on: boolean) => {
		if (on === running) return;
		running = on;
		clearInterval(timer);
		if (on) timer = window.setInterval(step, 130);
	};

	paint();
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	new IntersectionObserver((entries) => {
		run(entries.some((e) => e.isIntersecting) && !document.hidden);
	}).observe(root);
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) run(false);
	});
}

for (const root of document.querySelectorAll<HTMLElement>('[data-shot]')) start(root);
