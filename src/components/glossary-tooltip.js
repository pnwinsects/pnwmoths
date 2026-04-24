/**
 * Glossary term tooltip -- shows definition + image on hover/focus.
 *
 * Reads data-definition and data-image-url from <abbr class="glossary-term">
 * elements inserted by the build-time glossary transform.
 *
 * Removes the `title` attribute at runtime (replaced by aria-label) to prevent
 * the browser's native tooltip from appearing alongside the custom one.
 */

const terms = document.querySelectorAll('abbr.glossary-term');
let hideTimer;

terms.forEach((abbr, index) => {
  // Create per-term popover element
  const popover = document.createElement('div');
  popover.id = `gt-popover-${index}`;
  popover.className = 'glossary-popover';
  popover.setAttribute('popover', 'auto');
  popover.setAttribute('role', 'tooltip');
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML = '<img class="gt-img" alt=""><p class="gt-def"></p>';
  document.body.appendChild(popover);

  const gtImg = popover.querySelector('.gt-img');
  const gtDef = popover.querySelector('.gt-def');

  // Move title -> aria-label (D-09)
  const title = abbr.getAttribute('title');
  if (title) {
    abbr.setAttribute('aria-label', title);
    abbr.removeAttribute('title');
  }
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

  function show() {
    const imageUrl = abbr.dataset.imageUrl;
    const definition = abbr.dataset.definition;

    gtDef.textContent = definition || '';

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

    popover.showPopover();
    popover.removeAttribute('aria-hidden');

    // Viewport edge clamp
    const popoverWidth = popover.offsetWidth;
    const viewportWidth = window.innerWidth;
    if (left + popoverWidth > viewportWidth - 8) {
      left = viewportWidth - popoverWidth - 8;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function hide() {
    try { popover.hidePopover(); } catch (_) { /* already hidden */ }
    popover.setAttribute('aria-hidden', 'true');
  }
});
