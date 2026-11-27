/**
 * Renders the twelve 1200×630 PNG social cards into public/og/. Run `bun run og` after changing
 * a card's text (src/lib/docs.ts, MARKETING below), the client capture in src/assets/og/ (made by
 * scripts/og/capture.ts), or the wordmark. The output is committed.
 *
 * Docs cards and /download are drawn on the instrument plate. Marketing cards are the Ember Beam
 * falling onto a crop of the real client.
 */
import { Resvg } from '@resvg/resvg-js';
import sharp, { type PngOptions, type Sharp } from 'sharp';
import { DOC_PAGES, type DocCard } from '../src/lib/docs';
import { MARKS } from './og/marks';
import {
	checkFonts,
	chrome,
	GROUND,
	glow,
	H,
	measure,
	plate,
	SAFE,
	strip,
	svg,
	type TextStyle,
	text,
	W,
	wordmark,
} from './og/plate';

const root = new URL('../', import.meta.url);
const out = (name: string) => new URL(`public/og/${name}`, root).pathname;

const TITLE: TextStyle = {
	face: 'ui',
	size: 64,
	weight: 600,
	stretch: 125,
	tracking: -0.034,
	fill: '#F2EFEA',
};
const SUMMARY: TextStyle = { face: 'ui', size: 26, fill: '#B6B8BE' };
const EYEBROW: TextStyle = {
	face: 'mono',
	size: 20,
	weight: 600,
	tracking: 0.08,
	fill: '#FFB27A',
};
const TELEMETRY: TextStyle = { face: 'mono', size: 20, weight: 500, fill: '#9DA2AE' };
const SEPARATOR = '#6E7480';

/** Fails the run when a line would cross into the mini-mark or the safe zone. */
function fits(label: string, str: string, style: TextStyle, max: number) {
	const width = measure(str, style);
	if (width > max) throw new Error(`${label}: "${str}" is ${Math.ceil(width)}px, over ${max}px`);
}

function docsCard(card: DocCard, mark: keyof typeof MARKS): string {
	const twoLines = card.title.length === 2;
	const titleY = twoLines ? [258, 326] : [288];
	card.title.forEach((line) => {
		fits(card.eyebrow, line, TITLE, 740);
	});
	fits(card.eyebrow, card.summary, SUMMARY, 760);
	const tele = strip(card.telemetry, SAFE, 536, TELEMETRY, SEPARATOR);
	if (tele.width > W - 2 * SAFE) throw new Error(`${card.eyebrow}: telemetry strip too wide`);
	return svg(`${plate()}
		<rect x="${SAFE}" y="176" width="2" height="26" rx="1" fill="#FF7A1F"/>
		${text(card.eyebrow, 72, 196, EYEBROW)}
		${card.title.map((line, i) => text(line, SAFE, titleY[i] ?? 0, TITLE)).join('')}
		${text(card.summary, SAFE, twoLines ? 390 : 352, SUMMARY)}
		<path d="M${SAFE} 496.5 H${W - SAFE}" stroke="#F2EFEA1A" stroke-width="1"/>
		${tele.svg}
		<g transform="translate(824 168)">${MARKS[mark]()}</g>
		${chrome()}`);
}

const HEADLINE: TextStyle = {
	face: 'ui',
	size: 86,
	weight: 600,
	stretch: 125,
	tracking: -0.032,
	fill: '#F2EFEA',
	anchor: 'middle',
};
const SUBLINE: TextStyle = { face: 'ui', size: 25, fill: '#B6B8BE', anchor: 'middle' };
const HEADER_TELEMETRY: TextStyle = {
	face: 'mono',
	size: 13,
	weight: 500,
	tracking: 0.07,
	fill: '#9DA2AE',
};

/** Where the client window sits: it bleeds off the bottom edge. */
const CLIENT = { left: SAFE, top: 320, width: W - 2 * SAFE, height: 352, radius: 16 } as const;
const CLIENT_SRC = new URL('src/assets/og/client.png', root).pathname;

