/**
 * The Worker of the site. Cloudflare serves the pages as static files from dist/ and runs this
 * code only for `/api/*` (see wrangler.jsonc).
 *
 * GET /api/download?platform=windows|macos
 *     Redirects (302) to the matching file of the newest GitHub release of GITHUB_REPO. Without
 *     `platform`, the platform comes from the User-Agent. With no release, no matching file, or
 *     a GitHub error, it redirects to the releases page, so a person always lands somewhere useful.
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

export type Platform = 'windows' | 'macos';

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
};

export function platformFrom(url: URL, userAgent: string | null): Platform | undefined {
	const asked = url.searchParams.get('platform')?.toLowerCase();
	if (asked === 'windows' || asked === 'macos') return asked;
	if (asked) return undefined;
	const ua = userAgent ?? '';
	// iPhone and iPad user agents also say "Mac OS X"; they cannot run the desktop app.
	if (/iPhone|iPad|iPod|Android/i.test(ua)) return undefined;
	if (/Windows/i.test(ua)) return 'windows';
	if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
	return undefined;
}

/** The best file for the platform: right extension first, then a universal or arm64 Mac build. */
export function pickAsset(assets: Asset[], platform: Platform): Asset | undefined {
	const { name, ext } = MATCH[platform];
	const candidates = assets.filter((a) => name.test(a.name) && ext.some((e) => a.name.endsWith(e)));
	const rank = (a: Asset) => {
		const byExt = ext.findIndex((e) => a.name.endsWith(e));
		const byArch = platform === 'macos' && /universal|arm64|aarch64/i.test(a.name) ? 0 : 1;
		return byExt * 2 + byArch;
	};
	return candidates.sort((a, b) => rank(a) - rank(b))[0];
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
	const platform = platformFrom(new URL(request.url), request.headers.get('User-Agent'));
	if (!platform) return redirect(releases);
	const assets = await latestAssets(repo, env, send, cache);
	const file = assets && pickAsset(assets, platform);
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
