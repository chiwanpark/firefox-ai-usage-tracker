# AI Usage Tracker

A Firefox extension that shows usage of LLM services.

## Status

- Claude (claude.ai subscription usage) — reads the rolling utilization windows from your signed-in session.
- ChatGPT (chatgpt.com subscription usage) — reads the rate-limit windows from your signed-in session.
- GitHub Copilot (AI credits) — reads the billing usage report; needs a fine-grained token with `Plan: read` configured in settings.

## Development

```
pnpm install
pnpm start   # launch Firefox with the extension loaded
pnpm lint
pnpm build
```

Alternatively load it manually: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `manifest.json`.
