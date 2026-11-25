/**
 * Renders the 1200×630 social preview images in public/og/ from the hero art and the lockup.
 * Run `bun run og` after changing either; the output is committed.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const pages = [
	{ out: 'home.jpg', art: 'hero-home-racing@2x.png', position: 'centre' },
	{ out: 'gaming.jpg', art: 'hero-gaming-hdr10@2x.png', position: 'centre' },
	{ out: 'work.jpg', art: 'hero-work-studio@2x.png', position: 'centre' },
] as const;

const root = new URL('../', import.meta.url);
const lockupSvg = (await readFile(new URL('src/assets/brand/planck-lockup.svg', root), 'utf8'))
	// The lockup ships on a carbon plate; the preview draws its own ground.
	.replace(/<rect[^>]*\/>/, '');
const lockup = await sharp(Buffer.from(lockupSvg)).resize({ width: 360 }).png().toBuffer();

const shade = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
		<defs>
			<linearGradient id="l" x1="0" x2="1" y1="0" y2="0">
				<stop offset="0" stop-color="#0E0F12" stop-opacity="0.92"/>
				<stop offset="0.45" stop-color="#0E0F12" stop-opacity="0.45"/>
				<stop offset="1" stop-color="#0E0F12" stop-opacity="0.1"/>
			</linearGradient>
		</defs>
		<rect width="${W}" height="${H}" fill="url(#l)"/>
		<rect y="${H - 6}" width="${W}" height="6" fill="#FF7A1F"/>
	</svg>`,
);

for (const page of pages) {
	await sharp(new URL(`src/assets/${page.art}`, root).pathname)
		.resize(W, H, { fit: 'cover', position: page.position })
		.composite([
			{ input: shade, top: 0, left: 0 },
			{ input: lockup, top: 64, left: 64 },
		])
		.jpeg({ quality: 82, mozjpeg: true })
		.toFile(new URL(`public/og/${page.out}`, root).pathname);
	console.log(`public/og/${page.out}`);
}
