/**
 * State / district filters for the Checklist page.
 *
 * ENHANCES, NEVER GATES. The checklist is fully server-rendered — this element only
 * hides rows that are already on the page. If the fetches fail, or JavaScript never
 * runs, the reader still has the complete list (ADR 0005). That is why it renders
 * only the controls and manipulates its siblings, rather than owning the list:
 * a component that rendered the species would make the page depend on JS to show
 * its own content.
 *
 * COMBINING AREAS (#293, ADR 0043). The curator's two cases are the Olympic Peninsula
 * (several counties of one state) and the Georgia Basin (Washington plus British
 * Columbia). Both are UNIONS: a species known from any selected area is shown. The
 * two selects stay exactly as they were for the common single-area case; "Add another
 * area" pins the current pick as a removable chip and clears the selects for the next
 * one. What is shown is the union of the pinned areas and whatever the selects hold.
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
 * One selected area: a whole state or province (`county` empty), or one county or
 * regional district within it. The same `STATE:County` key the aggregates use.
 */
export interface Jurisdiction {
  state: string;
  county: string;
}

export function jurisdictionKey(j: Jurisdiction): string {
  return j.county ? `${j.state}:${j.county}` : j.state;
}

/** "Washington", or "Clallam (WA)" — the state tag disambiguates same-named counties (#133). */
export function jurisdictionLabel(j: Jurisdiction): string {
  return j.county ? `${j.county} (${j.state})` : (STATE_NAMES[j.state] ?? j.state);
}

/**
 * The effective selection: the pinned areas plus whatever the selects currently hold,
 * deduplicated, with any county dropped when its whole state is also selected — a
 * county adds nothing to a union that already contains its state, and listing it
 * would misstate what the filter is doing. Order is preserved so the chips and the
 * status line read the way the reader built them.
 */
