// Any button with [data-copy] copies text: either its own attribute value, or the text of the
// element whose id is in [data-copy-target].
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
	button.hidden = false;
	const label = button.querySelector<HTMLElement>('[data-copy-label]');
	const original = label?.textContent ?? '';
	const name = button.getAttribute('aria-label');
	const suffix = name?.startsWith(original) ? name.slice(original.length) : null;
	const show = (text: string) => {
		if (label) label.textContent = text;
		if (suffix !== null) button.setAttribute('aria-label', text + suffix);
	};
	let timer: number | undefined;
	button.addEventListener('click', async () => {
		const targetId = button.dataset.copyTarget;
		const text = targetId
			? (document.getElementById(targetId)?.textContent ?? '')
			: (button.dataset.copy ?? '');
		try {
			await navigator.clipboard.writeText(text.trim());
			button.dataset.copied = '';
			show('Copied');
		} catch {
			show('Select & copy');
		}
		clearTimeout(timer);
		timer = window.setTimeout(() => {
			delete button.dataset.copied;
			show(original);
		}, 1600);
	});
}
