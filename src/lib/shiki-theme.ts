import type { ThemeRegistration } from 'shiki';

/** Build-time syntax colours, mapped to Planck tokens: blackbody ramp and signal colours only.
    Unmapped scopes fall back to --text. */
export const planckShiki: ThemeRegistration = {
	name: 'planck',
	type: 'dark',
	colors: { 'editor.background': '#0b0c0f', 'editor.foreground': '#f2efea' },
	tokenColors: [
		{ settings: { foreground: '#f2efea', background: '#0b0c0f' } },
		{ scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#8c919b' } },
		{
			scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
			settings: { foreground: '#ffb27a' },
		},
		{
			scope: ['string', 'punctuation.definition.string', 'string.unquoted'],
			settings: { foreground: '#ffb46b' },
		},
		{
			scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
			settings: { foreground: '#4cd69b' },
		},
		{
			scope: [
				'entity.name.function',
				'support.function',
				'meta.function-call.generic',
				'entity.name.command',
			],
			settings: { foreground: '#c9d9ff' },
		},
		{
			scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
			settings: { foreground: '#ffd1a3' },
		},
		{ scope: ['punctuation', 'keyword.operator'], settings: { foreground: '#8c919b' } },
		{
			scope: [
				'variable',
				'variable.other',
				'variable.parameter',
				'meta.object-literal.key',
				'support.type.property-name',
				'variable.other.normal.shell',
			],
			settings: { foreground: '#d4d6dc' },
		},
		{ scope: ['invalid', 'markup.deleted'], settings: { foreground: '#ff5a5a' } },
	],
};
