/**
 * The Worker of the site. Cloudflare serves the pages as static files from dist/ and runs this
 * code only for `/api/*` (see wrangler.jsonc).
 *
 * GET /api/download?platform=windows|macos|linux[&arch=arm64|amd64|x64][&format=installer|portable]
 *     Redirects (302) to the matching file of the newest GitHub release of GITHUB_REPO. Without
 *     `platform`, the platform comes from the User-Agent. `arch` and `format` are strict: no
 *     file of that kind means the releases page, never another one.
 * GET /api/download?checksums=1 (or asset=checksums, asset=SHA256SUMS.txt)
 *     Redirects to the checksums file of the newest release.
 *     With no release, no matching file, or a GitHub error, it redirects to the releases page,
 *     so a person always lands somewhere useful.
 */

export interface Env {
	/** The repository with the releases, for example "planckdotgg/planck". It must be public. */
	GITHUB_REPO?: string;
	/** Optional secret: a GitHub token, so that GitHub lets the Worker ask more often. */
	GITHUB_TOKEN?: string;
}

/** The part of the Cloudflare cache that the Worker uses. */
export interface ReleaseCache {
	match(key: string): Promise<Response | undefined>;
	put(key: string, response: Response): Promise<void>;
}

export type Platform = 'windows' | 'macos' | 'linux';
export type Arch = 'arm64' | 'amd64';
export type Format = 'installer' | 'portable';

interface Asset {
	name: string;
	browser_download_url: string;
}

/** Seconds the Worker remembers the newest release's files (or that none exists yet). */
const REMEMBER = 120;
const DEFAULT_REPO = 'planckdotgg/planck';

/** File extensions per platform, best first. A name must also mention the platform. */
const MATCH: Record<Platform, { name: RegExp; ext: string[] }> = {
	windows: {
		name: /(^|[-_.])win(dows|64|32)?([-_.]|$)|\.exe$|\.msi$/i,
		ext: ['.msi', '.exe', '.zip'],
	},
	macos: {
		name: /(^|[-_.])(mac(os)?|darwin|osx)([-_.]|$)|\.dmg$|\.pkg$/i,
		ext: ['.dmg', '.pkg', '.zip', '.tar.gz'],
	},
	linux: {
		name: /(^|[-_.])linux([-_.]|$)|\.appimage$|\.deb$|\.rpm$/i,
		ext: ['.tar.gz', '.appimage', '.deb', '.rpm'],
	},
};

const ARM = /arm64|aarch64/i;
const X64 = /amd64|x64|x86[_-]64/i;
const CHECKSUMS = /^(sha256sums(\.txt)?|checksums?(\.txt)?)$/i;

const wants = (value: string | null, ...allowed: string[]) =>
	value !== null && allowed.includes(value.toLowerCase());

export function platformFrom(url: URL, userAgent: string | null): Platform | undefined {
	const asked = url.searchParams.get('platform')?.toLowerCase();
	if (asked === 'windows' || asked === 'macos' || asked === 'linux') return asked;
	if (asked) return undefined;
	const ua = userAgent ?? '';
	// iPhone and iPad user agents also say "Mac OS X"; they cannot run the desktop app.
	if (/iPhone|iPad|iPod|Android/i.test(ua)) return undefined;
	if (/Windows/i.test(ua)) return 'windows';
	if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
	// ChromeOS also says "X11" and "Linux", but runs no Linux desktop build.
	if (/Linux|X11/i.test(ua) && !/CrOS/i.test(ua)) return 'linux';
	return undefined;
}

/** `undefined` when `arch` is absent, `null` when it is present but not one we know. */
function archFrom(url: URL): Arch | null | undefined {
	const asked = url.searchParams.get('arch');
	if (asked === null) return undefined;
	if (wants(asked, 'arm64', 'aarch64')) return 'arm64';
	if (wants(asked, 'amd64', 'x64', 'x86_64')) return 'amd64';
	return null;
}

function formatFrom(url: URL): Format | null | undefined {
	const asked = url.searchParams.get('format');
	if (asked === null) return undefined;
	if (wants(asked, 'installer', 'portable')) return asked.toLowerCase() as Format;
	return null;
}

function isChecksumsRequest(url: URL): boolean {
	const p = url.searchParams;
	return p.get('checksums') === '1' || wants(p.get('asset'), 'checksums', 'sha256sums.txt');
}

export interface Pick {
	arch?: Arch;
	format?: Format;
}

/**
 * The best file for the platform: right extension first, then the architecture. With `arch`,
 * only that architecture qualifies (a universal Mac build fits both). With `format`, only that
 * kind of Windows file qualifies. Without them, Macs prefer universal or arm64, others x64.
 */
