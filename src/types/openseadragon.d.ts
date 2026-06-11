// Module augmentation for OpenSeadragon.
//
// OSD's `Viewer.open()` is typed to accept only `TileSourceSpecifier`, but at
// runtime it accepts a DZI/image URL string directly (the same string the
// constructor's `tileSources` option already accepts). The published
// `openseadragon` types omit that string overload, which previously forced an
// `as unknown as TileSourceSpecifier` cast at every `open()` call site.
//
// Declaring the missing overload here removes the cast at the source of the
// problem (the third-party type gap) rather than papering over it per-call.
import 'openseadragon';

declare module 'openseadragon' {
  interface Viewer {
    open(tileSources: string, initialPage?: number): Viewer;
  }
}
