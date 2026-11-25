import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

/** The public address of the site. A preview build sets SITE_URL to its own address, so its
    social previews (og:image, og:url) point at files that exist there. */
const site = process.env.SITE_URL ?? 'https://planck.gg';

export default defineConfig({
	site,
	// Static pages. Cloudflare serves them; a small Worker (worker/index.ts) answers /api/*.
	output: 'static',
	trailingSlash: 'never',
	build: { format: 'file', inlineStylesheets: 'auto' },
	integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
	server: { port: 4321, host: true },
	devToolbar: { enabled: false },
});
