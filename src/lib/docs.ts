/** The docs: navigation, per-page meta, and the text of each page's social card. One place, so
    the rail, pager, head tags, JSON-LD and scripts/og.ts never disagree. */

export type DocSlug =
	| 'index'
	| 'architecture'
	| 'protocol'
	| 'benchmarks'
	| 'configuration'
	| 'privacy'
	| 'troubleshooting';

export interface DocCard {
	eyebrow: string;
	/** One or two lines, at most 22 characters each. */
	title: [string] | [string, string];
	summary: string;
	telemetry: string;
}

export interface DocPage {
	slug: DocSlug;
	path: string;
	/** Rail and pager label. */
	label: string;
	group: 'Getting started' | 'Core systems' | 'Reference';
	h1: string;
	/** Backticks mark inline code. */
	lead: string;
	strip: string[];
	/** The <title>. */
	title: string;
	description: string;
	og: string;
	ogAlt: string;
	/** The repo file the page is derived from, cited in its source footer. */
	source: string;
	/** h3 entries join the TOC only where the page is long reference material. */
	tocDepth: 2 | 3;
	card: DocCard;
}

export const DOC_PAGES: DocPage[] = [
	{
		slug: 'index',
		path: '/docs',
		label: 'Overview',
		group: 'Getting started',
		h1: 'Planck, documented',
		lead: 'Install it, pair a device, stream. Then read exactly how it does that, with every number traced to a file in the repo.',
		strip: ['v0.2.0', 'PURE GO', 'CGO_ENABLED=0', 'APACHE-2.0'],
		title: 'Docs · Planck',
		description:
			'Install Planck on macOS 14+, Windows 10/11 or Linux, build it from source with CGO_ENABLED=0, pair over LAN or Tailscale, and start streaming.',
		og: 'docs.png',
		ogAlt:
			'Planck docs card: Planck, documented. Pure Go, CGO_ENABLED=0, Apache-2.0, version 0.2.0.',
		source: 'README.md',
		tocDepth: 2,
		card: {
			eyebrow: 'DOCS / OVERVIEW',
			title: ['Planck, documented'],
			summary: 'Install, pair, stream, and every measured number behind it.',
			telemetry: 'PURE GO · CGO_ENABLED=0 · APACHE-2.0 · v0.2.0',
		},
	},
	{
		slug: 'architecture',
		path: '/docs/architecture',
		label: 'Architecture',
		group: 'Core systems',
		h1: 'Architecture',
		lead: 'Five stages from capture to glass, four GPU vendors, two platforms, one language, and nothing crossing the CPU.',
		strip: ['DXGI · SCK', 'NVENC · AMF · oneVPL · VT', 'MyGo gpusurface'],
		title: 'Architecture · Planck · Docs',
		description:
			'How Planck moves a frame: DXGI or ScreenCaptureKit capture, NVENC, AMF, oneVPL or VideoToolbox encode, and zero-copy present through MyGo gpusurface.',
		og: 'docs-architecture.png',
		ogAlt:
			'Planck docs card: Capture to glass, zero copy. DXGI, ScreenCaptureKit, NVENC, AMF, oneVPL, VideoToolbox and MyGo.',
		source: 'docs/spikes/phase0-spike2.md',
		tocDepth: 2,
		card: {
			eyebrow: 'DOCS / ARCHITECTURE',
			title: ['Capture to glass,', 'zero copy'],
			summary: 'Five stages, four GPU vendors, two platforms, one language.',
			telemetry: 'DXGI · SCK · NVENC · AMF · oneVPL · VIDEOTOOLBOX · MyGo',
		},
	},
	{
		slug: 'protocol',
		path: '/docs/protocol',
		label: 'Protocol',
		group: 'Core systems',
		h1: 'The wire',
		lead: 'QUIC carries control and derives the media keys. Media rides raw sealed UDP with adaptive Reed-Solomon parity.',
		strip: ['ALPN planck-v1', 'AES-128-GCM', '1152 B', '36 B HEADER', 'RS FEC'],
		title: 'Protocol · Planck · Docs',
		description:
			'Planck wire protocol v1: QUIC control on ALPN planck-v1, AES-128-GCM UDP media keyed by EXPORTER-planck-media-v1, 1152-byte datagrams, Reed-Solomon FEC.',
		og: 'docs-protocol.png',
		ogAlt:
			'Planck docs card: The wire. QUIC plus AES-128-GCM UDP, 1152-byte datagrams, Reed-Solomon FEC.',
		source: 'pkg/wire/media.go',
		tocDepth: 2,
		card: {
			eyebrow: 'DOCS / PROTOCOL',
			title: ['The wire'],
			summary: 'QUIC for control, sealed UDP for media, Reed-Solomon for loss.',
			telemetry: 'QUIC + AES-128-GCM UDP · 1152 B DATAGRAM · RS FEC',
		},
	},
	{
		slug: 'benchmarks',
		path: '/docs/benchmarks',
		label: 'Benchmarks',
		group: 'Core systems',
		h1: 'Measured latency',
		lead: 'Every figure here comes from a doc in the repo at `v0.1.0`, measured on one test rig. The rig and its limits are named on every chart.',
		strip: ['RTX 4080', 'RX 6700 XT', 'UHD 770', 'M5 Pro', '2.5GbE LAN'],
		title: 'Benchmarks · Planck · Docs',
		description:
			'Measured Planck latency at v0.1.0: NVENC, AMF and VideoToolbox encode, sub-frame slices, pipeline stages and transport paths, each with rig and source.',
		og: 'docs-benchmarks.png',
		ogAlt:
			'Planck docs card: Measured latency. NVENC encode 1.04 ms, first slice out 0.70 ms, AMF encode 2.78 ms, VideoToolbox decode 0.87 ms.',
		source: 'docs/perf/phase2-results.md',
		tocDepth: 2,
		card: {
			eyebrow: 'DOCS / BENCHMARKS',
			title: ['Measured latency'],
			summary: 'Every stage of the pipeline, timed on real hardware.',
			telemetry: 'RTX 4080 · RX 6700 XT · UHD 770 · M5 PRO',
		},
	},
	{
		slug: 'configuration',
		path: '/docs/configuration',
		label: 'Configuration',
		group: 'Reference',
		h1: 'Configuration',
		lead: '`host.json`, `client.json`, every CLI flag on both binaries, and the in-stream hotkeys, with the defaults the code actually uses.',
		strip: ['41000 DISCOVERY', '41001 CONTROL', '41002 MEDIA', 'UDP'],
		title: 'Configuration · Planck · Docs',
		description:
			'Planck config files and defaults: host.json, client.json, planck-host and planck-client flags, headless mode, hotkeys, and the codec capability matrix.',
		og: 'docs-configuration.png',
		ogAlt:
			'Planck docs card: Every flag, every default. UDP ports 41000 discovery, 41001 control, 41002 media.',
		source: 'pkg/config/config.go',
		tocDepth: 3,
		card: {
			eyebrow: 'DOCS / CONFIGURATION',
			title: ['Every flag,', 'every default'],
			summary: 'host.json, client.json, the CLI, and the in-stream hotkeys.',
			telemetry: '41000 DISCOVERY · 41001 CONTROL · 41002 MEDIA · UDP',
		},
	},
	{
		slug: 'privacy',
		path: '/docs/privacy',
		label: 'Privacy & Telemetry',
		group: 'Reference',
		h1: 'Privacy & telemetry',
		lead: 'Four anonymous signals, eleven fields, one switch. Here is every field that leaves, and the list of things that never do.',
		strip: ['4 SIGNALS', '11 FIELDS', 'OPT-OUT IN SETTINGS'],
		title: 'Privacy & Telemetry · Planck · Docs',
		description:
			'Every TelemetryDeck signal Planck sends, each field and its values, what is never collected, and how to turn it off in Settings, client.json or a flag.',
		og: 'docs-privacy.png',
		ogAlt:
			'Planck docs card: What leaves your machine. Four signals, eleven fields, no IP, no screen, no input.',
		source: 'internal/telemetry/telemetry.go',
		tocDepth: 2,
		card: {
			eyebrow: 'DOCS / PRIVACY',
			title: ['What leaves', 'your machine'],
			summary: 'Four anonymous signals, eleven fields, one switch to stop them.',
			telemetry: '4 SIGNALS · 11 FIELDS · NO IP · NO SCREEN · NO INPUT',
		},
	},
	{
		slug: 'troubleshooting',
		path: '/docs/troubleshooting',
		label: 'Troubleshooting & FAQ',
		group: 'Reference',
		h1: 'Troubleshooting & FAQ',
		lead: 'Ports, permissions, GPU power policy, and the rough edges the repo already knows about.',
		strip: ['UDP 41000–41002', 'SCREEN RECORDING', 'ACCESSIBILITY'],
		title: 'Troubleshooting & FAQ · Planck · Docs',
		description:
			'Fix Planck connections: UDP 41000 to 41002, Windows excluded port ranges, macOS Screen Recording and Accessibility, SmartScreen, Tailscale DERP, GPU power.',
		og: 'docs-troubleshooting.png',
		ogAlt:
			'Planck docs card: When it does not connect. UDP 41000 to 41002, Screen Recording, Accessibility.',
		source: 'docs/releasing.md',
		tocDepth: 3,
		card: {
			eyebrow: 'DOCS / TROUBLESHOOTING',
			title: ['When it does', 'not connect'],
			summary: 'Ports, permissions, GPU power, and the known rough edges.',
			telemetry: 'UDP 41000–41002 · SCREEN RECORDING · ACCESSIBILITY',
		},
	},
];

