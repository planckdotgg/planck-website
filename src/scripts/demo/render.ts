import { layer, type Shape } from './scene';
import { idealU, RACER_ANCHOR, RACER_Z, type SimState, START_U } from './sim';
import { depthToY, type Point, trackPoint, WORLD_H, WORLD_W } from './track';

interface Drawn {
	shape: Shape;
	path: Path2D;
}

export interface Frame {
	state: SimState;
	/** 'planck' draws the racer edge in the direct color; 'cloud' in the relay color. */
	mode: 'planck' | 'cloud';
	reduced: boolean;
}

/** Smallest world height kept on screen; extra height shows sky above the art. */
const MIN_WORLD_H = 700;
const LANE_GAP = 1.6;
const LANE_COUNT = 19;
const CHEVRON_GAP = 3.2;
const CHEVRON_COUNT = 9;

// Reference points in the art used to place moving copies of the gate and chevron.
const GATE_LEFT: Point = { x: 624, y: 266 };
const GATE_RIGHT: Point = { x: 966, y: 292 };
const CHEVRON_LEFT: Point = { x: 704, y: 304 };
const CHEVRON_RIGHT: Point = { x: 824, y: 300 };
const GATE_FRAME = 'M624 266 L638 154 L948 182 L966 292';
const HULL_EDGE = 'M480 336 L602 286';

function compile(shapes: Shape[]): Drawn[] {
	return shapes.map((shape) => ({ shape, path: new Path2D(shape.d) }));
}

function paint(ctx: CanvasRenderingContext2D, items: Drawn[]) {
	for (const { shape, path } of items) {
		if (shape.fill) {
			ctx.fillStyle = shape.fill;
			ctx.fill(path);
		}
		if (shape.stroke) {
			ctx.strokeStyle = shape.stroke;
			ctx.lineWidth = shape.strokeWidth;
			ctx.lineCap = shape.cap ?? 'butt';
			ctx.lineJoin = shape.join ?? 'miter';
			ctx.setLineDash(shape.dash ?? []);
			ctx.stroke(path);
		}
	}
	ctx.setLineDash([]);
}

/** Maps segment a→b onto a2→b2 with one rotation and uniform scale. */
function mapSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point, a2: Point, b2: Point) {
	const k = Math.hypot(b2.x - a2.x, b2.y - a2.y) / Math.hypot(b.x - a.x, b.y - a.y);
	const angle = Math.atan2(b2.y - a2.y, b2.x - a2.x) - Math.atan2(b.y - a.y, b.x - a.x);
	ctx.translate(a2.x, a2.y);
	ctx.rotate(angle);
	ctx.scale(k, k);
	ctx.translate(-a.x, -a.y);
	return k;
}

/** An elliptical radial glow, like the art's CSS washes. */
function glow(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	stops: [number, string][],
) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(1, ry / rx);
	const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
	for (const [at, color] of stops) g.addColorStop(at, color);
	ctx.fillStyle = g;
	ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
	ctx.restore();
}

export class Renderer {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly backdrop: Drawn[];
	private readonly centerline: Drawn[];
	private readonly chevronNear: Drawn[];
	private readonly chevronFar: Drawn[];
	private readonly rails: Drawn[];
	private readonly gate: Drawn[];
	private readonly trails: Drawn[];
	private readonly shadow: Drawn[];
	private readonly racer: Drawn[];
	private readonly streaks: Drawn[];
	private readonly gateFrame = new Path2D(GATE_FRAME);
	private readonly hullEdge = new Path2D(HULL_EDGE);
	private readonly still = document.createElement('canvas');
	private readonly racerStart = trackPoint(START_U, RACER_ANCHOR.y);

