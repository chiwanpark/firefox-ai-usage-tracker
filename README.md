# AI Usage Tracker

A Firefox extension that shows usage of LLM services.

Install it from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ai-usage-tracker-extension/).

## Status

- Claude (claude.ai subscription usage) — reads the rolling utilization windows from your signed-in session.
- ChatGPT (chatgpt.com subscription usage) — reads the rate-limit windows from your signed-in session.
- GitHub Copilot (AI credits) — reads the billing usage report; needs a fine-grained token with `Plan: read` configured in settings.
- OpenCode (opencode.ai Zen and Go usage) — reads the subscription windows, monthly spend and Zen balance of each workspace from your signed-in session.
- OpenRouter (credits and key usage) — reads the credit balance and API key quota; needs an API key configured in settings.

Claude, ChatGPT and OpenCode support multiple accounts through Firefox containers: sign in to each account in a separate container, and every container with an active session is picked up automatically.

Providers and their organizations can be enabled or disabled individually in the extension settings; disabled ones are neither refreshed nor shown in the popup. Organizations appear in settings once they have been loaded at least once.

## Development

```
pnpm install
pnpm start   # launch Firefox with the extension loaded
pnpm lint
pnpm build
```

Alternatively load it manually: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `manifest.json`.

## License

[MIT](LICENSE)
