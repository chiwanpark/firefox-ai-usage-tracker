import { toErrorState } from "./shared.js";

export const DEFAULT_STORE = { id: "firefox-default", name: null };

const STORE_HEADER = "x-usage-tracker-cookie-store";

function cookiesFor(url, storeId) {
  return browser.cookies.getAll({ url, storeId, firstPartyDomain: null });
}

function isFromExtension(details) {
  const origin = details.originUrl ?? details.documentUrl ?? "";

  return details.tabId === -1 && origin.startsWith(browser.runtime.getURL(""));
}

async function injectStoreCookies(details) {
  const headers = details.requestHeaders ?? [];
  const marker = headers.find((header) => header.name.toLowerCase() === STORE_HEADER);

  if (!marker) {
    return {};
  }

  const rest = headers.filter((header) => header !== marker);

  if (!isFromExtension(details)) {
    return { requestHeaders: rest };
  }

  const requestHeaders = rest.filter((header) => header.name.toLowerCase() !== "cookie");

  try {
    const cookies = await cookiesFor(details.url, marker.value);

    if (cookies.length > 0) {
      requestHeaders.push({
        name: "Cookie",
        value: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      });
    }
  } catch {
    return { requestHeaders };
  }

  return { requestHeaders };
}

export function registerCookieBridge(hostPermissions) {
  browser.webRequest.onBeforeSendHeaders.addListener(
    injectStoreCookies,
    { urls: hostPermissions },
    ["blocking", "requestHeaders"],
  );
}

async function listContainers() {
  try {
    const identities = await browser.contextualIdentities.query({});

    return identities.map((identity) => ({ id: identity.cookieStoreId, name: identity.name }));
  } catch {
    return [];
  }
}

async function hasSession(origin, store, isSessionCookie) {
  try {
    const cookies = await cookiesFor(`${origin}/`, store.id);

    return cookies.some((cookie) => isSessionCookie(cookie.name));
  } catch {
    return false;
  }
}

export async function listStores(origin, isSessionCookie) {
  const containers = await listContainers();
  const signedIn = await Promise.all(
    containers.map((store) => hasSession(origin, store, isSessionCookie)),
  );

  return [DEFAULT_STORE, ...containers.filter((_, index) => signedIn[index])];
}

export function isDefaultStore(store) {
  return store.id === DEFAULT_STORE.id;
}

export function storeAccountId(store, id) {
  return isDefaultStore(store) ? id : `${store.id}:${id}`;
}

export function storeRequestOptions(store, host) {
  if (isDefaultStore(store)) {
    return { signedOutMessage: `Sign in to ${host} first.`, headers: {} };
  }

  return {
    signedOutMessage: `Sign in to ${host} in the ${store.name} container.`,
    credentials: "omit",
    headers: { [STORE_HEADER]: store.id },
  };
}

function storeErrorAccount(store, error, name) {
  return {
    id: store.id,
    name,
    type: null,
    container: store.name,
    ...toErrorState(error),
  };
}

export async function collectStoreAccounts(stores, fetchAccounts, name) {
  const results = await Promise.allSettled(stores.map(fetchAccounts));
  const [primary, ...others] = results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : [storeErrorAccount(stores[index], result.reason, name)],
  );
  const containerAccounts = others.flat();

  if (results[0].status === "fulfilled") {
    return [...primary, ...containerAccounts];
  }

  if (containerAccounts.length === 0) {
    throw results[0].reason;
  }

  if (toErrorState(results[0].reason).state === "signed-out") {
    return containerAccounts;
  }

  return [...primary, ...containerAccounts];
}
