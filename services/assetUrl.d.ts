// Vite's `?url` suffix: the import is the emitted asset's public path.
// Declared here rather than by pulling in all of `vite/client`.
declare module '*?url' {
  const src: string;
  export default src;
}
