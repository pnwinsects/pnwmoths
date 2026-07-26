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
interface RedirectMiss { from: string; count: number; referrer: string | null }
interface RedirectHits { total: number; matched: number; missed: number }
interface DaySummary {
  date: string;
  total_requests: number;
  total_pageviews: number;
  total_unique_visitors: number;
  total_bytes: number;
  pageviews: DayEntry[];
  requests_by_hour: number[];
  referrers: Array<{ domain: string; count: number }>;
  countries: Array<{ code: string; count: number }>;
}
interface AnalyticsData {
  days: DaySummary[];
  cumulative: {
    total_pageviews: number;
    total_unique_visitors: number;
    total_requests: number;
    first_date: string;
    last_date: string;
  };
  yearly_unique_visitors: Record<string, number>;
  rolling30: {
    total_requests: number;
    total_pageviews: number;
    total_unique_visitors: number;
    total_bytes: number;
    top_pages: DayEntry[];
    top_referrers: Array<{ domain: string; count: number }>;
    top_countries: Array<{ code: string; count: number }>;
    requests_by_hour: number[];
    redirect_hits?: RedirectHits;
    top_redirect_misses?: RedirectMiss[];
    top_not_found?: DayEntry[];
  };
}

const ACCENT = '#0172ad';
const ACCENT_LIGHT = 'rgba(1, 114, 173, 0.15)';
const CUMULATIVE_COLOR = '#e67e22';

class PnwmAnalyticsDashboard extends LitElement {
  static get properties() {
    return {
      _data: { attribute: false, state: true },
      _selectedYear: { attribute: false, state: true },
    };
  }

  static get styles(): CSSResult {
    return css`
      :host { display: block; }
      .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .summary-card {
        border: 1px solid var(--pico-muted-border-color, #ccc);
        border-radius: 8px;
        padding: 1rem;
        text-align: center;
      }
      .summary-card .value {
        font-size: 1.8rem;
        font-weight: bold;
        color: var(--pico-primary, #0172ad);
      }
      .summary-card .label {
        font-size: 0.85rem;
        color: var(--pico-muted-color, #666);
        margin-top: 0.25rem;
      }
      .filter-bar {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .filter-bar label {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .filter-bar select {
        padding: 0.4rem 0.8rem;
        border-radius: 4px;
        border: 1px solid var(--pico-muted-border-color, #ccc);
        font-size: 0.9rem;
      }
      .filter-info {
        font-size: 0.85rem;
        color: var(--pico-muted-color, #666);
      }
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
      .card-note {
        font-size: 0.85rem;
        color: var(--pico-muted-color, #666);
        margin: 0 0 0.75rem;
      }
      canvas { max-width: 100%; }
      table { width: 100%; font-size: 0.9rem; }
      th { text-align: left; }
      td:last-child, th:last-child { text-align: right; }
      /* Legacy-link tables carry a middle "linked from" column that should stay left-aligned. */
      td:first-child { word-break: break-all; }
    `;
  }

  _data: AnalyticsData | null = null;
  _selectedYear: string = 'all';
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

  /** Get the list of unique years present in the data. */
  _getYears(): string[] {
    if (!this._data) return [];
    const years = new Set(this._data.days.map((d) => d.date.slice(0, 4)));
    return [...years].sort().reverse();
  }

  /** Filter days by selected year (or return all). */
  _getFilteredDays(): DaySummary[] {
    if (!this._data) return [];
    if (this._selectedYear === 'all') return this._data.days;
    return this._data.days.filter((d) => d.date.startsWith(this._selectedYear));
  }

  /** Compute aggregate stats for filtered days. */
  _getFilteredStats(days: DaySummary[]): { pageviews: number; visitors: number; requests: number } {
    let pageviews = 0;
    let visitors = 0;
    let requests = 0;
    for (const day of days) {
      pageviews += day.total_pageviews;
      visitors += day.total_unique_visitors;
      requests += day.total_requests;
    }
    return { pageviews, visitors, requests };
  }

  _onYearChange(e: Event): void {
    this._selectedYear = (e.target as HTMLSelectElement).value;
  }

