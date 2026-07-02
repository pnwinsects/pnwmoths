import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import { SpeciesStateSchema, type SpeciesState, type TaxonFamily, type TaxonSubfamily, type TaxonGenus, type NavImage } from '../types/index.ts';

const STATE_NAMES: Record<string, string> = {
  BC: 'British Columbia',
  ID: 'Idaho',
  MT: 'Montana',
  OR: 'Oregon',
  WA: 'Washington',
};

const CDN_BASE_URL = 'https://moths.pnwinsects.org';

/**
 * Discriminant error class for species-states.json schema validation failures.
 * Allows the connectedCallback catch block to distinguish schema errors (hard-fail)
 * from network/fetch errors (soft degradation, per resolved D-05 decision).
 */
export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Validate that rows is a well-formed species-states.json payload.
 * O(1): checks top-level is Array + probes a single representative element shape.
 * Anti-pattern: do NOT parse the full array with Zod — that is O(rows) (D-03). Probe rows[0] only.
 *
 * @param rows - the unknown value returned by res.json()
 * @throws SchemaValidationError on non-array top level or bad element shape
 */
export function validateSpeciesStates(rows: unknown): asserts rows is SpeciesState[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError('species-states.json: expected array at top level');
  }
  if (rows.length > 0) {
    const probe = SpeciesStateSchema.safeParse(rows[0]);
    if (!probe.success) {
      throw new SchemaValidationError(
        `species-states.json: element shape mismatch: ${probe.error.issues.map((i: { message: string }) => i.message).join('; ')}`
      );
    }
  }
}

/**
 * Transform flat [{species_slug, state}] array from species-states.json
 * into an object mapping species_slug → Set<state>.
 */
export function buildStateMap(rows: SpeciesState[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const { species_slug, state } of rows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug]!.add(state);
  }
  return map;
}

/**
 * Returns true if any slug in `slugs` has `selectedState` in stateMap,
 * or if selectedState is empty string (no filter active).
 */
export function taxonHasState(slugs: string[], stateMap: Record<string, Set<string>>, selectedState: string): boolean {
  if (!selectedState) return true;
  return slugs.some(slug => stateMap[slug]?.has(selectedState));
}

/**
 * Recursively collect all species slugs from any taxon tree node.
 * Handles family ({subfamilies:[]}), subfamily ({genera:[]}), genus ({species:[]}).
 */
export function collectSlugs(node: TaxonFamily | TaxonSubfamily | TaxonGenus): string[] {
  if ('species' in node) return node.species.map(s => s.slug);
  const children = ('subfamilies' in node ? node.subfamilies : null) || ('genera' in node ? node.genera : null) || [];
  const slugs: string[] = [];
  for (const child of children) slugs.push(...collectSlugs(child));
  return slugs;
}

class PnwmTaxonBrowser extends LitElement {
  static get properties(): PropertyDeclarations {
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

  _families: TaxonFamily[];
  _stateMap: Record<string, Set<string>>;
  _statesAvailable: string[];
  _selectedState: string;
  _showImages: boolean;
  _expandedFamilies: Set<string>;
  _expandedSubfamilies: Set<string>;
  _expandedGenera: Set<string>;

  get _prefix(): string { return (this as { 'path-prefix'?: string })['path-prefix'] || '/'; }

  /** Light DOM — Pico CSS must reach selects, headings, links inside this component (D-09) */
  createRenderRoot(): this { return this; }

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

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    // Sync: read taxonomy JSON embedded by index.njk (D-10)
    const scriptEl = document.getElementById('taxon-data');
    if (scriptEl) {
      this._families = JSON.parse(scriptEl.textContent ?? '[]') as TaxonFamily[];
      // The component renders async, so the browser's initial scroll to a
      // #family-<name> deep link (e.g. from the homepage intro) misses. After
      // the first render, expand the targeted family and scroll it into view.
      void this.updateComplete.then(() => this._scrollToHashFamily());
    }
    // Async: fetch state filter data (D-11)
    try {
      const res = await fetch(`${this._prefix}species-states.json`);
      const rows: unknown = await res.json();
      // O(1) shape validator — D-03: check top-level + one representative element only
      // Throws SchemaValidationError on schema mismatch (SCHEMA-08 hard-fail per D-05)
      validateSpeciesStates(rows);
      this._stateMap = buildStateMap(rows);
      this._statesAvailable = [...new Set(rows.map(r => r.state))].sort();
    } catch (err) {
      if (err instanceof SchemaValidationError) {
        // D-05 hard-fail: schema mismatch surfaces the error (no silently-wrong data)
        // re-throw so callers see the schema problem
        throw err;
      }
      // Network/fetch errors: soft degradation — leave stateMap empty, select stays disabled
    }
  }

