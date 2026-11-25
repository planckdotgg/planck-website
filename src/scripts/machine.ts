// "Check this machine" on /download. Everything runs in the browser: the OS comes from
// navigator.userAgentData (or navigator.platform), the GPU name from a throwaway WebGL context.
// Nothing is sent over the network.

export type Platform = 'windows' | 'macos';

export interface MachineCheck {
	platform: Platform | undefined;
	os: string;
	gpu: string;
	encoder: string;
	verdict: string;
}

interface UADataLike {
	platform: string;
	getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>;
}

async function readOs(): Promise<{ platform: Platform | undefined; os: string }> {
	const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
	let name = uaData?.platform || navigator.platform || '';
	let arch = '';
	if (uaData?.getHighEntropyValues) {
		try {
			const hints = await uaData.getHighEntropyValues(['architecture', 'bitness']);
			if (hints.architecture)
				arch = hints.architecture === 'arm' ? 'arm64' : `${hints.architecture}`;
			if (arch === 'x86' && hints.bitness === '64') arch = 'x64';
		} catch {
			// The browser declined the high-entropy hints; the OS name alone is enough.
		}
	}
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(name) && navigator.maxTouchPoints > 1)) {
		return { platform: undefined, os: 'iOS / iPadOS' };
	}
	if (/Android/i.test(ua)) return { platform: undefined, os: 'Android' };
	if (/^Win/i.test(name) || /Windows/i.test(ua)) {
		name = 'Windows';
		return { platform: 'windows', os: arch ? `${name} · ${arch}` : name };
	}
	if (/Mac/i.test(name)) {
		name = 'macOS';
		return { platform: 'macos', os: arch ? `${name} · ${arch}` : name };
	}
	if (/Linux|CrOS/i.test(name) || /Linux|CrOS/i.test(ua)) {
		return { platform: undefined, os: /CrOS/.test(ua) ? 'ChromeOS' : 'Linux' };
	}
	return { platform: undefined, os: name || 'Unknown' };
}

function readGpu(): string {
	try {
		const canvas = document.createElement('canvas');
		const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
			| WebGLRenderingContext
			| WebGL2RenderingContext
			| null;
		if (!gl) return 'WebGL is off in this browser';
		const info = gl.getExtension('WEBGL_debug_renderer_info');
		const renderer = info
			? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
			: gl.getParameter(gl.RENDERER);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return String(renderer || 'Not reported');
	} catch {
		return 'Not reported';
	}
}

/**
 * Strips the ANGLE wrapper: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 (0x00002704) Direct3D11
 * vs_5_0 ps_5_0, D3D11)" becomes "NVIDIA GeForce RTX 4080".
 */
export function tidyGpu(renderer: string): string {
	const inner = /^ANGLE \((.*)\)$/.exec(renderer)?.[1];
	if (!inner) return renderer;
	const device = inner.split(', ')[1] ?? inner;
	return device
		.replace(/^ANGLE Metal Renderer:\s*/, '')
		.replace(/\s*\(0x[0-9a-f]+\)/i, '')
		.replace(/\s+(Direct3D|OpenGL|vs_).*$/, '')
		.trim();
}

function encoderFor(gpu: string, platform: Platform | undefined): string {
	if (platform === 'macos') return 'VideoToolbox · HEVC Main / Main10 4:2:0';
	if (/nvidia|geforce|rtx|gtx|quadro/i.test(gpu)) return 'NVENC · H.264, HEVC 10-bit & 4:4:4, AV1';
	if (/amd|radeon/i.test(gpu)) return 'AMF · H.264, HEVC 10-bit';
	if (/intel|iris|uhd/i.test(gpu)) return 'oneVPL · H.264, HEVC 10-bit & 4:4:4';
	if (platform === 'windows') return 'Picked at host start from the GPU found';
	return 'Not applicable';
}

export async function checkMachine(): Promise<MachineCheck> {
	const { platform, os } = await readOs();
	const gpu = tidyGpu(readGpu());
	const encoder = encoderFor(gpu, platform);
	let verdict: string;
	if (platform === 'windows')
		verdict = 'Planck runs here as host and client. Use the Windows build.';
	else if (platform === 'macos')
		verdict = 'Planck runs here as host and client. Use the macOS build.';
	else
		verdict = `${os} is not supported yet. Planck needs Windows or macOS for now; see the roadmap.`;
	return { platform, os, gpu, encoder, verdict };
}