	private width = 0;
	private height = 0;
	private dpr = 1;
	private scale = 1;
	private camX = WORLD_W / 2;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		shapes: Shape[],
	) {
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) throw new Error('2D canvas unavailable');
		this.ctx = ctx;
		this.backdrop = compile([...layer(shapes, 'backdrop'), ...layer(shapes, 'surface')]);
		this.centerline = compile(layer(shapes, 'centerline'));
		this.chevronNear = compile(layer(shapes, 'chevronNear'));
		this.chevronFar = compile(layer(shapes, 'chevronFar'));
		this.rails = compile(layer(shapes, 'rails'));
		this.gate = compile(layer(shapes, 'gate'));
		this.trails = compile([...layer(shapes, 'trailsFar'), ...layer(shapes, 'trailsNear')]);
		this.shadow = compile(layer(shapes, 'shadow'));
		this.racer = compile(layer(shapes, 'racer'));
		this.streaks = compile(layer(shapes, 'streaks'));
	}

	resize(width: number, height: number, dpr: number) {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.dpr = Math.min(2, Math.max(1, dpr));
		this.scale = Math.max(this.width / WORLD_W, this.height / MIN_WORLD_H);
		this.canvas.width = Math.round(this.width * this.dpr);
		this.canvas.height = Math.round(this.height * this.dpr);
		this.renderStill();
	}

	/** Sky, mountains, and track surface: drawn once per size, then copied every frame. */
	private renderStill() {
		const s = this.scale * this.dpr;
		this.still.width = Math.ceil(WORLD_W * s);
		this.still.height = this.canvas.height;
		const ctx = this.still.getContext('2d');
		if (!ctx) return;
		const top = this.height - WORLD_H * this.scale;
		ctx.setTransform(s, 0, 0, s, 0, top * this.dpr);
		const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
		sky.addColorStop(0, '#101728');
		sky.addColorStop(0.3, '#1F1D32');
		sky.addColorStop(0.46, '#3E2736');
		sky.addColorStop(0.54, '#7F4228');
		sky.addColorStop(0.57, '#171926');
		sky.addColorStop(1, '#0B0D14');
		ctx.fillStyle = sky;
		ctx.fillRect(0, -top / this.scale - 1, WORLD_W, WORLD_H + top / this.scale + 2);
		glow(ctx, WORLD_W * 0.7, 360 * 0.56, WORLD_W * 0.48, 360 * 0.52, [
			[0, '#FF9B52A8'],
			[0.34, '#C65A2E5C'],
			[0.64, '#52293624'],
			[0.86, '#00000000'],
		]);
		glow(ctx, WORLD_W * 0.32, 240 * 0.08, WORLD_W * 0.68, 240 * 0.54, [
			[0, '#4864A036'],
			[0.72, '#141B2D00'],
		]);
		paint(ctx, this.backdrop);
	}

	private trackAt(u: number, z: number): Point {
		return trackPoint(u, depthToY(z));
	}

	draw({ state, mode, reduced }: Frame) {
		const { ctx } = this;
		const s = this.scale;
		const visibleW = this.width / s;
		const racer = trackPoint(state.u, RACER_ANCHOR.y);
		if (visibleW >= WORLD_W) {
			this.camX = WORLD_W / 2;
		} else {
			const want = racer.x * 0.65 + 760 * 0.35;
			const lo = visibleW / 2;
			const hi = WORLD_W - visibleW / 2;
			this.camX += (Math.max(lo, Math.min(hi, want)) - this.camX) * 0.12;
		}
		const left = this.camX - visibleW / 2;
		const top = this.height - WORLD_H * s;

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#090A0E';
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.drawImage(this.still, Math.round(-left * s * this.dpr), 0);
		ctx.setTransform(s * this.dpr, 0, 0, s * this.dpr, -left * s * this.dpr, top * this.dpr);

		this.drawLanes(state);
		ctx.save();
		ctx.lineDashOffset = reduced ? 0 : state.travel * 24;
		paint(ctx, this.centerline);
		ctx.restore();
		this.drawChevrons(state);
		paint(ctx, this.rails);
		this.drawScrape(state);

		const gates = [...state.gates].sort((a, b) => b.z - a.z);
		for (const g of gates) if (g.z >= RACER_Z) this.drawGate(g, state, reduced);
		this.drawRacer(state, racer, mode, reduced);
		for (const g of gates) if (g.z < RACER_Z) this.drawGate(g, state, reduced);
		this.drawStreaks(state, reduced);
	}

	private drawLanes(state: SimState) {
		const { ctx } = this;
		ctx.lineWidth = 1.1;
		const span = LANE_GAP * LANE_COUNT;
		const phase = state.travel % span;
		for (let k = 0; k < LANE_COUNT; k++) {
			const z = 1 + ((k * LANE_GAP - phase + span) % span);
			const y = depthToY(z);
			const fade = Math.min(1, (y - 232) / 40);
			if (fade <= 0) continue;
			const a = trackPoint(0, y);
			const b = trackPoint(1, y);
			ctx.strokeStyle = `rgba(242, 239, 234, ${0.07 * fade})`;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
		}
	}

	private drawChevrons(state: SimState) {
		const { ctx } = this;
		const span = CHEVRON_GAP * CHEVRON_COUNT;
		const phase = state.travel % span;
		for (let k = CHEVRON_COUNT - 1; k >= 0; k--) {
			const z = 1.2 + ((k * CHEVRON_GAP - phase + span) % span);
			if (z > 24) continue;
			const u = idealU(state, z);
			const near = z < RACER_Z;
			ctx.save();
			ctx.globalAlpha = Math.min(1, (24 - z) / 6);
			mapSegment(
				ctx,
				CHEVRON_LEFT,
				CHEVRON_RIGHT,
				this.trackAt(u - 0.085, z),
				this.trackAt(u + 0.085, z),
			);
			paint(ctx, near ? this.chevronNear : this.chevronFar);
			ctx.restore();
		}
	}

	private drawScrape(state: SimState) {
		if (state.sinceScrape > 0.45) return;
		const { ctx } = this;
		const alpha = 1 - state.sinceScrape / 0.45;
		const rail = state.u > 0.5 ? this.rails[5] : this.rails[0];
		if (!rail) return;
		ctx.save();
		ctx.strokeStyle = `rgba(255, 90, 90, ${0.55 * alpha})`;
		ctx.lineWidth = 12;
		ctx.lineCap = 'round';
		ctx.stroke(rail.path);
		ctx.restore();
	}

	private drawGate(g: SimState['gates'][number], state: SimState, reduced: boolean) {
		const { ctx } = this;
		const left = this.trackAt(g.center - g.halfWidth, g.z);
		const right = this.trackAt(g.center + g.halfWidth, g.z);
		ctx.save();
		ctx.globalAlpha = Math.max(0, Math.min(1, (28 - g.z) / 5, (g.z - 0.85) / 0.5));
		const k = mapSegment(ctx, GATE_LEFT, GATE_RIGHT, left, right);
		const justJudged = state.sinceGate < 0.4 && g.result === state.lastGate && g.z < RACER_Z;
		const pulse = justJudged && !reduced ? 1 - state.sinceGate / 0.4 : 0;
		glow(ctx, 795, 222, 230, 150, [
			[0, g.result === 'missed' ? '#FF5A5A33' : `rgba(76, 214, 155, ${0.26 + 0.3 * pulse})`],
			[0.46, g.result === 'missed' ? '#FF5A5A10' : '#4CD69B12'],
			[0.76, '#00000000'],
		]);
		paint(ctx, this.gate);
		if (g.result === 'missed') {
			ctx.strokeStyle = '#FF5A5AD9';
			ctx.lineWidth = 2.8;
			ctx.lineJoin = 'round';
			ctx.stroke(this.gateFrame);
		} else if (g.result === 'threaded') {
			ctx.strokeStyle = `rgba(224, 255, 243, ${0.35 + 0.5 * pulse})`;
			ctx.lineWidth = 1.6 / Math.max(0.6, k);
			ctx.stroke(this.gateFrame);
		}
		ctx.restore();
	}

	private drawRacer(state: SimState, at: Point, mode: Frame['mode'], reduced: boolean) {
		const { ctx } = this;
		const ax = RACER_ANCHOR.x;
		const ay = RACER_ANCHOR.y;
		ctx.save();
		ctx.translate(at.x - this.racerStart.x + ax, at.y - this.racerStart.y + ay);
		ctx.rotate(state.bank * 0.6);
		ctx.translate(-ax, -ay);
		const braking = state.speed < 8;
		const flicker = reduced
			? 1
			: 0.88 + 0.12 * Math.sin(state.time * 47) * Math.sin(state.time * 13);
		ctx.globalAlpha = (braking ? 0.55 : 1) * flicker;
		glow(ctx, 440, 402, 440, 144, [
			[0, '#FF7A1F78'],
			[0.42, '#FF944726'],
			[0.76, '#00000000'],
		]);
		paint(ctx, this.trails);
		ctx.globalAlpha = 1;
		paint(ctx, this.shadow);
		paint(ctx, this.racer);
		if (mode === 'cloud') {
			ctx.strokeStyle = '#F2C94CD0';
			ctx.lineWidth = 2;
			ctx.lineCap = 'round';
			ctx.stroke(this.hullEdge);
		}
		ctx.restore();
	}

	private drawStreaks(state: SimState, reduced: boolean) {
		const { ctx } = this;
		if (reduced) {
			paint(ctx, this.streaks);
			return;
		}
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineWidth = 1.1;
		for (let i = 0; i < 10; i++) {
			const angle = -2.6 + i * 0.52 + (i % 3) * 0.11;
			const t = (state.travel * 0.09 + i * 0.37) % 1;
			const r0 = 160 + t * 620;
			const len = 30 + t * 90;
			const cx = 890;
			const cy = 226;
			const x0 = cx + Math.cos(angle) * r0;
			const y0 = cy + Math.sin(angle) * r0 * 0.55;
			const x1 = cx + Math.cos(angle) * (r0 + len);
			const y1 = cy + Math.sin(angle) * (r0 + len) * 0.55;
			ctx.strokeStyle = `rgba(242, 239, 234, ${0.13 * Math.sin(t * Math.PI)})`;
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();
		}
		ctx.restore();
	}
}
