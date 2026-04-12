import { LitElement, html, css } from 'lit';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { loadParquet, filterRecords, aggregateByMonth } from './parquet-cache.js';

// Register only what's needed (tree-shakeable pattern)
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

class PnwmPhenologyChart extends LitElement {
  static get properties() {
    return {
      slug: { type: String },
      filters: { attribute: false },
      _records: { attribute: false, state: true },
      _loading: { type: Boolean, state: true },
    };
  }

  static get styles() {
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

  constructor() {
    super();
    this.slug = '';
    this.filters = null;
    this._records = [];
    this._loading = true;
    this._chart = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    if (this.slug) {
      try {
        const records = await loadParquet(this.slug);
        this._records = records;
        this._loading = false;
      } catch (err) {
        this._records = [];
        this._loading = false;
      }
    } else {
      this._loading = false;
    }
  }

  render() {
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
    if (visible.length === 0) {
      return html`<p style="color:var(--pico-muted-color)">No records match the current filters.</p>`;
    }

    return html`
      <div class="chart-container" role="img" aria-label="Phenology chart for ${this.slug}">
        <canvas></canvas>
      </div>
    `;
  }

  updated(changed) {
    if (changed.has('_records') || changed.has('filters')) {
      const canvas = this.shadowRoot && this.shadowRoot.querySelector('canvas');
      if (canvas) {
        this._renderChart(canvas);
      }
    }
  }

  _renderChart(canvas) {
    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    const counts = aggregateByMonth(visible);

    if (this._chart) {
      this._chart.data.datasets[0].data = counts;
      this._chart.update();
    } else {
      this._chart = new Chart(canvas, {
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
        },
      });
    }
  }

  disconnectedCallback() {
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
    super.disconnectedCallback();
  }
}

customElements.define('pnwm-phenology-chart', PnwmPhenologyChart);
