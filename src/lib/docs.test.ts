import { describe, expect, test } from 'bun:test';
import { codeSpans, DOC_PAGES, headings, neighbours } from './docs';

describe('headings', () => {
	const html = `<h2 id="a">Install &amp; run</h2><p>x</p><h3 id="b">On <code>macOS</code></h3><h2>No id</h2><h4 id="c">Deep</h4>`;

	test('reads h2 and h3 with ids, as text', () => {
		expect(headings(html, 3)).toEqual([
			{ depth: 2, id: 'a', text: 'Install & run' },
			{ depth: 3, id: 'b', text: 'On macOS' },
		]);
	});

	test('drops h3 when the page lists only h2', () => {
		expect(headings(html, 2)).toEqual([{ depth: 2, id: 'a', text: 'Install & run' }]);
	});
});

describe('docs navigation', () => {
	test('pages are unique and live under /docs', () => {
		expect(new Set(DOC_PAGES.map((p) => p.path)).size).toBe(DOC_PAGES.length);
		expect(new Set(DOC_PAGES.map((p) => p.og)).size).toBe(DOC_PAGES.length);
		for (const p of DOC_PAGES) expect(p.path.startsWith('/docs')).toBe(true);
	});

	test('the pager has no neighbour past either end', () => {
		expect(neighbours('index').prev).toBeUndefined();
		expect(neighbours('index').next?.slug).toBe('architecture');
		expect(neighbours('troubleshooting').next).toBeUndefined();
	});

	test('descriptions fit a search result', () => {
		for (const p of DOC_PAGES) expect(p.description.length).toBeLessThanOrEqual(160);
	});
});

test('codeSpans splits on backticks', () => {
	expect(codeSpans('at `v0.1.0` today')).toEqual([
		{ text: 'at ', code: false },
		{ text: 'v0.1.0', code: true },
		{ text: ' today', code: false },
	]);
});
