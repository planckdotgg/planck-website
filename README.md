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
| 404         | `src/pages/404.astro`      |

Shared parts live in `src/components/`, `src/layouts/Base.astro`, and `src/styles/global.css`.
Client scripts are in `src/scripts/`. Colors, type, and motion values come from the Planck brand
tokens (`tokens.json` in the design kit).

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

`bun run og` re-renders the 1200×630 social images in `public/og/` from the hero art. Run it
after changing `src/assets/hero-*.png` or the lockup.

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
