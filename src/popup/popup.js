async function render() {
  const list = document.querySelector("#usage-list");
  const emptyState = document.querySelector("#empty-state");
  const response = await browser.runtime.sendMessage({ type: "getUsage" });
  const providers = response?.providers ?? [];

  list.replaceChildren();
  emptyState.hidden = providers.length > 0;

  for (const provider of providers) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");

    name.textContent = provider.name;
    value.textContent = provider.usage;
    item.append(name, value);
    list.append(item);
  }
}

document.addEventListener("DOMContentLoaded", render);
