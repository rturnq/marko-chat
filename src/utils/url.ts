export function tryGetSameOriginUrl(href: URL | string | undefined, base: URL) {
  if (href) {
    try {
      const url = new URL(href, base);
      if (url.origin === base.origin) {
        return url;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}