export const DOC_GROUPS = ['Getting started', 'Core systems', 'Reference'] as const;

export function docPage(slug: DocSlug): DocPage {
	const page = DOC_PAGES.find((p) => p.slug === slug);
	if (!page) throw new Error(`unknown docs page ${slug}`);
	return page;
}

export function neighbours(slug: DocSlug): { prev?: DocPage; next?: DocPage } {
	const i = DOC_PAGES.findIndex((p) => p.slug === slug);
	return { prev: DOC_PAGES[i - 1], next: DOC_PAGES[i + 1] };
}

export interface Heading {
	depth: 2 | 3;
	id: string;
	text: string;
}

const entities: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&#x27;': "'",
};

/** The h2 and h3 headings that carry an id, read from rendered page HTML. */
export function headings(html: string, maxDepth: 2 | 3): Heading[] {
	const out: Heading[] = [];
	for (const m of html.matchAll(/<h([23])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
		const depth = Number(m[1]) as 2 | 3;
		if (depth > maxDepth) continue;
		const text = (m[3] ?? '')
			.replace(/<[^>]+>/g, '')
			.replace(/&[#\w]+;/g, (e) => entities[e] ?? e)
			.trim();
		out.push({ depth, id: m[2] ?? '', text });
	}
	return out;
}

/** Splits text on backticks; odd pieces are inline code. */
export function codeSpans(text: string): { text: string; code: boolean }[] {
	return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 }));
}
