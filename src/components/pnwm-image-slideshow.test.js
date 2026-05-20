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
