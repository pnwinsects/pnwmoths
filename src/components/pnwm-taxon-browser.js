import { LitElement, html } from 'lit';

const STATE_NAMES = {
  BC: 'British Columbia',
  ID: 'Idaho',
  MT: 'Montana',
  OR: 'Oregon',
  WA: 'Washington',
};

const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';

/**
 * Transform flat [{species_slug, state}] array from species-states.json
 * into an object mapping species_slug → Set<state>.
 */
export function buildStateMap(rows) {
  const map = {};
  for (const { species_slug, state } of rows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug].add(state);
  }
  return map;
}

/**
 * Returns true if any slug in `slugs` has `selectedState` in stateMap,
 * or if selectedState is empty string (no filter active).
 */
export function taxonHasState(slugs, stateMap, selectedState) {
  if (!selectedState) return true;
  return slugs.some(slug => stateMap[slug]?.has(selectedState));
}

/**
 * Recursively collect all species slugs from any taxon tree node.
 * Handles family ({subfamilies:[]}), subfamily ({genera:[]}), genus ({species:[]}).
 */
export function collectSlugs(node) {
  if (node.species) return node.species.map(s => s.slug);
  const children = node.subfamilies || node.genera || [];
  const slugs = [];
  for (const child of children) slugs.push(...collectSlugs(child));
  return slugs;
}

class PnwmTaxonBrowser extends LitElement {
  static get properties() {
    return {
      'path-prefix':        { type: String },
      _families:            { attribute: false, state: true },
      _stateMap:            { attribute: false, state: true },
      _statesAvailable:     { attribute: false, state: true },
      _selectedState:       { type: String,  state: true },
      _showImages:          { type: Boolean, state: true },
      _expandedFamilies:    { attribute: false, state: true },
      _expandedSubfamilies: { attribute: false, state: true },
      _expandedGenera:      { attribute: false, state: true },
    };
  }

  get _prefix() { return this['path-prefix'] || '/'; }

  /** Light DOM — Pico CSS must reach selects, headings, links inside this component (D-09) */
  createRenderRoot() { return this; }

  constructor() {
    super();
    this._families = [];
    this._stateMap = {};
    this._statesAvailable = [];
    this._selectedState = '';
    this._showImages = true;
    this._expandedFamilies = new Set();
    this._expandedSubfamilies = new Set();
    this._expandedGenera = new Set();
  }

  async connectedCallback() {
    super.connectedCallback();
    // Sync: read taxonomy JSON embedded by index.njk (D-10)
    const scriptEl = document.getElementById('taxon-data');
    if (scriptEl) this._families = JSON.parse(scriptEl.textContent);
    // Async: fetch state filter data (D-11)
    try {
      const res = await fetch(`${this._prefix}species-states.json`);
      const rows = await res.json();
      this._stateMap = buildStateMap(rows);
      this._statesAvailable = [...new Set(rows.map(r => r.state))].sort();
    } catch (_e) {
      // Leave stateMap empty on error — select stays disabled (graceful degradation)
    }
  }

  // --- Toggle handlers ---

  _onToggleImages(e) {
    this._showImages = e.target.checked;
  }

  _onStateChange(e) {
    this._selectedState = e.target.value;
  }

  // --- Expand/collapse handlers ---
  // CRITICAL: Use new Set (not .add()) — Lit detects change by object identity (Pitfall 6)

  _toggleFamily(name) {
    if (this._expandedFamilies.has(name)) {
      this._expandedFamilies = new Set([...this._expandedFamilies].filter(n => n !== name));
    } else {
      this._expandedFamilies = new Set([...this._expandedFamilies, name]);
    }
  }

  _toggleSubfamily(key) {
    if (this._expandedSubfamilies.has(key)) {
      this._expandedSubfamilies = new Set([...this._expandedSubfamilies].filter(k => k !== key));
    } else {
      this._expandedSubfamilies = new Set([...this._expandedSubfamilies, key]);
    }
  }

  _toggleGenus(slug) {
    if (this._expandedGenera.has(slug)) {
      this._expandedGenera = new Set([...this._expandedGenera].filter(s => s !== slug));
    } else {
      this._expandedGenera = new Set([...this._expandedGenera, slug]);
    }
  }

  // --- Image strip renderer ---
  // D-01: inline-flex row, overflow-x:auto, no wrapping
  // D-02: fixed height 93px, width auto
  // D-03: object-fit:cover
  // Image path: /images/{img.species_slug}/{img.filename} (verified from species.njk)
  // onImageClick: optional (speciesSlug) => void — wraps each image in a button

  _renderImageStrip(navImages, onImageClick = null) {
    if (!this._showImages || !navImages?.length) return html``;
    return html`
      <div style="display:inline-flex;flex-direction:row;gap:4px;overflow-x:auto">
        ${navImages.map(img => {
          const imgEl = html`<img
            src="${CDN_BASE_URL}/${img.species_slug}/${encodeURIComponent(img.filename)}?height=186"
            alt=""
            loading="lazy"
            style="height:93px;width:auto;object-fit:cover;flex-shrink:0;display:block"
          >`;
          if (onImageClick) {
            return html`<button
              type="button"
              style="padding:0;border:none;background:none;cursor:pointer;display:inline-flex"
              @click=${() => onImageClick(img.species_slug)}
            >${imgEl}</button>`;
          }
          return imgEl;
        })}
      </div>`;
  }

  // --- Expand tree to a species' genus ---

