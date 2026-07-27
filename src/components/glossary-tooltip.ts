/**
 * Glossary term tooltip -- shows definition + image on hover/focus.
 *
 * Reads data-definition and data-image-url from <abbr class="glossary-term">
 * elements inserted by the build-time glossary transform.
 *
 * Removes the `title` attribute at runtime to prevent the browser's native
 * tooltip from appearing alongside the custom one. The definition is exposed via
 * aria-describedby on the popover, NOT aria-label on the term: aria-label would
 * REPLACE the term's accessible name, so a screen reader reading the sentence
 * would say a 250-word definition where the word "thorax" belongs.
 */

const terms = document.querySelectorAll<HTMLElement>('abbr.glossary-term');

terms.forEach((abbr: HTMLElement, index: number) => {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  // Create per-term popover element
  const popover = document.createElement('div');
  popover.id = `gt-popover-${index}`;
  popover.className = 'glossary-popover';
  popover.setAttribute('popover', 'auto');
  popover.setAttribute('role', 'tooltip');
  // No aria-hidden toggling: the popover is the target of aria-describedby, and
  // marking it hidden while it is referenced is contradictory. Closed popovers are
  // already display:none, which keeps them out of the reading order on their own.
  popover.innerHTML = '<img class="gt-img" alt="" hidden><p class="gt-def"></p>';
  document.body.appendChild(popover);

  // Non-null assertions justified: elements are authored at build time via innerHTML above
  const gtImg = popover.querySelector<HTMLImageElement>('.gt-img')!;
  const gtDef = popover.querySelector<HTMLParagraphElement>('.gt-def')!;

  // Populate the definition up front rather than on first show(), so the
  // aria-describedby reference below resolves to real text from the outset.
  gtDef.textContent = abbr.dataset.definition ?? '';

  // Drop the native tooltip (it would duplicate the custom popover) and point at
  // the popover as the term's DESCRIPTION. The term keeps its own text as its
  // accessible name — see the note in the file header on why aria-label is wrong.
  abbr.removeAttribute('title');
  abbr.setAttribute('aria-describedby', popover.id);
  // Make keyboard-focusable (D-06)
  abbr.setAttribute('tabindex', '0');

  abbr.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    show();
  });
  abbr.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => hide(), 80);
  });
  abbr.addEventListener('focus', () => {
    clearTimeout(hideTimer);
    show();
  });
  abbr.addEventListener('blur', () => {
    hideTimer = setTimeout(() => hide(), 80);
  });

  function show(): void {
    const imageUrl = abbr.dataset.imageUrl;

    if (imageUrl) {
      gtImg.src = imageUrl;
      gtImg.hidden = false;
    } else {
      gtImg.src = '';
      gtImg.hidden = true;
    }

    // Position below the term (D-04, D-05)
    const rect = abbr.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    const top = rect.bottom + window.scrollY + 6;

    // Position off-screen before showing to prevent flash
    popover.style.left = '-9999px';
    popover.style.top = '-9999px';

    popover.showPopover();

    // Viewport edge clamp
    const popoverWidth = popover.offsetWidth;
    const viewportWidth = window.innerWidth;
    if (left + popoverWidth > viewportWidth - 8) {
      left = viewportWidth - popoverWidth - 8;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function hide(): void {
    try { popover.hidePopover(); } catch (_) { /* already hidden */ }
  }
});
