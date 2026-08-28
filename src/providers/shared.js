export class UsageError extends Error {
  constructor(state, message) {
    super(message);
    this.name = "UsageError";
    this.state = state;
  }
}

export function hasHostPermission(origin) {
  return browser.permissions.contains({ origins: [origin] });
}

export function requestHostPermission(origin) {
  return browser.permissions.request({ origins: [origin] });
}

async function fetchOk(
  url,
  {
    headers = {},
    signedOutMessage,
    credentials = "include",
    authState = "signed-out",
    statusOverrides = {},
  } = {},
) {
  let response;

  try {
    response = await fetch(url, { credentials, headers });
  } catch {
    throw new UsageError("error", `Could not reach ${new URL(url).host}.`);
  }

  const override = statusOverrides[response.status];

  if (override) {
    throw new UsageError(override.state ?? "error", override.message);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UsageError(authState, signedOutMessage ?? "Sign in first.");
  }

  if (!response.ok) {
    throw new UsageError("error", `${new URL(url).host} returned ${response.status}.`);
  }

  return response;
}

export async function fetchJson(url, options = {}) {
  const response = await fetchOk(url, {
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });

  try {
    return await response.json();
  } catch {
    throw new UsageError("error", `Unexpected response from ${new URL(url).host}.`);
  }
}

export async function fetchText(url, options = {}) {
  const response = await fetchOk(url, options);

  try {
    return await response.text();
  } catch {
    throw new UsageError("error", `Unexpected response from ${new URL(url).host}.`);
  }
}

export function clampPercent(value) {
  return Math.min(Math.max(value, 0), 100);
}

export function humanize(key) {
  return key.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

export function severityFor(percent) {
  if (percent >= 90) {
    return "critical";
  }

  if (percent >= 75) {
    return "warning";
  }

  return "normal";
}

export function toErrorState(error) {
  return {
    state: error instanceof UsageError ? error.state : "error",
    message: error instanceof UsageError ? error.message : "Unexpected error.",
  };
}
