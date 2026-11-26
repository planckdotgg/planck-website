# planck.gg

The website of [Planck](https://github.com/planckdotgg/planck), open-source desktop and game
streaming in pure Go.

Astro builds static pages. Cloudflare Workers Static Assets serves them, and a small Worker
(`worker/index.ts`) answers `/api/*`.

## Pages

| Route       | File                       |
| ----------- | -------------------------- |
| `/`         | `src/pages/index.astro`    |
| `/download` | `src/pages/download.astro` |
| `/gaming`   | `src/pages/gaming.astro`   |
| `/work`     | `src/pages/work.astro`     |
| `/roadmap`  | `src/pages/roadmap.astro`  |
| `/docs`     | `src/pages/docs/index.astro` |
| `/docs/*`   | `src/pages/docs/*.astro`   |
| 404         | `src/pages/404.astro`      |

Shared parts live in `src/components/`, `src/layouts/Base.astro`, and `src/styles/global.css`.
Client scripts are in `src/scripts/`. Colors, type, and motion values come from the Planck brand
tokens (`tokens.json` in the design kit).

The docs use `src/layouts/Docs.astro`, `src/styles/docs.css` and `src/components/docs/`. Their
navigation, titles, descriptions and social card text live in `src/lib/docs.ts`. Every number on
a docs page is checked against a file in `planckdotgg/planck` at the release named in
`src/lib/site.ts` (`VERSION`, `COMMIT`); the source footer of each page cites that file.

Head tags (canonical, Open Graph, Twitter, JSON-LD) come from `Base.astro` and `src/lib/seo.ts`.
Only a build whose `SITE_URL` is `https://planck.gg` is indexable; any other build, such as
`deploy:preview`, emits `noindex, nofollow`. `public/_headers` sets cache and security headers.

## Commands

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev       # http://localhost:4321
bun run check     # astro check
bun run lint      # biome check .
bun test          # Worker and script unit tests
bun run build     # static site in dist/
bun run preview   # build, then serve dist/ and the Worker with wrangler on :8787
```

`bun run og` re-renders the twelve 1200×630 PNG social cards in `public/og/`. Docs cards (and
`/download`) are drawn from the text in `src/lib/docs.ts`; the other marketing cards keep their
hero art from `src/assets/og/*.png`. Text is converted to paths with fontkit from the site's own
WOFF2 fonts, so no system font is involved. Run it after changing card text, a hero export, or
the wordmark, and commit the output.

## `/api/download`

`GET /api/download?platform=windows|macos` redirects (302) to the matching file of the newest
release of `GITHUB_REPO` (`planckdotgg/planck`). Without `platform`, the User-Agent picks one.
When no release exists yet, no file matches, or GitHub fails, it redirects to the Releases page.
The Worker caches the release's file list for 120 seconds in the Cache API; GitHub errors are not
cached.

An optional `GITHUB_TOKEN` secret raises GitHub's rate limit:

```sh
bunx wrangler secret put GITHUB_TOKEN
```

## Deploy

```sh
bun run deploy           # planck.gg (custom domain)
bun run deploy:preview   # planck-website-preview on workers.dev
bun run deploy:www       # www.planck.gg → https://planck.gg (www/)
```

## Fonts

Archivo and Martian Mono, self-hosted as variable WOFF2 in `public/fonts/` under the SIL Open
Font License (license files alongside).

## License

[Apache-2.0](LICENSE).
