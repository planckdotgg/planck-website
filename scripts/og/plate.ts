/**
 * Text and the shared plate of the social cards. Text is set with fontkit and drawn as path data:
 * resvg ignores variable-font axes (Archivo at weight 600 and width 125 rendered as its default
 * instance), while fontkit shapes any instance exactly. The SVG that reaches the rasteriser
 * therefore holds no text, so no font engine can substitute or miss a glyph.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as fontkit from 'fontkit';
import { decompress } from 'wawoff2';
import {
	WORDMARK_LANCK,
	WORDMARK_P,
	WORDMARK_SLICE,
	WORDMARK_VIEWBOX,
} from '../../src/lib/wordmark';

export const W = 1200;
export const H = 630;
export const SAFE = 56;
export const GROUND = '#0E0F12';
export const VERSION_LABEL = 'v0.1.0';

/** Martian Mono's advance in em at weight 400, width 100: the setting the site renders. Checked
    against the loaded font on every run, so a wrong or missing font fails loudly. */
export const MONO_ADV_EM = 0.7;

const root = new URL('../../', import.meta.url);

async function ttf(name: string): Promise<Buffer> {
	const woff2 = new URL(`public/fonts/${name}.woff2`, root).pathname;
	const dir = new URL('.scratch/fonts/', root).pathname;
	const out = `${dir}${name}.ttf`;
	const fresh = await stat(out)
		.then(async (t) => t.mtimeMs >= (await stat(woff2)).mtimeMs)
		.catch(() => false);
	if (!fresh) {
		await mkdir(dir, { recursive: true });
		await writeFile(out, await decompress(await readFile(woff2)));
	}
	return readFile(out);
}

const faces = {
	ui: fontkit.create(await ttf('Archivo')) as fontkit.Font,
	mono: fontkit.create(await ttf('MartianMono')) as fontkit.Font,
};

const instances = new Map<string, fontkit.Font>();
function instance(face: keyof typeof faces, weight: number, stretch: number): fontkit.Font {
	const key = `${face}:${weight}:${stretch}`;
	let font = instances.get(key);
	if (!font) {
		font = faces[face].getVariation({ wght: weight, wdth: stretch });
		instances.set(key, font);
	}
	return font;
}

export interface TextStyle {
	face: 'ui' | 'mono';
	size: number;
	weight?: number;
	/** Font width axis, percent. */
	stretch?: number;
	/** Letter spacing in em. */
	tracking?: number;
	fill: string;
	anchor?: 'start' | 'middle' | 'end';
}

/** Advance width of a run in px, letter spacing included. */
export function measure(text: string, s: TextStyle): number {
	const font = instance(s.face, s.weight ?? 400, s.stretch ?? 100);
	const run = font.layout(text);
	const scale = s.size / font.unitsPerEm;
	const adv = run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;
	return adv + (s.tracking ?? 0) * s.size * Math.max(0, run.glyphs.length - 1);
}

/** A run of text as one <path>, x/y being the anchor point on the baseline. */
export function text(str: string, x: number, y: number, s: TextStyle): string {
	const font = instance(s.face, s.weight ?? 400, s.stretch ?? 100);
	const run = font.layout(str);
	const scale = s.size / font.unitsPerEm;
	const track = (s.tracking ?? 0) * s.size;
	const width = measure(str, s);
	let pen = s.anchor === 'end' ? x - width : s.anchor === 'middle' ? x - width / 2 : x;
	let d = '';
	run.glyphs.forEach((glyph, i) => {
		const pos = run.positions[i];
		if (!pos) return;
		const gx = pen + pos.xOffset * scale;
		const gy = y - pos.yOffset * scale;
		d += glyph.path.scale(scale, -scale).translate(gx, gy).toSVG();
		pen += pos.xAdvance * scale + track;
	});
	return `<path fill="${s.fill}" d="${d}"/>`;
}

/** Runs split by " · ", with the separators in their own colour. Returns the SVG and its width. */
export function strip(str: string, x: number, y: number, s: TextStyle, sepFill: string) {
	const parts = str.split(' · ');
	const sep = ' · ';
	let pen = x;
	let out = '';
	parts.forEach((p, i) => {
		if (i > 0) {
			out += text(sep, pen, y, { ...s, fill: sepFill });
			pen += measure(sep, s) + (s.tracking ?? 0) * s.size;
		}
		out += text(p, pen, y, s);
		pen += measure(p, s) + (s.tracking ?? 0) * s.size;
	});
	return { svg: out, width: pen - x };
}

