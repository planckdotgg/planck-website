/**
 * Wires a role="tablist": click or ←/→/Home/End selects a tab, shows its panel (aria-controls),
 * and calls `onSelect`. Panels are swapped with `hidden` unless `keepPanels` is set, in which
 * case the caller shows the change (for example in a fixed-size readout).
 */
export function tablist(
	list: Element | null,
	onSelect?: (tab: HTMLElement, index: number) => void,
	keepPanels = false,
) {
	if (!list) return;
	const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
	const select = (index: number, focus: boolean) => {
		tabs.forEach((tab, i) => {
			const on = i === index;
			tab.setAttribute('aria-selected', String(on));
			tab.tabIndex = on ? 0 : -1;
			const panelId = tab.getAttribute('aria-controls');
			const panel = panelId ? document.getElementById(panelId) : null;
			if (panel && !keepPanels) panel.hidden = !on;
		});
		const tab = tabs[index];
		if (!tab) return;
		if (focus) tab.focus();
		onSelect?.(tab, index);
	};
	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => select(i, false));
		tab.addEventListener('keydown', (e) => {
			const n = tabs.length;
			const moves: Record<string, number> = {
				ArrowRight: (i + 1) % n,
				ArrowLeft: (i - 1 + n) % n,
				Home: 0,
				End: n - 1,
			};
			const next = moves[e.key];
			if (next === undefined) return;
			e.preventDefault();
			select(next, true);
		});
	});
}
