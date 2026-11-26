import { REPO, VERSION } from './site';

export const PRODUCTION_HOST = 'planck.gg';

/** True only for the production site. Any other SITE_URL (a workers.dev preview, localhost)
    is a deploy search engines must not index. */
export function isProduction(site: URL | undefined): boolean {
	return site?.hostname === PRODUCTION_HOST;
}

type Node = Record<string, unknown>;

const id = (site: URL, fragment: string) => new URL(`/#${fragment}`, site).href;

export function organization(site: URL): Node {
	return {
		'@type': 'Organization',
		'@id': id(site, 'organization'),
		name: 'Planck',
		url: new URL('/', site).href,
		logo: new URL('/icon-512.png', site).href,
		sameAs: [REPO],
	};
}

export function website(site: URL): Node {
	return {
		'@type': 'WebSite',
		'@id': id(site, 'website'),
		name: 'Planck',
		url: new URL('/', site).href,
		inLanguage: 'en-US',
		publisher: { '@id': id(site, 'organization') },
	};
}

export function softwareApplication(site: URL, description: string): Node {
	return {
		'@type': 'SoftwareApplication',
		'@id': id(site, 'software'),
		name: 'Planck',
		description,
		url: new URL('/', site).href,
		downloadUrl: new URL('/download', site).href,
		softwareVersion: VERSION,
		applicationCategory: 'GameApplication',
		applicationSubCategory: 'Game streaming',
		operatingSystem: 'Windows 10, Windows 11, macOS 14+',
		license: 'https://www.apache.org/licenses/LICENSE-2.0',
		isAccessibleForFree: true,
		sameAs: [REPO],
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		publisher: { '@id': id(site, 'organization') },
	};
}

export interface Crumb {
	name: string;
	path: string;
}

export function breadcrumbs(site: URL, crumbs: Crumb[]): Node {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: crumbs.map((c, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: c.name,
			item: new URL(c.path, site).href,
		})),
	};
}

export function techArticle(
	site: URL,
	page: { path: string; title: string; description: string; og: string },
): Node {
	const url = new URL(page.path, site).href;
	return {
		'@type': 'TechArticle',
		'@id': `${url}#article`,
		headline: page.title,
		description: page.description,
		url,
		mainEntityOfPage: url,
		image: new URL(`/og/${page.og}`, site).href,
		inLanguage: 'en-US',
		proficiencyLevel: 'Expert',
		author: { '@id': id(site, 'organization') },
		publisher: organization(site),
		about: {
			'@type': 'SoftwareApplication',
			name: 'Planck',
			softwareVersion: VERSION,
			operatingSystem: 'Windows 10, Windows 11, macOS 14+',
			applicationCategory: 'GameApplication',
		},
	};
}

export interface Faq {
	q: string;
	/** Plain text, identical to the answer shown on the page. */
	a: string;
}

export function faqPage(site: URL, path: string, items: Faq[]): Node {
	return {
		'@type': 'FAQPage',
		'@id': `${new URL(path, site).href}#faq`,
		mainEntity: items.map((f) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a },
		})),
	};
}