  /**
   * Handle a #family-<name> deep link: expand the matching family and scroll
   * its row into view. No-op when the hash is absent or matches no family.
   */
  _scrollToHashFamily(): void {
    const hash = window.location.hash;
    if (!hash.startsWith('#family-')) return;
    const target = decodeURIComponent(hash.slice('#family-'.length)).toLowerCase();
    const family = this._families.find(f => (f.name ?? '').toLowerCase() === target);
    if (!family?.name) return;
    this._expandedFamilies = new Set([...this._expandedFamilies, family.name]);
    void this.updateComplete.then(() => {
      this.querySelector(`[id="family-${target}"]`)?.scrollIntoView();
    });
  }

  // --- Toggle handlers ---

  _onToggleImages(e: Event): void {
    this._showImages = (e.target as HTMLInputElement).checked;
  }

  _onStateChange(e: Event): void {
    this._selectedState = (e.target as HTMLSelectElement).value;
  }

  // --- Expand/collapse handlers ---
  // CRITICAL: Use new Set (not .add()) — Lit detects change by object identity (Pitfall 6)

  _toggleFamily(name: string): void {
    if (this._expandedFamilies.has(name)) {
      this._expandedFamilies = new Set([...this._expandedFamilies].filter(n => n !== name));
    } else {
      this._expandedFamilies = new Set([...this._expandedFamilies, name]);
    }
  }

  _toggleSubfamily(key: string): void {
    if (this._expandedSubfamilies.has(key)) {
      this._expandedSubfamilies = new Set([...this._expandedSubfamilies].filter(k => k !== key));
    } else {
      this._expandedSubfamilies = new Set([...this._expandedSubfamilies, key]);
    }
  }

  _toggleGenus(slug: string): void {
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

  _renderImageStrip(navImages: NavImage[] | null | undefined, onImageClick: ((slug: string) => void) | null = null): TemplateResult {
    if (!this._showImages || !navImages?.length) return html``;
    return html`
      <div style="display:inline-flex;flex-direction:row;gap:4px;overflow-x:auto">
        ${navImages.map(img => {
          const imgEl = html`<img
            src="${CDN_BASE_URL}/${img.thumb_url ?? `${img.species_slug}/${encodeURIComponent(img.filename)}`}?height=186"
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

  _expandToSpecies(speciesSlug: string): void {
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

  _mutedStyle(slugs: string[]): string {
    if (!this._selectedState) return '';
    return taxonHasState(slugs, this._stateMap, this._selectedState)
      ? ''
      : 'opacity:0.35';
  }

  // --- Level renderers ---

  _renderSpecies(species: TaxonGenus['species'], genusName: string): TemplateResult {
    return html`
      <div class="pnwm-tb-species-grid">
        ${species.map(sp => html`
          <a class="pnwm-tb-species-card" href="${this._prefix}species/${sp.slug}/">
            ${sp.navImage ? html`<img
              src="${CDN_BASE_URL}/${sp.navImage.thumb_url ?? `${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}`}?height=186"
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

  _renderGenus(genus: TaxonGenus, familyKey: string): TemplateResult {
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
        ${!expanded ? this._renderImageStrip(genus.navImages, (slug) => this._expandToSpecies(slug)) : ''}
        ${expanded ? this._renderSpecies(genus.species, genus.name) : ''}
      </div>`;
  }

  _renderSubfamily(subfam: TaxonSubfamily, familyName: string): TemplateResult {
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

  _renderFamily(family: TaxonFamily): TemplateResult {
    const expanded = this._expandedFamilies.has(family.name);
    const slugs = collectSlugs(family);
    return html`
      <div class="pnwm-tb-family-row" id="family-${(family.name ?? '').toLowerCase()}" style="${this._mutedStyle(slugs)}">
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

  render(): TemplateResult {
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
              html`<option value=${s} ?selected=${this._selectedState === s}>${STATE_NAMES[s] ?? s}</option>`
            )}
          </select>
        </div>
      </div>
      ${this._families.map(f => this._renderFamily(f))}`;
  }
}

customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
