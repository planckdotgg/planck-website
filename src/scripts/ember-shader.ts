export const VERTEX = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export const UNIFORMS = [
	'uRes',
	'uPx',
	'uTime',
	'uFrame',
	'uRadius',
	'uCopy',
	'uBeam',
	'uFront',
	'uRun',
	'uGlow',
	'uRipple',
	'uDither',
] as const;

export type Uniform = (typeof UNIFORMS)[number];

/**
 * GLSL ES 1.00, so one source compiles on WebGL2 and WebGL1. Work is in CSS px, y down, with the
 * ClientShot frame as an analytic rounded box. Light is summed in linear RGB, soft-clipped with
 * 1 - exp(-x) so the hottest parts burn toward bone white, then encoded to sRGB once. The canvas
 * sits over the frame with `mix-blend-mode: screen`; premultiplied output with alpha = max
 * channel makes that exactly screen(backdrop, light), which is how the spill bleeds into the glass.
 */
export const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uPx;
uniform float uTime;
uniform vec4 uFrame;
uniform float uRadius;
uniform vec4 uCopy;
uniform vec3 uBeam;
uniform float uFront;
uniform vec2 uRun;
uniform vec3 uGlow;
uniform vec2 uRipple;
uniform float uDither;

const vec3 BONE = vec3(0.888, 0.863, 0.825);
const vec3 AMBER = vec3(1.0, 0.637, 0.366);
const vec3 EMBER = vec3(1.0, 0.195, 0.013);
const vec3 DEEP = vec3(0.807, 0.109, 0.004);
const vec3 COOL = vec3(0.584, 0.693, 1.0);

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		p = m * p;
		a *= 0.5;
	}
	return v / 0.9375;
}

// Two octaves: smooth enough to bend the stream without combing it into fine streaks.
float soft(vec2 p) {
	return (noise(p) * 0.6667 + noise(mat2(1.6, 1.2, -1.2, 1.6) * p) * 0.3333);
}

