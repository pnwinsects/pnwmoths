import { LitElement, html, css } from 'lit';

export class PnwmImageSlideshow extends LitElement {
  static properties = {
    slug: { type: String },
    _currentIndex: { state: true },
    _lightboxOpen: { state: true },
    _images: { attribute: false, state: true },
    _stripOverflows: { state: true },
    highResAvailable: { type: Boolean, attribute: 'high-res-available' },
    highResSpecimens: { attribute: 'high-res-specimens' },
    cdnBaseUrl: { type: String, attribute: 'cdn-base-url' },
    prefixUrl: { type: String, attribute: 'prefix-url' },
    _highResSpecimens: { state: true },
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
    .controls button[hidden] { display: none; }
    .thumbnail-strip {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scroll-behavior: smooth;
      scrollbar-width: none;
      margin-top: 8px;
    }
    .thumbnail-strip::-webkit-scrollbar { display: none; }
    .thumbnail {
      flex-shrink: 0;
      height: 93px;
      width: auto;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      background: none;
    }
    .thumbnail[aria-selected="true"] {
      border-color: var(--pico-primary);
    }
    .thumbnail img {
      height: 93px;
      width: auto;
      display: block;
    }
    .caption-line { margin: 2px 0; font-size: 0.8rem; color: var(--pico-muted-color); text-align: center; }
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9000;
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
    this._stripOverflows = false;
    this._resizeObserver = null;
    this._inertedElements = [];
    this._osdViewer = null;
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

    if (this.getAttribute('high-res-specimens')) {
      try {
        this._highResSpecimens = JSON.parse(this.getAttribute('high-res-specimens'));
      } catch (e) {
        console.error('[pnwmoths] Failed to parse high-res-specimens attribute', e);
        this._highResSpecimens = [];
      }
    }

    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeydown);
    this._resizeObserver?.disconnect();
    this._inertedElements.forEach(el => el.removeAttribute('inert'));
    this._inertedElements = [];
  }

  firstUpdated() {
    const strip = this.shadowRoot.querySelector('.thumbnail-strip');
    if (!strip) return;
    this._resizeObserver = new ResizeObserver(() => {
      const overflows = strip.scrollWidth > strip.clientWidth;
      if (overflows !== this._stripOverflows) {
        this._stripOverflows = overflows;
      }
    });
    this._resizeObserver.observe(strip);
  }

  updated(changedProperties) {
    if (changedProperties.has('_currentIndex')) {
      const activeThumb = this.shadowRoot.querySelector('.thumbnail[aria-selected="true"]');
      activeThumb?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && this._lightboxOpen) {
      this._closeLightbox();
    }
  }

  _openLightbox() {
    this._lightboxOpen = true;
    // Inert all siblings up the ancestor chain (not the host itself) so keyboard
    // focus is trapped in the lightbox without inerting our own shadow DOM.
    let node = this;
    while (node.parentElement && node.parentElement.tagName !== 'BODY') {
      Array.from(node.parentElement.children).forEach(sibling => {
        if (sibling !== node && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '');
          this._inertedElements.push(sibling);
        }
      });
      node = node.parentElement;
    }
    this.updateComplete.then(() => {
      const closeBtn = this.shadowRoot.querySelector('.lightbox-close');
      if (closeBtn) closeBtn.focus();
    });
  }

  _closeLightbox() {
    this._lightboxOpen = false;
    this._inertedElements.forEach(el => el.removeAttribute('inert'));
    this._inertedElements = [];
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

  _buildDziUrl(specimen) {
    return `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi`;
  }

  _scrollLeft() {
    const strip = this.shadowRoot.querySelector('.thumbnail-strip');
    strip?.scrollBy({ left: -(strip.clientWidth / 2), behavior: 'smooth' });
  }

  _scrollRight() {
    const strip = this.shadowRoot.querySelector('.thumbnail-strip');
    strip?.scrollBy({ left: strip.clientWidth / 2, behavior: 'smooth' });
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
              @click=${() => this._openLightbox()}
              @error=${(e) => console.error(`[pnwmoths] Image failed to load: ${e.target.src}`)}
            >
            ${this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
          </div>
        </div>
        ${lightbox}
      `;
    }

    // Multiple images — thumbnail strip with scroll controls
    return html`
      <div role="region" aria-label="Species photos" class="slideshow">
        <div class="slide">
          <img
            src=${current.src}
            alt=${current.alt}
            @click=${() => this._openLightbox()}
            @error=${(e) => console.error(`[pnwmoths] Image failed to load: ${e.target.src}`)}
          >
          ${this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
        </div>
        <div class="thumbnail-strip" role="tablist" aria-label="Photo thumbnails">
          ${this._images.map((img, i) => html`
            <button
              class="thumbnail"
              role="tab"
              aria-selected=${i === this._currentIndex ? 'true' : 'false'}
              aria-label=${`Photo ${i + 1} of ${this._images.length}: ${img.alt}`}
              @click=${() => { this._currentIndex = i; }}
            ><img src=${img.src} alt="" height="93"></button>
          `)}
        </div>
        <div class="controls">
          <button
            aria-label="Scroll thumbnails left"
            ?hidden=${!this._stripOverflows}
            @click=${() => this._scrollLeft()}
          >&#x2039;</button>
          <button
            aria-label="Scroll thumbnails right"
            ?hidden=${!this._stripOverflows}
            @click=${() => this._scrollRight()}
          >&#x203a;</button>
        </div>
      </div>
      ${lightbox}
    `;
  }
}

customElements.define('pnwm-image-slideshow', PnwmImageSlideshow);
