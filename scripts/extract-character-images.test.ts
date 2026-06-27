import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractRows } from './extract-character-images.ts';

// Minimal key.data-shaped XML: 3 states (ids 10,11,12) in document order → char_id 0,1,2.
// state 10 has one image; state 11 has two (lowest media_index wins); state 12 has none.
// Includes an XML-entity path and a non-image media_item that must be ignored.
const XML = `<?xml version='1.0' encoding='UTF-8'?>
<compiled_key>
  <tree_data><feature_tree>
    <feature_node><state_item item_id='10' item_name='Black'/></feature_node>
    <feature_node><state_item item_id='11' item_name="Doesn't blend"/></feature_node>
    <feature_node><state_item item_id='12' item_name='Washington'/></feature_node>
  </feature_tree></tree_data>
  <media_data>
    <media_item media_path='Images/Black Forewing.jpg' media_type='image' media_thumb_path='Thumbs/x.jpg'>
      <media_details item_id='10' media_index='1'/>
    </media_item>
    <media_item media_path='Images/Thorax doesn&apos;t blend.JPG' media_type='image'>
      <media_details item_id='11' media_index='2'/>
    </media_item>
    <media_item media_path='Images/Primary.jpg' media_type='image'>
      <media_details item_id='11' media_index='0'/>
    </media_item>
    <media_item media_path='http://example.com/page/' media_type='unknown'>
      <media_details item_id='12' media_index='0'/>
    </media_item>
  </media_data>
</compiled_key>`;

describe('extractRows', () => {
  it('binds states to images by item_id, char_id = state document order', () => {
    const rows = extractRows(XML);
    assert.equal(rows.length, 2, 'only states 10 and 11 have an image (12 is a URL, ignored)');
    assert.deepEqual(rows[0], { char_id: 0, image_filename: 'Black Forewing.webp', alt_text: '' });
  });

  it('picks the lowest media_index when a state has several images', () => {
    const rows = extractRows(XML);
    const r = rows.find(x => x.char_id === 1)!;
    assert.equal(r.image_filename, 'Primary.webp', 'media_index 0 wins over 2');
  });

  it('decodes XML entities and converts extension via toWebpName', () => {
    const xml = `<feature_tree><state_item item_id='5' item_name="x"/></feature_tree>
      <media_item media_path='Images/Thorax doesn&apos;t blend.JPG' media_type='image'>
        <media_details item_id='5' media_index='1'/>
      </media_item>`;
    const r = extractRows(xml)[0]!;
    assert.equal(r.image_filename, "Thorax doesn't blend.webp", 'entity decoded + .JPG→.webp');
  });

  it('emits no row for a state with no image binding', () => {
    assert.ok(!extractRows(XML).some(r => r.char_id === 2), 'state 12 (URL-only) has no image row');
  });
});
