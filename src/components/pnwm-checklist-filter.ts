/**
 * State / district filters for the Checklist page.
 *
 * ENHANCES, NEVER GATES. The checklist is fully server-rendered — this element only
 * hides rows that are already on the page. If the fetches fail, or JavaScript never
 * runs, the reader still has the complete list (ADR 0005). That is why it renders
 * only the two selects and manipulates its siblings, rather than owning the list:
 * a component that rendered the species would make the page depend on JS to show
 * its own content.
 *
 * Reuses the pure filter helpers from `pnwm-taxon-browser.ts` rather than restating
 * them, so Browse and the Checklist cannot disagree about what "in Whatcom County"
 * means — they read the same two aggregates and apply the same predicates.
 */
import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import {
  buildStateMap,
  buildDistrictMap,
  deriveStatesAvailable,
  districtsForState,
  districtLabel,
  validateSpeciesStates,
  validateSpeciesDistricts,
  SchemaValidationError,
} from './pnwm-taxon-browser.ts';
import type { SpeciesState, SpeciesDistrict } from '../types/index.ts';

/**
 * Label for the district select's "no filter" option.
 *
 * Not `districtLabel(state).toLowerCase() + 's'` — that yields "All countys". Only
 * two jurisdictions exist here, so spell both rather than reach for a pluraliser.
 */
export function allDistrictsLabel(selectedState: string): string {
  return selectedState === 'BC' ? 'All regional districts' : 'All counties';
}

const STATE_NAMES: Record<string, string> = {
  BC: 'British Columbia',
  ID: 'Idaho',
  MT: 'Montana',
  OR: 'Oregon',
  WA: 'Washington',
};

/**
 * Species recorded in a state that no selectable district can reach.
 *
 * Montana is capped to a western-MT county allow-list (`data/mt-county-allowlist.csv`,
 * see docs/concerns.md), while the state aggregate is not — so 86 of Montana's 344
 * species appear under "Montana" and under no county at all. WA/OR/ID/BC lose 1-4
 * each to records with no district assigned. Someone building a county list would
 * otherwise get a quietly incomplete one, which is precisely what the curator asked
 * this page for.
 */
export function unreachableByDistrict(
  allSlugs: string[],
  stateMap: Record<string, Set<string>>,
  districtMap: Record<string, Set<string>>,
  selectedState: string,
): number {
  if (!selectedState) return 0;
  const prefix = `${selectedState}:`;
  return allSlugs.filter(slug => {
    if (!stateMap[slug]?.has(selectedState)) return false;
    for (const key of districtMap[slug] ?? []) if (key.startsWith(prefix)) return false;
    return true;
  }).length;
}

/**
 * Decide the visibility of every species row, given the current selection.
 *
 * Pure and exported: the DOM walk below is not worth testing, but this is — it is
 * where "no filter selected" has to mean "show everything", including species with
 * no occurrence rows at all. Getting that backwards silently empties the page for
 * the default view.
 */
export function visibleSlugs(
  allSlugs: string[],
  stateMap: Record<string, Set<string>>,
  districtMap: Record<string, Set<string>>,
  selectedState: string,
  selectedCounty: string,
): Set<string> {
  if (!selectedState) return new Set(allSlugs);
  const key = selectedCounty ? `${selectedState}:${selectedCounty}` : null;
  return new Set(
    allSlugs.filter(slug =>
      key === null
        ? stateMap[slug]?.has(selectedState) === true
        : districtMap[slug]?.has(key) === true,
    ),
  );
}

export class PnwmChecklistFilter extends LitElement {
  static properties: PropertyDeclarations = {
    'path-prefix': { type: String },
    _selectedState: { type: String, state: true },
    _selectedCounty: { type: String, state: true },
    _statesAvailable: { type: Array, state: true },
    _districtRows: { type: Array, state: true },
    _shown: { type: Number, state: true },
    _unreachable: { type: Number, state: true },
    _total: { type: Number, state: true },
    _ready: { type: Boolean, state: true },
    _failed: { type: Boolean, state: true },
  };

  // Declared, never initialized in the class body — a class field would shadow the
  // reactive accessor Lit puts on the prototype. See docs/lessons-learned.md.
  declare _selectedState: string;
  declare _selectedCounty: string;
  declare _statesAvailable: string[];
  declare _stateMap: Record<string, Set<string>>;
  declare _districtMap: Record<string, Set<string>>;
  declare _districtRows: SpeciesDistrict[];
  declare _shown: number;
  declare _unreachable: number;
  declare _total: number;
  declare _ready: boolean;
  declare _failed: boolean;

  constructor() {
    super();
    this._selectedState = '';
    this._selectedCounty = '';
    this._statesAvailable = [];
    this._stateMap = {};
    this._districtMap = {};
    this._districtRows = [];
    this._shown = 0;
    this._unreachable = 0;
    this._total = 0;
    this._ready = false;
    this._failed = false;
  }

  /** Light DOM — Pico styles the selects, and this element manipulates its siblings. */
  createRenderRoot(): this { return this; }

