// pnwm-identify — Light-DOM Lit component for the /identify/ filter panel.
// Reads the inlined #key-char-data script, renders 8 default-collapsed
// collapsible categories, tracks selection state, shows per-category count
// badges, provides a sticky "Clear all" reset, and dispatches
// pnwm-key-filter-change on every change.
// Phase 41: placeholder slugs only.
// Phase 42: async matrix fetch, computeMatching wiring, two-column layout, mounts key-results-grid.
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import type { Character } from '../types/index.ts';
import type { KeyFilterChangeDetail } from '../types/index.ts';
import type { KeyMatrix, KeySpecies } from '../types/schemas.ts';
import { validateKeyMatrix } from './key-matrix-cache.ts';
import { computeMatching, buildQuestionGroups, type QuestionGroups } from '../_lib/key-filter.ts';
import { isQuestionVisible, pruneHiddenSelections } from '../_lib/key-dependencies.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** category → question → Character[]. Exported for unit tests. */
export type CategoryMap = Map<string, Map<string, Character[]>>;

// ---------------------------------------------------------------------------
// CDN constant (mirrors key-results-grid.ts:9 verbatim — MUST NOT use this._prefix)
// ---------------------------------------------------------------------------

const CDN_BASE_URL = 'https://moths.pnwinsects.org';

// ---------------------------------------------------------------------------
// Pure helpers — exported for testability (CIMG-03)
// ---------------------------------------------------------------------------

/**
 * Construct a host-absolute CDN URL for a character illustration.
 * Single home for the CDN base URL, encodeURIComponent, and the pathPrefix-guard
 * (RESEARCH Pitfall 1: MUST NOT be wrapped in this._prefix — that would yield
 * /pnwmoths/https://... and 404 on GitHub Pages).
 *
 * @param image_filename - bare .webp filename (e.g. 'Black Forewing.webp')
 * @returns host-absolute CDN URL (e.g. 'https://moths.pnwinsects.org/key-images/Black%20Forewing.webp')
 */
export function characterImageSrc(image_filename: string): string {
  return `${CDN_BASE_URL}/key-images/${encodeURIComponent(image_filename)}`;
}

/**
 * Derive the <img alt> text for a character illustration.
 * Returns curator alt_text when non-blank, else the state name verbatim.
 * Never returns an empty string (UI-SPEC Copywriting / D-06).
 *
 * @param state - the character state label (e.g. 'Black')
 * @param alt_text - curator-provided alt text from data/key-character-images.csv (may be null/blank)
 * @returns non-empty alt string
 */
