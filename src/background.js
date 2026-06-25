// background.js
// Service worker：负责跨域请求翻译 API（content script 直接 fetch 容易被
// 部分网站的 CSP 拦截，所以统一放到 background 里做）。
//
// 用到两个免费、无需 API key 的服务：
// 1. MyMemory 翻译 API —— https://mymemory.translated.net/doc/spec.php
// 2. Free Dictionary API（仅英文单词的音标/释义/例句）—— https://dictionaryapi.dev/

const TRANSLATE_ENDPOINT = "https://api.mymemory.translated.net/get";
const DICTIONARY_ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en";

async function translate(text, langpair) {
  const url = `${TRANSLATE_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(
    langpair
  )}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`翻译服务返回错误状态码 ${res.status}`);
  }

  const data = await res.json();
  const translatedText = data?.responseData?.translatedText;

  if (!translatedText) {
    throw new Error("翻译服务没有返回结果");
  }

  // MyMemory 在没有匹配到翻译时，有时会原样返回输入文本并提示，
  // 这里做一个简单识别，避免把错误信息当成翻译结果展示给用户。
  if (typeof translatedText === "string" && /MYMEMORY WARNING/i.test(translatedText)) {
    throw new Error("今日免费额度已用完，请稍后再试");
  }

  return translatedText;
}

async function lookupDictionary(word) {
  const url = `${DICTIONARY_ENDPOINT}/${encodeURIComponent(word.toLowerCase())}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("没有查到这个单词的词典释义");
  }

  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) {
    throw new Error("没有查到这个单词的词典释义");
  }

  const phonetic =
    entry.phonetic || (entry.phonetics || []).find((p) => p.text)?.text || "";

  let partOfSpeech = "";
  let definition = "";
  let example = "";

  for (const meaning of entry.meanings || []) {
    const def = (meaning.definitions || []).find((d) => d.definition);
    if (def) {
      partOfSpeech = meaning.partOfSpeech || "";
      definition = def.definition;
      example = def.example || "";
      break;
    }
  }

  if (!definition) {
    throw new Error("没有查到这个单词的词典释义");
  }

  return { phonetic, partOfSpeech, definition, example };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "WL_TRANSLATE") {
    translate(message.text, message.langpair)
      .then((translatedText) => sendResponse({ ok: true, translatedText }))
      .catch((err) => sendResponse({ ok: false, error: err.message || "未知错误" }));
    return true; // 异步响应，保持消息通道打开
  }

  if (message?.type === "WL_DICTIONARY") {
    lookupDictionary(message.word)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message || "未知错误" }));
    return true;
  }
});
