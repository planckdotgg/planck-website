import { describe, expect, test } from 'bun:test';
import { type Env, handle, type ReleaseCache } from './index.ts';

const env: Env = { GITHUB_REPO: 'planckdotgg/planck' };
const RELEASES = 'https://github.com/planckdotgg/planck/releases';
const API = 'https://api.github.com/repos/planckdotgg/planck/releases/latest';
const ASSET = 'https://github.com/planckdotgg/planck/releases/download/v0.4.0';

const MAC_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15';
const WIN_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const IPHONE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

const get = (query: string, userAgent?: string) =>
	new Request(`https://planck.gg/api/download${query}`, {
		headers: userAgent ? { 'User-Agent': userAgent } : {},
	});

const release = (...names: string[]) => ({
	tag_name: 'v0.4.0',
	assets: names.map((name) => ({ name, browser_download_url: `${ASSET}/${name}`, size: 1 })),
});

/** A fake GitHub that answers every request the same way and counts the calls. */
function github(answer: () => Response | Promise<Response>) {
	const calls: string[] = [];
	const send = (async (input: string | URL | Request) => {
		calls.push(String(input));
		return answer();
	}) as typeof fetch;
	return { calls, send };
}

function memoryCache(): ReleaseCache & { keys: () => string[] } {
	const store = new Map<string, string>();
	return {
		keys: () => [...store.keys()],
		async match(key) {
			const body = store.get(key);
			return body === undefined ? undefined : new Response(body);
		},
		async put(key, response) {
			store.set(key, await response.text());
		},
	};
}

const ALL_ASSETS = [
	'planck-0.4.0-windows-x64-setup.exe',
	'planck-0.4.0-macos-x64.dmg',
	'planck-0.4.0-macos-arm64.dmg',
	'planck-0.4.0-linux-x86_64.tar.gz',
	'checksums.txt',
];

describe('/api/download with a published release', () => {
	test('platform=windows redirects to the Windows installer', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const res = await handle(get('?platform=windows'), env, gh.send);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${ASSET}/planck-0.4.0-windows-x64-setup.exe`);
		expect(gh.calls).toEqual([API]);
	});

	test('platform=macos redirects to the arm64 DMG', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const res = await handle(get('?platform=macos'), env, gh.send);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${ASSET}/planck-0.4.0-macos-arm64.dmg`);
	});

	test('without platform, the User-Agent picks the file', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const mac = await handle(get('', MAC_UA), env, gh.send);
		expect(mac.headers.get('Location')).toBe(`${ASSET}/planck-0.4.0-macos-arm64.dmg`);
		const win = await handle(get('', WIN_UA), env, gh.send);
		expect(win.headers.get('Location')).toBe(`${ASSET}/planck-0.4.0-windows-x64-setup.exe`);
	});

	test('a darwin zip is never taken for the Windows file', async () => {
		const gh = github(() =>
			Response.json(release('planck_darwin_arm64.zip', 'planck_windows_amd64.zip')),
		);
		const win = await handle(get('?platform=windows'), env, gh.send);
		expect(win.headers.get('Location')).toBe(`${ASSET}/planck_windows_amd64.zip`);
		const mac = await handle(get('?platform=macos'), env, gh.send);
		expect(mac.headers.get('Location')).toBe(`${ASSET}/planck_darwin_arm64.zip`);
	});

	test('a release without a matching file falls back to the releases page', async () => {
		const gh = github(() => Response.json(release('planck-0.4.0-linux-x86_64.tar.gz')));
		const res = await handle(get('?platform=macos'), env, gh.send);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(RELEASES);
	});
});

describe('/api/download fallbacks', () => {
	test('no release published yet (GitHub 404) goes to the releases page', async () => {
		const gh = github(() => Response.json({ message: 'Not Found' }, { status: 404 }));
		const res = await handle(get('?platform=windows'), env, gh.send);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(RELEASES);
	});

	test('a GitHub error goes to the releases page and is not cached', async () => {
		const gh = github(() => new Response('rate limited', { status: 403 }));
		const cache = memoryCache();
		const res = await handle(get('?platform=macos'), env, gh.send, cache);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(RELEASES);
		expect(cache.keys()).toEqual([]);
	});

	test('a network failure goes to the releases page', async () => {
		const gh = github(() => {
			throw new TypeError('fetch failed');
		});
		const res = await handle(get('?platform=windows'), env, gh.send);
		expect(res.headers.get('Location')).toBe(RELEASES);
	});

	test('an unknown platform or a phone goes to the releases page without asking GitHub', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const linux = await handle(get('?platform=linux'), env, gh.send);
		expect(linux.headers.get('Location')).toBe(RELEASES);
		const phone = await handle(get('', IPHONE_UA), env, gh.send);
		expect(phone.headers.get('Location')).toBe(RELEASES);
		const none = await handle(get(''), env, gh.send);
		expect(none.headers.get('Location')).toBe(RELEASES);
		expect(gh.calls).toEqual([]);
	});
});

describe('/api/download cache', () => {
	test('the release is fetched once and served from the cache after that', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const cache = memoryCache();
		await handle(get('?platform=windows'), env, gh.send, cache);
		const res = await handle(get('?platform=macos'), env, gh.send, cache);
		expect(res.headers.get('Location')).toBe(`${ASSET}/planck-0.4.0-macos-arm64.dmg`);
		expect(gh.calls).toHaveLength(1);
	});
});

describe('routing', () => {
	test('POST to /api/download is refused', async () => {
		const gh = github(() => Response.json(release(...ALL_ASSETS)));
		const res = await handle(
			new Request('https://planck.gg/api/download', { method: 'POST' }),
			env,
			gh.send,
		);
		expect(res.status).toBe(405);
	});

	test('other /api paths are 404', async () => {
		const res = await handle(new Request('https://planck.gg/api/other'), env);
		expect(res.status).toBe(404);
	});
});
