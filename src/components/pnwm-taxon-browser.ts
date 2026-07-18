import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import { SpeciesStateSchema, SpeciesDistrictSchema, type SpeciesState, type SpeciesDistrict, type TaxonFamily, type TaxonSubfamily, type TaxonTribe, type TaxonGenus, type NavImage } from '../types/index.ts';

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
 * Derive the sorted, deduped list of selectable states from species-states.json rows,
 * intersected with STATE_NAMES' keys so Alberta (which has no STATE_NAMES entry) is
 * EXCLUDED from the dropdown entirely, not merely unlabeled (Pitfall 1 / D-05).
 */
export function deriveStatesAvailable(rows: SpeciesState[]): string[] {
  return [...new Set(rows.map(r => r.state))]
    .filter(s => s in STATE_NAMES)
    .sort();
}

/**
 * Validate that rows is a well-formed species-districts.json payload.
 * O(1): checks top-level is Array + probes a single representative element shape.
 * Same probe-one-element/reuse-SchemaValidationError pattern as validateSpeciesStates
 * (BFILT-02, T-48-01).
 *
 * @param rows - the unknown value returned by res.json()
 * @throws SchemaValidationError on non-array top level or bad element shape
 */
export function validateSpeciesDistricts(rows: unknown): asserts rows is SpeciesDistrict[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError('species-districts.json: expected array at top level');
  }
  if (rows.length > 0) {
    const probe = SpeciesDistrictSchema.safeParse(rows[0]);
    if (!probe.success) {
      throw new SchemaValidationError(
        `species-districts.json: element shape mismatch: ${probe.error.issues.map((i: { message: string }) => i.message).join('; ')}`
      );
    }
  }
}

/**
 * Transform flat [{species_slug, state, county}] array from species-districts.json
 * into an object mapping species_slug → Set<`${state}:${county}`>.
 * Pitfall 3: the key is ALWAYS the compound `${state}:${county}` string, never a bare
 * county name — cross-state county-name collisions (e.g. WA Lincoln vs MT Lincoln) are
 * real and numerous in this dataset.
 */
export function buildDistrictMap(rows: SpeciesDistrict[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const { species_slug, state, county } of rows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug]!.add(`${state}:${county}`);
  }
  return map;
}

/**
 * Returns true if any slug in `slugs` has the compound `${selectedState}:${selectedCounty}`
 * key in districtMap, or if selectedCounty is empty string (no district filter active,
 * D-02's "All counties" reset state).
 */
export function taxonHasDistrict(
  slugs: string[],
  districtMap: Record<string, Set<string>>,
  selectedState: string,
  selectedCounty: string,
): boolean {
  if (!selectedCounty) return true;
  const key = `${selectedState}:${selectedCounty}`;
  return slugs.some(slug => districtMap[slug]?.has(key));
}

/**
 * State-scoped, deduped, alphabetical list of districts (D-03/D-04). The
 * species-districts.json aggregate is already allow-list-filtered and DISTINCT at
 * build time (MT capped to the western-MT allow-list, AB excluded entirely), so this
 * needs no allow-list knowledge of its own — only filter by state and dedupe.
 */
export function districtsForState(rows: SpeciesDistrict[], state: string): string[] {
  const set = new Set(rows.filter(r => r.state === state).map(r => r.county));
  return [...set].sort();
}

/**
 * Dynamic jurisdiction label (BFILT-04): "Regional District" for BC, "County" for the
 * US states (and the neutral/disabled no-state-selected case).
 */
export function districtLabel(selectedState: string): string {
  return selectedState === 'BC' ? 'Regional District' : 'County';
}

/**
 * Recursively collect all species slugs from any taxon tree node.
 * Handles family ({subfamilies:[]}), subfamily ({tribes:[]}), tribe ({genera:[]}),
 * genus ({species:[]}).
 */
