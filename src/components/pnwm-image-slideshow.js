import { LitElement, html, css } from 'lit';

class PnwmImageSlideshow extends LitElement {
  static properties = {
    slug: { type: String },
    _currentIndex: { state: true },
    _lightboxOpen: { state: true },
    _images: { attribute: false, state: true },
  };

  static styles = css`
    :host { display: block; }
    .slideshow { position: relative; }
    .slide { text-align: center; }
    .slide img { max-width: 100%; height: auto; cursor: pointer; }
    .controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .controls button { min-width: 44px; min-height: 44px; }
    .dots { display: flex; gap: 4px; }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--pico-muted-color);
    }
    .dot.active { background: var(--pico-primary); }
    .index-label { font-size: 0.875rem; }
    .caption-line { margin: 2px 0; font-size: 0.8rem; color: var(--pico-muted-color); text-align: center; }
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
    }
    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 44px;
      height: 44px;
      background: transparent;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    }
  `;

  constructor() {
    super();
    this.slug = '';
    this._currentIndex = 0;
    this._lightboxOpen = false;
    this._images = [];
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();

    // Extract image data from light DOM figure children (only figures with an img)
    const figures = Array.from(this.querySelectorAll(':scope > figure'));
    this._images = figures.flatMap(fig => {
      const img = fig.querySelector('img');
      if (!img) return [];
      const figcaption = fig.querySelector('figcaption');
      return [{
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        photographer: figcaption ? figcaption.textContent.trim() : '',
        locality: img.dataset.locality || '',
        state: img.dataset.state || '',
        elevation: img.dataset.elevation || '',
        year: img.dataset.year || '',
        month: img.dataset.month || '',
        day: img.dataset.day || '',
        collector: img.dataset.collector || '',
        subspecies: img.dataset.subspecies || '',
      }];
    });

    // Hide static figures once JS component takes over
    if (this._images.length > 0) {
      figures.forEach(f => { f.style.display = 'none'; });
    }

    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeydown);
    // Restore inert state if component is removed while lightbox is open
    const main = document.querySelector('main');
    if (main) main.removeAttribute('inert');
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && this._lightboxOpen) {
      this._closeLightbox();
    }
  }

  _openLightbox() {
    this._lightboxOpen = true;
    const main = document.querySelector('main');
    if (main) main.setAttribute('inert', '');
    // Focus close button after render
    this.updateComplete.then(() => {
      const closeBtn = this.shadowRoot.querySelector('.lightbox-close');
      if (closeBtn) closeBtn.focus();
    });
  }

  _closeLightbox() {
    this._lightboxOpen = false;
    const main = document.querySelector('main');
    if (main) main.removeAttribute('inert');
  }

  _formatCaption(img) {
    const parts = [];
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const locationParts = [];
    if (img.locality) locationParts.push(img.locality);
    if (img.state) locationParts.push(img.state);
    if (img.elevation) locationParts.push(`${img.elevation} ft.`);
    if (locationParts.length) parts.push(locationParts.join(', '));

    if (img.year) {
      const month = img.month ? parseInt(img.month) : 0;
      const day = img.day ? parseInt(img.day) : 0;
      const dateParts = [img.year];
      if (month >= 1 && month <= 12) dateParts.unshift(MONTHS[month - 1]);
      if (day) dateParts.splice(1, 0, day);
      parts.push(dateParts.join(' '));
    }

    if (img.collector) parts.push(`Coll. ${img.collector}`);
    if (img.photographer) parts.push(`Photo © ${img.photographer}`);

    return parts;
  }

  _prev() {
    this._currentIndex = (this._currentIndex - 1 + this._images.length) % this._images.length;
  }

  _next() {
    this._currentIndex = (this._currentIndex + 1) % this._images.length;
  }

  render() {
    // No images parsed from light DOM — fall back to slotted content
    if (this._images.length === 0) {
      return html`<slot></slot>`;
    }

    const current = this._images[this._currentIndex];

    const lightbox = this._lightboxOpen
      ? html`
          <div class="lightbox" @click=${(e) => { if (e.target === e.currentTarget) this._closeLightbox(); }}>
            <img src=${current.src} alt=${current.alt}>
            <button
              class="lightbox-close"
              aria-label="Close lightbox"
              @click=${() => this._closeLightbox()}
            >&#x2715;</button>
          </div>
        `
      : '';

    // Single image — no controls
    if (this._images.length === 1) {
      return html`
        <div role="region" aria-label="Species photos" class="slideshow">
          <div class="slide">
            <img
              src=${current.src}
              alt=${current.alt}
              @click=${this._openLightbox}
              @error=${(e) => console.error(`[pnwmoths] Image failed to load: ${e.target.src}`)}
            >
            ${this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
          </div>
        </div>
        ${lightbox}
      `;
    }

    // Multiple images — prev/next controls and dots
    const dots = this._images.map((_, i) => html`
      <span class="dot ${i === this._currentIndex ? 'active' : ''}"></span>
    `);

    return html`
      <div role="region" aria-label="Species photos" class="slideshow">
        <div class="slide">
          <img
            src=${current.src}
            alt=${current.alt}
            @click=${this._openLightbox}
            @error=${(e) => console.error(`[pnwmoths] Image failed to load: ${e.target.src}`)}
          >
          ${this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
        </div>
        <div class="controls">
          <button
            aria-label="Previous photo"
            @click=${this._prev}
          >&#x2039;</button>
          <div class="dots">${dots}</div>
          <span class="index-label">${this._currentIndex + 1} of ${this._images.length}</span>
          <button
            aria-label="Next photo"
            @click=${this._next}
          >&#x203a;</button>
        </div>
      </div>
      ${lightbox}
    `;
  }
}

customElements.define('pnwm-image-slideshow', PnwmImageSlideshow);
