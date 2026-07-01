import { LitElement, html, css, type CSSResult, type TemplateResult, type PropertyValues } from 'lit';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
);

interface DayEntry { path: string; count: number }
interface DaySummary {
  date: string;
  total_requests: number;
  total_pageviews: number;
  total_bytes: number;
  pageviews: DayEntry[];
  requests_by_hour: number[];
  referrers: Array<{ domain: string; count: number }>;
  countries: Array<{ code: string; count: number }>;
}
interface AnalyticsData {
  days: DaySummary[];
  rolling30: {
    total_requests: number;
    total_pageviews: number;
    total_bytes: number;
    top_pages: DayEntry[];
    top_referrers: Array<{ domain: string; count: number }>;
    top_countries: Array<{ code: string; count: number }>;
    requests_by_hour: number[];
  };
}

const ACCENT = '#0172ad';
const ACCENT_LIGHT = 'rgba(1, 114, 173, 0.15)';

class PnwmAnalyticsDashboard extends LitElement {
  static get properties() {
    return { _data: { attribute: false, state: true } };
  }

  static get styles(): CSSResult {
    return css`
      :host { display: block; }
      .chart-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        margin-top: 1rem;
      }
      @media (min-width: 768px) {
        .chart-grid { grid-template-columns: 1fr 1fr; }
        .full-width { grid-column: 1 / -1; }
      }
      .chart-card {
        border: 1px solid var(--pico-muted-border-color, #ccc);
        border-radius: 8px;
        padding: 1rem;
      }
      .chart-card h3 { margin-top: 0; font-size: 1rem; }
      canvas { max-width: 100%; }
      table { width: 100%; font-size: 0.9rem; }
      th { text-align: left; }
      td:last-child, th:last-child { text-align: right; }
    `;
  }

  _data: AnalyticsData | null = null;
  _charts: Chart[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    const el = document.getElementById('analytics-data');
    if (el?.textContent) {
      try {
        this._data = JSON.parse(el.textContent);
      } catch { /* noscript fallback handles this */ }
    }
  }

  render(): TemplateResult {
    if (!this._data || this._data.days.length === 0) {
      return html`<p>No analytics data available.</p>`;
    }
    const r30 = this._data.rolling30;
    return html`
      <div class="chart-grid">
        <div class="chart-card full-width">
          <h3>Daily Pageviews</h3>
          <canvas id="chart-daily"></canvas>
        </div>
        <div class="chart-card">
          <h3>Requests by Hour (UTC)</h3>
          <canvas id="chart-hourly"></canvas>
        </div>
        <div class="chart-card">
          <h3>Top Countries</h3>
          <canvas id="chart-countries"></canvas>
        </div>
        <div class="chart-card">
          <h3>Top Referrers</h3>
          ${this._renderTable(r30.top_referrers.slice(0, 15), 'Domain', 'domain')}
        </div>
        <div class="chart-card">
          <h3>Top Pages</h3>
          ${this._renderTable(r30.top_pages.slice(0, 20), 'Path', 'path')}
        </div>
      </div>
    `;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _renderTable(items: any[], labelHeader: string, labelKey: string): TemplateResult {
    return html`
      <table>
        <thead><tr><th>${labelHeader}</th><th>Hits</th></tr></thead>
        <tbody>
          ${items.map((item) => html`
            <tr><td>${item[labelKey]}</td><td>${item['count']}</td></tr>
          `)}
        </tbody>
      </table>
    `;
  }

  updated(changed: PropertyValues): void {
    if (changed.has('_data') && this._data) {
      // Wait for shadow DOM to settle
      requestAnimationFrame(() => this._renderCharts());
    }
  }

  _renderCharts(): void {
    this._destroyCharts();
    if (!this._data) return;

    const days = [...this._data.days].reverse(); // chronological
    const r30 = this._data.rolling30;

    // Daily pageviews (line chart)
    const dailyCanvas = this.shadowRoot?.getElementById('chart-daily') as HTMLCanvasElement | null;
    if (dailyCanvas) {
      const config: ChartConfiguration<'line', number[], string> = {
        type: 'line',
        data: {
          labels: days.map((d) => d.date.slice(5)), // MM-DD
          datasets: [{
            data: days.map((d) => d.total_pageviews),
            borderColor: ACCENT,
            backgroundColor: ACCENT_LIGHT,
            fill: true,
            tension: 0.3,
            pointRadius: days.length > 14 ? 0 : 3,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Pageviews' } },
          },
        },
      };
      this._charts.push(new Chart(dailyCanvas, config));
    }

    // Hourly distribution (bar)
    const hourlyCanvas = this.shadowRoot?.getElementById('chart-hourly') as HTMLCanvasElement | null;
    if (hourlyCanvas) {
      const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
          labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          datasets: [{
            data: r30.requests_by_hour,
            backgroundColor: ACCENT,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      };
      this._charts.push(new Chart(hourlyCanvas, config));
    }

    // Countries (horizontal bar)
    const countriesCanvas = this.shadowRoot?.getElementById('chart-countries') as HTMLCanvasElement | null;
    if (countriesCanvas) {
      const top = r30.top_countries.slice(0, 15);
      const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
          labels: top.map((c) => c.code),
          datasets: [{
            data: top.map((c) => c.count),
            backgroundColor: ACCENT,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } },
        },
      };
      this._charts.push(new Chart(countriesCanvas, config));
    }
  }

  _destroyCharts(): void {
    for (const chart of this._charts) chart.destroy();
    this._charts = [];
  }

  disconnectedCallback(): void {
    this._destroyCharts();
    super.disconnectedCallback();
  }
}

customElements.define('pnwm-analytics-dashboard', PnwmAnalyticsDashboard);
