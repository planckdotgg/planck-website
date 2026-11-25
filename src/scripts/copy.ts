// Any button with [data-copy] copies text: either its own attribute value, or the text of the
// element whose id is in [data-copy-target].
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
	const label = button.querySelector<HTMLElement>('[data-copy-label]');
	const original = label?.textContent ?? '';
	let timer: number | undefined;
	button.addEventListener('click', async () => {
		const targetId = button.dataset.copyTarget;
		const text = targetId
			? (document.getElementById(targetId)?.textContent ?? '')
			: (button.dataset.copy ?? '');
		try {
			await navigator.clipboard.writeText(text.trim());
			button.dataset.copied = '';
			if (label) label.textContent = 'Copied';
		} catch {
			if (label) label.textContent = 'Select & copy';
		}
		clearTimeout(timer);
		timer = window.setTimeout(() => {
			delete button.dataset.copied;
			if (label) label.textContent = original;
		}, 1600);
	});
}
