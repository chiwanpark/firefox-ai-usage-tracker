import { getProviderSettings, isAccountEnabled } from "../settings.js";
import {
  UsageError,
  clampPercent,
  fetchText,
  hasHostPermission,
  humanize,
  severityFor,
  toErrorState,
} from "./shared.js";

export const OPENCODE_HOST_PERMISSION = "https://opencode.ai/*";

const ORIGIN = "https://opencode.ai";
const SIGNED_OUT = "Sign in to opencode.ai first.";

const SERVER_FUNCTIONS = {
  workspaces: "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f",
  subscription: "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4",
  billing: "c83b78a614689c38ebee981f9b39a8b377716db85c1fd7dbab604adc02d3313d",
};

const SIGNED_OUT_MARKERS = ["auth/authorize", "not associated with an account"];

const USD_SCALE = 1e8;

const WINDOWS = [
  { id: "rolling", label: "5 hours", keys: ["rollingUsage", "rolling"], isActive: true },
  { id: "weekly", label: "Weekly", keys: ["weeklyUsage", "weekly"], isActive: false },
  { id: "monthly", label: "Monthly", keys: ["monthlyUsage", "monthly"], isActive: false },
];

const PERCENT_FIELDS = ["usagePercent", "usedPercent", "percent"];
const RESET_FIELDS = ["resetInSec", "resetInSeconds", "resetSeconds"];
const PLAN_LABELS = { go: "Go", lite: "Lite" };

const ASSIGNED = "(?:\\$R\\[\\d+\\]\\s*=\\s*)?";
const NUMBER = "(-?\\d+(?:\\.\\d+)?)";

function nameOf(field) {
  return `(?:"${field}"|${field})`;
}

function fieldMatch(text, field, value) {
  return text.match(new RegExp(`${nameOf(field)}\\s*:\\s*${ASSIGNED}${value}`));
}

function numberField(text, field) {
  const match = fieldMatch(text, field, NUMBER);

  return match ? Number(match[1]) : null;
}

function stringField(text, field) {
  const match = fieldMatch(text, field, '"([^"]*)"');

  return match ? match[1] : null;
}

function objectNumber(text, keys, fields) {
  for (const key of keys) {
    for (const field of fields) {
      const match = text.match(
        new RegExp(
          `${nameOf(key)}\\s*:\\s*${ASSIGNED}\\{[^{}]*?${nameOf(field)}\\s*:\\s*${ASSIGNED}${NUMBER}`,
        ),
      );

      if (match) {
        return Number(match[1]);
      }
    }
  }

  return null;
}

function enclosingObject(text, pattern) {
  const index = text.search(pattern);
  const start = index === -1 ? -1 : text.lastIndexOf("{", index);

  if (start === -1) {
    return null;
  }

  let depth = 0;

  for (let position = start; position < text.length; position += 1) {
    if (text[position] === "{") {
      depth += 1;
    } else if (text[position] === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, position + 1);
      }
    }
  }

  return null;
}

function guardSignedOut(text) {
  if (SIGNED_OUT_MARKERS.some((marker) => text.includes(marker))) {
    throw new UsageError("signed-out", SIGNED_OUT);
  }

  return text;
}

async function fetchServer(name, args) {
  const serverId = SERVER_FUNCTIONS[name];
  const url = new URL(`${ORIGIN}/_server`);

  url.searchParams.set("id", serverId);

  if (args) {
    url.searchParams.set("args", JSON.stringify(args));
  }

  const text = await fetchText(url.toString(), {
    signedOutMessage: SIGNED_OUT,
    headers: {
      Accept: "text/javascript, application/json;q=0.9, */*;q=0.8",
      "X-Server-Id": serverId,
      "X-Server-Instance": `server-fn:${crypto.randomUUID()}`,
    },
  });

  return guardSignedOut(text);
}

async function fetchPage(path) {
  const text = await fetchText(`${ORIGIN}${path}`, {
    signedOutMessage: SIGNED_OUT,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });

  return guardSignedOut(text);
}

function parseWorkspaces(text) {
  const pattern = new RegExp(
    `${nameOf("id")}\\s*:\\s*${ASSIGNED}"(wrk_[^"]+)"` +
      `(?:[^{}]*?${nameOf("name")}\\s*:\\s*${ASSIGNED}"([^"]*)")?`,
    "g",
  );
  const workspaces = new Map();

  for (const [, id, name] of text.matchAll(pattern)) {
    if (!workspaces.has(id)) {
      workspaces.set(id, { id, name: name || "Workspace" });
    }
  }

  return [...workspaces.values()];
}

async function fetchWorkspaces() {
  const workspaces = parseWorkspaces(await fetchServer("workspaces"));

  if (workspaces.length === 0) {
    throw new UsageError("signed-out", "No OpenCode workspace found.");
  }

  return workspaces;
}