  render(): TemplateResult {
    if (!this._data || this._data.days.length === 0) {
      return html`<p>No analytics data available.</p>`;
    }

    const years = this._getYears();
    const filteredDays = this._getFilteredDays();
    const stats = this._getFilteredStats(filteredDays);
    const cum = this._data.cumulative;
    const isFiltered = this._selectedYear !== 'all';
    const periodLabel = isFiltered ? this._selectedYear : 'All time';

    return html`
      <div class="summary-cards">
        <div class="summary-card">
          <div class="value">${cum.total_pageviews.toLocaleString()}</div>
          <div class="label">Total Pageviews (All Time)</div>
        </div>
        <div class="summary-card">
          <div class="value">${cum.total_unique_visitors.toLocaleString()}</div>
          <div class="label">Unique Visitors (All Time)</div>
        </div>
        ${isFiltered ? html`
          <div class="summary-card">
            <div class="value">${stats.pageviews.toLocaleString()}</div>
            <div class="label">Pageviews (${this._selectedYear})</div>
          </div>
          <div class="summary-card">
            <div class="value">${(this._data!.yearly_unique_visitors[this._selectedYear] ?? stats.visitors).toLocaleString()}</div>
            <div class="label">Unique Visitors (${this._selectedYear})</div>
          </div>
        ` : ''}
      </div>

      <div class="filter-bar">
        <label for="year-filter">Time Period:</label>
        <select id="year-filter" @change=${this._onYearChange}>
          <option value="all" ?selected=${this._selectedYear === 'all'}>All Time</option>
          ${years.map((y) => html`<option value=${y} ?selected=${this._selectedYear === y}>${y}</option>`)}
        </select>
        <span class="filter-info">
          Showing ${filteredDays.length} day${filteredDays.length !== 1 ? 's' : ''}
          · ${stats.pageviews.toLocaleString()} pageviews
          ${isFiltered && this._data!.yearly_unique_visitors[this._selectedYear]
            ? html`· ${this._data!.yearly_unique_visitors[this._selectedYear]!.toLocaleString()} unique visitors`
            : stats.visitors > 0 ? html`· ${stats.visitors.toLocaleString()} visitors` : ''}
        </span>
      </div>

      <div class="chart-grid">
        <div class="chart-card full-width">
          <h3>Daily Pageviews — ${periodLabel}</h3>
          <canvas id="chart-daily"></canvas>
        </div>
        <div class="chart-card full-width">
          <h3>Cumulative Pageviews — ${periodLabel}</h3>
          <canvas id="chart-cumulative"></canvas>
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
          ${this._renderFilteredTable(filteredDays, 'referrers', 'Domain', 'domain', 15)}
        </div>
        <div class="chart-card">
          <h3>Top Pages</h3>
          ${this._renderFilteredTable(filteredDays, 'pageviews', 'Path', 'path', 20)}
        </div>
        ${this._renderLegacyLinkCards()}
      </div>
    `;
  }

