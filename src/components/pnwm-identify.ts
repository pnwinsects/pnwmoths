// pnwm-identify — Light-DOM Lit component for the /identify/ filter panel.
// Reads the inlined #key-char-data script, renders 8 default-collapsed
// collapsible categories, tracks selection state, shows per-category count
// badges, provides a sticky "Clear all" reset, and dispatches
// pnwm-key-filter-change on every change. Phase 41: placeholder slugs only.
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import type { Character } from '../types/index.ts';
import type { KeyFilterChangeDetail } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** category → question → Character[]. Exported for unit tests. */
export type CategoryMap = Map<string, Map<string, Character[]>>;

// ---------------------------------------------------------------------------
// Pure helper — exported for testability
// ---------------------------------------------------------------------------

/**
 * Group a flat Character[] into CategoryMap (category → question → Character[]).
 * Insertion order is preserved — categories and questions appear in the order
 * they first appear in the input array.
 */
export function buildCategoryMap(characters: Character[]): CategoryMap {
  const catMap = new Map<string, Map<string, Character[]>>();
  for (const char of characters) {
    if (!catMap.has(char.category)) catMap.set(char.category, new Map());
    const qMap = catMap.get(char.category)!;
    if (!qMap.has(char.question)) qMap.set(char.question, []);
    qMap.get(char.question)!.push(char);
  }
  return catMap;
}

// Categories whose data originates from the 2015 Lucid key (not live occurrence records).
// Per UI-SPEC Copywriting Contract: show "(Key data, 2015)" sub-note.
const KEY_DATA_CATEGORIES = new Set(['Distribution', 'Seasonality']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Exported so unit tests can construct and inspect state without the DOM. */
export class PnwmIdentify extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      _categoryMap:        { attribute: false, state: true },
      _expandedCategories: { attribute: false, state: true },
      _selection:          { attribute: false, state: true },
    };
  }

  _categoryMap: CategoryMap;
  _expandedCategories: Set<string>;
  /** Selection: Map<questionText, Set<characterId>> */
  _selection: Map<string, Set<number>>;

  /** Light DOM — Pico CSS must reach checkboxes, fieldsets, labels (D-03, PATTERNS.md) */
  createRenderRoot(): this { return this; }

  constructor() {
    super();
    this._categoryMap = new Map();
    this._expandedCategories = new Set();
    this._selection = new Map();
  }

  connectedCallback(): void {
    super.connectedCallback();
    const el = document.getElementById('key-char-data');
    if (!el) return;
    const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[] };
    this._categoryMap = buildCategoryMap(data.characters);
  }

  // ---------------------------------------------------------------------------
  // State mutators — always replace with new collection (new-Set/new-Map reactivity)
  // ---------------------------------------------------------------------------

  _toggleCategory(name: string): void {
    if (this._expandedCategories.has(name)) {
      this._expandedCategories = new Set([...this._expandedCategories].filter(n => n !== name));
    } else {
      this._expandedCategories = new Set([...this._expandedCategories, name]);
    }
  }

  _onCheckboxChange(question: string, charId: number, checked: boolean): void {
    const prev = this._selection.get(question) ?? new Set<number>();
    const next = new Set(prev);
    if (checked) {
      next.add(charId);
    } else {
      next.delete(charId);
    }
    this._selection = new Map(this._selection).set(question, next);
    this._dispatchFilterChange();
  }

  _clearAll(): void {
    this._selection = new Map();
    this._dispatchFilterChange();
  }

  // ---------------------------------------------------------------------------
  // Selection predicates
  // ---------------------------------------------------------------------------

  _hasSelection(): boolean {
    for (const ids of this._selection.values()) {
      if (ids.size > 0) return true;
    }
    return false;
  }

  /**
   * Count how many character states are selected within a category.
   * Selection is keyed by question; count is aggregated per category (Pitfall 7).
   */
  _selectionCountForCategory(catName: string): number {
    const qMap = this._categoryMap.get(catName);
    if (!qMap) return 0;
    let count = 0;
    for (const [question, chars] of qMap) {
      const ids = this._selection.get(question);
      if (!ids) continue;
      for (const char of chars) {
        if (ids.has(char.id)) count++;
      }
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // Event dispatch
  // ---------------------------------------------------------------------------

  _dispatchFilterChange(): void {
    const detail: KeyFilterChangeDetail = {
      matchedSlugs: [],  // Phase 42 will compute; placeholder in Phase 41
      count: 0,
      hasSelection: this._hasSelection(),
    };
    this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
      bubbles: true,
      detail,
    }));
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  _renderQuestion(question: string, chars: Character[]): TemplateResult {
    return html`
      <fieldset class="pnwm-kfp-question">
        <legend>${question}</legend>
        ${chars.map(char => {
          const selected = this._selection.get(question)?.has(char.id) ?? false;
          return html`<label>
            <input
              type="checkbox"
              .checked=${selected}
              @change=${(e: Event) => this._onCheckboxChange(question, char.id, (e.target as HTMLInputElement).checked)}
            >
            ${char.state}
          </label>`;
        })}
      </fieldset>`;
  }

  _renderCategory(catName: string, questions: Map<string, Character[]>): TemplateResult {
    const expanded = this._expandedCategories.has(catName);
    const selCount = this._selectionCountForCategory(catName);
    const isKeyData = KEY_DATA_CATEGORIES.has(catName);
    return html`
      <div class="pnwm-kfp-category">
        <h2>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleCategory(catName)}
          >${catName}${selCount > 0 ? html` <span class="pnwm-kfp-badge">(${selCount})</span>` : ''}
          </button>
        </h2>
        ${isKeyData ? html`<small>(Key data, 2015)</small>` : ''}
        <div ?hidden=${!expanded}>
          ${[...questions.entries()].map(([q, chars]) => this._renderQuestion(q, chars))}
        </div>
      </div>`;
  }

  render(): TemplateResult {
    return html`
      ${this._hasSelection() ? html`
        <div class="pnwm-kfp-sticky">
          <button type="button" @click=${() => this._clearAll()}>Clear all</button>
        </div>` : ''}
      ${[...this._categoryMap.entries()].map(([catName, questions]) =>
        this._renderCategory(catName, questions)
      )}`;
  }
}

customElements.define('pnwm-identify', PnwmIdentify);
