import { NSEG } from './flux-sim';

export const VERTEX = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export const UNIFORMS = [
	'uRes',
	'uPx',
	'uTime',
	'uShot',
	'uShotR',
	'uMeter',
	'uMeterR',
	'uBand',
	'uGlassY',
	'uLandX',
	'uTickX',
	'uTick',
	'uPtr',
	'uOnShot',
	'uImpact',
	'uSplit',
	'uFlare',
	'uWaveR',
	'uWaveE',
	'uRunY',
	'uRunE',
	'uGain',
	'uCap',
	'uDither',
	'uSeg',
	'uSegB',
] as const;

export type Uniform = (typeof UNIFORMS)[number];

/**
 * GLSL ES 1.00 so one source compiles on WebGL2 and WebGL1. Colour is mixed in linear RGB and
 * encoded to sRGB once; output is premultiplied, which over the #0E0F12 ground is additive.
 */
export const FRAGMENT = `precision highp float;
uniform vec2 uRes; uniform float uPx; uniform float uTime;
uniform vec4 uShot; uniform float uShotR;
uniform vec4 uMeter; uniform float uMeterR;
uniform vec2 uBand; uniform float uGlassY; uniform float uLandX;
uniform float uTickX; uniform float uTick;
uniform vec2 uPtr; uniform float uOnShot;
uniform float uImpact; uniform float uSplit; uniform float uFlare;
uniform float uWaveR; uniform float uWaveE; uniform float uRunY; uniform float uRunE;
uniform float uGain; uniform float uCap; uniform float uDither;
uniform vec4 uSeg[${NSEG}];
uniform vec4 uSegB[${NSEG}];

const vec3 K10 = vec3(0.58408, 0.69387, 1.00000); // --k10000 #C9D9FF
const vec3 K40 = vec3(1.00000, 0.63760, 0.36625); // --k4000  #FFD1A3
const vec3 K30 = vec3(1.00000, 0.45641, 0.14703); // --k3000  #FFB46B
const vec3 ACC = vec3(1.00000, 0.19462, 0.01370); // --accent #FF7A1F
const vec3 BONE = vec3(0.88792, 0.86316, 0.82279); // --text   #F2EFEA

float sdBox(vec2 p, vec4 r, float rad) {
  vec2 c = (r.xy + r.zw) * 0.5; vec2 h = (r.zw - r.xy) * 0.5 - rad;
  vec2 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 enc(vec3 x) {
  x = clamp(x, 0.0, 1.0);
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}

void main() {
  vec2 p = gl_FragCoord.xy; p.y = uRes.y - p.y;
  vec3 c = vec3(0.0);
  float gdy = p.y - uGlassY;
  float land = uLandX;

  float reach = 1.0 - smoothstep(0.58, 0.99, abs(p.x - uRes.x * 0.5) / (uRes.x * 0.5));
  float base = exp(-abs(gdy) / max(1.10 * uPx, 1.0));
  c += BONE * base * 0.034 * reach;

  float u = (p.x - uTickX) / (uTick * uPx);
  float five = step(0.5, abs(fract(u / 5.0 + 0.5) - 0.5) * 10.0 - 4.0);
  float th = (4.5 + 5.0 * five) * uPx;
  float tick = step(0.94, fract(u + 0.03)) * (1.0 - step(1.0, fract(u + 0.03)));
  float tcol = exp(-max(0.0, -gdy - th) / (1.2 * uPx)) * step(gdy, -2.0 * uPx) * step(-th - 1.0 * uPx, gdy);
  c += BONE * tick * tcol * 0.060 * reach;

  for (int i = 0; i < ${NSEG}; i++) {
    vec4 s = uSeg[i]; if (s.w <= 0.0015) continue;
    vec4 b = uSegB[i];
    float dy = p.y - s.x;
    if (abs(dy) > b.y * 9.0 + 3.0 * uPx) continue;
    float sw = abs(b.w);
    float xin = smoothstep(s.y - sw, s.y + sw, p.x) * (1.0 - smoothstep(s.z - sw, s.z + sw, p.x));
    if (xin <= 0.002) continue;
    float core = exp(-(dy * dy) / (b.x * b.x));
    float halo = exp(-abs(dy) / b.y) * 0.13;
    float tt = (p.x - s.y) / max(s.z - s.y, 1.0);
    float head = b.w > 0.0 ? tt : 1.0 - tt;
    float prof = 0.14 + 0.86 * pow(clamp(head, 0.0, 1.0), 2.0);
    vec3 col = mix(ACC, K40, b.z);
    col = mix(col, BONE, core * 0.88);
    float lx = b.w > 0.0 ? s.z : s.y;
    col += K10 * exp(-abs(p.x - lx) / (10.0 * uPx)) * core * 0.60;
    c += col * (core + halo) * xin * prof * s.w;
  }

  float inX = 1.0 - smoothstep(0.0, 13.0 * uPx, max(uShot.x - p.x, p.x - uShot.z));
  float bw = 1.0 - smoothstep(0.0, 1.15, abs(p.x - land) / (0.42 * (uShot.z - uShot.x)));
  float k = 2.5 * uPx;
  vec3 bar = vec3(exp(-abs(gdy + uSplit) / k), exp(-abs(gdy) / k), exp(-abs(gdy - uSplit) / k));
  c += (bar * 1.10 + K40 * exp(-abs(gdy) / (18.0 * uPx)) * 0.16) * bw * inX * uImpact;
  c += BONE * base * inX * uFlare * 0.85;

  float ds = sdBox(p, uShot, uShotR);
  float d = min(ds, sdBox(p, uMeter, uMeterR));
  float out_ = smoothstep(-1.0, 1.4, d);
  float rim = (exp(-max(d, 0.0) / (5.5 * uPx)) * 0.90 + exp(-max(d, 0.0) / (22.0 * uPx)) * 0.14) * out_;
  float topw = 1.0 - smoothstep(0.0, 240.0 * uPx, p.y - uShot.y);
  float wave = exp(-abs(abs(p.x - land) - uWaveR) / (130.0 * uPx)) * uWaveE;
  float hot = uOnShot * exp(-abs(p.x - uPtr.x) / (92.0 * uPx)) * 0.95;
  c += mix(ACC, K40, clamp(uImpact, 0.0, 1.0)) * rim * topw * (1.0 + 0.45 * uOnShot)
       * (0.18 + 0.75 * bw + wave + hot) * (0.40 + 0.95 * uImpact);
  float side = exp(-abs(p.y - (uShot.y + uRunY)) / (64.0 * uPx)) * uRunE;
  c += K30 * exp(-max(ds, 0.0) / (6.0 * uPx)) * out_ * side * 0.80;

  c *= uGain;

  // A clamp, not a scale: dim pixels in the band are untouched, so the band has no visible edge.
  float inBand = smoothstep(uBand.x - 140.0 * uPx, uBand.x, p.y)
               * (1.0 - smoothstep(uBand.y, uBand.y + 140.0 * uPx, p.y));
  float yadd = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= min(1.0, mix(1.0, uCap, inBand) / max(yadd, 1e-5));

  float fx = smoothstep(0.0, max(0.030 * uRes.x, (uRes.x - 1800.0 * uPx) * 0.5), min(p.x, uRes.x - p.x));
  float fy = smoothstep(0.0, 0.040 * uRes.y, p.y) * smoothstep(0.0, 0.035 * uRes.y, uRes.y - p.y);
  c *= fx * fy;

  vec3 o = enc(c) + (hash12(p + fract(uTime) * 137.0) - 0.5) / 255.0 * uDither;
  o = max(o, 0.0);
  gl_FragColor = vec4(o, clamp(max(max(o.r, o.g), o.b), 0.0, 1.0));
}`;