/** Fails the run if the fonts did not load as expected. */
export function checkFonts() {
	const mono = measure('0123456789', { face: 'mono', size: 100, fill: '#000' }) / 10 / 100;
	if (Math.abs(mono - MONO_ADV_EM) > 0.01) {
		throw new Error(`Martian Mono advance is ${mono.toFixed(3)} em, expected ${MONO_ADV_EM}`);
	}
	const style = { face: 'ui', size: 64, weight: 600, fill: '#000' } as const;
	const wide = measure('MEASURED LATENCY', { ...style, stretch: 125 });
	const normal = measure('MEASURED LATENCY', style);
	if (wide / normal < 1.08) {
		throw new Error(`Archivo width axis not applied (${(wide / normal).toFixed(3)}×)`);
	}
}

export function wordmark(x: number, y: number, width: number): string {
	const [vx, vy, vw] = WORDMARK_VIEWBOX.split(' ').map(Number) as [number, number, number];
	const s = width / vw;
	return `<g transform="translate(${x} ${y}) scale(${s}) translate(${-vx} ${-vy})">
		<path fill-rule="evenodd" fill="#F2EFEA" d="${WORDMARK_P}"/>
		<path fill-rule="evenodd" fill="#FF7A1F" d="${WORDMARK_SLICE}"/>
		<path fill-rule="evenodd" fill="#F2EFEA" d="${WORDMARK_LANCK}"/>
	</g>`;
}

const versionStyle: TextStyle = {
	face: 'mono',
	size: 20,
	weight: 500,
	fill: '#8C919B',
	anchor: 'end',
};

/** Wordmark, version and the ember edge: on every card. */
export function chrome(): string {
	return `${wordmark(SAFE, SAFE, 168)}
		${text(VERSION_LABEL, W - SAFE, 84, versionStyle)}
		<rect x="0" y="${H - 6}" width="${W}" height="6" fill="#FF7A1F"/>`;
}

/** The instrument plate under docs cards: ground, grid, ember horizon, crop marks, header rule. */
export function plate(): string {
	const lines: string[] = [];
	for (let x = SAFE; x <= W - SAFE; x += 48) lines.push(`M${x} ${SAFE} V${H - SAFE}`);
	const vertical = lines.join(' ');
	lines.length = 0;
	for (let y = SAFE; y <= H - SAFE; y += 48) lines.push(`M${SAFE} ${y} H${W - SAFE}`);
	const horizontal = lines.join(' ');
	const r = W - SAFE;
	const b = H - SAFE;
	return `<defs>
			<radialGradient id="horizon" cx="0.5" cy="1.08" r="0.62">
				<stop offset="0" stop-color="#FF7A1F" stop-opacity="0.149"/>
				<stop offset="0.42" stop-color="#E8650C" stop-opacity="0.063"/>
				<stop offset="0.76" stop-color="#0E0F12" stop-opacity="0"/>
			</radialGradient>
		</defs>
		<rect width="${W}" height="${H}" fill="${GROUND}"/>
		<path d="${vertical}" stroke="#F2EFEA08" stroke-width="1" shape-rendering="crispEdges"/>
		<path d="${horizontal}" stroke="#F2EFEA06" stroke-width="1" shape-rendering="crispEdges"/>
		<rect x="0" y="270" width="${W}" height="354" fill="url(#horizon)"/>
		<path d="M${SAFE} ${SAFE + 16} V${SAFE} H${SAFE + 16} M${r - 16} ${SAFE} H${r} V${SAFE + 16} M${SAFE} ${b - 16} V${b} H${SAFE + 16} M${r - 16} ${b} H${r} V${b - 16}" fill="none" stroke="#F2EFEA1F" stroke-width="1.25"/>
		<path d="M${SAFE} 136.5 H${r}" stroke="#F2EFEA1A" stroke-width="1"/>`;
}

export const svg = (body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
