import { expect, test } from 'bun:test';
import { tidyGpu } from './machine.ts';

test('tidyGpu strips the ANGLE wrapper that Chromium reports', () => {
	expect(
		tidyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 (0x00002704) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
	).toBe('NVIDIA GeForce RTX 4080');
	expect(tidyGpu('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
		'AMD Radeon RX 6700 XT',
	);
	expect(tidyGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)')).toBe(
		'Apple M5 Pro',
	);
	expect(tidyGpu('Apple GPU')).toBe('Apple GPU');
});
