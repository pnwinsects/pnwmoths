// src/types/eleventy.d.ts
// Minimal type shim for Eleventy 3 UserConfig API
// Covers exactly the methods called in eleventy.config.ts
// This file is an ambient module declaration file (no top-level exports).

interface EleventyTransformContext {
  page: { outputPath: string | false };
}

interface DataExtensionOptions {
  read: boolean;
  parser: (filePath: string) => Promise<unknown> | unknown;
}

interface EleventyConfig {
  addPlugin(plugin: unknown, options?: unknown): void;
  addFilter(name: string, fn: (this: unknown, ...args: unknown[]) => unknown): void;
  addTransform(
    name: string,
    fn: (this: EleventyTransformContext, content: string) => string
  ): void;
  addGlobalData(name: string, value: unknown): void;
  addPassthroughCopy(pathOrRecord: string | Record<string, string>, opts?: unknown): void;
  addDataExtension(extension: string, options: DataExtensionOptions): void;
  on(event: string, callback: (data: { runMode: string }) => Promise<void> | void): void;
}

declare module '@11ty/eleventy' {
  export class EleventyRenderPlugin {
    configFunction(config: EleventyConfig): void;
  }
}

declare module '@11ty/eleventy-plugin-vite' {
  import type { UserConfigExport } from 'vite';
  const EleventyVitePlugin: (eleventyConfig: EleventyConfig, options?: { viteOptions?: UserConfigExport }) => void;
  export default EleventyVitePlugin;
}
