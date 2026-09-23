// The patch router Marko Run installs in the app template. Its virtual id
// resolves to @marko/run's own runtime, which ships no declaration for it.
declare module 'virtual:marko-run/runtime/patch' {
  /** Warms a page of this app with the request its link would send. */
  export function prefetch(href: string | URL): Promise<void> | undefined;
  /** Navigates as a link click would; settles once the patch has applied. */
  export function navigate(href: string | URL): Promise<void>;
}
