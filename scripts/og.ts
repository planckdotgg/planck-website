/**
 * Renders the 1200×630 social preview images in public/og/ from each page's hero, exported from
 * the approved design (src/assets/og/*.png), plus the wordmark. Run `bun run og` after replacing
 * an export or changing the wordmark; the output is committed.
 */
import sharp from 'sharp';
import { WORDMARK_LANCK, WORDMARK_P, WORDMARK_SLICE, WORDMARK_VIEWBOX } from '../src/lib/wordmark';

const W = 1200;
const H = 630;
const GROUND = '#0E0F12';

/** `crop` is the region of the export kept, in export pixels. */
const pages = [
	{ name: 'home', crop: { left: 72, top: 1, width: 1296, height: 680 } },
	{ name: 'gaming', crop: { left: 96, top: 1, width: 1248, height: 498 } },
	{ name: 'work', crop: { left: 96, top: 1, width: 1248, height: 498 } },
	{ name: 'download', crop: { left: 96, top: 1, width: 1248, height: 498 } },
	{ name: 'roadmap', crop: { left: 96, top: 1, width: 1248, height: 498 } },
] as const;

const root = new URL('../', import.meta.url);

const wordmark = await sharp(
	Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}" width="144" height="30">
			<path fill-rule="evenodd" d="${WORDMARK_P}" fill="#F2EFEA"/>
			<path fill-rule="evenodd" d="${WORDMARK_SLICE}" fill="#FF7A1F"/>
			<path fill-rule="evenodd" d="${WORDMARK_LANCK}" fill="#F2EFEA"/>
		</svg>`,
	),
	{ density: 288 },
)
	.resize({ width: 144 })
	.png()
	.toBuffer();

for (const page of pages) {
	const scaled = await sharp(new URL(`src/assets/og/${page.name}.png`, root).pathname)
		.extract(page.crop)
		.resize({ width: W })
		.png()
		.toBuffer();
	const { height = H } = await sharp(scaled).metadata();
	const top = Math.floor((H - height) / 2);
	// Repeat the hero's edge rows into the letterbox so its washes run to the frame edge.
	const art = await sharp(scaled)
		.extend({ top, bottom: H - height - top, extendWith: 'copy' })
		.png()
		.toBuffer();
	await sharp({ create: { width: W, height: H, channels: 3, background: GROUND } })
		.composite([
			{ input: art, top: 0, left: 0 },
			{ input: wordmark, top: 36, left: 44 },
			{
				input: Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect y="${H - 6}" width="${W}" height="6" fill="#FF7A1F"/></svg>`,
				),
				top: 0,
				left: 0,
			},
		])
		.jpeg({ quality: 84, mozjpeg: true })
		.toFile(new URL(`public/og/${page.name}.jpg`, root).pathname);
	console.log(`public/og/${page.name}.jpg`);
}
