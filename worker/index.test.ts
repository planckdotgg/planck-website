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
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const ANDROID_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const CHROMEOS_UA =
	'Mozilla/5.0 (X11; CrOS x86_64 15917.0.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
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
		const bsd = await handle(get('?platform=freebsd'), env, gh.send);
		expect(bsd.headers.get('Location')).toBe(RELEASES);
		const android = await handle(get('', ANDROID_UA), env, gh.send);
		expect(android.headers.get('Location')).toBe(RELEASES);
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

describe('/api/download when the API is rate limited', () => {
	const LATEST = 'https://github.com/planckdotgg/planck/releases/latest';
	const PAGE = 'https://github.com/planckdotgg/planck/releases/expanded_assets/v0.1.0';
	const D = '/planckdotgg/planck/releases/download/v0.1.0';
	const html = `<a href="${D}/planck-0.1.0-macos-arm64.dmg">a</a>
		<a href="${D}/planck-0.1.0-macos-arm64.dmg">dup</a>
		<a href="${D}/planck-0.1.0-windows-x64-setup.exe">b</a>
		<a href="/other/repo/releases/download/v0.1.0/planck-0.1.0-macos-x64.dmg">x</a>`;

	function fake(page: () => Response) {
		const calls: string[] = [];
		const send = (async (input: string | URL | Request) => {
			const url = String(input);
			calls.push(url);
			if (url === API) return new Response('rate limited', { status: 403 });
			if (url === LATEST) {
				return new Response(null, {
					status: 302,
					headers: { Location: 'https://github.com/planckdotgg/planck/releases/tag/v0.1.0' },
				});
			}
			if (url === PAGE) return page();
			return new Response('?', { status: 500 });
		}) as typeof fetch;
		return { calls, send };
	}

	test('a 403 falls back to the release pages and caches the files', async () => {
		const gh = fake(() => new Response(html));
		const cache = memoryCache();
		const mac = await handle(get('?platform=macos'), env, gh.send, cache);
		expect(mac.headers.get('Location')).toBe(`https://github.com${D}/planck-0.1.0-macos-arm64.dmg`);
		const win = await handle(get('?platform=windows'), env, gh.send, cache);
		expect(win.headers.get('Location')).toBe(
			`https://github.com${D}/planck-0.1.0-windows-x64-setup.exe`,
		);
		expect(cache.keys()).toEqual([API]);
		expect(gh.calls).toEqual([API, LATEST, PAGE]);
	});

	test('a failing fallback goes to the releases page and is not cached', async () => {
		const gh = fake(() => new Response('nope', { status: 500 }));
		const cache = memoryCache();
		const res = await handle(get('?platform=macos'), env, gh.send, cache);
		expect(res.headers.get('Location')).toBe(RELEASES);
		expect(cache.keys()).toEqual([]);
	});
});