float sq(float x) { return x * x; }

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
	vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
	float t = uTime;
	float L = uFrame.x;
	float T = uFrame.y;
	float R = uFrame.z;
	float B = uFrame.w;
	float rad = uRadius;
	float sd = box(p - vec2(L + R, T + B) * 0.5, vec2(R - L, B - T) * 0.5, rad);

	// Inside the window only a band under the top and right bezel takes light.
	if (sd < -48.0) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float src = uBeam.z;
	float lean = uBeam.y * clamp(1.0 - (p.y - src) / max(T - src, 1.0), 0.0, 1.0);
	float dx = p.x - uBeam.x - lean;
	float adx = abs(dx);
	// The glow falls off faster on the side that faces the copy, so the copy needs little masking.
	float towardCopy = dx * ((uCopy.x + uCopy.z) * 0.5 - uBeam.x) > 0.0 ? 1.8 : 1.0;
	float gdx = adx * towardCopy;
	float energy = uGlow.z;
	float bloom = uGlow.y;

	// Distance to the top-right bezel (outside positive) and the path length along it, measured
	// from the landing point: across the top, round the corner, then down the right side.
	vec2 c = vec2(R - rad, T + rad);
	float d;
	float s;
	float onSide = 0.0;
	if (p.x <= c.x) {
		d = T - p.y;
		s = p.x - uBeam.x;
	} else if (p.y >= c.y) {
		d = p.x - R;
		s = (c.x - uBeam.x) + 1.5708 * rad + (p.y - c.y);
		onSide = 1.0;
	} else {
		vec2 v = p - c;
		d = length(v) - rad;
		s = (c.x - uBeam.x) + rad * atan(v.x, -v.y);
		onSide = smoothstep(0.0, 1.5708 * rad, s - (c.x - uBeam.x));
	}
	float down = max(p.y - c.y, 0.0) * onSide;
	float dOut = max(d, 0.0);
	float dIn = max(-d, 0.0);

	float bound = exp(-adx / 260.0) * exp(-max(p.y - T, 0.0) / 80.0)
		+ exp(-dOut / 120.0) * step(-48.0, d) * step(-uRun.y - 160.0, s);
	if (bound < 0.002) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float breathe = 1.0 + 0.07 * sin(t * 1.3) + 0.05 * (noise(vec2(t * 0.45, 7.0)) - 0.5);
	float rippleAt = uRipple.x * 1100.0;
	float rippleE = uRipple.y * exp(-uRipple.x / 0.7);
	// Volumetric light stays outside the glass; only the bezel spill bleeds in.
	float vol = smoothstep(-14.0, 1.0, sd);

	vec3 col = vec3(0.0);

	// --- The falling stream ------------------------------------------------------------
	// Domain warp advected downward gives the stream a liquid, plasma-like flow; the warp grows
	// away from the core so the centre stays a clean thread.
	vec2 q = vec2(dx * 0.0085, p.y * 0.0068 - t * 0.3);
	vec2 w = vec2(soft(q + vec2(1.7, 9.2 - t * 0.09)), soft(q * 1.3 + vec2(8.3, 2.8 - t * 0.15)));
	float flow = soft(q * vec2(1.3, 1.0) + 1.8 * w + vec2(0.0, -t * 0.22));
	float reachW = min(adx, 160.0);
	float warp = (w.x - 0.5) * (2.5 + 0.17 * reachW) + (soft(q * 2.0 + 1.5 * w) - 0.5) * 0.08 * reachW;
	float wdx = abs(dx + warp);
	float streak = 0.6 + 0.8 * smoothstep(0.25, 0.85, fbm(vec2(dx * 0.07 + 1.5 * w.y, p.y * 0.012 - t * 1.2)));

	float above = 1.0 - smoothstep(T - 3.0, T + 1.0, p.y);
	float head = smoothstep(uFront + 4.0, uFront - 90.0, p.y);
	float falling = 1.0 - smoothstep(T - 30.0, T - 2.0, uFront);
	float ignite = smoothstep(src - 10.0, src + 40.0 + 0.4 * max(T - src - 40.0, 0.0), p.y);
	ignite = mix(src > 0.5 ? 0.0 : 0.5, 1.0, ignite);
	float beamOn = above * head * ignite * vol;
	float rip = 1.0 + 1.6 * rippleE * exp(-sq((p.y - rippleAt) / 46.0));

	float nearing = mix(0.7, 1.35, smoothstep(src, T, p.y));
	float core = exp(-sq(abs(dx + 0.1 * warp) / (1.4 + 0.5 * nearing)));
	float hot = exp(-wdx / 5.0);
	float inner = exp(-sq(wdx / 26.0)) * streak;
	float mid = exp(-wdx * towardCopy / 52.0) * (0.4 + 0.9 * flow);
	col += BONE * core * 3.6 * energy * beamOn * rip;
	col += AMBER * hot * 1.2 * nearing * energy * beamOn * rip;
	col += EMBER * inner * 0.6 * nearing * beamOn * breathe * rip;
	col += DEEP * mid * 0.16 * beamOn * bloom * breathe;

	// The leading edge of the head burns hottest, with a thin cool fringe ahead of it.
	float hy = p.y - uFront;
	float headOn = falling * step(src - 10.0, uFront);
	col += (BONE * 6.0 * exp(-adx / 3.0) + AMBER * 1.4 * exp(-wdx / 13.0)) * exp(-sq(hy / 22.0)) * headOn;
	col += COOL * 0.9 * exp(-adx / 6.0) * exp(-sq((hy - 12.0) / 9.0)) * headOn;

	// --- Atmosphere: a soft 350-450 px wash that turns with the stream -------------------
	float smoke = soft(vec2(dx / 150.0, (p.y - t * 16.0) / 150.0) + 1.2 * w);
	float lower = mix(0.3, 1.0, smoothstep(src, T, p.y)) * mix(0.0, 1.0, ignite);
	float below = exp(-max(p.y - T, 0.0) / 50.0);
	float poured = smoothstep(uFront + 160.0, uFront - 60.0, p.y);
	float column = (0.2 * exp(-wdx * towardCopy / 70.0) + 0.04 * exp(-gdx / 200.0)) * lower * below * poured;
	vec2 k = vec2(dx, p.y - T);
	vec2 kg = vec2(gdx, p.y - T);
	float wash = 0.16 * exp(-length(kg * vec2(0.55, 1.0)) / 95.0) + 0.03 * exp(-length(kg * vec2(0.8, 1.0)) / 280.0);
	wash *= mix(1.0, below, step(0.0, k.y)) * smoothstep(T - 160.0, T, uFront);
	col += mix(DEEP, EMBER, 0.35) * (column + wash * smoothstep(0.0, 0.4, bloom)) * (0.7 + 0.6 * smoke) * bloom * breathe * vol;

	// --- Impact knee: where the stream strikes the top bezel --------------------------------
	float landed = smoothstep(T - 20.0, T, uFront);
	float knee = exp(-length(k * vec2(0.4, 1.0)) / 13.0);
	float skirt = exp(-max(-k.y, 0.0) / 34.0) * exp(-adx / 80.0) * step(k.y, 1.0);
	float lens = exp(-sq(k.y / 1.2)) * exp(-adx / 460.0) * smoothstep(L, L + 240.0, p.x);
	col += (BONE * 2.6 * knee + AMBER * 0.55 * skirt * (0.6 + 0.6 * flow) + BONE * 0.45 * lens) * landed * energy * vol;
	col += COOL * 0.3 * exp(-length(k * vec2(0.28, 1.4)) / 6.0) * landed;
	col += (BONE * 7.0 * exp(-length(k * vec2(0.5, 1.6)) / 18.0) + AMBER * 1.6 * exp(-length(k) / 70.0)) * uGlow.x * vol;

	// --- Spill along the bezel --------------------------------------------------------------
	float sideLen = B - c.y;
	float sideFade = exp(-sq(down / (0.34 * sideLen + 40.0)));
	float fromBeam = abs(s);
	float rightSide = step(0.0, s);
	float reach = rightSide * exp(-max(s, 0.0) / 1100.0) * sideFade
		+ (1.0 - rightSide) * exp(-fromBeam / 240.0) * smoothstep(L + rad, L + rad + 160.0, p.x);
	float run = rightSide > 0.5 ? uRun.x : uRun.y;
	float reveal = 1.0 - smoothstep(run - 70.0, run + 10.0, fromBeam + 0.4 * dOut);
	float shimmer = 0.6 + 0.8 * soft(vec2(fromBeam / 46.0 - t * 1.5, d / 60.0 + 3.0));
	float drip = 0.65 + 0.7 * soft(vec2(dOut / 30.0 - t * 0.12, down / 70.0 - t * 0.9));
	float rip2 = 1.0 + 1.4 * rippleE * exp(-sq((T + fromBeam - rippleAt) / 60.0));

	float line = exp(-sq(d / 1.3));
	float lip = (exp(-dOut / 6.0) + 0.3 * exp(-dOut / 22.0)) * smoothstep(-1.5, 1.5, d);
	float pourOut = onSide * (exp(-dOut / 14.0) * 0.8 + exp(-dOut / 46.0) * 0.3) * drip * smoothstep(-1.5, 1.5, d);
	float bleed = (exp(-dIn / 7.0) * 0.8 + exp(-dIn / 20.0) * 0.45) * smoothstep(46.0, 14.0, dIn) * step(d, 0.0);
	bleed *= mix(0.45, 1.5, max(onSide, smoothstep(240.0, 0.0, c.x - p.x))) * (0.75 + 0.5 * drip);
	float edge = reach * reveal * shimmer * rip2;
	vec3 bezel = BONE * line * 1.7 + mix(AMBER, EMBER, 0.45) * lip * 1.0 + EMBER * pourOut + mix(EMBER, AMBER, 0.3) * bleed;
	col += bezel * edge * energy * breathe;

	// The copy stays clean whatever the layout.
	vec2 cc = (uCopy.xy + uCopy.zw) * 0.5;
	float copyD = box(p - cc, (uCopy.zw - uCopy.xy) * 0.5 + 6.0, 24.0);
	col *= mix(0.025, 1.0, smoothstep(-8.0, 160.0, copyD));

	vec3 emit = srgb(1.0 - exp(-col));
	float m = max(emit.r, max(emit.g, emit.b));
	float dn = (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
	emit = clamp(emit + uDither * dn * clamp(m * 255.0, 0.0, 1.0), 0.0, 1.0);
	m = max(emit.r, max(emit.g, emit.b));
	gl_FragColor = vec4(emit, m);
}
`;
