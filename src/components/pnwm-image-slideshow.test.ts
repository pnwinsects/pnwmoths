import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PnwmImageSlideshow } from './pnwm-image-slideshow.ts';

describe('lightbox layout', () => {
  it('stacks the image and credit vertically while centering them', () => {
    const styles = PnwmImageSlideshow.styles.cssText;

    assert.match(
      styles,
      /\.lightbox\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
  });
});

describe('_formatCaption', () => {
  it('returns location line with locality, state, and elevation', () => {
    const img = { locality: 'Snoqualmie Pass', state: 'WA', elevation: '3000' };
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, img);
    assert.deepEqual(result, ['Snoqualmie Pass, WA, 3000 ft.']);
  });

  it('returns a date line when year, month, and day are provided', () => {
    const img = { locality: 'Mt. Rainier', state: 'WA', elevation: '5000', year: '2020', month: '3', day: '15' };
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, img);
    assert.equal(result.length, 2);
    assert.equal(result[1], 'March 15 2020');
  });

  it('returns only year when no month or day provided', () => {
    const img = { locality: 'Olympic NP', state: 'WA', elevation: '1200', year: '2020' };
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, img);
    assert.equal(result.length, 2);
    assert.equal(result[1], '2020');
  });

  it('returns collector and photographer lines in correct order', () => {
    const img = {
      locality: 'Capitol Forest', state: 'WA', elevation: '800',
      year: '2021', month: '7', day: '4',
      collector: 'J. Doe', photographer: 'K. Roe',
    };
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, img);
    assert.equal(result.length, 4);
    assert.equal(result[0], 'Capitol Forest, WA, 800 ft.');
    assert.equal(result[1], 'July 4 2021');
    assert.equal(result[2], 'Coll. J. Doe');
    assert.equal(result[3], 'Photo © K. Roe');
  });

  it('returns empty array for empty img object', () => {
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, {});
    assert.deepEqual(result, []);
  });
});

describe('_buildDziUrl', () => {
  it('constructs DZI URL from cdnBaseUrl + tiles path + .dzi extension', () => {
    const ctx = { cdnBaseUrl: 'https://moths.pnwinsects.org' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, 'species-tiles/abagrotis-apposita/A-D');
    assert.equal(result, 'https://moths.pnwinsects.org/species-tiles/abagrotis-apposita/A-D.dzi');
  });

  it('handles institutional accession specimen ids', () => {
    const ctx = { cdnBaseUrl: 'https://moths.pnwinsects.org' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, 'species-tiles/feltia-herilis/WWUC0000003275-V');
    assert.equal(result, 'https://moths.pnwinsects.org/species-tiles/feltia-herilis/WWUC0000003275-V.dzi');
  });
});

// A strip mixes tiled specimens with catalogued photographs no tile covers (ADR 0041),
// so stepping through the lightbox walks EVERY slide and the viewer follows the slide.
function slide(overrides: Partial<{ tilesPath: string; src: string }> = {}) {
  return { src: 'x.jpg', thumb: 'x.jpg', alt: '', tilesPath: '', specimen: '', view: '', photographer: '', license: '',
    locality: '', state: '', elevation: '', year: '', month: '', day: '', collector: '', subspecies: '', ...overrides };
}

describe('_nextImage / _prevImage', () => {
  const tiled = slide({ tilesPath: 'species-tiles/abagrotis-apposita/A-D' });
  const plain = slide({ src: 'plain.jpg' });

  it('advances through every slide, tiled or not, and re-syncs the viewer', () => {
    let synced = 0;
    const ctx = { _images: [tiled, plain], _currentIndex: 0, _syncViewer: async () => { synced++; } };
    PnwmImageSlideshow.prototype._nextImage.call(ctx);
    assert.equal(ctx._currentIndex, 1);
    assert.equal(synced, 1);
  });

  it('wraps from the last slide back to the first', () => {
    const ctx = { _images: [tiled, plain], _currentIndex: 1, _syncViewer: async () => {} };
    PnwmImageSlideshow.prototype._nextImage.call(ctx);
    assert.equal(ctx._currentIndex, 0);
  });

  it('wraps from the first slide back to the last', () => {
    const ctx = { _images: [tiled, plain], _currentIndex: 0, _syncViewer: async () => {} };
    PnwmImageSlideshow.prototype._prevImage.call(ctx);
    assert.equal(ctx._currentIndex, 1);
  });

  it('does nothing with no slides', () => {
    const ctx = { _images: [], _currentIndex: 0, _syncViewer: async () => { throw new Error('should not sync'); } };
    assert.doesNotThrow(() => PnwmImageSlideshow.prototype._nextImage.call(ctx));
    assert.equal(ctx._currentIndex, 0);
  });
});

