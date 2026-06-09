// src/types/eleventy.d.ts
// Minimal type shim for Eleventy 3 UserConfig API
// Covers exactly the methods called in eleventy.config.ts

export interface EleventyTransformContext {
  page: { outputPath: string | false };
}

export interface EleventyConfig {
  addPlugin(plugin: unknown, options?: unknown): void;
  addFilter(name: string, fn: (this: unknown, ...args: unknown[]) => unknown): void;
  addTransform(
    name: string,
    fn: (this: EleventyTransformContext, content: string) => string
  ): void;
  addGlobalData(name: string, value: unknown): void;
  addPassthroughCopy(pathOrRecord: string | Record<string, string>, opts?: unknown): void;
  on(event: string, callback: (data: { runMode: string }) => Promise<void> | void): void;
}

declare module '@11ty/eleventy' {
  export class EleventyRenderPlugin {
    configFunction(config: EleventyConfig): void;
  }
}