export function combineSelections(
  pinned: readonly Jurisdiction[],
  current: Jurisdiction | null,
): Jurisdiction[] {
  const all = current && current.state ? [...pinned, current] : [...pinned];
  const wholeStates = new Set(all.filter(j => !j.county).map(j => j.state));
  const seen = new Set<string>();
  const out: Jurisdiction[] = [];
  for (const j of all) {
    if (j.county && wholeStates.has(j.state)) continue;
    const key = jurisdictionKey(j);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

/** "Washington", "Washington and British Columbia", "Clallam (WA), Jefferson (WA) and Mason (WA)". */
export function describeSelections(selections: readonly Jurisdiction[]): string {
  const labels = selections.map(jurisdictionLabel);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Species recorded in a selected state that no selectable district can reach.
 *
 * Montana is capped to a western-MT county allow-list (`data/mt-county-allowlist.csv`,
 * see docs/concerns.md), while the state aggregate is not — so 86 of Montana's 344
 * species appear under "Montana" and under no county at all. WA/OR/ID/BC lose 1-4
 * each to records with no district assigned. Someone building a county list would
 * otherwise get a quietly incomplete one, which is precisely what the curator asked
 * this page for. Counted over the WHOLE-STATE selections only — a county selection
 * has already excluded them — and each species once, however many states it is
 * unreachable in.
 */
export function unreachableByDistrict(
  allSlugs: string[],
  stateMap: Record<string, Set<string>>,
  districtMap: Record<string, Set<string>>,
  selections: readonly Jurisdiction[],
): number {
  const states = selections.filter(j => !j.county).map(j => j.state);
  if (states.length === 0) return 0;
  return allSlugs.filter(slug =>
    states.some(state => {
      if (!stateMap[slug]?.has(state)) return false;
      const prefix = `${state}:`;
      for (const key of districtMap[slug] ?? []) if (key.startsWith(prefix)) return false;
      return true;
    }),
  ).length;
}

/**
 * Decide the visibility of every species row, given the current selection.
 *
 * Pure and exported: the DOM walk below is not worth testing, but this is — it is
 * where "no filter selected" has to mean "show everything", including species with
 * no occurrence rows at all. Getting that backwards silently empties the page for
 * the default view. With several areas selected the result is their UNION (#293):
 * a species known from any one of them is shown.
 */
export function visibleSlugs(
  allSlugs: string[],
  stateMap: Record<string, Set<string>>,
  districtMap: Record<string, Set<string>>,
  selections: readonly Jurisdiction[],
): Set<string> {
  if (selections.length === 0) return new Set(allSlugs);
  const inArea = (slug: string, j: Jurisdiction): boolean =>
    j.county
      ? districtMap[slug]?.has(jurisdictionKey(j)) === true
      : stateMap[slug]?.has(j.state) === true;
  return new Set(allSlugs.filter(slug => selections.some(j => inArea(slug, j))));
}

export class PnwmChecklistFilter extends LitElement {
  static properties: PropertyDeclarations = {
    'path-prefix': { type: String },
    _selectedState: { type: String, state: true },
    _selectedCounty: { type: String, state: true },
    _pinned: { type: Array, state: true },
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
  declare _pinned: Jurisdiction[];
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
    this._pinned = [];
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

  /** What the selects currently hold, or null when they hold nothing. */
  get _current(): Jurisdiction | null {
    return this._selectedState ? { state: this._selectedState, county: this._selectedCounty } : null;
  }

  /** The effective selection: pinned areas plus the selects. */
  get _selections(): Jurisdiction[] {
    return combineSelections(this._pinned, this._current);
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
   * Whether "Add another area" would change anything: the selects hold an area that
   * the pinned set does not already contain or subsume.
   */
  get _canPin(): boolean {
    const current = this._current;
    if (!current) return false;
    return combineSelections(this._pinned, null).length < combineSelections(this._pinned, current).length;
  }

  /** Pin what the selects hold and clear them for the next area. The union is unchanged. */
  _pinCurrent(): void {
    const current = this._current;
    if (!current || !this._canPin) return;
    this._pinned = combineSelections(this._pinned, current);
    this._selectedState = '';
    this._selectedCounty = '';
    this._apply();
  }

  _unpin(key: string): void {
    this._pinned = this._pinned.filter(j => jurisdictionKey(j) !== key);
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
    const slugs = rows.map(r => r.dataset['slug'] ?? '');
    const selections = this._selections;
    const visible = visibleSlugs(slugs, this._stateMap, this._districtMap, selections);

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
    this._unreachable = unreachableByDistrict(slugs, this._stateMap, this._districtMap, selections);
  }

  /** The district noun for the note about species no district can reach. */
  _unreachableNoun(selections: readonly Jurisdiction[]): string {
    const states = new Set(selections.filter(j => !j.county).map(j => j.state));
    if (states.size === 1) return districtLabel([...states][0] ?? '').toLowerCase();
    return 'county or regional district';
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
    const selections = this._selections;
    const noun = this._unreachableNoun(selections);

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
        <div>
          <button
            type="button"
            class="outline"
            style="width:auto;margin:0"
            ?disabled=${!this._canPin}
            title="Keep this area and choose another; the list shows species from any of them"
            @click=${this._pinCurrent}
          >Add another area</button>
        </div>
      </div>
      ${/* list-style on each <li> too: Pico's `ul li { list-style: square }` outranks the
           none inherited from the <ul>, and Chrome paints the first flex item's marker
           INSIDE its chip as a stray black square (docs/lessons-learned.md). */
      this._pinned.length > 0 ? html`
        <ul class="checklist-pins" aria-label="Selected areas" style="list-style:none;padding:0;margin-block:0 1rem;display:flex;flex-wrap:wrap;gap:.5rem">
          ${this._pinned.map(j => html`
            <li style="margin:0;list-style:none">
              <button
                type="button"
                class="outline secondary"
                style="width:auto;margin:0;padding:.2rem .7rem"
                aria-label=${`Remove ${jurisdictionLabel(j)}`}
                @click=${() => this._unpin(jurisdictionKey(j))}
              >${jurisdictionLabel(j)} &#x2715;</button>
            </li>
          `)}
        </ul>
      ` : ''}
      <p role="status">
        ${selections.length > 0
          ? html`Showing ${this._shown} of ${this._total} species in ${describeSelections(selections)}.`
          : html`Showing all ${this._total} species.`}
        ${this._unreachable > 0
          ? html`<br><small>${this._unreachable} of these have no ${noun}
              recorded and will not appear under any ${noun}.</small>`
          : ''}
      </p>
    `;
  }
}

customElements.define('pnwm-checklist-filter', PnwmChecklistFilter);
