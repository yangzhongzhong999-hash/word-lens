// vocab.js — 生词本页面逻辑
const elTable = document.getElementById("table");
const elRows = document.getElementById("rows");
const elEmpty = document.getElementById("empty");
const elCount = document.getElementById("count");
const elSearch = document.getElementById("search");

let allEntries = [];

function langLabel(code) {
  const map = {
    "zh-CN": "中文",
    en: "English",
    ja: "日本語",
    ko: "한국어",
    fr: "Français",
    es: "Español",
    de: "Deutsch",
  };
  return map[code] || code;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadEntries() {
  const { wl_vocab = [] } = await chrome.storage.local.get({ wl_vocab: [] });
  allEntries = wl_vocab;
  render();
}

function render() {
  const keyword = elSearch.value.trim().toLowerCase();
  const filtered = keyword
    ? allEntries.filter(
        (e) =>
          e.original.toLowerCase().includes(keyword) ||
          e.translation.toLowerCase().includes(keyword)
      )
    : allEntries;

  elCount.textContent = `${allEntries.length} 个生词${
    keyword ? `（筛选出 ${filtered.length} 个）` : ""
  }`;

  if (allEntries.length === 0) {
    elEmpty.hidden = false;
    elTable.hidden = true;
    return;
  }
  elEmpty.hidden = true;
  elTable.hidden = false;

  elRows.innerHTML = filtered
    .map(
      (e) => `
    <tr data-id="${e.id}">
      <td>
        <span class="wl-original-cell">${escapeHtml(e.original)}</span>
        ${e.phonetic ? `<span class="wl-phonetic-cell">${escapeHtml(e.phonetic)}</span>` : ""}
      </td>
      <td class="wl-translation-cell">${escapeHtml(e.translation)}</td>
      <td class="wl-meaning-cell">
        ${e.definition ? escapeHtml(e.definition) : "—"}
        ${e.example ? `<span class="wl-example-cell">"${escapeHtml(e.example)}"</span>` : ""}
      </td>
      <td class="wl-date-cell">${formatDate(e.savedAt)}</td>
      <td><button class="wl-delete" title="删除" data-id="${e.id}">×</button></td>
    </tr>
  `
    )
    .join("");

  elRows.querySelectorAll(".wl-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteEntry(btn.dataset.id));
  });
}

async function deleteEntry(id) {
  allEntries = allEntries.filter((e) => e.id !== id);
  await chrome.storage.local.set({ wl_vocab: allEntries });
  render();
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

document.getElementById("exportCsv").addEventListener("click", () => {
  const header = ["原文", "翻译", "释义", "例句", "收藏时间"];
  const lines = [header.join(",")];
  for (const e of allEntries) {
    lines.push(
      [
        csvEscape(e.original),
        csvEscape(e.translation),
        csvEscape(e.definition || ""),
        csvEscape(e.example || ""),
        csvEscape(new Date(e.savedAt).toISOString()),
      ].join(",")
    );
  }
  downloadFile("wordlens-vocab.csv", lines.join("\n"), "text/csv;charset=utf-8");
});

document.getElementById("exportAnki").addEventListener("click", () => {
  // Anki 桌面版可以直接 File → Import 这个 .txt 文件，
  // 用 Tab 分隔的两列会自动对应 Basic 笔记模板的 Front / Back。
  const lines = allEntries.map((e) => {
    const back = e.definition ? `${e.translation}\n${e.definition}` : e.translation;
    return `${e.original}\t${back.replace(/\t/g, " ").replace(/\n/g, "<br>")}`;
  });
  downloadFile("wordlens-anki-import.txt", lines.join("\n"), "text/plain;charset=utf-8");
});

document.getElementById("clearAll").addEventListener("click", async () => {
  if (allEntries.length === 0) return;
  const confirmed = confirm("确定要清空整个生词本吗？这个操作无法撤销。");
  if (!confirmed) return;
  allEntries = [];
  await chrome.storage.local.set({ wl_vocab: [] });
  render();
});

elSearch.addEventListener("input", render);

loadEntries();