describe('/api/download with the v0.2.0 assets', () => {
	const V1 = 'https://github.com/planckdotgg/planck/releases/download/v0.2.0';
	const NAMES = [
		'planck-0.2.0-macos-arm64.dmg',
		'planck-0.2.0-macos-amd64.dmg',
		'planck-0.2.0-windows-x64-setup.exe',
		'planck-0.2.0-windows-x64.zip',
		'planck-0.2.0-linux-x86_64.tar.gz',
		'planck-0.2.0-linux-aarch64.tar.gz',
		'SHA256SUMS.txt',
	];
	const v1 = () => ({
		tag_name: 'v0.2.0',
		assets: NAMES.map((name) => ({ name, browser_download_url: `${V1}/${name}` })),
	});
	const to = async (query: string, userAgent?: string) => {
		const gh = github(() => Response.json(v1()));
		const res = await handle(get(query, userAgent), env, gh.send);
		expect(res.status).toBe(302);
		return res.headers.get('Location');
	};

	const cases: [string, string][] = [
		['?platform=macos&arch=arm64', 'planck-0.2.0-macos-arm64.dmg'],
		['?platform=macos&arch=aarch64', 'planck-0.2.0-macos-arm64.dmg'],
		['?platform=macos&arch=amd64', 'planck-0.2.0-macos-amd64.dmg'],
		['?platform=macos&arch=x64', 'planck-0.2.0-macos-amd64.dmg'],
		['?platform=macos', 'planck-0.2.0-macos-arm64.dmg'],
		['?platform=windows&format=installer', 'planck-0.2.0-windows-x64-setup.exe'],
		['?platform=windows&format=portable', 'planck-0.2.0-windows-x64.zip'],
		['?platform=windows', 'planck-0.2.0-windows-x64-setup.exe'],
		['?platform=windows&arch=x64&format=portable', 'planck-0.2.0-windows-x64.zip'],
		['?platform=linux&arch=amd64', 'planck-0.2.0-linux-x86_64.tar.gz'],
		['?platform=linux&arch=x64', 'planck-0.2.0-linux-x86_64.tar.gz'],
		['?platform=linux&arch=x86_64', 'planck-0.2.0-linux-x86_64.tar.gz'],
		['?platform=linux&arch=arm64', 'planck-0.2.0-linux-aarch64.tar.gz'],
		['?platform=linux', 'planck-0.2.0-linux-x86_64.tar.gz'],
		['?asset=SHA256SUMS.txt', 'SHA256SUMS.txt'],
		['?asset=sha256sums.txt', 'SHA256SUMS.txt'],
		['?asset=checksums', 'SHA256SUMS.txt'],
		['?asset=CHECKSUMS', 'SHA256SUMS.txt'],
		['?checksums=1', 'SHA256SUMS.txt'],
	];
	for (const [query, name] of cases) {
		test(query, async () => {
			expect(await to(query)).toBe(`${V1}/${name}`);
		});
	}

	test('checksums ignore the platform and a phone User-Agent', async () => {
		expect(await to('?checksums=1&platform=freebsd', IPHONE_UA)).toBe(`${V1}/SHA256SUMS.txt`);
	});

	test('User-Agent detection picks Linux, but never for Android or ChromeOS', async () => {
		expect(await to('', LINUX_UA)).toBe(`${V1}/planck-0.2.0-linux-x86_64.tar.gz`);
		expect(await to('', ANDROID_UA)).toBe(RELEASES);
		expect(await to('', CHROMEOS_UA)).toBe(RELEASES);
		expect(await to('', MAC_UA)).toBe(`${V1}/planck-0.2.0-macos-arm64.dmg`);
		expect(await to('', WIN_UA)).toBe(`${V1}/planck-0.2.0-windows-x64-setup.exe`);
	});

	test('a missing arch or format falls back instead of serving another one', async () => {
		expect(await to('?platform=windows&arch=arm64')).toBe(RELEASES);
		expect(await to('?platform=macos&arch=riscv')).toBe(RELEASES);
		expect(await to('?platform=windows&format=msix')).toBe(RELEASES);
		expect(await to('?platform=linux&format=installer')).toBe(
			`${V1}/planck-0.2.0-linux-x86_64.tar.gz`,
		);
	});

	test('with only the zip, format=installer never serves it', async () => {
		const gh = github(() => Response.json(release('planck-0.2.0-windows-x64.zip')));
		const installer = await handle(get('?platform=windows&format=installer'), env, gh.send);
		expect(installer.headers.get('Location')).toBe(RELEASES);
		const portable = await handle(get('?platform=windows&format=portable'), env, gh.send);
		expect(portable.headers.get('Location')).toBe(`${ASSET}/planck-0.2.0-windows-x64.zip`);
	});

	test('a release without the requested arch or checksums falls back', async () => {
		const gh = github(() => Response.json(release('planck-0.2.0-macos-arm64.dmg')));
		const intel = await handle(get('?platform=macos&arch=amd64'), env, gh.send);
		expect(intel.headers.get('Location')).toBe(RELEASES);
		const sums = await handle(get('?checksums=1'), env, gh.send);
		expect(sums.headers.get('Location')).toBe(RELEASES);
	});

	test('a universal Mac build serves both architectures', async () => {
		const gh = github(() => Response.json(release('planck-0.2.0-macos-universal.dmg')));
		const intel = await handle(get('?platform=macos&arch=amd64'), env, gh.send);
		expect(intel.headers.get('Location')).toBe(`${ASSET}/planck-0.2.0-macos-universal.dmg`);
	});

	test('a GitHub failure still falls back for the new queries', async () => {
		const gh = github(() => new Response('boom', { status: 500 }));
		for (const q of ['?platform=linux&arch=arm64', '?checksums=1']) {
			const res = await handle(get(q), env, gh.send);
			expect(res.headers.get('Location')).toBe(RELEASES);
		}
	});
});