function parseBilling(text) {
  const payload = enclosingObject(text, new RegExp(`${nameOf("customerID")}\\s*:`));

  if (!payload) {
    return null;
  }

  const monthlyUsage = numberField(payload, "monthlyUsage");
  const balance = numberField(payload, "balance");
  const subscription = fieldMatch(payload, "subscription", "[^,}\\s]+");

  return {
    monthlyUsage: monthlyUsage === null ? null : monthlyUsage / USD_SCALE,
    monthlyLimit: numberField(payload, "monthlyLimit"),
    balance: balance === null ? null : balance / USD_SCALE,
    plan: stringField(payload, "subscriptionPlan"),
    hasSubscription: Boolean(subscription) && !fieldMatch(payload, "subscription", "null"),
  };
}

function toWindowLimits(text) {
  const now = Date.now();

  return WINDOWS.map((window) => {
    const raw = objectNumber(text, window.keys, PERCENT_FIELDS);

    if (raw === null) {
      return null;
    }

    const percent = clampPercent(raw);
    const resetInSec = objectNumber(text, window.keys, RESET_FIELDS);

    return {
      id: window.id,
      label: window.label,
      percent,
      detail: null,
      resetsAt: resetInSec === null ? null : new Date(now + resetInSec * 1000).toISOString(),
      severity: severityFor(percent),
      isActive: window.isActive,
    };
  }).filter(Boolean);
}

function formatMoney(value) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  } catch {
    return `${value.toFixed(2)} USD`;
  }
}

function toSpendLimits(billing) {
  if (typeof billing?.monthlyUsage !== "number") {
    return [];
  }

  const used = formatMoney(billing.monthlyUsage);
  const limit = billing.monthlyLimit;
  const percent = limit ? clampPercent((billing.monthlyUsage / limit) * 100) : null;

  return [
    {
      id: "monthly-spend",
      label: "Monthly spend",
      percent,
      detail: limit ? `${used} of ${formatMoney(limit)}` : used,
      resetsAt: null,
      severity: percent === null ? "normal" : severityFor(percent),
      isActive: false,
    },
  ];
}

function toBalance(billing) {
  if (typeof billing?.balance !== "number") {
    return null;
  }

  return {
    label: "Zen balance",
    text: formatMoney(billing.balance),
    percent: null,
    severity: "normal",
  };
}

function planLabel(billing, hasWindows) {
  if (billing?.plan) {
    return PLAN_LABELS[billing.plan] ?? humanize(billing.plan);
  }

  if (hasWindows) {
    return "Subscription";
  }

  if (typeof billing?.monthlyUsage === "number") {
    return "Pay as you go";
  }

  return billing ? "No subscription" : null;
}

function toAccount(workspace, windows, billing) {
  const account = { ...workspace, type: planLabel(billing, windows.length > 0) };
  const limits = [...windows, ...toSpendLimits(billing)];

  if (limits.length > 0) {
    return { ...account, state: "ok", limits, spend: toBalance(billing) };
  }

  const balance = toBalance(billing);

  if (!balance) {
    return { ...account, state: "empty", message: "No usage reported." };
  }

  return {
    ...account,
    state: "ok",
    limits: [
      {
        id: "balance",
        label: balance.label,
        percent: null,
        detail: balance.text,
        resetsAt: null,
        severity: "normal",
        isActive: false,
      },
    ],
    spend: null,
  };
}

async function fetchWorkspaceUsage(workspace) {
  try {
    const [subscription, billingText] = await Promise.all([
      fetchServer("subscription", [workspace.id]),
      fetchServer("billing", [workspace.id]),
    ]);
    const billing = parseBilling(billingText);
    let windows = toWindowLimits(subscription);

    if (windows.length === 0 && billing?.hasSubscription) {
      windows = toWindowLimits(await fetchPage(`/workspace/${workspace.id}/go`));
    }

    return toAccount(workspace, windows, billing);
  } catch (error) {
    return { ...workspace, ...toErrorState(error) };
  }
}

export async function fetchOpenCodeUsage() {
  const provider = {
    id: "opencode",
    name: "OpenCode",
    hostPermission: OPENCODE_HOST_PERMISSION,
  };

  if (!(await hasHostPermission(OPENCODE_HOST_PERMISSION))) {
    return {
      ...provider,
      state: "needs-permission",
      message: "Grant access to opencode.ai to read usage.",
    };
  }

  try {
    const settings = await getProviderSettings();
    const workspaces = await fetchWorkspaces();
    const accounts = await Promise.all(
      workspaces.map((workspace) =>
        isAccountEnabled(settings, provider.id, workspace.id)
          ? fetchWorkspaceUsage(workspace)
          : { ...workspace, state: "disabled", message: "Hidden in settings." },
      ),
    );

    return {
      ...provider,
      state: "ok",
      accounts,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return { ...provider, ...toErrorState(error) };
  }
}
