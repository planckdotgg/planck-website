/**
 * Reads the hero art's SVG into drawing commands. The art uses only circle, ellipse, polygon,
 * and path elements with presentation attributes, so a small attribute reader is enough and the
 * same file serves as the static poster and the playable scene.
 */
export interface Shape {
	tag: 'circle' | 'ellipse' | 'polygon' | 'path';
	/** SVG path data for every shape kind. */
	d: string;
	fill?: string;
	stroke?: string;
	strokeWidth: number;
	dash?: number[];
	cap?: CanvasLineCap;
	join?: CanvasLineJoin;
}

const ELEMENT = /<(circle|ellipse|polygon|path)\b([^>]*?)\/?>/g;
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

function attrs(source: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of source.matchAll(ATTR)) out[m[1] as string] = m[2] as string;
	return out;
}

function num(a: Record<string, string>, key: string): number {
	return Number.parseFloat(a[key] ?? '0');
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
	return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

export function parseScene(svg: string): Shape[] {
	const shapes: Shape[] = [];
	for (const m of svg.matchAll(ELEMENT)) {
		const tag = m[1] as Shape['tag'];
		const a = attrs(m[2] as string);
		let d: string;
		if (tag === 'circle') d = ellipsePath(num(a, 'cx'), num(a, 'cy'), num(a, 'r'), num(a, 'r'));
		else if (tag === 'ellipse')
			d = ellipsePath(num(a, 'cx'), num(a, 'cy'), num(a, 'rx'), num(a, 'ry'));
		else if (tag === 'polygon') d = `M${(a.points ?? '').trim().split(/\s+/).join(' L')} Z`;
		else d = a.d ?? '';
		const fill = a.fill && a.fill !== 'none' ? a.fill : undefined;
		const stroke = a.stroke && a.stroke !== 'none' ? a.stroke : undefined;
		shapes.push({
			tag,
			d,
			fill: tag === 'path' && !('fill' in a) ? '#000000' : fill,
			stroke,
			strokeWidth: a['stroke-width'] ? Number.parseFloat(a['stroke-width']) : 1,
			dash: a['stroke-dasharray']?.split(/[\s,]+/).map(Number),
			cap: a['stroke-linecap'] as CanvasLineCap | undefined,
			join: a['stroke-linejoin'] as CanvasLineJoin | undefined,
		});
	}
	return shapes;
}

/**
 * Index ranges of the art's layers, in document order. The scene test pins the element count,
 * so a re-export of the art that moves layers fails loudly instead of drawing the wrong parts.
 */
export const LAYERS = {
	backdrop: [0, 47],
	surface: [47, 53],
	lanes: [53, 60],
	centerline: [60, 61],
	chevronNear: [61, 62],
	chevronFar: [63, 64],
	rails: [65, 72],
	gate: [72, 88],
	trailsFar: [88, 93],
	shadow: [93, 96],
	trailsNear: [96, 106],
	racer: [106, 139],
	streaks: [139, 140],
} as const satisfies Record<string, readonly [number, number]>;

export const SHAPE_COUNT = 140;

export function layer(shapes: Shape[], name: keyof typeof LAYERS): Shape[] {
	const [from, to] = LAYERS[name];
	return shapes.slice(from, to);
}