describe('/api/download page fallback for the new queries', () => {
	const LATEST = 'https://github.com/planckdotgg/planck/releases/latest';
	const PAGE = 'https://github.com/planckdotgg/planck/releases/expanded_assets/v0.2.0';
	const D = '/planckdotgg/planck/releases/download/v0.2.0';
	const names = [
		'planck-0.2.0-macos-arm64.dmg',
		'planck-0.2.0-windows-x64-setup.exe',
		'planck-0.2.0-windows-x64.zip',
		'planck-0.2.0-linux-x86_64.tar.gz',
		'planck-0.2.0-linux-aarch64.tar.gz',
		'SHA256SUMS.txt',
	];
	const html = names.map((n) => `<a href="${D}/${n}">${n}</a>`).join('\n');
	const send = (async (input: string | URL | Request) => {
		const url = String(input);
		if (url === API) return new Response('limited', { status: 429 });
		if (url === LATEST) {
			return new Response(null, {
				status: 302,
				headers: { Location: 'https://github.com/planckdotgg/planck/releases/tag/v0.2.0' },
			});
		}
		if (url === PAGE) return new Response(html);
		return new Response('?', { status: 500 });
	}) as typeof fetch;

	const cases: [string, string][] = [
		['?platform=linux&arch=arm64', 'planck-0.2.0-linux-aarch64.tar.gz'],
		['?platform=linux&arch=x64', 'planck-0.2.0-linux-x86_64.tar.gz'],
		['?platform=windows&format=portable', 'planck-0.2.0-windows-x64.zip'],
		['?platform=windows&format=installer', 'planck-0.2.0-windows-x64-setup.exe'],
		['?asset=SHA256SUMS.txt', 'SHA256SUMS.txt'],
		['?checksums=1', 'SHA256SUMS.txt'],
	];
	for (const [query, name] of cases) {
		test(`${query} after a ${429}`, async () => {
			const res = await handle(get(query), env, send);
			expect(res.headers.get('Location')).toBe(`https://github.com${D}/${name}`);
		});
	}

	test('a missing arch still falls back to the releases page', async () => {
		const res = await handle(get('?platform=macos&arch=amd64'), env, send);
		expect(res.headers.get('Location')).toBe(RELEASES);
	});
});

describe('/api/download with the published v0.2.0 assets', () => {
	const V010 = [
		'planck-0.2.0-windows-x64.zip',
		'planck-0.2.0-linux-x86_64.tar.gz',
		'planck-0.2.0-linux-aarch64.tar.gz',
		'planck-0.2.0-macos-universal.dmg',
		'SHA256SUMS.txt',
	];
	const LINUX_ARM_UA = 'Mozilla/5.0 (X11; Linux aarch64)';
	const to = async (query: string, ua?: string) => {
		const gh = github(() => Response.json(release(...V010)));
		const res = await handle(get(query, ua), env, gh.send);
		return res.headers.get('Location');
	};

	test('a Linux aarch64 User-Agent without arch gets the aarch64 tarball', async () => {
		expect(await to('', LINUX_ARM_UA)).toBe(`${ASSET}/planck-0.2.0-linux-aarch64.tar.gz`);
	});

	test('a Linux x86_64 User-Agent without arch gets the x86_64 tarball', async () => {
		expect(await to('', LINUX_UA)).toBe(`${ASSET}/planck-0.2.0-linux-x86_64.tar.gz`);
	});

	test('an explicit arch beats the Linux User-Agent', async () => {
		expect(await to('?arch=amd64', LINUX_ARM_UA)).toBe(`${ASSET}/planck-0.2.0-linux-x86_64.tar.gz`);
	});

	test('Windows and macOS keep their defaults', async () => {
		expect(await to('', WIN_UA)).toBe(`${ASSET}/planck-0.2.0-windows-x64.zip`);
		expect(await to('', MAC_UA)).toBe(`${ASSET}/planck-0.2.0-macos-universal.dmg`);
	});
});
