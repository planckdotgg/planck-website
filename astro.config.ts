import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { planckShiki } from './src/lib/shiki-theme';

/** The public address of the site. A preview build sets SITE_URL to its own address, so its
    social previews (og:image, og:url) point at files that exist there. */
const site = process.env.SITE_URL ?? 'https://planck.gg';

/** The page file behind a public path: /docs → src/pages/docs/index.astro, /work → work.astro. */
function pageFile(pathname: string): string | undefined {
	const route = pathname.replace(/^\/|\/$/g, '');
	const candidates = route
		? [`src/pages/${route}.astro`, `src/pages/${route}/index.astro`]
		: ['src/pages/index.astro'];
	return candidates.find((f) => existsSync(f));
}

/** When a page's file last changed in git; the build time for a file not yet committed. */
function lastModified(pathname: string): string {
	const file = pageFile(pathname);
	if (file) {
		try {
			const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
				encoding: 'utf8',
			}).trim();
			const dirty = execFileSync('git', ['status', '--porcelain', '--', file], {
				encoding: 'utf8',
			}).trim();
			if (iso && !dirty) return new Date(iso).toISOString();
		} catch {}
	}
	return new Date().toISOString();
}

export default defineConfig({
	site,
	// Static pages. Cloudflare serves them; a small Worker (worker/index.ts) answers /api/*.
	output: 'static',
	trailingSlash: 'never',
	build: { format: 'file', inlineStylesheets: 'auto' },
	markdown: { shikiConfig: { theme: planckShiki } },
	integrations: [
		sitemap({
			filter: (page) => {
				const { pathname } = new URL(page);
				return !pathname.startsWith('/404') && !pathname.startsWith('/api');
			},
			serialize: (item) => ({ ...item, lastmod: lastModified(new URL(item.url).pathname) }),
		}),
	],
	server: { port: 4321, host: true },
	devToolbar: { enabled: false },
});