export function helpImageAlt(state: string, alt_text: string | null): string {
  return alt_text && alt_text.trim() ? alt_text : state;
}

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
      'path-prefix':      { type: String },
      _categoryMap:       { attribute: false, state: true },
      _expandedCategories:{ attribute: false, state: true },
      _expandedQuestions: { attribute: false, state: true },
      _selection:         { attribute: false, state: true },
      _keyMatrix:         { attribute: false, state: true },
      _questionGroups:    { attribute: false, state: true },
      _matchedSpecies:    { attribute: false, state: true },
      _matchedCount:      { state: true },
    };
  }

  _categoryMap: CategoryMap;
  _expandedCategories: Set<string>;
  /** Questions (sub-character-groups) currently expanded. Empty = all collapsed. */
  _expandedQuestions: Set<string>;
  /** Selection: Map<questionText, Set<characterId>> */
  _selection: Map<string, Set<number>>;
  _keyMatrix: KeyMatrix | null;
  _questionGroups: QuestionGroups | null;
  _matchedSpecies: KeySpecies[];
  _matchedCount: number;

  /** Light DOM — Pico CSS must reach checkboxes, fieldsets, labels (D-03, PATTERNS.md) */
  createRenderRoot(): this { return this; }

  constructor() {
    super();
    this._categoryMap = new Map();
    this._expandedCategories = new Set();
    this._expandedQuestions = new Set();
    this._selection = new Map();
    this._keyMatrix = null;
    this._questionGroups = null;
    this._matchedSpecies = [];
    this._matchedCount = 0;
  }

  /** Mirror pnwm-taxon-browser.ts line 106 */
  get _prefix(): string {
    return (this as { 'path-prefix'?: string })['path-prefix'] || '/';
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    const el = document.getElementById('key-char-data');
    if (!el) return;
    const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[] };
    this._categoryMap = buildCategoryMap(data.characters);
    // Build question groups from the inlined data so contingent-reveal visibility
    // (isQuestionVisible) is resolvable immediately — before the async matrix
    // fetch below resolves. Reassigned to the matrix's groups on fetch success
    // (identical character set).
    this._questionGroups = buildQuestionGroups(data.characters);
    // Async: fetch full matrix (bitsets) for computeMatching
    try {
      const res = await fetch(`${this._prefix}key-matrix.json`);
      const raw: unknown = await res.json();
      validateKeyMatrix(raw);
      this._keyMatrix = raw;
      this._questionGroups = buildQuestionGroups(raw.characters);
    } catch (err) {
      // soft degradation: grid stays in "prompt" state; panel still interactive
      console.error('[pnwm-identify] matrix fetch failed:', err);
    }
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

  _toggleQuestion(question: string): void {
    if (this._expandedQuestions.has(question)) {
      this._expandedQuestions = new Set([...this._expandedQuestions].filter(q => q !== question));
    } else {
      this._expandedQuestions = new Set([...this._expandedQuestions, question]);
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
    const updated = new Map(this._selection).set(question, next);
    // Deselecting a parent trigger hides its dependent questions; drop any
    // orphaned child selections so they cannot silently constrain results
    // (issue #97). No-op until _questionGroups is available.
    this._selection = this._questionGroups
      ? pruneHiddenSelections(updated, this._questionGroups)
      : updated;
    this._dispatchFilterChange();
  }

  _clearAll(): void {
    this._selection = new Map();
    this._matchedSpecies = [];
    this._matchedCount = 0;
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

  /** Count how many character states are selected within a single question. */
  _selectionCountForQuestion(question: string, chars: Character[]): number {
    const ids = this._selection.get(question);
    if (!ids) return 0;
    let count = 0;
    for (const char of chars) {
      if (ids.has(char.id)) count++;
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // Event dispatch
  // ---------------------------------------------------------------------------

  _dispatchFilterChange(): void {
    if (!this._keyMatrix || !this._questionGroups) {
      // matrix not yet loaded — dispatch placeholder (Phase 41 behavior preserved)
      this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
        bubbles: true,
        detail: { matchedSlugs: [], count: 0, hasSelection: this._hasSelection() },
      }));
      return;
    }
    const { matchedSlugs, count } = computeMatching(
      this._keyMatrix, this._selection, this._questionGroups
    );
    const matchedSlugSet = new Set(matchedSlugs);
    this._matchedSpecies = this._keyMatrix.species.filter(s => matchedSlugSet.has(s.slug));
    this._matchedCount = count;
    this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
      bubbles: true,
      detail: { matchedSlugs, count, hasSelection: this._hasSelection() },
    }));
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  _renderQuestion(question: string, chars: Character[]): TemplateResult {
    const expanded = this._expandedQuestions.has(question);
    const selCount = this._selectionCountForQuestion(question, chars);
    return html`
      <fieldset class="pnwm-kfp-question">
        <legend>
          <button
            type="button"
            aria-expanded="${expanded}"
            @click=${() => this._toggleQuestion(question)}
          >${question}${selCount > 0 ? html` <span class="pnwm-kfp-badge">(${selCount})</span>` : ''}</button>
        </legend>
        <div ?hidden=${!expanded}>
        ${chars.map(char => {
          const selected = this._selection.get(question)?.has(char.id) ?? false;
          const img = char.image_filename;
          return html`<label>
            <input
              type="checkbox"
              .checked=${selected}
              @change=${(e: Event) => this._onCheckboxChange(question, char.id, (e.target as HTMLInputElement).checked)}
            >
            ${char.state}
          </label>
          ${img ? html`<details class="pnwm-kfp-help">
            <summary>ⓘ illustration</summary>
            <a
              class="pnwm-kfp-help-zoom"
              href="${characterImageSrc(img)}"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View full-size illustration of ${char.state}"
            >
              <img
                src="${characterImageSrc(img)}"
                alt="${helpImageAlt(char.state, char.alt_text)}"
                loading="lazy"
                decoding="async"
              >
              <span class="pnwm-kfp-help-zoom-hint">View full size ↗</span>
            </a>
          </details>` : ''}`;
        })}
        </div>
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
          ${[...questions.entries()]
            .filter(([q]) => !this._questionGroups
              || isQuestionVisible(q, this._selection, this._questionGroups))
            .map(([q, chars]) => this._renderQuestion(q, chars))}
        </div>
      </div>`;
  }

  render(): TemplateResult {
    return html`
      <div class="pnwm-identify-layout">
        <aside class="pnwm-identify-panel">
          ${this._hasSelection() ? html`
            <div class="pnwm-kfp-sticky">
              <button type="button" @click=${() => this._clearAll()}>Clear all</button>
            </div>` : ''}
          ${[...this._categoryMap.entries()].map(([catName, questions]) =>
            this._renderCategory(catName, questions)
          )}
        </aside>
        <div class="pnwm-identify-grid-area">
          <key-results-grid
            .matchedSpecies=${this._matchedSpecies}
            .hasSelection=${this._hasSelection()}
            .matchedCount=${this._matchedCount}
            .totalCount=${this._keyMatrix?.meta.matchedSpecies ?? 1192}
            .pathPrefix=${this._prefix}
            @pnwm-key-clear-all=${() => this._clearAll()}
          ></key-results-grid>
        </div>
      </div>`;
  }
}

customElements.define('pnwm-identify', PnwmIdentify);
