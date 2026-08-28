import { mergeEntry, readCache, writeCache } from "./cache.js";
import { PROVIDERS } from "./providers/index.js";
import { getGeneralSettings } from "./settings.js";

const ALARM_NAME = "refresh-usage";

let refreshing = null;
let writeQueue = Promise.resolve();

function broadcast(message) {
  browser.runtime.sendMessage(message).catch(() => {});
}

function placeholder({ id, name }) {
  return { provider: { id, name, state: "loading" }, fetchedAt: null, error: null };
}

async function snapshot() {
  const cache = await readCache();

  return { entries: PROVIDERS.map((descriptor) => cache[descriptor.id] ?? placeholder(descriptor)) };
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

async function refreshProvider(descriptor) {
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

  broadcast({ type: "usageUpdated", entry });

  return entry;
}

function refreshAll() {
  refreshing ??= Promise.all(PROVIDERS.map(refreshProvider)).finally(() => {
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
  if (area === "local" && changes.general) {
    applyAlarm();
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
