/**
 * Renders the twelve 1200×630 PNG social cards into public/og/. Run `bun run og` after changing
 * a card's text (src/lib/docs.ts, MARKETING below), a hero export in src/assets/og/, or the
 * wordmark. The output is committed.
 *
 * Docs cards (and /download, whose exported hero is stale) are drawn on the instrument plate.
 * Marketing cards keep their approved hero art, with the shared chrome and a telemetry strip.
 */
import { Resvg } from '@resvg/resvg-js';
import sharp, { type Region } from 'sharp';
import { DOC_PAGES, type DocCard } from '../src/lib/docs';
import { MARKS } from './og/marks';
import {
	checkFonts,
	chrome,
	GROUND,
	H,
	measure,
	plate,
	SAFE,
	strip,
	svg,
	type TextStyle,
	text,
	W,
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

/** The approved hero art, cropped to the card and letterboxed with its own edge rows. */
async function art(name: string, crop: Region): Promise<Buffer> {
	const scaled = await sharp(new URL(`src/assets/og/${name}.png`, root).pathname)
		.extract(crop)
		.resize({ width: W })
		.png()
		.toBuffer();
	const { height = H } = await sharp(scaled).metadata();
	const top = Math.floor((H - height) / 2);
	return sharp(scaled)
		.extend({ top, bottom: H - height - top, extendWith: 'copy' })
		.png()
		.toBuffer();
}

function marketingOverlay(telemetry: string): string {
	const tele = strip(telemetry, SAFE, 532, TELEMETRY, SEPARATOR);
	if (tele.width > W - 2 * SAFE) throw new Error(`telemetry strip too wide: ${telemetry}`);
	return svg(`<defs>
			<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="${GROUND}" stop-opacity="0"/>
				<stop offset="0.46" stop-color="${GROUND}" stop-opacity="0.7"/>
				<stop offset="1" stop-color="${GROUND}" stop-opacity="0.95"/>
			</linearGradient>
		</defs>
		<rect x="0" y="440" width="${W}" height="184" fill="url(#scrim)"/>
		<path d="M${SAFE} 488.5 H${W - SAFE}" stroke="#F2EFEA1A" stroke-width="1"/>
		${tele.svg}
		${chrome()}`);
}

const render = (markup: string) =>
	new Resvg(markup, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } })
		.render()
		.asPng();

const MARKETING = [
	{
		name: 'home',
		crop: { left: 72, top: 1, width: 1296, height: 680 },
		telemetry: 'PURE GO · 4:4:4 · 10-BIT HDR10 · TAILSCALE · APACHE-2.0',
	},
	{
		name: 'gaming',
		crop: { left: 96, top: 1, width: 1248, height: 498 },
		telemetry: '1.04 ms NVENC p50 · 0.70 ms 1st slice · 240 FPS ZERO-COPY',
	},
	{
		name: 'work',
		crop: { left: 96, top: 1, width: 1248, height: 498 },
		telemetry: '4:4:4 CHROMA · MULTI-MONITOR · VIRTUAL DISPLAYS · CLIPBOARD',
	},
	{
		name: 'roadmap',
		crop: { left: 96, top: 1, width: 1248, height: 498 },
		telemetry: 'PHASE 1 SHIPPED · STUDIO & LAN · CLOUD & CO-OP · BROADCAST',
	},
] as const;

/** /download's exported hero still shows the old headline, so its card uses the plate. */
const DOWNLOAD: DocCard = {
	eyebrow: 'PLANCK / DOWNLOAD',
	title: ['Download Planck'],
	summary: 'Client and host for macOS, Windows, and Linux.',
	telemetry: 'macOS · WINDOWS · LINUX CLI · TWO BINARIES · NO ACCOUNT',
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

for (const page of DOC_PAGES) {
	await sharp(render(docsCard(page.card, page.slug)))
		.png(PALETTE)
		.toFile(out(page.og));
	console.log(`public/og/${page.og}`);
}
await sharp(render(docsCard(DOWNLOAD, 'download')))
	.png(PALETTE)
	.toFile(out('download.png'));
console.log('public/og/download.png');

for (const page of MARKETING) {
	await sharp(await art(page.name, page.crop))
		.composite([{ input: render(marketingOverlay(page.telemetry)), top: 0, left: 0 }])
		.png(TRUECOLOUR)
		.toFile(out(`${page.name}.png`));
	console.log(`public/og/${page.name}.png`);
}
