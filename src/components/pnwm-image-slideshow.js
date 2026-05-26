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
    .caption-line { margin: 2px 0; font-size: 0.875rem; color: var(--pico-muted-color); text-align: center; }
    .osd-viewer {
      width: 90vw;
      height: 70vh;
      min-height: 400px;
      background: #111;
    }
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
      z-index: 1;
    }
    .lightbox-prev, .lightbox-next {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 44px;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      color: #ffffff;
      font-size: 20px;
      cursor: pointer;
      z-index: 1;
    }
    .lightbox-prev { left: 16px; }
    .lightbox-next { right: 16px; }
    .lightbox-prev:hover, .lightbox-next:hover,
    .lightbox-prev:focus, .lightbox-next:focus {
      background: rgba(0, 0, 0, 0.7);
      outline: 2px solid var(--pico-primary);
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
        photographer: img.dataset.photographer || (figcaption ? figcaption.textContent.trim() : ''),
        license: img.dataset.license || '',
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
    } else if (e.key === 'ArrowLeft' && this._lightboxOpen) {
      if (this._highResSpecimens?.length > 1) this._prevSpecimen();
      else if (this._images.length > 1) this._currentIndex = (this._currentIndex - 1 + this._images.length) % this._images.length;
    } else if (e.key === 'ArrowRight' && this._lightboxOpen) {
      if (this._highResSpecimens?.length > 1) this._nextSpecimen();
      else if (this._images.length > 1) this._currentIndex = (this._currentIndex + 1) % this._images.length;
    }
  }

  async _openLightbox() {
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
    await this.updateComplete;
    const closeBtn = this.shadowRoot.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.focus();

    if (this.highResAvailable && this._highResSpecimens?.length) {
      const viewerEl = this.shadowRoot.querySelector('#osd-viewer');
      if (viewerEl && !this._osdViewer) {
        const { default: OpenSeadragon } = await import('openseadragon');
        const current = this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0];
        this._osdViewer = OpenSeadragon({
          element: viewerEl,
          prefixUrl: this.prefixUrl,
          tileSources: this._buildDziUrl(current),
          visibilityRatio: 1.0,
          minZoomLevel: 0.5,
          defaultZoomLevel: 0,
          showNavigator: false,
          showRotationControl: false,
        });
      }
    }
  }

  _closeLightbox() {
    this._osdViewer?.destroy();
    this._osdViewer = null;
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
    if (img.photographer) {
      const credit = img.license ? `Photo © ${img.photographer} · ${img.license}` : `Photo © ${img.photographer}`;
      parts.push(credit);
    }

    return parts;
  }

  _buildDziUrl(specimen) {
    return `${this.cdnBaseUrl}/${specimen.tiles_path}.dzi`;
  }

  _prevSpecimen() {
    this._currentIndex = (this._currentIndex - 1 + this._highResSpecimens.length) % this._highResSpecimens.length;
    this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
  }

  _nextSpecimen() {
    this._currentIndex = (this._currentIndex + 1) % this._highResSpecimens.length;
    this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
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

    const useOsd = this.highResAvailable && this._highResSpecimens?.length > 0;
    const currentSpecimen = useOsd
      ? (this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0])
      : null;

    const lightbox = this._lightboxOpen
      ? html`
          <div class="lightbox" @click=${(e) => { if (e.target === e.currentTarget) this._closeLightbox(); }}>
            ${useOsd
              ? html`
                  <div id="osd-viewer" class="osd-viewer"></div>
                  <p class="caption-line">
                    Specimen ${currentSpecimen.specimen_id} &middot;
                    ${currentSpecimen.view === 'D' ? 'Dorsal' : 'Ventral'}
                    ${current.photographer ? html` &middot; &copy; ${current.photographer}${current.license ? html` &middot; ${current.license}` : ''}` : ''}
                  </p>
                `
              : html`<img src=${current.src} alt=${current.alt}>`}
            ${useOsd && this._highResSpecimens.length > 1 ? html`
              <button class="lightbox-prev" aria-label="Previous specimen" @click=${() => this._prevSpecimen()}>&#x276E;</button>
              <button class="lightbox-next" aria-label="Next specimen" @click=${() => this._nextSpecimen()}>&#x276F;</button>
            ` : ''}
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