  get _prefix(): string { return (this as { 'path-prefix'?: string })['path-prefix'] || '/'; }

  /** Every species row on the page, in document order. */
  get _rows(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.checklist-species > li[data-slug]')];
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this._total = this._rows.length;

    try {
      const [states, districts] = await Promise.all([
        fetch(`${this._prefix}species-states.json`).then(r => r.json()),
        fetch(`${this._prefix}species-districts.json`).then(r => r.json()),
      ]);
      validateSpeciesStates(states);
      validateSpeciesDistricts(districts);
      this._stateMap = buildStateMap(states as SpeciesState[]);
      this._districtMap = buildDistrictMap(districts as SpeciesDistrict[]);
      this._districtRows = districts as SpeciesDistrict[];
      this._statesAvailable = deriveStatesAvailable(states as SpeciesState[]);
      this._ready = true;
    } catch (err) {
      // A schema error is a build bug and must be loud; a network failure is not, and
      // the page is already complete without us. Either way the controls stay hidden
      // rather than offering a filter that would silently do nothing.
      if (err instanceof SchemaValidationError) throw err;
      this._ready = false;
      this._failed = true;
    }
  }

  _onStateChange(e: Event): void {
    this._selectedState = (e.target as HTMLSelectElement).value;
    this._selectedCounty = '';   // the old district belongs to the old state
    this._apply();
  }

  _onCountyChange(e: Event): void {
    this._selectedCounty = (e.target as HTMLSelectElement).value;
    this._apply();
  }

  /**
   * Hide non-matching species, then hide any group left with nothing visible.
   *
   * Each group asks its own descendants directly, so one pass settles every level
   * regardless of order — a tribe sees its genera's species, not its genera's
   * visibility. The point is that a heading never strands above a blank space.
   */
  _apply(): void {
    const rows = this._rows;
    const visible = visibleSlugs(
      rows.map(r => r.dataset['slug'] ?? ''),
      this._stateMap,
      this._districtMap,
      this._selectedState,
      this._selectedCounty,
    );

    let shown = 0;
    for (const row of rows) {
      const on = visible.has(row.dataset['slug'] ?? '');
      row.hidden = !on;
      if (on) shown++;
    }

    const groups = [...document.querySelectorAll<HTMLElement>('.checklist-group')];
    for (const group of groups) {
      const hasVisibleRow = [...group.querySelectorAll<HTMLElement>('li[data-slug]')].some(li => !li.hidden);
      group.hidden = !hasVisibleRow;
    }

    this._shown = shown;
    this._unreachable = unreachableByDistrict(
      rows.map(r => r.dataset['slug'] ?? ''),
      this._stateMap,
      this._districtMap,
      this._selectedState,
    );
  }

  render(): TemplateResult {
    // This element renders into the light DOM, so there is no slot to fall back to —
    // the page's own <noscript> sits outside it and is never touched.
    //
    // A failed fetch says so rather than rendering nothing. The page's own
    // description promises filtering; silently omitting the controls leaves a reader
    // hunting for a feature that is simply absent, with no console error either.
    if (this._failed) {
      return html`<p role="status"><small>
        Filtering is unavailable — the occurrence data could not be loaded. The complete list is below.
      </small></p>`;
    }
    if (!this._ready) return html``;

    const districts = this._selectedState ? districtsForState(this._districtRows, this._selectedState) : [];
    const label = districtLabel(this._selectedState);

    return html`
      <div class="checklist-filters" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:end;margin-block:1rem">
        <div>
          <label for="checklist-state">State or province</label>
          <select
            id="checklist-state"
            style="width:auto;margin:0"
            .value=${this._selectedState}
            @change=${this._onStateChange}
          >
            <option value="">All states</option>
            ${this._statesAvailable.map(s => html`
              <option value=${s} ?selected=${this._selectedState === s}>${STATE_NAMES[s] ?? s}</option>
            `)}
          </select>
        </div>
        <div>
          <label for="checklist-district">${label}</label>
          <select
            id="checklist-district"
            style="width:auto;margin:0"
            ?disabled=${!this._selectedState}
            .value=${this._selectedCounty}
            @change=${this._onCountyChange}
          >
            <option value="">${allDistrictsLabel(this._selectedState)}</option>
            ${districts.map(d => html`
              <option value=${d} ?selected=${this._selectedCounty === d}>${d}</option>
            `)}
          </select>
        </div>
      </div>
      <p role="status">
        ${this._selectedState
          ? html`Showing ${this._shown} of ${this._total} species.`
          : html`Showing all ${this._total} species.`}
        ${this._unreachable > 0 && !this._selectedCounty
          ? html`<br><small>${this._unreachable} of these have no ${districtLabel(this._selectedState).toLowerCase()}
              recorded and will not appear under any ${districtLabel(this._selectedState).toLowerCase()}.</small>`
          : ''}
      </p>
    `;
  }
}

customElements.define('pnwm-checklist-filter', PnwmChecklistFilter);
