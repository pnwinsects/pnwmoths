// Minimal declarations for the synchronous Nunjucks API used by template tests.
// Nunjucks ships no types; keep this boundary typed like the Eleventy API shim.
declare module 'nunjucks' {
  export class FileSystemLoader {
    constructor(searchPaths?: string | string[]);
  }

  export class Environment {
    constructor(loader?: FileSystemLoader, options?: { autoescape?: boolean });
    addFilter<Args extends unknown[]>(
      name: string,
      filter: (...args: Args) => unknown,
    ): this;
    renderString(template: string, context: object): string;
  }
}
