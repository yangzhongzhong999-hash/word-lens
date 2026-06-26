// popup.js
const enabledEl = document.getElementById("enabled");
const targetLangEl = document.getElementById("targetLang");

function load() {
  chrome.storage.sync.get({ enabled: true, targetLang: "zh-CN" }, (items) => {
    enabledEl.checked = items.enabled;
    targetLangEl.value = items.targetLang;
  });
}

function save() {
  chrome.storage.sync.set({
    enabled: enabledEl.checked,
    targetLang: targetLangEl.value,
  });
}

enabledEl.addEventListener("change", save);
targetLangEl.addEventListener("change", save);

document.getElementById("openVocab").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/vocab.html") });
});

load();
