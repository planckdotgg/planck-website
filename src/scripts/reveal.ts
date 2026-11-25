// Blocks marked [data-reveal] that start below the fold slice in when they scroll into view.
// Blocks already on screen are left alone, so nothing visible ever dims after load.
const blocks = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!still && 'IntersectionObserver' in window) {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				observer.unobserve(el);
				requestAnimationFrame(() => {
					el.classList.add('reveal-in');
					el.classList.remove('reveal-pending');
				});
			}
		},
		{ rootMargin: '0px 0px -8% 0px' },
	);
	for (const el of blocks) {
		if (el.getBoundingClientRect().top > window.innerHeight) {
			el.classList.add('reveal-pending');
			observer.observe(el);
		}
	}
}
