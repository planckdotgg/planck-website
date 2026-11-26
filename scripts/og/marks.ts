/** The 320×320 mini-marks drawn at the right of each docs card, in local coordinates. Strokes
    of 1 to 2px, the blackbody ramp and signal colours, fills only at low alpha. */
import { measure, text } from './plate';

const mono = (size: number, fill: string, weight = 400) =>
	({ face: 'mono', size, weight, fill }) as const;

const RAMP = ['#FF8912', '#FFB46B', '#FFD1A3', '#C9D9FF', '#4CD69B'] as const;

/** A datasheet contents block: six rules of falling length, row 03 in ember. */
function contents(): string {
	let out = '';
	for (let i = 0; i < 6; i++) {
		const y = 34 + i * 52;
		const ember = i === 2;
		out += text(`0${i + 1}`, 0, y + 5, mono(14, ember ? '#FF7A1F' : '#6E7480', 500));
		out += `<rect x="44" y="${y - 1}" width="${276 - i * 34}" height="2" rx="1" fill="${ember ? '#FF7A1F' : '#F2EFEA24'}"/>`;
	}
	return out;
}

/** Five pipeline nodes in a zigzag, cooling along the ramp. */
function pipeline(): string {
	const nodes = RAMP.map((tone, i) => ({ x: i * 70, y: i % 2 === 0 ? 96 : 184, tone }));
	let joins = '';
	nodes.slice(1).forEach((n, i) => {
		const p = nodes[i];
		if (p) joins += `M${p.x + 20} ${p.y + 20} L${n.x + 20} ${n.y + 20} `;
	});
	let out = `<path d="${joins}" fill="none" stroke="#FF7A1F99" stroke-width="1.25"/>`;
	nodes.forEach((n, i) => {
		out += `<rect x="${n.x + 0.75}" y="${n.y + 0.75}" width="38.5" height="38.5" rx="6" fill="#0E0F12" stroke="${n.tone}" stroke-width="1.5"/>`;
		out += `<rect x="${n.x + 6}" y="${n.y + 6}" width="28" height="28" rx="3" fill="${n.tone}33"/>`;
		out += text(`0${i + 1}`, n.x + 20, n.y + 25, { ...mono(13, n.tone, 600), anchor: 'middle' });
	});
	out += text('CAPTURE', 0, 72, mono(11, '#8C919B', 500));
	out += text('PRESENT', 320, 248, { ...mono(11, '#8C919B', 500), anchor: 'end' });
	return out;
}

/** The 36-byte video header as a byte ruler, and a 1152-byte datagram split into its parts. */
function wire(): string {
	const cell = 280 / 36;
	const x0 = 20;
	const y0 = 64;
	let cells = '';
	for (let i = 1; i < 36; i++) cells += `M${x0 + i * cell} ${y0} V${y0 + 40} `;
	let out = `<rect x="${x0 + 0.5}" y="${y0 + 0.5}" width="279" height="39" rx="2" fill="#F2EFEA08" stroke="#F2EFEA24"/>`;
	out += `<path d="${cells}" stroke="#F2EFEA14" stroke-width="1"/>`;
	for (const t of [0, 12, 20, 28, 36]) {
		out += text(String(t), x0 + t * cell, y0 - 10, { ...mono(11, '#6E7480'), anchor: 'middle' });
	}
	const groups = [
		{ a: 0, b: 10, label: '1 B', tone: '#FFD1A3' },
		{ a: 12, b: 20, label: '4 B', tone: '#FFB46B' },
		{ a: 20, b: 36, label: '8 B', tone: '#FF8912' },
	];
	for (const g of groups) {
		const a = x0 + g.a * cell + 2;
		const b = x0 + g.b * cell - 2;
		out += `<path d="M${a} ${y0 + 50} V${y0 + 56} H${b} V${y0 + 50}" fill="none" stroke="${g.tone}" stroke-width="1.25"/>`;
		out += text(g.label, (a + b) / 2, y0 + 74, { ...mono(11, g.tone, 500), anchor: 'middle' });
	}
	const by = 222;
	const scale = 280 / 1152;
	const seal = 25 * scale;
	const head = 36 * scale;
	out += text('1152 B DATAGRAM', x0, by - 14, mono(11, '#8C919B', 500));
	out += `<rect x="${x0}" y="${by}" width="${seal}" height="22" fill="#C9D9FF"/>`;
	out += `<rect x="${x0 + seal}" y="${by}" width="${head}" height="22" fill="#FFB46B"/>`;
	out += `<rect x="${x0 + seal + head}" y="${by}" width="${280 - seal - head}" height="22" fill="#FF7A1F33" stroke="#FF7A1F" stroke-width="1"/>`;
	out += text('25 B', x0, by + 44, mono(11, '#C9D9FF', 500));
	out += text('36 B', x0 + 48, by + 44, mono(11, '#FFB46B', 500));
	out += text('1091 B', x0 + 280, by + 44, { ...mono(11, '#FF7A1F', 500), anchor: 'end' });
	return out;
}

