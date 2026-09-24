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

export function withSearch(
  href: URL | string,
  search: Record<string, (string | undefined)>,
) {
  // Copy, so the caller's URL (often `$global.url`) is left unchanged.
  const url = new URL(href, "http://marko.app");
  for (const key in search) {
    const value = search[key];
    if (value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url.pathname + url.search + url.hash;
}