/** Layer A: the Ember Beam falling onto the client, as the hero draws it. */
function beam(): string {
	const column = [330, -50, 540, 400] as const;
	return svg(`<rect width="${W}" height="${H}" fill="${GROUND}"/>
		${glow(
			'halo',
			[200, -60, 800, 430],
			[0.42, 0.82, 0.8],
			[
				[0, '#E8650C', 0.2],
				[0.46, '#E8650C', 0.07],
				[0.74, GROUND, 0],
			],
		)}
		${glow(
			'c4',
			column,
			[0.16, 0.68, 0.8],
			[
				[0, '#FF7A1F', 0.34],
				[1, '#FF7A1F', 0],
			],
		)}
		${glow(
			'c3',
			column,
			[0.065, 0.6, 0.83],
			[
				[0, '#FFB46B', 0.5],
				[1, '#FF8912', 0],
			],
		)}
		${glow(
			'c2',
			column,
			[0.026, 0.54, 0.86],
			[
				[0, '#FFF6EC', 0.96],
				[0.36, '#FFD1A3', 0.62],
				[1, '#FF8912', 0],
			],
		)}
		${glow(
			'c1',
			column,
			[0.014, 0.3, 0.24],
			[
				[0, '#C9D9FF', 0.3],
				[1, '#C9D9FF', 0],
			],
		)}
		${glow(
			'bloom',
			[190, 224, 820, 196],
			[0.5, 0.5, 0.5],
			[
				[0, '#FFE6CA', 0.58],
				[0.32, '#FF9834', 0.2],
				[0.68, GROUND, 0],
			],
		)}
		${glow(
			'floor-l',
			[-120, 300, 520, 330],
			[0.5, 0.5, 0.5],
			[
				[0, '#FF7A1F', 0.13],
				[0.7, GROUND, 0],
			],
		)}
		${glow(
			'floor-r',
			[800, 300, 520, 330],
			[0.5, 0.5, 0.5],
			[
				[0, '#FF7A1F', 0.13],
				[0.7, GROUND, 0],
			],
		)}
		<defs><filter id="ambient" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="45"/></filter></defs>
		<rect x="${CLIENT.left}" y="${CLIENT.top}" width="${CLIENT.width}" height="${CLIENT.height}" rx="${CLIENT.radius}" fill="#FF7A1F" fill-opacity="0.22" filter="url(#ambient)"/>`);
}

/** Layer B: the top of the real client, rounded at the top, cut off by the card's bottom edge. */
async function client(): Promise<Buffer> {
	const src = sharp(CLIENT_SRC);
	const { width = 0 } = await src.metadata();
	const rows = Math.round((CLIENT.height / CLIENT.width) * width);
	const visible = H - CLIENT.top;
	const { radius: r, width: w } = CLIENT;
	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${visible}"><path d="M0 ${visible} V${r} A${r} ${r} 0 0 1 ${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${visible} Z"/></svg>`,
	);
	const scaled = await src
		.extract({ left: 0, top: 0, width, height: rows })
		.resize({ width: w, height: CLIENT.height, fit: 'fill', kernel: 'lanczos3' })
		.extract({ left: 0, top: 0, width: w, height: visible })
		.png()
		.toBuffer();
	return sharp(scaled)
		.ensureAlpha()
		.composite([{ input: mask, blend: 'dest-in' }])
		.png()
		.toBuffer();
}

/** Layer C: window border, the beam landing on the bezel, and the type. */
function marketingOverlay(page: (typeof MARKETING)[number]): string {
	fits(page.name, page.headline, HEADLINE, 1040);
	fits(page.name, page.subline, SUBLINE, 1000);
	const width = strip(page.telemetry, 0, 0, HEADER_TELEMETRY, '#FF7A1F', 9).width;
	const tele = strip(page.telemetry, W - SAFE - width, 60, HEADER_TELEMETRY, '#FF7A1F', 9);
	if (W - SAFE - width < SAFE + 152 + 40) throw new Error(`${page.name}: telemetry hits wordmark`);
	const { left: x, top: y, width: w, radius: r } = CLIENT;
	return svg(`<defs>
			<linearGradient id="bezel" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#FF7A1F" stop-opacity="0"/>
				<stop offset="0.2" stop-color="#FF9650" stop-opacity="0.3"/>
				<stop offset="0.42" stop-color="#FFD6B2" stop-opacity="0.85"/>
				<stop offset="0.5" stop-color="#FFFCF7" stop-opacity="1"/>
				<stop offset="0.58" stop-color="#FFD6B2" stop-opacity="0.85"/>
				<stop offset="0.8" stop-color="#FF9650" stop-opacity="0.3"/>
				<stop offset="1" stop-color="#FF7A1F" stop-opacity="0"/>
			</linearGradient>
		</defs>
		<path d="M${x + 0.5} ${H} V${y + r} A${r - 0.5} ${r - 0.5} 0 0 1 ${x + r} ${y + 0.5} H${x + w - r} A${r - 0.5} ${r - 0.5} 0 0 1 ${x + w - 0.5} ${y + r} V${H}" fill="none" stroke="#2C3038" stroke-width="1"/>
		<rect x="${x}" y="${y - 1}" width="${w}" height="2" rx="1" fill="url(#bezel)"/>
		${glow(
			'hotspot',
			[400, 286, 400, 66],
			[0.5, 0.5, 0.5],
			[
				[0, '#FFFAF2', 0.55],
				[0.34, '#FFBA78', 0.22],
				[0.72, GROUND, 0],
			],
		)}
		${wordmark(SAFE, 40, 152)}
		${tele.svg}
		${text(page.headline, W / 2, 193, HEADLINE)}
		${text(page.subline, W / 2, 246, SUBLINE)}`);
}