  _expandToSpecies(speciesSlug) {
    for (const family of this._families) {
      for (const subfam of family.subfamilies) {
        for (const genus of subfam.genera) {
          if (!genus.species.some(sp => sp.slug === speciesSlug)) continue;
          this._expandedFamilies = new Set([...this._expandedFamilies, family.name]);
          if (subfam.name) {
            const subfamKey = `${family.name}__${subfam.name}`;
            this._expandedSubfamilies = new Set([...this._expandedSubfamilies, subfamKey]);
            this._expandedGenera = new Set([...this._expandedGenera, `${subfamKey}__${genus.genus_slug}`]);
          } else {
            this._expandedGenera = new Set([...this._expandedGenera, `${family.name}__${genus.genus_slug}`]);
          }
          return;
        }
      }
    }
  }

  // --- Muting helper ---
  // D-06: opacity:0.35 on taxa with no records in selected state; never display:none

  _mutedStyle(slugs) {
    if (!this._selectedState) return '';
    return taxonHasState(slugs, this._stateMap, this._selectedState)
      ? ''
      : 'opacity:0.35';
  }

  // --- Level renderers ---

  _renderSpecies(species, genusName) {
    return html`
      <div class="pnwm-tb-species-grid">
        ${species.map(sp => html`
          <a class="pnwm-tb-species-card" href="${this._prefix}species/${sp.slug}/">
            ${sp.navImage ? html`<img
              src="${CDN_BASE_URL}/${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}?height=186"
              alt="${genusName} ${sp.name}"
              loading="lazy"
            >` : ''}
            <div class="pnwm-tb-species-label">
              <em>${genusName} ${sp.name}</em>${sp.common_name ? html` — ${sp.common_name}` : ''}
            </div>
          </a>
        `)}
      </div>`;
  }

  _renderGenus(genus, familyKey) {
    const key = `${familyKey}__${genus.genus_slug}`;
    const expanded = this._expandedGenera.has(key);
    const slugs = genus.species.map(s => s.slug);
    return html`
      <div class="pnwm-tb-genus-row" style="${this._mutedStyle(slugs)}">
        <h4>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleGenus(key)}
          >${genus.name}</button>
        </h4>
        ${!expanded ? this._renderImageStrip(genus.navImages) : ''}
        ${expanded ? this._renderSpecies(genus.species, genus.name) : ''}
      </div>`;
  }

  _renderSubfamily(subfam, familyName) {
    // subfam.name === null means no real subfamily — render genera directly (Pitfall 2)
    const key = `${familyName}__${subfam.name ?? '__none__'}`;
    const expanded = this._expandedSubfamilies.has(key);
    const slugs = collectSlugs(subfam);

    if (!subfam.name) {
      // No-subfamily case: flatten genera directly under family (no h3, no expand button)
      return html`
        ${subfam.genera.map(g => this._renderGenus(g, familyName))}`;
    }

    return html`
      <div class="pnwm-tb-subfamily-row" style="${this._mutedStyle(slugs)}">
        <h3>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleSubfamily(key)}
          >${subfam.name}</button>
        </h3>
        ${!expanded ? this._renderImageStrip(subfam.navImages, (slug) => this._expandToSpecies(slug)) : ''}
        <div ?hidden=${!expanded}>
          ${subfam.genera.map(g => this._renderGenus(g, key))}
        </div>
      </div>`;
  }

  _renderFamily(family) {
    const expanded = this._expandedFamilies.has(family.name);
    const slugs = collectSlugs(family);
    return html`
      <div class="pnwm-tb-family-row" style="${this._mutedStyle(slugs)}">
        <h2>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleFamily(family.name)}
          >${family.name}</button>
        </h2>
        ${!expanded ? this._renderImageStrip(family.navImages, (slug) => this._expandToSpecies(slug)) : ''}
        <div ?hidden=${!expanded}>
          ${family.subfamilies.map(s => this._renderSubfamily(s, family.name))}
        </div>
      </div>`;
  }

  render() {
    return html`
      <style>
        .pnwm-tb-species-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 600px) {
          .pnwm-tb-species-grid { grid-template-columns: 1fr 1fr; }
        }
        .pnwm-tb-species-card { display: block; text-decoration: none; }
        .pnwm-tb-species-card img {
          width: 100%;
          aspect-ratio: 376 / 249;
          object-fit: cover;
          display: block;
        }
        .pnwm-tb-species-label { padding: 0.25rem 0; }
      </style>
      <div class="pnwm-tb-toolbar" style="display:flex;gap:1.5rem;align-items:baseline;padding:8px 16px;flex-wrap:wrap">
        <label>
          <input
            type="checkbox"
            ?checked=${this._showImages}
            @change=${this._onToggleImages}
          >
          Show images
        </label>
        <div style="display:flex;align-items:baseline;gap:0.5em">
          <label for="pnwm-tb-state-filter">Filter by state</label>
          <select
            id="pnwm-tb-state-filter"
            style="width:auto"
            .value=${this._selectedState}
            ?disabled=${!this._statesAvailable.length}
            @change=${this._onStateChange}
          >
            <option value="">All states</option>
            ${this._statesAvailable.map(s =>
              html`<option value=${s} ?selected=${this._selectedState === s}>${STATE_NAMES[s] || s}</option>`
            )}
          </select>
        </div>
      </div>
      ${this._families.map(f => this._renderFamily(f))}`;
  }
}

customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