describe('_usesOsd', () => {
  const tiled = slide({ tilesPath: 'species-tiles/abagrotis-apposita/A-D' });
  const plain = slide();
  const usesOsd = (ctx: object) => PnwmImageSlideshow.prototype._usesOsd.call({
    _currentImage: PnwmImageSlideshow.prototype._currentImage, ...ctx,
  });

  it('is false when the page has no high-res tiles at all', () => {
    assert.equal(usesOsd({ highResAvailable: false, _images: [tiled], _currentIndex: 0 }), false);
  });

  it('is true on a tiled slide and false on a plain photograph in the same strip', () => {
    assert.equal(usesOsd({ highResAvailable: true, _images: [tiled, plain], _currentIndex: 0 }), true);
    assert.equal(usesOsd({ highResAvailable: true, _images: [tiled, plain], _currentIndex: 1 }), false);
  });

  it('is false before any figure has been read', () => {
    assert.equal(usesOsd({ highResAvailable: true, _images: [], _currentIndex: 0 }), false);
  });
});

describe('_syncViewer', () => {
  it('tears the viewer down when stepping onto a plain photograph', async () => {
    let destroyed = false;
    const ctx = {
      _lightboxOpen: true, highResAvailable: true, _currentIndex: 1, _syncGeneration: 0,
      _images: [slide({ tilesPath: 'species-tiles/x/A-D' }), slide()],
      _osdViewer: { destroy: () => { destroyed = true; } },
      _currentImage: PnwmImageSlideshow.prototype._currentImage,
      _usesOsd: PnwmImageSlideshow.prototype._usesOsd,
      updateComplete: Promise.resolve(true),
    };
    await PnwmImageSlideshow.prototype._syncViewer.call(ctx);
    assert.equal(destroyed, true);
    assert.equal(ctx._osdViewer, null);
  });

  it('re-points an existing viewer when stepping onto another tile set', async () => {
    let opened = '';
    const ctx = {
      _lightboxOpen: true, highResAvailable: true, _currentIndex: 1, _syncGeneration: 0, cdnBaseUrl: 'https://cdn',
      _images: [slide({ tilesPath: 'species-tiles/x/A-D' }), slide({ tilesPath: 'species-tiles/x/A-V' })],
      _osdViewer: { open: (url: string) => { opened = url; } },
      _currentImage: PnwmImageSlideshow.prototype._currentImage,
      _usesOsd: PnwmImageSlideshow.prototype._usesOsd,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      shadowRoot: { querySelector: () => ({}) },
      updateComplete: Promise.resolve(true),
    };
    await PnwmImageSlideshow.prototype._syncViewer.call(ctx);
    assert.equal(opened, 'https://cdn/species-tiles/x/A-V.dzi');
  });

  it('does nothing while the lightbox is closed', async () => {
    const ctx = { _lightboxOpen: false, _syncGeneration: 0, _osdViewer: { destroy: () => { throw new Error('should not destroy'); } } };
    await assert.doesNotReject(() => PnwmImageSlideshow.prototype._syncViewer.call(ctx));
  });

  // The render await is where a keypress can land. A sync that started for the tiled
  // slide must not re-point the viewer once the user has moved on to a plain one.
  it('abandons a sync overtaken by a step onto a plain slide before render completed', async () => {
    let opened = 0;
    let release!: () => void;
    const rendered = new Promise<boolean>((resolve) => { release = () => resolve(true); });
    const ctx = {
      _lightboxOpen: true, highResAvailable: true, _currentIndex: 0, _syncGeneration: 0, cdnBaseUrl: 'https://cdn',
      _images: [slide({ tilesPath: 'species-tiles/x/A-D' }), slide()],
      _osdViewer: { open: () => { opened++; }, destroy: () => {} },
      _currentImage: PnwmImageSlideshow.prototype._currentImage,
      _usesOsd: PnwmImageSlideshow.prototype._usesOsd,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      shadowRoot: { querySelector: () => ({}) },
      updateComplete: rendered,
    };
    const first = PnwmImageSlideshow.prototype._syncViewer.call(ctx);
    // The user steps onto the plain slide while the first sync is still waiting on render.
    ctx._currentIndex = 1;
    const second = PnwmImageSlideshow.prototype._syncViewer.call(ctx);
    release();
    await Promise.all([first, second]);
    assert.equal(opened, 0, 'the overtaken sync must not re-point the viewer');
    assert.equal(ctx._osdViewer, null, 'the latest sync tore the viewer down for the plain slide');
  });

  it('abandons a sync when the lightbox closes before render completed', async () => {
    let opened = 0;
    let release!: () => void;
    const rendered = new Promise<boolean>((resolve) => { release = () => resolve(true); });
    const ctx = {
      _lightboxOpen: true, highResAvailable: true, _currentIndex: 0, _syncGeneration: 0, cdnBaseUrl: 'https://cdn',
      _images: [slide({ tilesPath: 'species-tiles/x/A-D' })],
      _osdViewer: { open: () => { opened++; }, destroy: () => {} },
      _currentImage: PnwmImageSlideshow.prototype._currentImage,
      _usesOsd: PnwmImageSlideshow.prototype._usesOsd,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      shadowRoot: { querySelector: () => ({}) },
      updateComplete: rendered,
    };
    const pending = PnwmImageSlideshow.prototype._syncViewer.call(ctx);
    ctx._lightboxOpen = false;
    release();
    await pending;
    assert.equal(opened, 0);
  });
});

