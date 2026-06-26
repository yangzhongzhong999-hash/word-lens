// content.js
// 注入到每个网页里的脚本：检测用户划词选中文字 -> 显示一个小触发按钮 ->
// 点击后展示翻译卡片。所有 UI 都画在一个 Shadow DOM 里，
// 这样既不会被页面自己的 CSS 污染，也不会污染页面的 CSS。

(() => {
  const HOST_ID = "wordlens-host-root";
  const MAX_SELECTION_LENGTH = 300;

  /** @type {HTMLElement | null} */
  let hostEl = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  let triggerEl = null;
  let cardEl = null;
  let currentSelectionText = "";

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .wl-trigger {
      position: fixed;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #1B2430;
      color: #FFD9C2;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.28);
      border: 2px solid #FF6B4A;
      font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
      user-select: none;
      transition: transform .12s ease;
    }
    .wl-trigger:hover { transform: scale(1.1); }

    .wl-card {
      position: fixed;
      width: 290px;
      max-width: 90vw;
      background: #FAF7F0;
      border: 1px solid #E4DFD3;
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(27,36,48,.22);
      font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
      color: #1B2430;
      overflow: hidden;
      animation: wl-pop .14s ease-out;
    }
    @keyframes wl-pop {
      from { opacity: 0; transform: translateY(4px) scale(.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .wl-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 8px 7px 14px;
      font-size: 10.5px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #8A8470;
      border-bottom: 1px solid #EFEBE0;
    }
    .wl-brand { display: flex; align-items: center; gap: 6px; }
    .wl-dot { width: 6px; height: 6px; border-radius: 50%; background: #FF6B4A; }
    .wl-close {
      cursor: pointer; font-size: 16px; color: #8A8470;
      padding: 2px 8px; line-height: 1; border-radius: 4px;
    }
    .wl-close:hover { color: #1B2430; background: #EFEBE0; }

    .wl-original {
      padding: 10px 14px 8px;
      font-family: Georgia, "Iowan Old Style", "Songti SC", serif;
      font-size: 14px;
      line-height: 1.5;
      color: #514C3E;
      max-height: 90px;
      overflow-y: auto;
    }
    .wl-phonetic {
      font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 12px;
      color: #B07A55;
      margin-left: 6px;
    }

    .wl-divider { height: 1px; background: #EFEBE0; margin: 0 14px; }

    .wl-body { padding: 10px 14px 12px; }
    .wl-translation {
      font-family: Georgia, "Iowan Old Style", "Songti SC", serif;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.45;
      margin-bottom: 10px;
      word-break: break-word;
    }
    .wl-status { font-size: 12.5px; color: #8A8470; }
    .wl-status.wl-error { color: #C0432A; }

    .wl-dict {
      margin: 2px 0 10px;
      padding: 8px 10px;
      background: #F1EEE3;
      border-radius: 8px;
      font-size: 12.5px;
      line-height: 1.55;
      color: #514C3E;
    }
    .wl-dict-pos {
      display: inline-block;
      font-size: 10.5px;
      color: #8A8470;
      border: 1px solid #DCD6C6;
      border-radius: 4px;
      padding: 0 5px;
      margin-bottom: 4px;
    }
    .wl-dict-example {
      margin-top: 4px;
      color: #8A8470;
      font-style: italic;
    }
    .wl-dict-loading { font-size: 11.5px; color: #B8B2A0; }

    .wl-actions { display: flex; gap: 6px; margin-top: 2px; flex-wrap: wrap; }
    .wl-btn {
      border: none;
      background: #1B2430;
      color: #FAF7F0;
      font-size: 12px;
      padding: 6px 11px;
      border-radius: 7px;
      cursor: pointer;
      font-family: inherit;
    }
    .wl-btn:hover { opacity: .85; }
    .wl-btn.secondary {
      background: transparent;
      color: #1B2430;
      border: 1px solid #DCD6C6;
    }
    .wl-btn.copied { background: #5C8A6B; }
    .wl-btn.saved { background: #C99A3D; }

    .wl-footer {
      font-size: 10px;
      color: #B8B2A0;
      padding: 0 14px 10px;
      text-align: right;
    }
    .wl-footer a { color: #B8B2A0; text-decoration: none; }
    .wl-footer a:hover { text-decoration: underline; }
  `;

  function ensureHost() {
    if (hostEl) return shadow;
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "open" });
    const styleTag = document.createElement("style");
    styleTag.textContent = STYLES;
    shadow.appendChild(styleTag);
    return shadow;
  }

  function clearTrigger() {
    if (triggerEl) {
      triggerEl.remove();
      triggerEl = null;
    }
  }

  function clearCard() {
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
  }

  function clearAll() {
    clearTrigger();
    clearCard();
  }

  function detectLang(text) {
    if (/[\u3040-\u30ff]/.test(text)) return "ja";
    if (/[\uac00-\ud7af]/.test(text)) return "ko";
    if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
    return "en";
  }

  function isSingleEnglishWord(text) {
    return /^[a-zA-Z]+([-'][a-zA-Z]+)*$/.test(text.trim());
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        { targetLang: "zh-CN", enabled: true },
        (items) => resolve(items)
      );
    });
  }

  function placeNear(el, rect) {
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;

    // 粗略防止卡片超出视口右侧/底部
    const approxWidth = 290;
    const approxHeight = 230;
    if (left + approxWidth > window.innerWidth - 8) {
      left = window.innerWidth - approxWidth - 8;
    }
    if (top + approxHeight > window.innerHeight - 8) {
      top = rect.top - approxHeight - margin;
      if (top < 8) top = 8;
    }
    el.style.top = `${Math.max(8, top)}px`;
    el.style.left = `${Math.max(8, left)}px`;
  }

  function showTrigger(rect, text) {
    const root = ensureHost();
    clearAll();

    triggerEl = document.createElement("div");
    triggerEl.className = "wl-trigger";
    triggerEl.textContent = "译";
    triggerEl.style.top = `${rect.bottom + 6}px`;
    triggerEl.style.left = `${rect.right - 30}px`;

    triggerEl.addEventListener("mousedown", (e) => {
      // 防止触发按钮自身的点击清空页面已有选区
      e.preventDefault();
      e.stopPropagation();
    });

    triggerEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCard(rect, text);
    });

    root.appendChild(triggerEl);
  }

  async function showCard(rect, text) {
    const root = ensureHost();
    clearTrigger();
    clearCard();

    cardEl = document.createElement("div");
    cardEl.className = "wl-card";
    placeNear(cardEl, rect);

    cardEl.innerHTML = `
      <div class="wl-card-header">
        <div class="wl-brand"><span class="wl-dot"></span>WordLens</div>
        <div class="wl-close" title="关闭">×</div>
      </div>
      <div class="wl-original">
        <span class="wl-original-text"></span><span class="wl-phonetic"></span>
      </div>
      <div class="wl-divider"></div>
      <div class="wl-body">
        <div class="wl-status">翻译中…</div>
      </div>
      <div class="wl-footer">由 MyMemory / Free Dictionary API 提供数据 · WordLens 开源插件</div>
    `;

    cardEl.querySelector(".wl-original-text").textContent = text;
    cardEl
      .querySelector(".wl-close")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        clearCard();
      });

    root.appendChild(cardEl);

    const settings = await getSettings();
    const sourceLang = detectLang(text);
    const targetLang = sourceLang === settings.targetLang ? "en" : settings.targetLang;
    const langpair = `${sourceLang}|${targetLang}`;
    const wantsDictionary = sourceLang === "en" && isSingleEnglishWord(text);
    const dictPromise = wantsDictionary ? fetchDictionary(text) : Promise.resolve(null);

    chrome.runtime.sendMessage(
      { type: "WL_TRANSLATE", text, langpair },
      async (response) => {
        if (!cardEl) return; // 用户已经把卡片关掉了
        const body = cardEl.querySelector(".wl-body");
        if (!response) {
          body.innerHTML = `<div class="wl-status wl-error">没有收到翻译服务的响应</div>`;
          return;
        }
        if (!response.ok) {
          body.innerHTML = `<div class="wl-status wl-error">${escapeHtml(
            response.error || "翻译失败"
          )}</div>`;
          return;
        }

        const dict = await dictPromise;
        if (!cardEl) return; // 等词典结果的过程中卡片可能已被关闭

        if (dict && dict.phonetic) {
          const phoneticEl = cardEl.querySelector(".wl-phonetic");
          if (phoneticEl) phoneticEl.textContent = ` ${dict.phonetic}`;
        }

        renderResult(body, response.translatedText, {
          original: text,
          sourceLang,
          targetLang,
          dict,
        });
      }
    );
  }

  function fetchDictionary(word) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "WL_DICTIONARY", word }, (response) => {
        resolve(response && response.ok ? response : null);
      });
    });
  }

  async function saveToVocab(entry) {
    const { wl_vocab = [] } = await chrome.storage.local.get({ wl_vocab: [] });
    const exists = wl_vocab.some(
      (v) => v.original === entry.original && v.translation === entry.translation
    );
    if (exists) return false;
    wl_vocab.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...entry,
      savedAt: Date.now(),
    });
    await chrome.storage.local.set({ wl_vocab });
    return true;
  }

  function renderResult(body, translatedText, meta) {
    const dict = meta?.dict;
    let dictHtml = "";
    if (dict && dict.definition) {
      dictHtml = `
        <div class="wl-dict">
          ${
            dict.partOfSpeech
              ? `<span class="wl-dict-pos">${escapeHtml(dict.partOfSpeech)}</span><br/>`
              : ""
          }
          ${escapeHtml(dict.definition)}
          ${
            dict.example
              ? `<div class="wl-dict-example">"${escapeHtml(dict.example)}"</div>`
              : ""
          }
        </div>
      `;
    }

    body.innerHTML = `
      <div class="wl-translation"></div>
      ${dictHtml}
      <div class="wl-actions">
        <button class="wl-btn wl-copy">复制</button>
        <button class="wl-btn secondary wl-speak">朗读</button>
        <button class="wl-btn secondary wl-save">★ 收藏</button>
      </div>
    `;
    body.querySelector(".wl-translation").textContent = translatedText;

    const copyBtn = body.querySelector(".wl-copy");
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(translatedText);
        copyBtn.textContent = "已复制";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "复制";
          copyBtn.classList.remove("copied");
        }, 1200);
      } catch {
        copyBtn.textContent = "复制失败";
      }
    });

    body.querySelector(".wl-speak").addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        const utter = new SpeechSynthesisUtterance(translatedText);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        // 部分浏览器/环境可能不支持，静默忽略
      }
    });

    const saveBtn = body.querySelector(".wl-save");
    saveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const added = await saveToVocab({
        original: meta.original,
        translation: translatedText,
        sourceLang: meta.sourceLang,
        targetLang: meta.targetLang,
        phonetic: dict?.phonetic || "",
        partOfSpeech: dict?.partOfSpeech || "",
        definition: dict?.definition || "",
        example: dict?.example || "",
      });
      saveBtn.textContent = added ? "已收藏 ✓" : "已收藏过";
      saveBtn.classList.add("saved");
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function isInsideOwnUI(target) {
    return hostEl && target && hostEl.contains(target);
  }

  document.addEventListener("mouseup", async (e) => {
    if (isInsideOwnUI(e.target)) return;

    const settings = await getSettings();
    if (!settings.enabled) return;

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (!text || text.length > MAX_SELECTION_LENGTH) {
      currentSelectionText = "";
      clearTrigger();
      return;
    }

    if (text === currentSelectionText && (triggerEl || cardEl)) return;
    currentSelectionText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    showTrigger(rect, text);
  });

  document.addEventListener("mousedown", (e) => {
    if (isInsideOwnUI(e.target)) return;
    clearAll();
  });

  window.addEventListener("scroll", () => clearAll(), { passive: true });
  window.addEventListener("resize", () => clearAll());
})();
