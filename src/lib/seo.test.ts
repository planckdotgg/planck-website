import { expect, test } from 'bun:test';
import { breadcrumbs, faqPage, isProduction } from './seo';

test('only planck.gg is indexable', () => {
	expect(isProduction(new URL('https://planck.gg'))).toBe(true);
	expect(isProduction(new URL('https://planck-website-preview.watzon.workers.dev'))).toBe(false);
	expect(isProduction(new URL('http://localhost:4321'))).toBe(false);
	expect(isProduction(undefined)).toBe(false);
});

test('breadcrumbs number from 1 with absolute URLs', () => {
	const ld = breadcrumbs(new URL('https://planck.gg'), [
		{ name: 'Docs', path: '/docs' },
		{ name: 'Protocol', path: '/docs/protocol' },
	]);
	expect(ld.itemListElement).toEqual([
		{ '@type': 'ListItem', position: 1, name: 'Docs', item: 'https://planck.gg/docs' },
		{ '@type': 'ListItem', position: 2, name: 'Protocol', item: 'https://planck.gg/docs/protocol' },
	]);
});

test('FAQ answers are passed through verbatim', () => {
	const ld = faqPage(new URL('https://planck.gg'), '/docs/troubleshooting', [
		{ q: 'Which ports?', a: 'UDP 47700.' },
	]);
	expect(ld.mainEntity).toEqual([
		{
			'@type': 'Question',
			name: 'Which ports?',
			acceptedAnswer: { '@type': 'Answer', text: 'UDP 47700.' },
		},
	]);
});
