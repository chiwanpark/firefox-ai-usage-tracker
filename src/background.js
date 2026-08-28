import { mergeEntry, readCache, writeCache } from "./cache.js";
import { PROVIDERS } from "./providers/index.js";
import {
  getGeneralSettings,
  getProviderSettings,
  isAccountEnabled,
  isProviderEnabled,
} from "./settings.js";

const ALARM_NAME = "refresh-usage";

let refreshing = null;
let writeQueue = Promise.resolve();

function broadcast(message) {
  browser.runtime.sendMessage(message).catch(() => {});
}

function placeholder({ id, name }) {
  return { provider: { id, name, state: "loading" }, fetchedAt: null, error: null };
}

function enabledProviders(settings) {
  return PROVIDERS.filter((descriptor) => isProviderEnabled(settings, descriptor.id));
}

function visibleEntry(entry, settings) {
  const { provider } = entry;

  if (provider.state !== "ok" || !Array.isArray(provider.accounts)) {
    return entry;
  }

  const accounts = provider.accounts.filter((account) =>
    isAccountEnabled(settings, provider.id, account.id),
  );

  if (accounts.length === provider.accounts.length) {
    return entry;
  }

  if (accounts.length === 0) {
    return {
      ...entry,
      provider: {
        ...provider,
        state: "empty",
        message: "All organizations are hidden.",
        accounts: [],
      },
    };
  }

  return { ...entry, provider: { ...provider, accounts } };
}

async function snapshot() {
  const [cache, settings] = await Promise.all([readCache(), getProviderSettings()]);

  return {
    entries: enabledProviders(settings).map((descriptor) =>
      visibleEntry(cache[descriptor.id] ?? placeholder(descriptor), settings),
    ),
  };
}

function queueWrite(id, provider) {
  const result = writeQueue.then(async () => {
    const cache = await readCache();
    const entry = mergeEntry(cache[id], provider);

    await writeCache({ ...cache, [id]: entry });

    return entry;
  });

  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

async function refreshProvider(descriptor, settings) {
  let provider;

  try {
    provider = await descriptor.fetchUsage();
  } catch {
    provider = {
      id: descriptor.id,
      name: descriptor.name,
      state: "error",
      message: "Unexpected error.",
    };
  }

  const entry = await queueWrite(descriptor.id, provider);

  broadcast({ type: "usageUpdated", entry: visibleEntry(entry, settings) });

  return entry;
}

function refreshAll() {
  refreshing ??= getProviderSettings()
    .then((settings) =>
      Promise.all(
        enabledProviders(settings).map((descriptor) => refreshProvider(descriptor, settings)),
      ),
    )
    .finally(() => {
      refreshing = null;
      broadcast({ type: "refreshDone" });
    });

  return refreshing;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "getUsage") {
    return snapshot();
  }

  if (message?.type === "refreshUsage") {
    refreshAll();
    return Promise.resolve({ started: true });
  }

  return undefined;
});

async function applyAlarm() {
  const { refreshMinutes } = await getGeneralSettings();

  await browser.alarms.clear(ALARM_NAME);

  if (refreshMinutes > 0) {
    browser.alarms.create(ALARM_NAME, { periodInMinutes: refreshMinutes });
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  if (changes.general) {
    applyAlarm();
  }

  if (changes.providers) {
    broadcast({ type: "providersChanged" });
    refreshAll();
  }
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshAll();
  }
});

browser.runtime.onStartup.addListener(refreshAll);
browser.runtime.onInstalled.addListener(refreshAll);
browser.permissions.onAdded.addListener(refreshAll);

applyAlarm();
