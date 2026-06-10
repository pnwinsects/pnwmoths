import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult } from 'lit';

/**
 * Deep-zoom viewer for photographic plates using OpenSeadragon + Zoomify tiles.
 *
 * Usage:
 *   <pnwm-plate-viewer
 *     tiles-url="/pnwmoths/plates/plate-1-drepanidae/"
 *     width="2400"
 *     height="3000">
 *   </pnwm-plate-viewer>
 *
 * OpenSeadragon is dynamically imported so it only loads on pages that
 * actually contain this element (Vite code-splits it automatically).
 */
class PnwmPlateViewer extends LitElement {
  static properties: PropertyDeclarations = {
    tilesUrl: { type: String, attribute: 'tiles-url' },
    prefixUrl: { type: String, attribute: 'prefix-url' },
    width: { type: Number },
    height: { type: Number },
  };

  static styles: CSSResult = css`
    :host { display: block; }
    #viewer {
      width: 100%;
      height: 70vh;
      min-height: 400px;
      background: #111;
    }
  `;

  tilesUrl: string;
  prefixUrl: string;
  width: number;
  height: number;

  constructor() {
    super();
    this.tilesUrl = '';
    this.prefixUrl = '';
    this.width = 0;
    this.height = 0;
  }

  firstUpdated(): void {
    this._initViewer();
  }

  async _initViewer(): Promise<void> {
    const { default: OpenSeadragon } = await import('openseadragon');
    const viewerEl = this.renderRoot.querySelector<HTMLElement>('#viewer');
    if (!viewerEl) return;
    OpenSeadragon({
      element: viewerEl,
      prefixUrl: this.prefixUrl,
      // zoomifytileservice is a valid OSD tile source type at runtime;
      // the @types/openseadragon TileSourceOptions doesn't include tilesUrl so we cast
      tileSources: {
        type: 'zoomifytileservice',
        width: this.width,
        height: this.height,
        tilesUrl: this.tilesUrl,
      } as import('openseadragon').TileSourceOptions,
      visibilityRatio: 1.0,
      minZoomLevel: 0.5,
      defaultZoomLevel: 0,
      showRotationControl: false,
    });
  }

  render(): TemplateResult {
    return html`<div id="viewer"></div>`;
  }
}

customElements.define('pnwm-plate-viewer', PnwmPlateViewer);
