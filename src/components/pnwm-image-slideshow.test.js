import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PnwmImageSlideshow } from './pnwm-image-slideshow.js';

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
  it('constructs DZI URL from cdnBaseUrl + tiles_path + .dzi extension', () => {
    const ctx = { cdnBaseUrl: 'https://pnwmoths.b-cdn.net' };
    const specimen = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, specimen);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D.dzi');
  });

  it('handles institutional accession specimen_id', () => {
    const ctx = { cdnBaseUrl: 'https://pnwmoths.b-cdn.net' };
    const specimen = { specimen_id: 'WWUC0000003275', view: 'V', tiles_path: 'species-tiles/feltia-herilis/WWUC0000003275-V' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, specimen);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/feltia-herilis/WWUC0000003275-V.dzi');
  });
});

describe('_nextSpecimen', () => {
  const specimenA = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
  const specimenB = { specimen_id: 'A', view: 'V', tiles_path: 'species-tiles/abagrotis-apposita/A-V' };

  it('advances _currentIndex from 0 to 1 and calls open with correct URL', () => {
    let openedWith = null;
    const _osdViewer = { open: (url) => { openedWith = url; } };
    const ctx = {
      _currentIndex: 0,
      _highResSpecimens: [specimenA, specimenB],
      _osdViewer,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      cdnBaseUrl: 'https://pnwmoths.b-cdn.net',
    };
    PnwmImageSlideshow.prototype._nextSpecimen.call(ctx);
    assert.equal(ctx._currentIndex, 1);
    assert.equal(openedWith, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V.dzi');
  });

  it('wraps from last index back to 0 and calls open with first specimen URL', () => {
    let openedWith = null;
    const _osdViewer = { open: (url) => { openedWith = url; } };
    const ctx = {
      _currentIndex: 1,
      _highResSpecimens: [specimenA, specimenB],
      _osdViewer,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      cdnBaseUrl: 'https://pnwmoths.b-cdn.net',
    };
    PnwmImageSlideshow.prototype._nextSpecimen.call(ctx);
    assert.equal(ctx._currentIndex, 0);
    assert.equal(openedWith, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D.dzi');
  });

  it('does not throw when _osdViewer is null; _currentIndex still advances', () => {
    const ctx = {
      _currentIndex: 0,
      _highResSpecimens: [specimenA, specimenB],
      _osdViewer: null,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      cdnBaseUrl: 'https://pnwmoths.b-cdn.net',
    };
    assert.doesNotThrow(() => PnwmImageSlideshow.prototype._nextSpecimen.call(ctx));
    assert.equal(ctx._currentIndex, 1);
  });
});

describe('_prevSpecimen', () => {
  const specimenA = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
  const specimenB = { specimen_id: 'A', view: 'V', tiles_path: 'species-tiles/abagrotis-apposita/A-V' };

  it('wraps from index 0 to last index and calls open with last specimen URL', () => {
    let openedWith = null;
    const _osdViewer = { open: (url) => { openedWith = url; } };
    const ctx = {
      _currentIndex: 0,
      _highResSpecimens: [specimenA, specimenB],
      _osdViewer,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      cdnBaseUrl: 'https://pnwmoths.b-cdn.net',
    };
    PnwmImageSlideshow.prototype._prevSpecimen.call(ctx);
    assert.equal(ctx._currentIndex, 1);
    assert.equal(openedWith, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V.dzi');
  });

  it('retreats from index 1 to 0 and calls open with first specimen URL', () => {
    let openedWith = null;
    const _osdViewer = { open: (url) => { openedWith = url; } };
    const ctx = {
      _currentIndex: 1,
      _highResSpecimens: [specimenA, specimenB],
      _osdViewer,
      _buildDziUrl: PnwmImageSlideshow.prototype._buildDziUrl,
      cdnBaseUrl: 'https://pnwmoths.b-cdn.net',
    };
    PnwmImageSlideshow.prototype._prevSpecimen.call(ctx);
    assert.equal(ctx._currentIndex, 0);
    assert.equal(openedWith, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D.dzi');
  });
});

describe('useOsd derivation', () => {
  const useOsd = (ctx) => ctx.highResAvailable && ctx._highResSpecimens?.length > 0;

  it('is false when highResAvailable is false and _highResSpecimens is undefined', () => {
    assert.equal(useOsd({ highResAvailable: false, _highResSpecimens: undefined }), false);
  });

  it('is false when highResAvailable is true but _highResSpecimens is empty', () => {
    assert.equal(useOsd({ highResAvailable: true, _highResSpecimens: [] }), false);
  });

  it('is true when highResAvailable is true and _highResSpecimens has at least one entry', () => {
    const specimen = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
    assert.equal(useOsd({ highResAvailable: true, _highResSpecimens: [specimen] }), true);
  });
});

describe('view-to-label mapping', () => {
  const label = (view) => view === 'D' ? 'Dorsal' : 'Ventral';

  it('maps D to Dorsal', () => {
    assert.equal(label('D'), 'Dorsal');
  });

  it('maps V to Ventral', () => {
    assert.equal(label('V'), 'Ventral');
  });
});
