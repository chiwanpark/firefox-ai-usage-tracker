const CACHE_KEY = "usageCache";

export async function readCache() {
  const stored = await browser.storage.local.get(CACHE_KEY);

  return stored[CACHE_KEY] ?? {};
}

export async function writeCache(cache) {
  await browser.storage.local.set({ [CACHE_KEY]: cache });
}

export function mergeEntry(previous, provider) {
  if (provider.state === "ok") {
    return { provider, fetchedAt: Date.now(), error: null };
  }

  if (previous?.provider?.state !== "ok") {
    return { provider, fetchedAt: Date.now(), error: null };
  }

  return {
    ...previous,
    error: { state: provider.state, message: provider.message },
  };
}