export function collectSlugs(node: TaxonFamily | TaxonSubfamily | TaxonTribe | TaxonGenus): string[] {
  if ('species' in node) return node.species.map(s => s.slug);
  const children =
    ('subfamilies' in node ? node.subfamilies : null) ||
    ('tribes' in node ? node.tribes : null) ||
    ('genera' in node ? node.genera : null) ||
    [];
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
      _selectedDistrict:    { type: String,  state: true },
      _districtMap:         { attribute: false, state: true },
      _districtRows:        { attribute: false, state: true },
      _districtsAvailable:  { attribute: false, state: true },
      _showImages:          { type: Boolean, state: true },
      _expandedFamilies:    { attribute: false, state: true },
      _expandedSubfamilies: { attribute: false, state: true },
      _expandedTribes:      { attribute: false, state: true },
      _expandedGenera:      { attribute: false, state: true },
    };
  }

  _families: TaxonFamily[];
  _stateMap: Record<string, Set<string>>;
  _statesAvailable: string[];
  _selectedState: string;
  _selectedDistrict: string;
  _districtMap: Record<string, Set<string>>;
  _districtRows: SpeciesDistrict[];
  _districtsAvailable: string[];
  _showImages: boolean;
  _expandedFamilies: Set<string>;
  _expandedSubfamilies: Set<string>;
  _expandedTribes: Set<string>;
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
    this._selectedDistrict = '';
    this._districtMap = {};
    this._districtRows = [];
    this._districtsAvailable = [];
    this._showImages = true;
    this._expandedFamilies = new Set();
    this._expandedSubfamilies = new Set();
    this._expandedTribes = new Set();
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
    // species-states.json and species-districts.json are independent payloads —
    // fetch them concurrently so neither dropdown waits on the other's round-trip.
    // allSettled attaches handlers to both immediately (no unhandled rejection) and
    // isolates a network failure of one payload from the other. Validation runs
    // AFTER, still OUTSIDE the fulfilled branch's guard, so a SchemaValidationError
    // propagates out of connectedCallback (D-05 hard-fail) while a rejected fetch
    // soft-degrades (map left empty, that select stays disabled).
    const [statesResult, districtsResult] = await Promise.allSettled([
      fetch(`${this._prefix}species-states.json`).then(r => r.json()),
      fetch(`${this._prefix}species-districts.json`).then(r => r.json()),
    ]);

    // State filter data (D-11)
    if (statesResult.status === 'fulfilled') {
      const rows: unknown = statesResult.value;
      // O(1) shape validator — D-03: check top-level + one representative element only.
      // Throws SchemaValidationError on schema mismatch (SCHEMA-08 hard-fail per D-05).
      validateSpeciesStates(rows);
      this._stateMap = buildStateMap(rows);
      // Pitfall 1 fix (D-05): intersect with STATE_NAMES' keys so Alberta (which has no
      // STATE_NAMES entry) is excluded from the dropdown, not merely unlabeled.
      this._statesAvailable = deriveStatesAvailable(rows);
    }
    // Network/fetch errors (rejected): soft degradation — stateMap empty, select disabled.

    // District filter data (BFILT-02/BFILT-03)
    if (districtsResult.status === 'fulfilled') {
      const rows: unknown = districtsResult.value;
      // O(1) shape validator — same probe-one-element pattern as species-states (T-48-01).
      validateSpeciesDistricts(rows);
      // Keep raw rows so districtsForState() can recompute options on every state change.
      this._districtRows = rows;
      this._districtMap = buildDistrictMap(rows);
      // WR-01: if the user selected a state before this payload resolved,
      // _districtsAvailable was computed against an empty _districtRows ([]) and
      // never recovers on its own (it is only recomputed in _onStateChange).
      // Recompute it now so the county dropdown populates without a re-select.
      if (this._selectedState) {
        this._districtsAvailable = districtsForState(this._districtRows, this._selectedState);
      }
    }
    // Network/fetch errors (rejected): soft degradation — districtMap empty, select disabled.
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
      // WR-02: `target` comes from window.location.hash (attacker-supplyable via a
      // crafted deep link). Interpolating it raw into an attribute selector lets a
      // hash containing selector metacharacters (e.g. `#family-a"]`) throw a
      // DOMException. `target` is already lowercased to match the generated id, so
      // getElementById sidesteps selector parsing entirely.
      document.getElementById(`family-${target}`)?.scrollIntoView();
    });
  }

  // --- Toggle handlers ---

  _onToggleImages(e: Event): void {
    this._showImages = (e.target as HTMLInputElement).checked;
  }

  _onStateChange(e: Event): void {
    // Pitfall 5 / D-02: reset the district selection AND recompute its options in the
    // same handler invocation — otherwise a stale district value from the old state
    // could linger while _districtsAvailable no longer contains it.
    const value = (e.target as HTMLSelectElement).value;
    this._selectedState = value;
    this._selectedDistrict = '';
    this._districtsAvailable = districtsForState(this._districtRows, value);
  }

  _onDistrictChange(e: Event): void {
    this._selectedDistrict = (e.target as HTMLSelectElement).value;
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

  _toggleTribe(key: string): void {
    if (this._expandedTribes.has(key)) {
      this._expandedTribes = new Set([...this._expandedTribes].filter(k => k !== key));
    } else {
      this._expandedTribes = new Set([...this._expandedTribes, key]);
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
        // subfamKey mirrors _renderSubfamily's key; a null subfamily renders its
        // tribes/genera flat under the family, so its genus keys omit the subfamily.
        const subfamKey = subfam.name ? `${family.name}__${subfam.name}` : family.name;
        for (const tribe of subfam.tribes) {
          for (const genus of tribe.genera) {
            if (!genus.species.some(sp => sp.slug === speciesSlug)) continue;
            this._expandedFamilies = new Set([...this._expandedFamilies, family.name]);
            if (subfam.name) {
              this._expandedSubfamilies = new Set([...this._expandedSubfamilies, subfamKey]);
            }
            // A null tribe renders its genera flat under the subfamily, so its
            // genus keys are rooted at the subfamily; a named tribe adds a level.
            const tribeKey = tribe.name ? `${subfamKey}__${tribe.name}` : subfamKey;
            if (tribe.name) {
              this._expandedTribes = new Set([...this._expandedTribes, tribeKey]);
            }
            this._expandedGenera = new Set([...this._expandedGenera, `${tribeKey}__${genus.genus_slug}`]);
            return;
          }
        }
      }
    }
  }

  // --- Muting helper ---
  // D-06: opacity:0.35 on taxa with no records in selected state; never display:none

  _mutedStyle(slugs: string[]): string {
    if (this._selectedDistrict) {
      return taxonHasDistrict(slugs, this._districtMap, this._selectedState, this._selectedDistrict)
        ? ''
        : 'opacity:0.35';
    }
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

  // headingLevel is 4 when the genus sits directly under a subfamily (no tribe)
  // and 5 when it sits under a named tribe, keeping heading nesting monotonic.
  _renderGenus(genus: TaxonGenus, parentKey: string, headingLevel: 4 | 5 = 4): TemplateResult {
    const key = `${parentKey}__${genus.genus_slug}`;
    const expanded = this._expandedGenera.has(key);
    const slugs = genus.species.map(s => s.slug);
    const heading = html`<button
      type="button"
      aria-expanded="${expanded}"
      @click=${() => this._toggleGenus(key)}
    >${genus.name}</button>`;
    return html`
      <div class="pnwm-tb-genus-row" style="${this._mutedStyle(slugs)}">
        ${headingLevel === 5 ? html`<h5>${heading}</h5>` : html`<h4>${heading}</h4>`}
        ${!expanded ? this._renderImageStrip(genus.navImages, (slug) => this._expandToSpecies(slug)) : ''}
        ${expanded ? this._renderSpecies(genus.species, genus.name) : ''}
      </div>`;
  }

  // subfamKey is the parent subfamily's expand key (or the family name when the
  // subfamily is null — see _renderSubfamily).
  _renderTribe(tribe: TaxonTribe, subfamKey: string): TemplateResult {
    // tribe.name === null means the subfamily has no tribal subdivision — render
    // its genera directly under the subfamily (no h4, no expand button), the same
    // way a null subfamily flattens its genera under the family.
    if (!tribe.name) {
      return html`${tribe.genera.map(g => this._renderGenus(g, subfamKey, 4))}`;
    }

    const key = `${subfamKey}__${tribe.name}`;
    const expanded = this._expandedTribes.has(key);
    const slugs = collectSlugs(tribe);
    return html`
      <div class="pnwm-tb-tribe-row" style="${this._mutedStyle(slugs)}">
        <h4>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleTribe(key)}
          >${tribe.name}</button>
        </h4>
        ${!expanded ? this._renderImageStrip(tribe.navImages, (slug) => this._expandToSpecies(slug)) : ''}
        <div ?hidden=${!expanded}>
          ${tribe.genera.map(g => this._renderGenus(g, key, 5))}
        </div>
      </div>`;
  }

  _renderSubfamily(subfam: TaxonSubfamily, familyName: string): TemplateResult {
    // subfam.name === null means no real subfamily — render tribes/genera directly (Pitfall 2)
    const key = `${familyName}__${subfam.name ?? '__none__'}`;
    const expanded = this._expandedSubfamilies.has(key);
    const slugs = collectSlugs(subfam);

    if (!subfam.name) {
      // No-subfamily case: flatten tribes/genera directly under family (no h3, no expand button)
      return html`
        ${subfam.tribes.map(t => this._renderTribe(t, familyName))}`;
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
          ${subfam.tribes.map(t => this._renderTribe(t, key))}
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
      <div class="pnwm-tb-toolbar" style="display:flex;flex-direction:column;gap:0.75rem;align-items:flex-start;padding:8px 16px">
        <label>
          <input
            type="checkbox"
            ?checked=${this._showImages}
            @change=${this._onToggleImages}
          >
          Show images
        </label>
        <div style="display:flex;align-items:center;gap:0.5em">
          <label for="pnwm-tb-state-filter" style="white-space:nowrap">Filter by state</label>
          <select
            id="pnwm-tb-state-filter"
            style="width:auto;margin:0"
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
        <div style="display:flex;align-items:center;gap:0.5em">
          <label for="pnwm-tb-district-filter" style="white-space:nowrap">Filter by ${districtLabel(this._selectedState)}</label>
          <select
            id="pnwm-tb-district-filter"
            style="width:auto;margin:0"
            .value=${this._selectedDistrict}
            ?disabled=${!this._selectedState}
            @change=${this._onDistrictChange}
          >
            <option value="">${this._selectedState === 'BC' ? 'All regional districts' : this._selectedState ? 'All counties' : 'Select a state first'}</option>
            ${this._districtsAvailable.map(d =>
              html`<option value=${d} ?selected=${this._selectedDistrict === d}>${d}</option>`
            )}
          </select>
        </div>
      </div>
      ${this._families.map(f => this._renderFamily(f))}`;
  }
}

customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
