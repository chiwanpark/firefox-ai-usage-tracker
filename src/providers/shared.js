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

export async function fetchJson(url, { headers = {}, signedOutMessage } = {}) {
  let response;

  try {
    response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json", ...headers },
    });
  } catch {
    throw new UsageError("error", `Could not reach ${new URL(url).host}.`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UsageError("signed-out", signedOutMessage ?? "Sign in first.");
  }

  if (!response.ok) {
    throw new UsageError("error", `${new URL(url).host} returned ${response.status}.`);
  }

  try {
    return await response.json();
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
