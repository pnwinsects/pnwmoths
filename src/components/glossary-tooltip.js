/**
 * Glossary term tooltip — shows definition + image on hover/focus.
 *
 * Reads data-definition and data-image-url from <abbr class="glossary-term">
 * elements inserted by the build-time glossary transform.
 *
 * Removes the `title` attribute at runtime (replaced by aria-label) to prevent
 * the browser's native tooltip from appearing alongside the custom one.
 */

const tooltip = document.createElement('div');
tooltip.id = 'glossary-tooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.setAttribute('aria-hidden', 'true');
tooltip.innerHTML = '<img class="gt-img" alt=""><p class="gt-def"></p>';
document.body.appendChild(tooltip);

const gtImg = tooltip.querySelector('.gt-img');
const gtDef = tooltip.querySelector('.gt-def');
let hideTimer;

for (const abbr of document.querySelectorAll('abbr.glossary-term')) {
  // Move title → aria-label so the browser's native tooltip doesn't conflict
  const title = abbr.getAttribute('title');
  if (title) {
    abbr.setAttribute('aria-label', title);
    abbr.removeAttribute('title');
  }

  abbr.addEventListener('mouseenter', (e) => {
    clearTimeout(hideTimer);
    show(abbr, e.clientX, e.clientY);
  });
  abbr.addEventListener('mousemove', (e) => {
    position(e.clientX, e.clientY);
  });
  abbr.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(hide, 80);
  });

  // Keyboard focus support
  abbr.addEventListener('focus', (e) => {
    clearTimeout(hideTimer);
    const r = abbr.getBoundingClientRect();
    show(abbr, r.left, r.bottom);
  });
  abbr.addEventListener('blur', () => {
    hideTimer = setTimeout(hide, 80);
  });
}

function show(abbr, x, y) {
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

  tooltip.style.display = 'block';
  tooltip.removeAttribute('aria-hidden');
  position(x, y);
}

function hide() {
  tooltip.style.display = 'none';
  tooltip.setAttribute('aria-hidden', 'true');
}

function position(x, y) {
  const pad = 12;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + pad;
  let top = y + pad;

  if (left + tw > vw - pad) left = Math.max(pad, x - tw - pad);
  if (top + th > vh - pad) top = Math.max(pad, y - th - pad);

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}