export function pickAsset(
	assets: Asset[],
	platform: Platform,
	{ arch, format }: Pick = {},
): Asset | undefined {
	const { name, ext } = MATCH[platform];
	const lower = (a: Asset) => a.name.toLowerCase();
	let kinds = ext;
	if (format && platform === 'windows') {
		kinds = format === 'portable' ? ['.zip'] : ['.exe', '.msi'];
	}
	const candidates = assets.filter(
		(a) =>
			name.test(a.name) &&
			kinds.some((e) => lower(a).endsWith(e)) &&
			(!arch ||
				(arch === 'arm64' ? ARM : X64).test(a.name) ||
				(platform === 'macos' && /universal/i.test(a.name))),
	);
	const rank = (a: Asset) => {
		const byExt = kinds.findIndex((e) => lower(a).endsWith(e));
		const preferred =
			platform === 'macos' ? /universal|arm64|aarch64/i.test(a.name) : X64.test(a.name);
		return byExt * 2 + (preferred ? 0 : 1);
	};
	return candidates.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * The files of the newest release read from github.com pages, which have no REST rate limit.
 * Used when the API refuses the Worker's shared egress IP. `undefined` means it failed.
 */
async function pageAssets(repo: string, send: typeof fetch): Promise<Asset[] | undefined> {
	try {
		const latest = await send(`https://github.com/${repo}/releases/latest`, {
			redirect: 'manual',
			headers: { 'User-Agent': 'planck-website' },
		});
		const tag = /\/releases\/tag\/([^/?#]+)/.exec(latest.headers.get('Location') ?? '')?.[1];
		if (!tag) return undefined;
		const page = await send(
			`https://github.com/${repo}/releases/expanded_assets/${encodeURIComponent(decodeURIComponent(tag))}`,
			{ headers: { 'User-Agent': 'planck-website' } },
		);
		if (!page.ok) return undefined;
		const html = await page.text();
		const prefix = `/${repo}/releases/download/${tag}/`;
		const seen = new Set<string>();
		const assets: Asset[] = [];
		for (const match of html.matchAll(/href="([^"]+)"/g)) {
			const href = (match[1] ?? '').replace(/&amp;/g, '&');
			if (!href.startsWith(prefix)) continue;
			const name = decodeURIComponent(href.slice(prefix.length).split(/[?#]/)[0] ?? '');
			if (!name || seen.has(name)) continue;
			seen.add(name);
			assets.push({ name, browser_download_url: `https://github.com${href}` });
		}
		return assets;
	} catch (error) {
		console.error(`GitHub pages could not be read: ${String(error)}`);
		return undefined;
	}
}

/**
 * The files of the newest release. An empty list means no release exists yet (GitHub answers
 * 404); `undefined` means GitHub failed, which is never cached.
 */
async function latestAssets(
	repo: string,
	env: Env,
	send: typeof fetch,
	cache?: ReleaseCache,
): Promise<Asset[] | undefined> {
	const api = `https://api.github.com/repos/${repo}/releases/latest`;
	const remembered = await cache?.match(api);
	if (remembered) return (await remembered.json()) as Asset[];

	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'planck-website',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
	let response: Response;
	try {
		response = await send(api, { headers });
	} catch (error) {
		console.error(`GitHub could not be reached: ${String(error)}`);
		return undefined;
	}
	let assets: Asset[];
	if (response.status === 404) {
		assets = [];
	} else if (response.ok) {
		const release = (await response.json()) as { assets?: Asset[] };
		assets = (release.assets ?? []).map(({ name, browser_download_url }) => ({
			name,
			browser_download_url,
		}));
	} else if (response.status === 403 || response.status === 429) {
		console.error(
			`GitHub did not give the newest release (${response.status}); reading its pages.`,
		);
		const fromPages = await pageAssets(repo, send);
		if (!fromPages) return undefined;
		assets = fromPages;
	} else {
		console.error(`GitHub did not give the newest release (${response.status}).`);
		return undefined;
	}
	await cache?.put(
		api,
		new Response(JSON.stringify(assets), {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${REMEMBER}` },
		}),
	);
	return assets;
}

const redirect = (location: string) =>
	new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });

export async function download(
	request: Request,
	env: Env,
	send: typeof fetch = fetch,
	cache?: ReleaseCache,
): Promise<Response> {
	const repo = env.GITHUB_REPO || DEFAULT_REPO;
	const releases = `https://github.com/${repo}/releases`;
	const url = new URL(request.url);
	if (isChecksumsRequest(url)) {
		const assets = await latestAssets(repo, env, send, cache);
		const file = assets?.find((a) => CHECKSUMS.test(a.name));
		return redirect(file?.browser_download_url ?? releases);
	}
	const platform = platformFrom(url, request.headers.get('User-Agent'));
	const arch = archFrom(url);
	const format = formatFrom(url);
	if (!platform || arch === null || format === null) return redirect(releases);
	const assets = await latestAssets(repo, env, send, cache);
	const file = assets && pickAsset(assets, platform, { arch, format });
	return redirect(file?.browser_download_url ?? releases);
}

export async function handle(
	request: Request,
	env: Env,
	send: typeof fetch = fetch,
	cache?: ReleaseCache,
): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname === '/api/download') {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
		}
		return download(request, env, send, cache);
	}
	return new Response('Not found', { status: 404 });
}

export default {
	fetch: (request: Request, env: Env) =>
		handle(request, env, fetch, (caches as unknown as { default: ReleaseCache }).default),
};