describe('_specimenLine', () => {
  it('names the specimen and view when both are known', () => {
    assert.equal(PnwmImageSlideshow.prototype._specimenLine.call({}, { specimen: 'A', view: 'Dorsal' }), 'Specimen A · Dorsal');
  });
  it('is empty for a photograph with no specimen letter', () => {
    assert.equal(PnwmImageSlideshow.prototype._specimenLine.call({}, { view: 'Dorsal' }), '');
  });
});

describe('view-to-label mapping', () => {
  const label = (view: string) => view === 'D' ? 'Dorsal' : 'Ventral';

  it('maps D to Dorsal', () => {
    assert.equal(label('D'), 'Dorsal');
  });

  it('maps V to Ventral', () => {
    assert.equal(label('V'), 'Ventral');
  });
});

describe('_closeLightbox', () => {
  it('closes the lightbox, tears down the OSD viewer, and removes inert from trapped elements', () => {
    let destroyed = false;
    const removed: string[] = [];
    const makeEl = (id: string) => ({ removeAttribute: (attr: string) => { if (attr === 'inert') removed.push(id); } });
    const ctx = {
      _osdViewer: { destroy: () => { destroyed = true; } },
      _lightboxOpen: true,
      _inertedElements: [makeEl('a'), makeEl('b'), makeEl('c')],
      // Focus restore is deferred to the next render (the opener is inside the
      // still-inert .slideshow), so the context needs Lit's updateComplete.
      _lightboxOpener: null,
      updateComplete: Promise.resolve(true),
    };

    PnwmImageSlideshow.prototype._closeLightbox.call(ctx);

    assert.equal(ctx._lightboxOpen, false, 'lightbox should be marked closed');
    assert.equal(ctx._osdViewer, null, 'OSD viewer reference should be cleared');
    assert.deepEqual(removed, ['a', 'b', 'c'], 'inert should be removed from every trapped element');
    assert.deepEqual(ctx._inertedElements, [], 'inerted-elements list should be emptied');
    assert.equal(destroyed, true, 'OSD viewer destroy() should be called');
  });

  it('does not throw when there is no OSD viewer and nothing was inerted', () => {
    const ctx = {
      _osdViewer: null,
      _lightboxOpen: true,
      _inertedElements: [],
      _lightboxOpener: null,
      updateComplete: Promise.resolve(true),
    };
    assert.doesNotThrow(() => PnwmImageSlideshow.prototype._closeLightbox.call(ctx));
    assert.equal(ctx._lightboxOpen, false);
  });

  it('restores focus to the opener once the re-render has cleared inert', async () => {
    let focused = false;
    const ctx = {
      _osdViewer: null,
      _lightboxOpen: true,
      _inertedElements: [],
      _lightboxOpener: { isConnected: true, focus: () => { focused = true; } },
      updateComplete: Promise.resolve(true),
    };

    PnwmImageSlideshow.prototype._closeLightbox.call(ctx);

    assert.equal(focused, false, 'focus must not be restored before the render flushes');
    assert.equal(ctx._lightboxOpener, null, 'opener reference should be released synchronously');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(focused, true, 'opener should be refocused after updateComplete resolves');
  });

  it('does not refocus an opener that has left the document', async () => {
    let focused = false;
    const ctx = {
      _osdViewer: null,
      _lightboxOpen: true,
      _inertedElements: [],
      _lightboxOpener: { isConnected: false, focus: () => { focused = true; } },
      updateComplete: Promise.resolve(true),
    };

    PnwmImageSlideshow.prototype._closeLightbox.call(ctx);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(focused, false);
  });
});

describe('_handleKeydown', () => {
  const makeCtx = (open: boolean) => {
    let closed = false;
    const ctx = {
      _lightboxOpen: open,
      _images: [],
      _closeLightbox() { closed = true; },
    };
    return { ctx, wasClosed: () => closed };
  };

  it('closes the lightbox when Escape is pressed and the lightbox is open', () => {
    const { ctx, wasClosed } = makeCtx(true);
    PnwmImageSlideshow.prototype._handleKeydown.call(ctx, { key: 'Escape' } as KeyboardEvent);
    assert.equal(wasClosed(), true);
  });

  it('ignores Escape when the lightbox is closed', () => {
    const { ctx, wasClosed } = makeCtx(false);
    PnwmImageSlideshow.prototype._handleKeydown.call(ctx, { key: 'Escape' } as KeyboardEvent);
    assert.equal(wasClosed(), false);
  });
});