const render = (markup: string) =>
	new Resvg(markup, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } })
		.render()
		.asPng();

const MARKETING = [
	{
		name: 'home',
		headline: 'Play like it’s local.',
		subline: 'Open-source game streaming in pure Go.',
		telemetry: 'PURE GO · 4:4:4 · 10-BIT HDR10 · TAILSCALE',
	},
	{
		name: 'gaming',
		headline: 'Play like it’s local.',
		subline: '240 fps, zero copies, no account.',
		telemetry: '1.04 ms NVENC p50 · 0.70 ms 1st SLICE · 240 FPS ZERO-COPY',
	},
	{
		name: 'work',
		headline: 'Your desk, anywhere.',
		subline: 'Text that stays text at 4:4:4.',
		telemetry: '4:4:4 CHROMA · MULTI-MONITOR · VIRTUAL DISPLAYS · CLIPBOARD',
	},
	{
		name: 'roadmap',
		headline: 'Shipped, then further.',
		subline: 'Phase 1 is in your hands today.',
		telemetry: 'PHASE 1 SHIPPED · STUDIO & LAN · CLOUD & CO-OP · BROADCAST',
	},
] as const;

/** /download has no hero of its own, so its card uses the plate. */
const DOWNLOAD: DocCard = {
	eyebrow: 'PLANCK / DOWNLOAD',
	title: ['Download Planck'],
	summary: 'Client and host for macOS, Windows, and Linux.',
	telemetry: 'macOS · WINDOWS · LINUX BETA · TWO BINARIES · NO ACCOUNT',
};

checkFonts();

// Docs plates quantise well; marketing art does not, so it stays truecolour.
const PALETTE = { compressionLevel: 9, effort: 10, palette: true, colors: 128, dither: 1 } as const;
const TRUECOLOUR = {
	compressionLevel: 9,
	effort: 10,
	adaptiveFiltering: true,
	palette: false,
} as const;

/** Flattened onto the ground and checked: X and iMessage handle an opaque PNG best. */
async function save(img: Sharp, name: string, png: PngOptions) {
	// sharp composites after every other operation, so flatten in a second pass.
	const buf = await sharp(await img.png().toBuffer())
		.flatten({ background: GROUND })
		.png(png)
		.toBuffer();
	const { width, height, channels } = await sharp(buf).metadata();
	if (width !== W || height !== H || channels !== 3) {
		throw new Error(`${name}: ${width}×${height}×${channels}, expected ${W}×${H}×3`);
	}
	await Bun.write(out(name), buf);
	console.log(`public/og/${name}`);
}

for (const page of DOC_PAGES) {
	await save(sharp(render(docsCard(page.card, page.slug))), page.og, PALETTE);
}
await save(sharp(render(docsCard(DOWNLOAD, 'download'))), 'download.png', PALETTE);

const window = await client();
for (const page of MARKETING) {
	const card = sharp(render(beam())).composite([
		{ input: window, top: CLIENT.top, left: CLIENT.left },
		{ input: render(marketingOverlay(page)), top: 0, left: 0 },
	]);
	await save(card, `${page.name}.png`, TRUECOLOUR);
}