/** The measured Phase 0 / Phase 1B latencies on a 0–3 ms scale, tones in pipeline order. */
function bars(): string {
	const rows = [
		{ label: 'NVENC encode', ms: 1.04, tone: '#FF8912' },
		{ label: '1st slice out', ms: 0.7, tone: '#FFB46B' },
		{ label: 'AMF encode', ms: 2.78, tone: '#FFD1A3' },
		{ label: 'VideoToolbox decode', ms: 0.87, tone: '#C9D9FF' },
	];
	const perMs = 320 / 3;
	const unit = { ...mono(10, '#8C919B', 500), anchor: 'end' } as const;
	let out = '';
	rows.forEach((r, i) => {
		const y = 52 * i;
		const len = Math.round(r.ms * perMs);
		out += text(r.label, 0, 12 + y, mono(12, '#B6B8BE', 500));
		out += text('ms', 320, 12 + y, unit);
		out += text(r.ms.toFixed(2), 320 - measure('ms', unit) - 4, 12 + y, {
			face: 'ui',
			size: 18,
			weight: 600,
			stretch: 125,
			tracking: -0.02,
			fill: r.tone,
			anchor: 'end',
		});
		out += `<rect x="0.5" y="${26.5 + y}" width="319" height="11" rx="2" fill="#F2EFEA0A" stroke="#22252B" stroke-width="1"/>`;
		out += `<rect x="1" y="${27 + y}" width="${len - 2}" height="10" rx="2" fill="${r.tone}42"/>`;
		out += `<rect x="${len - 3}" y="${21 + y}" width="3" height="20" rx="1" fill="${r.tone}"/>`;
	});
	out += `<path d="M0 216.5 H320" stroke="#2C3038" stroke-width="1"/>`;
	const tick = mono(11, '#6E7480');
	out += text('0', 0, 234, tick);
	out += text('1', 107, 234, { ...tick, anchor: 'middle' });
	out += text('2', 213, 234, { ...tick, anchor: 'middle' });
	out += text('3 ms', 320, 234, { ...tick, anchor: 'end' });
	return out;
}

/** A key and value ladder, one value in ember. */
function ladder(): string {
	const rows = [
		['discoveryPort', '47700'],
		['controlPort', '47701'],
		['mediaPort', '47702'],
		['codec', 'hevc'],
		['fps', '120'],
		['maxBitrateKbps', '100000'],
	];
	let out = '';
	rows.forEach(([k = '', v = ''], i) => {
		const y = 40 + i * 50;
		const ember = i === 3;
		out += text(k, 0, y, mono(14, '#B6B8BE'));
		out += text(v, 320, y, {
			...mono(14, ember ? '#FF7A1F' : '#F2EFEA', ember ? 600 : 500),
			anchor: 'end',
		});
		const from = k.length * 14 * 0.7 + 10;
		const to = 320 - v.length * 14 * 0.7 - 10;
		out += `<path d="M${from} ${y - 1} H${to}" stroke="#F2EFEA1F" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>`;
	});
	return out;
}

/** Four fields that are sent (ticked), seven that never are (struck through). */
function ledger(): string {
	const sent = ['os', 'arch', 'appVersion', 'codec'];
	const never = ['ip address', 'host name', 'screen', 'audio', 'input', 'clipboard', 'pairing PIN'];
	let out = '';
	[...sent, ...never].forEach((f, i) => {
		const y = 22 + i * 28.6;
		const isSent = i < sent.length;
		if (isSent) {
			out += `<rect x="0" y="${y - 12}" width="2" height="16" rx="1" fill="#4CD69B"/>`;
			out += text(f, 16, y, mono(14, '#F2EFEA', 500));
		} else {
			out += text(f, 16, y, mono(14, '#6E7480'));
			const w = f.length * 14 * 0.7;
			out += `<path d="M14 ${y - 5} H${18 + w}" stroke="#FF5A5A" stroke-width="1.25"/>`;
		}
	});
	return out;
}

/** Three UDP port chips; the last one blocked. */
function ports(): string {
	let out = '';
	['47700', '47701', '47702'].forEach((port, i) => {
		const y = 40 + i * 92;
		const blocked = i === 2;
		out += `<path d="M0 ${y + 28} H112" stroke="${blocked ? '#FF5A5A' : '#6E7480'}" stroke-width="1.5" stroke-dasharray="${blocked ? '4 4' : '0'}"/>`;
		out += `<path d="M106 ${y + 22} L113 ${y + 28} L106 ${y + 34}" fill="none" stroke="${blocked ? '#FF5A5A' : '#6E7480'}" stroke-width="1.5"/>`;
		out += text('UDP', 0, y + 18, mono(11, '#8C919B', 500));
		out += `<rect x="128.75" y="${y + 0.75}" width="190.5" height="54.5" rx="8" fill="#14161A" stroke="${blocked ? '#FF5A5A' : '#242833'}" stroke-width="1.5"/>`;
		out += text(port, 152, y + 36, mono(22, blocked ? '#FF5A5A' : '#F2EFEA', 600));
		if (blocked) {
			out += `<path d="M280 ${y + 18} L298 ${y + 36} M298 ${y + 18} L280 ${y + 36}" stroke="#FF5A5A" stroke-width="1.5" stroke-linecap="round"/>`;
		}
	});
	return out;
}

/** Three platform chips in the tones /download gives each platform. */
function platforms(): string {
	const list = [
		{ name: 'macOS', sub: '14.0+ · DMG', tone: '#C9D9FF' },
		{ name: 'Windows', sub: '10 · 11 · x64', tone: '#FF8912' },
		{ name: 'Linux', sub: 'CLI preview', tone: '#4CD69B' },
	];
	let out = '';
	list.forEach((p, i) => {
		const y = 20 + i * 100;
		out += `<rect x="0.75" y="${y + 0.75}" width="318.5" height="78.5" rx="8" fill="#14161A" stroke="#242833" stroke-width="1.5"/>`;
		out += `<rect x="0" y="${y}" width="3" height="80" rx="1.5" fill="${p.tone}"/>`;
		out += text(p.name, 24, y + 36, mono(20, '#F2EFEA', 600));
		out += text(p.sub, 24, y + 60, mono(13, p.tone, 500));
	});
	return out;
}

export const MARKS = {
	index: contents,
	architecture: pipeline,
	protocol: wire,
	benchmarks: bars,
	configuration: ladder,
	privacy: ledger,
	troubleshooting: ports,
	download: platforms,
} as const;
