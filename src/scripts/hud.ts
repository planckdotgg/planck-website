/**
 * An illustrative HUD pill that hides to a 3 px ember hair after `idleMs` with no activity.
 * Hovering near the top edge, focus, a tap, or Ctrl+Alt+H brings it back; clicking the pill
 * pins it. The root gets `data-hud-hidden` while hidden; CSS does the rest.
 */
export function autoHideHud(
	root: HTMLElement,
	area: HTMLElement,
	pill: HTMLButtonElement,
	idleMs: number,
): { show: () => void } {
	const state = pill.querySelector<HTMLElement>('[data-hud-pin-state]');
	let pinned = false;
	let timer: number | undefined;
	const hide = () => {
		if (!pinned && !area.matches(':focus-within')) root.dataset.hudHidden = '';
	};
	const show = () => {
		delete root.dataset.hudHidden;
		clearTimeout(timer);
		timer = window.setTimeout(hide, idleMs);
	};
	const setPinned = (on: boolean) => {
		pinned = on;
		pill.setAttribute('aria-pressed', String(on));
		pill.title = on ? 'Unpin the HUD' : 'Pin the HUD';
		if (state) state.textContent = on ? 'Pinned.' : 'Click to pin.';
		show();
	};
	area.addEventListener('pointermove', (e) => {
		const rect = area.getBoundingClientRect();
		if (e.pointerType !== 'mouse' || e.clientY - rect.top < rect.height * 0.28) show();
	});
	area.addEventListener('pointerdown', show);
	area.addEventListener('focusin', show);
	area.addEventListener('focusout', (e) => {
		if (!pinned && !area.contains(e.relatedTarget as Node | null)) show();
	});
	pill.addEventListener('click', () => setPinned(!pinned));
	document.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.altKey && e.code === 'KeyH') {
			e.preventDefault();
			setPinned(!pinned);
		}
	});
	show();
	return { show };
}