  /**
   * Legacy-link maintenance cards (#181): unmapped old-site URLs that landed visitors on
   * a generic fallback, and the paths returning 404. Both are work queues — each row is
   * a mapping to add to src/_lib/legacy-redirects.ts or data/species-redirects.csv.
   *
   * Deliberately not affected by the year filter: this is the current backlog, and only
   * the rolling 30-day aggregate is shipped to the client (per-day detail would grow the
   * inlined payload without answering a question anyone asks). Rendered only when there
   * is something to show, so the dashboard stays quiet when the redirect table is doing
   * its job.
   */
  _renderLegacyLinkCards(): TemplateResult {
    const rolling = this._data?.rolling30;
    const misses = rolling?.top_redirect_misses ?? [];
    const notFound = rolling?.top_not_found ?? [];
    const hits = rolling?.redirect_hits ?? { total: 0, matched: 0, missed: 0 };

    if (misses.length === 0 && notFound.length === 0) return html``;

    return html`
      ${misses.length > 0 ? html`
        <div class="chart-card">
          <h3>Unmapped Legacy Links (Last 30 Days)</h3>
          <p class="card-note">
            ${hits.missed.toLocaleString()} of ${hits.total.toLocaleString()} old-site links
            found no specific page and fell back to Browse or the home page.
          </p>
          <table>
            <thead><tr><th>Old URL</th><th>Linked from</th><th>Hits</th></tr></thead>
            <tbody>
              ${misses.map((miss) => html`
                <tr>
                  <td>${miss.from}</td>
                  <td>${miss.referrer ?? '—'}</td>
                  <td>${miss.count.toLocaleString()}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : ''}
      ${notFound.length > 0 ? html`
        <div class="chart-card">
          <h3>Top 404s (Last 30 Days)</h3>
          <p class="card-note">Requested paths that do not exist and never reached the redirect handler.</p>
          <table>
            <thead><tr><th>Path</th><th>Hits</th></tr></thead>
            <tbody>
              ${notFound.map((nf) => html`
                <tr><td>${nf.path}</td><td>${nf.count.toLocaleString()}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  /** Build a top-N table from filtered days by aggregating a named array field. */
  _renderFilteredTable(
    days: DaySummary[],
    field: 'referrers' | 'pageviews',
    labelHeader: string,
    labelKey: string,
    limit: number,
  ): TemplateResult {
    const counts = new Map<string, number>();
    for (const day of days) {
      const items = field === 'referrers' ? day.referrers : day.pageviews;
      for (const item of items) {
        const key = (item as Record<string, unknown>)[labelKey] as string;
        const count = (item as Record<string, unknown>)['count'] as number;
        counts.set(key, (counts.get(key) ?? 0) + count);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

    return html`
      <table>
        <thead><tr><th>${labelHeader}</th><th>Hits</th></tr></thead>
        <tbody>
          ${sorted.map(([label, count]) => html`
            <tr><td>${label}</td><td>${count.toLocaleString()}</td></tr>
          `)}
        </tbody>
      </table>
    `;
  }

  updated(changed: PropertyValues): void {
    if ((changed.has('_data') || changed.has('_selectedYear')) && this._data) {
      requestAnimationFrame(() => this._renderCharts());
    }
  }

  _renderCharts(): void {
    this._destroyCharts();
    if (!this._data) return;

    const filteredDays = this._getFilteredDays();
    const days = [...filteredDays].reverse(); // chronological

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

    // Cumulative pageviews (line chart)
    const cumulativeCanvas = this.shadowRoot?.getElementById('chart-cumulative') as HTMLCanvasElement | null;
    if (cumulativeCanvas) {
      let runningTotal = 0;
      const cumulativeData = days.map((d) => {
        runningTotal += d.total_pageviews;
        return runningTotal;
      });

      const config: ChartConfiguration<'line', number[], string> = {
        type: 'line',
        data: {
          labels: days.map((d) => d.date.slice(5)),
          datasets: [{
            label: 'Cumulative Pageviews',
            data: cumulativeData,
            borderColor: CUMULATIVE_COLOR,
            backgroundColor: 'rgba(230, 126, 34, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: days.length > 14 ? 0 : 3,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Cumulative Pageviews' } },
          },
        },
      };
      this._charts.push(new Chart(cumulativeCanvas, config));
    }

    // Hourly distribution — use filtered data
    const hourlyCanvas = this.shadowRoot?.getElementById('chart-hourly') as HTMLCanvasElement | null;
    if (hourlyCanvas) {
      const hourCounts = new Array<number>(24).fill(0);
      for (const day of days) {
        for (let h = 0; h < 24; h++) {
          hourCounts[h]! += day.requests_by_hour[h] ?? 0;
        }
      }
      const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
          labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          datasets: [{
            data: hourCounts,
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

    // Countries (horizontal bar) — aggregate from filtered data
    const countriesCanvas = this.shadowRoot?.getElementById('chart-countries') as HTMLCanvasElement | null;
    if (countriesCanvas) {
      const countryCounts = new Map<string, number>();
      for (const day of days) {
        for (const c of day.countries) {
          countryCounts.set(c.code, (countryCounts.get(c.code) ?? 0) + c.count);
        }
      }
      const top = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

      const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
          labels: top.map(([code]) => code),
          datasets: [{
            data: top.map(([, count]) => count),
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
