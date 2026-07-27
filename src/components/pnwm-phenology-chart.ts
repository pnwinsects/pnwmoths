import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult, type PropertyValues } from 'lit';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import { loadParquet, filterRecords, aggregateByMonth } from './parquet-cache.ts';
import type { OccurrenceRecord, FilterChangeDetail } from '../types/index.ts';

// Register only what's needed (tree-shakeable pattern)
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class PnwmPhenologyChart extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      slug: { type: String },
      speciesName: { type: String, attribute: 'species-name' },
      filters: { attribute: false },
      _records: { attribute: false, state: true },
      _loading: { type: Boolean, state: true },
    };
  }

  static get styles(): CSSResult {
    return css`
      :host {
        display: block;
      }
      .chart-container {
        position: relative;
        min-height: 200px;
      }
      canvas {
        max-width: 100%;
      }
    `;
  }

  slug: string;
  speciesName: string;
  filters: Partial<FilterChangeDetail> | null;
  _records: OccurrenceRecord[];
  _loading: boolean;
  _chart: Chart | null;

  constructor() {
    super();
    this.slug = '';
    this.speciesName = '';
    this.filters = null;
    this._records = [];
    this._loading = true;
    this._chart = null;
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    if (this.slug) {
      try {
        const records = await loadParquet(this.slug);
        this._records = records;
        this._loading = false;
      } catch (_err) {
        this._records = [];
        this._loading = false;
      }
    } else {
      this._loading = false;
    }
  }

  render(): TemplateResult {
    if (this._loading) {
      // Skeleton: 12 muted placeholder bars, no animation (per UI-SPEC)
      return html`
        <div class="chart-container" aria-hidden="true" style="display:flex;align-items:flex-end;gap:4px;padding:8px;background:var(--pico-card-background-color,#f9f9f9)">
          ${MONTHS.map(() => html`
            <div style="flex:1;background:var(--pico-muted-border-color,#ccc);height:${Math.floor(Math.random() * 60 + 20)}px;border-radius:2px"></div>
          `)}
        </div>
      `;
    }

    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    return html`
      <p style="color:var(--pico-muted-color)" aria-live="polite">${visible.length} record${visible.length === 1 ? '' : 's'}</p>
      <div class="chart-container" role="img" aria-label=${this._chartLabel(visible)}>
        <canvas></canvas>
      </div>
    `;
  }

  /** Display name for the species; falls back to the slug when the attribute is absent. */
  get _displayName(): string {
    return this.speciesName || this.slug;
  }

  /**
   * Accessible name for the chart. A <canvas> exposes nothing to assistive tech,
   * so the label has to carry the data itself — previously it read only
   * "Phenology chart for virbia-ferruginosa", which conveyed neither the species
   * (a raw slug) nor a single value from the chart.
   */
  _chartLabel(visible: OccurrenceRecord[]): string {
    const counts = aggregateByMonth(visible);
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) {
      return `Phenology chart for ${this._displayName}: no records match the current filters.`;
    }
    const byMonth = counts
      .map((n, i) => `${MONTHS[i]} ${n}`)
      .join(', ');
    return `Phenology chart for ${this._displayName}: records collected per month — ${byMonth}.`;
  }

  updated(changed: PropertyValues): void {
    if (changed.has('_records') || changed.has('filters')) {
      const canvas = this.shadowRoot && this.shadowRoot.querySelector('canvas');
      if (canvas) {
        this._renderChart(canvas);
      } else if (this._chart) {
        this._chart.destroy();
        this._chart = null;
      }
    }
  }

  _renderChart(canvas: HTMLCanvasElement): void {
    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    const counts = aggregateByMonth(visible);

    if (this._chart) {
      const dataset = this._chart.data.datasets[0];
      if (dataset) {
        dataset.data = counts;
      }
      this._chart.update();
    } else {
      const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
          labels: MONTHS,
          datasets: [
            {
              data: counts,
              backgroundColor: '#0172ad', // hardcoded — CSS custom props don't work in Canvas 2D context (RESEARCH.md A2)
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Month',
              },
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: '# Records',
              },
            },
          },
        },
      };
      this._chart = new Chart(canvas, config);
    }
  }

  disconnectedCallback(): void {
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
    super.disconnectedCallback();
  }
}

customElements.define('pnwm-phenology-chart', PnwmPhenologyChart);
