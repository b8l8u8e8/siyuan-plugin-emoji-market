/* Emoji Market - SiYuan plugin (no-build single file) */

const {Plugin, showMessage, Setting, Dialog, getAllEditor} = require("siyuan");

const SOURCES = [
  {
    id: "iconfont",
    name: "阿里巴巴矢量库",
    origin: "https://www.iconfont.cn",
    dir: "iconfont",
  },
  {
    id: "cainiao",
    name: "菜鸟图标",
    origin: "https://icon.sucai999.com",
    dir: "cainiao",
  },
];
const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

const STORAGE_SETTINGS = "settings";
const DEFAULT_MAX_PER_SOURCE = 30;
const MIN_MAX_PER_SOURCE = 1;
const MAX_MAX_PER_SOURCE = 2000;
const ICONFONT_PAGE_SIZE = 50;
const ICONFONT_MAX_PAGES = 80;
const CAINIAO_MAX_PAGES = 120;
const SEARCH_TTL = 2 * 60 * 1000;
const DETAIL_TTL = 10 * 60 * 1000;
const FALLBACK_COLOR = "#64748b";
const SWATCHES = ["#64748b", "#111827", "#334155", "#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#ec4899"];
const ICONFONT_COPYRIGHT_TERMS_URL = "https://terms.alicdn.com/legal-agreement/terms/platform_service/20220704165734807/20220704165734807.html";

/* 鈹€鈹€ Utility functions 鈹€鈹€ */

function s(v, d = "") {
  return typeof v === "string" ? v : d;
}
function n(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}
function safeMsg(err) {
  if (!err) return "unknown error";
  return s(err.message, String(err));
}
function parseIntSafe(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}
function normalizeHex(v) {
  const t = String(v || "").trim();
  if (!t.startsWith("#")) return "";
  const b = t.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(b)) {
    return `#${b.split("").map((x) => `${x}${x}`).join("").toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(b)) return `#${b.toLowerCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(b)) return `#${b.slice(0, 6).toLowerCase()}`;
  return "";
}
function isHex(v) {
  return !!normalizeHex(v);
}
function rgbToHex(v) {
  const m = String(v || "")
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!m) return "";
  const c = [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Number(x))));
  if (c.some((x) => !Number.isFinite(x))) return "";
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
function normalizeColorToken(v) {
  const t = String(v || "").trim();
  if (!t) return "";
  const hex = normalizeHex(t);
  if (hex) return hex;
  const rgb = rgbToHex(t);
  if (rgb) return rgb;
  const lower = t.toLowerCase();
  if (lower === "currentcolor") return "currentColor";
  return lower;
}
function displayColorFromToken(v, fallback = FALLBACK_COLOR) {
  const token = normalizeColorToken(v);
  if (!token || token === "currentColor") return fallback;
  return isHex(token) ? token : (normalizeHex(token) || rgbToHex(token) || fallback);
}
function encodeColorVector(colors) {
  const hexes = colors.map((color) => normalizeHex(color)).filter(Boolean);
  if (!hexes.length) return "";

  const bytes = new Uint8Array(hexes.length * 3);
  hexes.forEach((hex, index) => {
    const raw = hex.slice(1);
    const offset = index * 3;
    bytes[offset] = parseInt(raw.slice(0, 2), 16);
    bytes[offset + 1] = parseInt(raw.slice(2, 4), 16);
    bytes[offset + 2] = parseInt(raw.slice(4, 6), 16);
  });

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  if (typeof btoa === "function") {
    let text = "";
    bytes.forEach((value) => {
      text += String.fromCharCode(value);
    });
    return btoa(text)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return hexes.map((hex) => hex.slice(1)).join("");
}
function slug(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function getToken() {
  try {
    const token = globalThis?.siyuan?.config?.api?.token;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}
function authHeaders() {
  const token = getToken();
  return token ? {Authorization: `Token ${token}`} : {};
}
function hasHeader(h, name) {
  const k = String(name || "").toLowerCase();
  return Object.keys(h || {}).some((x) => x.toLowerCase() === k);
}
function fmtDate(v) {
  const t = s(v).trim();
  if (!t) return "";
  const d = new Date(t);
  if (!Number.isNaN(d.valueOf())) return d.toISOString().slice(0, 10);
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : t;
}
function normalizeRelativeDir(v, fallback = "") {
  const raw = String(v || "").trim().replace(/\\/g, "/");
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const clean = [];

  parts.forEach((part) => {
    if (part === "." || part === "..") return;
    const next = part.replace(/[<>:"|?*\u0000-\u001f]/g, "-").replace(/\.+$/g, "").trim();
    if (next) clean.push(next);
  });

  const joined = clean.join("/");
  if (joined) return joined;
  const fallbackNorm = String(fallback || "").trim().replace(/\\/g, "/");
  return fallbackNorm.replace(/^\/+|\/+$/g, "");
}
function httpsUrl(v) {
  const t = s(v).trim();
  if (!t) return "";
  return t.startsWith("//") ? `https:${t}` : t;
}
function cleanTitleText(v) {
  let t = n(v);
  t = t.replace(/^["'""'']+/, "").replace(/["'""'']+$/, "");
  return t.trim();
}

/* 鈹€鈹€ Plugin class 鈹€鈹€ */

class EmojiMarketPlugin extends Plugin {

  /* 鈹€鈹€ Lifecycle 鈹€鈹€ */

  onload() {
    this.observer = null;
    this._mutating = false;
    this.panelStates = new WeakMap();
    this.searchCache = new Map();
    this.detailCache = new Map();
    this.emojiBase = "";
    this.settingsData = this.defaultSettings();
    this.settingSourceInputs = new Map();
    this.settingSourceMaxInputs = new Map();
    this.settingSourceStorageInputs = new Map();
    this.settingSourceOpenButtons = new Map();
    this.settingSourceActionEls = new Map();
    this.settingInlineHintInput = null;
    this.setting = null;
    this.importDialog = null;

    this.dialogPromise = null;
    this.dialogResolve = null;
    this.dialogCleanup = null;

    this.initSettingPanel();
    void this.loadSettingsData().then(() => this.refreshEnhancedPanels());
    this.observePanels();
    void this.cleanupLegacyMetaFiles();
  }

  onunload() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.dialogResolve) {
      this.dialogResolve({confirmed: false, keepOriginalColor: true, selectedColor: "", slotColors: {}});
      this.dialogResolve = null;
    }
    this.dialogPromise = null;
    this.removeDialog();
    this.cleanupInjected();
    this.searchCache.clear();
    this.detailCache.clear();
    this.setting = null;
    this.settingSourceInputs.clear();
    this.settingSourceMaxInputs.clear();
    this.settingSourceStorageInputs.clear();
    this.settingSourceOpenButtons.clear();
    this.settingSourceActionEls.clear();
    this.settingInlineHintInput = null;
  }

  async uninstall() {
    // Imported emojis in data/emojis/ are user data and preserved.
    // No plugin-specific storage to clean up.
  }

  /* 鈹€鈹€ i18n 鈹€鈹€ */

  t(key, params = {}) {
    const raw = (this.i18n && this.i18n[key]) || key;
    return raw.replace(/\{\{(\w+)\}\}/g, (m, name) => {
      if (Object.prototype.hasOwnProperty.call(params, name)) return String(params[name]);
      return "";
    });
  }

  /* 鈹€鈹€ Settings 鈹€鈹€ */

  defaultSettings() {
    return {
      enabledSources: Object.fromEntries(SOURCES.map((source) => [source.id, true])),
      maxPerSourceBySource: Object.fromEntries(SOURCES.map((source) => [source.id, DEFAULT_MAX_PER_SOURCE])),
      storageDirBySource: Object.fromEntries(SOURCES.map((source) => [source.id, source.dir])),
      enableInlineHint: true,
    };
  }

  normalizeSettings(raw) {
    const defaults = this.defaultSettings();
    const data = raw && typeof raw === "object" ? raw : {};
    const enabledRaw = data.enabledSources && typeof data.enabledSources === "object" ? data.enabledSources : {};
    const maxRaw = data.maxPerSourceBySource && typeof data.maxPerSourceBySource === "object" ? data.maxPerSourceBySource : {};
    const storageRaw = data.storageDirBySource && typeof data.storageDirBySource === "object" ? data.storageDirBySource : {};
    const legacyMax = Object.prototype.hasOwnProperty.call(data, "maxPerSource") ? data.maxPerSource : undefined;

    const enabledSources = {};
    const maxPerSourceBySource = {};
    const storageDirBySource = {};
    SOURCES.forEach((source) => {
      if (Object.prototype.hasOwnProperty.call(enabledRaw, source.id)) {
        enabledSources[source.id] = !!enabledRaw[source.id];
      } else {
        enabledSources[source.id] = defaults.enabledSources[source.id];
      }

      const maxVal = Object.prototype.hasOwnProperty.call(maxRaw, source.id) ? maxRaw[source.id] : legacyMax;
      maxPerSourceBySource[source.id] = this.normalizeMaxPerSource(maxVal);

      const storageVal = Object.prototype.hasOwnProperty.call(storageRaw, source.id)
        ? storageRaw[source.id]
        : defaults.storageDirBySource[source.id];
      storageDirBySource[source.id] = normalizeRelativeDir(storageVal, source.dir);
    });

    const enableInlineHint = Object.prototype.hasOwnProperty.call(data, "enableInlineHint")
      ? !!data.enableInlineHint
      : defaults.enableInlineHint;

    return {
      enabledSources,
      maxPerSourceBySource,
      storageDirBySource,
      enableInlineHint,
    };
  }

  normalizeMaxPerSource(v) {
    const num = Number(v);
    if (!Number.isFinite(num)) return DEFAULT_MAX_PER_SOURCE;
    return Math.max(MIN_MAX_PER_SOURCE, Math.min(MAX_MAX_PER_SOURCE, Math.trunc(num)));
  }

  isSourceEnabled(sourceId) {
    return !!this.settingsData?.enabledSources?.[sourceId];
  }

  getEnabledSources() {
    return SOURCES.filter((source) => this.isSourceEnabled(source.id));
  }

  getMaxPerSource(sourceId = "") {
    if (!sourceId) return DEFAULT_MAX_PER_SOURCE;
    return this.normalizeMaxPerSource(this.settingsData?.maxPerSourceBySource?.[sourceId]);
  }

  getSourceStorageDir(sourceId = "") {
    const source = SOURCE_MAP[sourceId];
    if (!source) return "";
    return normalizeRelativeDir(this.settingsData?.storageDirBySource?.[sourceId], source.dir);
  }

  async loadSettingsData() {
    try {
      const saved = await this.loadData(STORAGE_SETTINGS);
      this.settingsData = this.normalizeSettings(saved);
    } catch (err) {
      this.settingsData = this.defaultSettings();
      console.error("[emoji-market] load settings failed", err);
    }
    this.syncSettingUI();
  }

  async saveSettingsData() {
    try {
      await this.saveData(STORAGE_SETTINGS, this.settingsData);
    } catch (err) {
      console.error("[emoji-market] save settings failed", err);
    }
  }

  syncSettingUI() {
    if (this.settingSourceInputs instanceof Map) {
      SOURCES.forEach((source) => {
        const input = this.settingSourceInputs.get(source.id);
        const maxInput = this.settingSourceMaxInputs.get(source.id);
        const storageInput = this.settingSourceStorageInputs.get(source.id);
        const openButton = this.settingSourceOpenButtons.get(source.id);
        const action = this.settingSourceActionEls.get(source.id);
        const enabled = this.isSourceEnabled(source.id);
        if (input instanceof HTMLInputElement) input.checked = enabled;
        if (maxInput instanceof HTMLInputElement) {
          maxInput.value = String(this.getMaxPerSource(source.id));
          maxInput.disabled = !enabled;
        }
        if (storageInput instanceof HTMLInputElement) {
          storageInput.value = this.getSourceStorageDir(source.id);
          storageInput.disabled = !enabled;
        }
        if (openButton instanceof HTMLButtonElement) openButton.disabled = !enabled;
        if (action instanceof HTMLElement) action.classList.toggle("is-disabled", !enabled);
      });
    }
    if (this.settingInlineHintInput instanceof HTMLInputElement) {
      this.settingInlineHintInput.checked = !!this.settingsData?.enableInlineHint;
    }
  }

  refreshEnhancedPanels() {
    document.querySelectorAll(".emojis[data-if-market-enhanced]").forEach((root) => {
      const st = this.panelStates.get(root);
      if (!st || st.disposed) return;
      this.scheduleSearch(st, 0);
    });
  }

  initSettingPanel() {
    this.settingSourceInputs.clear();
    this.settingSourceMaxInputs.clear();
    this.settingSourceStorageInputs.clear();
    this.settingSourceOpenButtons.clear();
    this.settingSourceActionEls.clear();
    this.setting = new Setting({});
    this.setting.addItem({
      title: this.t("settingsSourcesTitle"),
      description: this.t("settingsSourcesDesc", {min: MIN_MAX_PER_SOURCE, max: MAX_MAX_PER_SOURCE}),
    });

    SOURCES.forEach((source) => {
      this.setting.addItem({
        title: source.name,
        createActionElement: () => {
          const action = document.createElement("div");
          action.className = "if-market-setting-source-actions";

          const toggle = document.createElement("label");
          toggle.className = "if-market-setting-source-switch";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "b3-switch fn__flex-center";
          checkbox.checked = this.isSourceEnabled(source.id);

          const limitWrap = document.createElement("label");
          limitWrap.className = "if-market-setting-source-limit";
          const limitLabel = document.createElement("span");
          limitLabel.className = "if-market-setting-source-limit-label";
          limitLabel.textContent = this.t("settingsLimitPrefix");

          const maxInput = document.createElement("input");
          maxInput.type = "number";
          maxInput.min = String(MIN_MAX_PER_SOURCE);
          maxInput.max = String(MAX_MAX_PER_SOURCE);
          maxInput.step = "1";
          maxInput.inputMode = "numeric";
          maxInput.setAttribute("aria-label", `${source.name} ${this.t("settingsPerSourceLimit")}`);
          maxInput.className = "b3-text-field if-market-setting-source-limit-input";
          maxInput.value = String(this.getMaxPerSource(source.id));
          maxInput.disabled = !checkbox.checked;

          const limitUnit = document.createElement("span");
          limitUnit.className = "if-market-setting-source-limit-unit";
          limitUnit.textContent = this.t("settingsLimitUnit");

          const storageWrap = document.createElement("label");
          storageWrap.className = "if-market-setting-source-storage";
          const storageLabel = document.createElement("span");
          storageLabel.className = "if-market-setting-source-storage-label";
          storageLabel.textContent = this.t("settingsStoragePrefix");

          const storageInput = document.createElement("input");
          storageInput.type = "text";
          storageInput.spellcheck = false;
          storageInput.placeholder = source.dir;
          storageInput.setAttribute("aria-label", `${source.name} ${this.t("settingsStoragePath")}`);
          storageInput.className = "b3-text-field if-market-setting-source-storage-input";
          storageInput.value = this.getSourceStorageDir(source.id);

          const openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "if-market-setting-source-open";
          openButton.title = this.t("settingsOpenFolder");
          openButton.setAttribute("aria-label", `${source.name} ${this.t("settingsOpenFolder")}`);
          openButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4l2 2h8a2 2 0 0 1 2 2v8.5A3.5 3.5 0 0 1 18.5 20h-13A3.5 3.5 0 0 1 2 16.5v-9A3.5 3.5 0 0 1 5.5 4H10zm8 4h-5.17l-2-2H5.5A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V8A1 1 0 0 0 19 7h-1z"/></svg>`;
          openButton.disabled = !checkbox.checked;

          const applySourceMax = () => {
            const next = this.normalizeMaxPerSource(maxInput.value);
            maxInput.value = String(next);
            if (next === this.getMaxPerSource(source.id)) return;
            this.settingsData.maxPerSourceBySource[source.id] = next;
            this.searchCache.clear();
            void this.saveSettingsData();
            this.refreshEnhancedPanels();
          };
          maxInput.addEventListener("change", applySourceMax);
          maxInput.addEventListener("blur", applySourceMax);

          const applyStorageDir = () => {
            const next = normalizeRelativeDir(storageInput.value, source.dir);
            storageInput.value = next;
            if (next === this.getSourceStorageDir(source.id)) return;
            this.settingsData.storageDirBySource[source.id] = next;
            void this.saveSettingsData();
          };
          storageInput.addEventListener("change", applyStorageDir);
          storageInput.addEventListener("blur", applyStorageDir);

          openButton.addEventListener("click", () => {
            void this.openSourceStorageFolder(source.id);
          });

          checkbox.addEventListener("change", () => {
            const enabled = !!checkbox.checked;
            this.settingsData.enabledSources[source.id] = enabled;
            maxInput.disabled = !enabled;
            storageInput.disabled = !enabled;
            openButton.disabled = !enabled;
            action.classList.toggle("is-disabled", !enabled);
            void this.saveSettingsData();
            this.refreshEnhancedPanels();
          });

          toggle.appendChild(checkbox);
          limitWrap.appendChild(limitLabel);
          limitWrap.appendChild(maxInput);
          limitWrap.appendChild(limitUnit);
          storageWrap.appendChild(storageLabel);
          storageWrap.appendChild(storageInput);
          action.appendChild(limitWrap);
          action.appendChild(storageWrap);
          action.appendChild(openButton);
          action.appendChild(toggle);
          action.classList.toggle("is-disabled", !checkbox.checked);

          this.settingSourceInputs.set(source.id, checkbox);
          this.settingSourceMaxInputs.set(source.id, maxInput);
          this.settingSourceStorageInputs.set(source.id, storageInput);
          this.settingSourceOpenButtons.set(source.id, openButton);
          this.settingSourceActionEls.set(source.id, action);
          return action;
        },
      });
    });

    this.setting.addItem({
      title: this.t("settingsInlineHintTitle"),
      description: this.t("settingsInlineHintDesc"),
      createActionElement: () => {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "b3-switch fn__flex-center";
        checkbox.checked = !!this.settingsData?.enableInlineHint;
        checkbox.addEventListener("change", () => {
          this.settingsData.enableInlineHint = !!checkbox.checked;
          void this.saveSettingsData();
        });
        this.settingInlineHintInput = checkbox;
        return checkbox;
      },
    });

    this.syncSettingUI();
  }

  /* 鈹€鈹€ Panel observation 鈹€鈹€ */

  observePanels() {
    this.enhanceAll();
    this.observer = new MutationObserver(() => this.enhanceAll());
    this.observer.observe(document.body, {childList: true, subtree: true});
  }

  enhanceAll() {
    if (this._mutating) return;
    document.querySelectorAll(".emojis").forEach((root) => {
      if (root.closest(".protyle-hint, .hint--menu")) {
        this.enhanceHintPanel(root);
      } else {
        this.enhancePanel(root);
      }
    });
  }

  cleanupInjected() {
    document.querySelectorAll(".emojis[data-if-market-enhanced]").forEach((root) => {
      const st = this.panelStates.get(root);
      if (st?.dispose) st.dispose();
      root.removeAttribute("data-if-market-enhanced");
    });
    document.querySelectorAll('[data-if-market="1"]').forEach((el) => el.remove());
  }

  enhancePanel(root) {
    if (!(root instanceof HTMLElement)) return;
    if (root.dataset.ifMarketEnhanced === "true") return;

    const tab =
      root.querySelector('.emojis__tabbody [data-type="tab-emoji"]') ||
      root.querySelector('[data-type="tab-emoji"]');
    const input =
      tab?.querySelector(".b3-text-field") ||
      root.querySelector('.emojis__tabbody [data-type="tab-emoji"] .b3-text-field') ||
      root.querySelector(".b3-text-field");
    const panel =
      tab?.querySelector(".emojis__panel") ||
      root.querySelector('.emojis__tabbody [data-type="tab-emoji"] .emojis__panel');
    if (!(input instanceof HTMLInputElement) || !(panel instanceof HTMLElement)) return;

    const st = {
      input,
      panel,
      title: null,
      content: null,
      marketNodes: [],
      timer: 0,
      seq: 0,
      disposed: false,
      dispose: null,
    };

    const onInput = (e) => {
      if (e?.isComposing) return;
      this.scheduleSearch(st);
    };
    const onCompEnd = () => this.scheduleSearch(st, 0);
    const onKeyup = () => this.scheduleSearch(st, 0);
    const onChange = () => this.scheduleSearch(st, 0);

    input.addEventListener("input", onInput);
    input.addEventListener("compositionend", onCompEnd);
    input.addEventListener("keyup", onKeyup);
    input.addEventListener("change", onChange);

    st.dispose = () => {
      if (st.disposed) return;
      st.disposed = true;
      if (st.timer) clearTimeout(st.timer);
      input.removeEventListener("input", onInput);
      input.removeEventListener("compositionend", onCompEnd);
      input.removeEventListener("keyup", onKeyup);
      input.removeEventListener("change", onChange);
      this.removeSection(st);
    };

    this.panelStates.set(root, st);
    root.dataset.ifMarketEnhanced = "true";

    if (input.value.trim()) this.scheduleSearch(st, 0);
  }

  /* 鈹€鈹€ Hint panel (inline :xxx popup) 鈹€鈹€ */

  enhanceHintPanel(root) {
    if (!(root instanceof HTMLElement)) return;
    if (!this.settingsData?.enableInlineHint) return;
    const panel = root.querySelector(".emojis__panel");
    if (!(panel instanceof HTMLElement)) return;

    const kw = this.getHintKeyword();
    if (!kw) return;

    let st = this.panelStates.get(root);
    if (!st || st.disposed) {
      st = {
        input: null,
        panel,
        title: null,
        content: null,
        marketNodes: [],
        timer: 0,
        seq: 0,
        disposed: false,
        dispose: null,
        isHint: true,
        lastHintKw: "",
      };
      st.dispose = () => {
        if (st.disposed) return;
        st.disposed = true;
        if (st.timer) clearTimeout(st.timer);
        this.removeSection(st);
      };
      this.panelStates.set(root, st);
    }

    if (st.panel !== panel) {
      st.panel = panel;
      st.title = null;
      st.content = null;
    }

    if (st.lastHintKw === kw && st.content && st.content.parentElement === panel) {
      this.showHintContainer(st);
      return;
    }
    st.lastHintKw = kw;
    void this.searchAndRender(st, kw);
  }

  getHintKeyword() {
    try {
      const sel = document.getSelection();
      if (!sel || !sel.rangeCount) return "";
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return "";
      const text = node.textContent || "";
      const offset = range.startOffset;
      const before = text.substring(0, offset);
      const colonIdx = before.lastIndexOf(":");
      if (colonIdx < 0) return "";
      const kw = before.substring(colonIdx + 1).trim();
      return kw.length >= 1 ? kw : "";
    } catch {
      return "";
    }
  }

  showHintContainer(st) {
    if (!st?.isHint || !(st.panel instanceof HTMLElement)) return;
    const host = st.panel.closest(".protyle-hint");
    if (host instanceof HTMLElement) host.classList.remove("fn__none");
  }

  /* 鈹€鈹€ Search scheduling 鈹€鈹€ */

  scheduleSearch(st, delay = 280) {
    if (!st || st.disposed) return;
    if (st.timer) clearTimeout(st.timer);

    const kw = st.input ? s(st.input.value).trim() : (st.isHint ? s(st.lastHintKw).trim() : "");
    if (!kw) {
      st.seq += 1;
      this.removeSection(st);
      return;
    }

    st.timer = window.setTimeout(() => void this.searchAndRender(st, kw), delay);
  }

  removeSection(st) {
    const nodes = Array.isArray(st?.marketNodes) ? st.marketNodes : [];
    nodes.forEach((node) => {
      if (node instanceof HTMLElement && node.parentElement) node.remove();
    });
    if (st) {
      st.marketNodes = [];
      st.title = null;
      st.content = null;
    }
  }

  getPanelInsertAnchor(panel, exclude = new Set()) {
    if (!(panel instanceof HTMLElement)) return null;
    let titles = [];
    try {
      titles = Array.from(panel.children).filter(
        (el) =>
          el instanceof HTMLElement &&
          el.classList.contains("emojis__title") &&
          !exclude.has(el) &&
          s(el.dataset?.ifMarket).trim() !== "1"
      );
    } catch {
      titles = [];
    }
    return titles.length >= 2 ? titles[1] : null;
  }

  insertMarketNodes(st, nodes) {
    if (!st || !(st.panel instanceof HTMLElement)) return;
    const valid = Array.isArray(nodes) ? nodes.filter((el) => el instanceof HTMLElement) : [];
    if (!valid.length) {
      this.removeSection(st);
      return;
    }

    const panel = st.panel;
    const exclude = new Set(valid);
    const anchor = this.getPanelInsertAnchor(panel, exclude);
    valid.forEach((node) => {
      if (node.parentElement) node.remove();
      panel.insertBefore(node, anchor);
    });
    st.marketNodes = valid;
    st.title = valid.find((el) => el.classList.contains("emojis__title")) || null;
    st.content = valid.find((el) => el.classList.contains("emojis__content")) || null;
  }

  ensureSection(st) {
    this._mutating = true;
    try {
      this.removeSection(st);
      const title = document.createElement("div");
      title.className = "emojis__title";
      title.dataset.ifMarket = "1";
      title.textContent = this.t("storeTitle");
      const content = document.createElement("div");
      content.className = "emojis__content";
      content.dataset.ifMarket = "1";
      this.insertMarketNodes(st, [title, content]);
      return content;
    } finally {
      this._mutating = false;
    }
  }

  /* 鈹€鈹€ Search & render 鈹€鈹€ */

  async searchAndRender(st, reqKw) {
    if (!st || st.disposed) return;
    const cur = st.input ? s(st.input.value).trim() : (st.isHint ? s(st.lastHintKw).trim() : "");
    if (!cur) return this.removeSection(st);
    const kw = cur;

    let c;
    try {
      c = this.ensureSection(st);
      this.showHintContainer(st);
    } catch (err) {
      console.error("[emoji-market] ensure section failed", err);
      return;
    }
    c.classList.add("if-market-loading");
    c.innerHTML = `<div class="emojis__title if-market-searching" data-if-market="1">${this.escapeHtml(this.t("searching"))}</div>`;

    st.seq += 1;
    const seq = st.seq;

    try {
      const enabledSources = this.getEnabledSources();
      if (!enabledSources.length) {
        c.classList.remove("if-market-loading");
        c.innerHTML = `<div class="emojis__title if-market-empty" data-if-market="1">${this.escapeHtml(this.t("settingsNoSourceEnabled"))}</div>`;
        this.showHintContainer(st);
        return;
      }

      const bySource = await this.searchAllSources(kw, enabledSources);
      if (st.disposed || st.seq !== seq) return;
      this.renderResults(st, kw, enabledSources, bySource);
      this.showHintContainer(st);
    } catch (err) {
      if (st.disposed || st.seq !== seq) return;
      c.classList.remove("if-market-loading");
      c.innerHTML = `<div class="emojis__title if-market-empty" data-if-market="1">${this.escapeHtml(this.t("searchFailed", {msg: safeMsg(err)}))}</div>`;
      this.showHintContainer(st);
    }
  }

  renderResults(st, kw, sources, bySource) {
    this._mutating = true;
    try {
      const nodes = [];
      sources.forEach((source) => {
        const pair = this.renderSourceBlock(source, kw, bySource[source.id] || {items: [], error: null});
        nodes.push(...pair);
      });
      this.removeSection(st);
      this.insertMarketNodes(st, nodes);
    } finally {
      this._mutating = false;
    }
  }

  renderSourceBlock(source, kw, res) {
    const items = Array.isArray(res.items) ? res.items.slice(0, this.getMaxPerSource(source.id)) : [];
    const resultCount = res.error ? 0 : items.length;

    const t = document.createElement("div");
    t.className = "emojis__title";
    t.dataset.ifMarket = "1";
    t.textContent = `${this.t("storeTitle")} - ${source.name} (${resultCount})`;

    const body = document.createElement("div");
    body.className = "emojis__content";
    body.dataset.ifMarket = "1";

    if (res.error) {
      body.innerHTML = `<div class="emojis__title if-market-empty" data-if-market="1">${this.escapeHtml(this.t("sourceSearchFailed", {source: source.name, msg: safeMsg(res.error)}))}</div>`;
      return [t, body];
    }

    if (!items.length) {
      body.innerHTML = `<div class="emojis__title if-market-empty" data-if-market="1">${this.escapeHtml(this.t("noResults", {kw}))}</div>`;
      return [t, body];
    }

    items.forEach((icon) => body.appendChild(this.createResultButton(source, icon, kw)));
    return [t, body];
  }

  /* 鈹€鈹€ Result buttons (FIX #1: no emojis__item class initially) 鈹€鈹€ */

  createResultButton(source, icon, kw) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emojis__item ariaLabel";
    btn.setAttribute("aria-label", s(icon?.name, "icon"));
    btn.dataset.ifMarket = "1";
    btn.dataset.ifKeyword = kw;
    btn.dataset.ifProvider = source.id;
    btn.dataset.ifIconId = s(icon?.id);
    btn.dataset.ifReady = "0";
    btn.dataset.ifSaving = "0";
    btn.__ifMarketIcon = icon;

    const preview = this.safeSvgElement(icon?.previewSvg);
    if (preview) btn.appendChild(preview);
    else btn.textContent = "?";

    const trapPendingNativePick = (e) => {
      if (btn.dataset.ifReady === "1") return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    };
    btn.addEventListener("pointerdown", trapPendingNativePick, {capture: true});
    btn.addEventListener("mousedown", trapPendingNativePick, {capture: true});

    btn.addEventListener("click", (e) => {
      if (btn.dataset.ifReady === "1") return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      void this.onPick(btn, source, icon);
    });

    return btn;
  }

  collectSiblingPickItems(btn, source, icon) {
    const fallbackBtn = btn instanceof HTMLElement ? btn : null;
    const fallback = [{btn: fallbackBtn, source, icon}];

    if (!(btn instanceof HTMLElement)) return {items: fallback, index: 0};

    const group = btn.closest(".emojis__content");
    if (!(group instanceof HTMLElement)) return {items: fallback, index: 0};

    const nodes = Array.from(group.querySelectorAll('.emojis__item[data-if-market="1"]'));
    const items = [];
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const providerId = s(node.dataset.ifProvider).trim();
      const mappedSource = SOURCE_MAP[providerId] || source;

      let mappedIcon = node.__ifMarketIcon;
      if (!mappedIcon || typeof mappedIcon !== "object") {
        const id = s(node.dataset.ifIconId).trim();
        if (!id) return;
        mappedIcon = {
          id,
          name: s(node.getAttribute("aria-label"), "icon"),
          previewSvg: s(node.innerHTML),
        };
      }

      items.push({btn: node, source: mappedSource, icon: mappedIcon});
    });

    if (!items.length) return {items: fallback, index: 0};

    let index = items.findIndex((x) => x.btn === btn);
    if (index < 0) {
      const provider = s(source?.id || btn.dataset.ifProvider).trim();
      const iconId = s(icon?.id !== undefined && icon?.id !== null ? String(icon.id) : btn.dataset.ifIconId).trim();
      if (provider && iconId) {
        index = items.findIndex((x) => {
          if (!(x.btn instanceof HTMLElement)) return false;
          return s(x.btn.dataset.ifProvider).trim() === provider && s(x.btn.dataset.ifIconId).trim() === iconId;
        });
      }
    }

    if (index < 0) index = 0;
    return {items, index};
  }

  /* 鈹€鈹€ Pick & import (FIX #3: auto-select after import) 鈹€鈹€ */

  async onPick(btn, source, icon) {
    if (btn.dataset.ifSaving === "1") return;
    btn.dataset.ifSaving = "1";
    btn.classList.add("if-market-item--saving");

    try {
      const kw = s(btn.dataset.ifKeyword).trim();
      const selectionCtx = this.captureSelectionContext(btn);
      const pickGroup = this.collectSiblingPickItems(btn, source, icon);
      const items = Array.isArray(pickGroup.items) && pickGroup.items.length
        ? pickGroup.items
        : [{btn, source, icon}];
      const idx = Number.isFinite(pickGroup.index) ? Math.max(0, Math.min(items.length - 1, Math.trunc(pickGroup.index))) : 0;
      const first = items[idx] || {};
      const firstBtn = first.btn instanceof HTMLElement ? first.btn : btn;
      const firstSource = first.source || source;
      const firstIcon = first.icon || icon;
      const firstDetail = await this.getDetail(firstSource, firstIcon);

      const decision = await this.showImportDialog(firstSource, firstIcon, firstDetail, kw, {
        items,
        index: idx,
      });
      if (!decision?.confirmed) return;

      const finalBtn = decision.btn instanceof HTMLElement ? decision.btn : firstBtn;
      const finalSource = decision.source || firstSource;
      const finalIcon = decision.icon || firstIcon;
      const finalDetail = decision.detail || firstDetail;

      const saved = await this.saveToEmojiStore(finalSource, finalIcon, finalDetail, {
        keyword: kw,
        selectedColor: decision.selectedColor,
        slotColors: decision.slotColors,
        keepOriginalColor: decision.keepOriginalColor,
      });
      await this.refreshRuntimeEmojiCache(saved.unicodePath);

      await this.applyImportedSelection(
        finalBtn,
        finalSource,
        finalIcon,
        saved.unicodePath,
        selectionCtx,
        kw,
        !!finalBtn.closest(".protyle-hint, .hint--menu")
      );
    } catch (err) {
      const msg = this.t("downloadFailed", {source: source.name, msg: safeMsg(err)});
      if (typeof showMessage === "function") showMessage(msg, 3000, "error");
      else console.error(msg);
    } finally {
      btn.dataset.ifSaving = "0";
      btn.classList.remove("if-market-item--saving");
    }
  }

  /* 鈹€鈹€ Multi-source search 鈹€鈹€ */

  async searchAllSources(keyword, sources = null) {
    const sourceList = Array.isArray(sources) ? sources : this.getEnabledSources();
    const jobs = sourceList.map((source) => {
      if (source.id === "iconfont") return this.searchIconfont(keyword);
      return this.searchCainiao(keyword);
    });

    const settled = await Promise.allSettled(jobs);
    const out = {};
    sourceList.forEach((source, idx) => {
      const x = settled[idx];
      out[source.id] = x.status === "fulfilled" ? {items: x.value || [], error: null} : {items: [], error: x.reason};
    });
    return out;
  }

  async searchIconfont(keyword) {
    const key = `s:iconfont:${n(keyword).toLowerCase()}`;
    const now = Date.now();
    const cached = this.searchCache.get(key);
    if (cached && now - cached.at < SEARCH_TTL) return cached.items;

    const target = this.getMaxPerSource("iconfont");
    const maxPages = Math.min(ICONFONT_MAX_PAGES, Math.max(1, Math.ceil(target / ICONFONT_PAGE_SIZE)));
    const ref = `${SOURCE_MAP.iconfont.origin}/search/index?searchType=icon&q=${encodeURIComponent(keyword)}`;
    const items = [];
    const seen = new Set();
    let totalAvailable = Number.POSITIVE_INFINITY;

    for (let page = 1; page <= maxPages && items.length < target; page += 1) {
      const params = new URLSearchParams();
      params.set("q", keyword);
      params.set("page", String(page));
      params.set("count", String(ICONFONT_PAGE_SIZE));
      params.set("sortType", "updated_at");
      params.set("fromCollection", "1");

      const json = await this.requestJson(
        `${SOURCE_MAP.iconfont.origin}/api/icon/search.json?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Referer: ref,
            Origin: SOURCE_MAP.iconfont.origin,
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest",
          },
        },
        SOURCE_MAP.iconfont.origin
      );

      if (Number(json?.code) !== 200) throw new Error(s(json?.message, "iconfont search error"));
      const totalCount = parseIntSafe(json?.data?.count, 0);
      if (totalCount > 0) totalAvailable = totalCount;

      const rows = Array.isArray(json?.data?.icons) ? json.data.icons : [];
      if (!rows.length) break;

      rows.forEach((row) => {
        if (items.length >= target) return;
        const id = n(row?.id);
        if (!id || seen.has(id)) return;

        let previewSvg = s(row?.show_svg).trim();
        if (!previewSvg) previewSvg = this.buildIconfontSvg(row);
        if (!previewSvg) return;

        const name = n(row?.name || row?.slug || row?.font_class || `icon-${id}`);
        items.push({
          provider: "iconfont",
          id,
          name,
          previewSvg,
          detailUrl: `${SOURCE_MAP.iconfont.origin}/icons/detail?icon_id=${encodeURIComponent(id)}`,
        });
        seen.add(id);
      });

      if (rows.length < ICONFONT_PAGE_SIZE) break;
      if (Number.isFinite(totalAvailable) && items.length >= Math.min(target, totalAvailable)) break;
    }

    this.searchCache.set(key, {at: now, items});
    return items;
  }

  buildIconfontSvg(data) {
    const o = s(data?.origin_file).trim();
    if (o) return o;

    const show = s(data?.show_svg).trim();
    if (show) return show;

    const raw = s(data?.svg).trim();
    if (!raw) return "";

    const width = parseIntSafe(data?.width, 1024) || 1024;
    const height = parseIntSafe(data?.height, 1024) || 1024;
    const paths = raw.split("|").map((x) => x.trim()).filter(Boolean);
    if (!paths.length) return "";

    const attrs = s(data?.path_attributes)
      .split("|")
      .map((x) => x.trim());

    const body = paths
      .map((d, i) => {
        const extra = attrs[i] ? ` ${attrs[i]}` : "";
        return `<path d="${this.escapeHtml(d)}"${extra} />`;
      })
      .join("");

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  async searchCainiao(keyword) {
    const key = `s:cainiao:${n(keyword).toLowerCase()}`;
    const now = Date.now();
    const cached = this.searchCache.get(key);
    if (cached && now - cached.at < SEARCH_TTL) return cached.items;

    const target = this.getMaxPerSource("cainiao");
    const maxPages = Math.min(CAINIAO_MAX_PAGES, Math.max(1, target));
    const items = [];
    const seen = new Set();
    const parser = new DOMParser();

    for (let page = 1; page <= maxPages && items.length < target; page += 1) {
      const url = `${SOURCE_MAP.cainiao.origin}/s-${encodeURIComponent(keyword)}-${page}.html`;
      const html = await this.requestText(
        url,
        {
          method: "GET",
          headers: {
            Referer: `${SOURCE_MAP.cainiao.origin}/`,
            Origin: SOURCE_MAP.cainiao.origin,
            "User-Agent": "Mozilla/5.0",
          },
        },
        SOURCE_MAP.cainiao.origin
      );

      const doc = parser.parseFromString(String(html || ""), "text/html");
      let added = 0;

      doc.querySelectorAll(".icon-item").forEach((item) => {
        if (items.length >= target) return;
        const id = n(item.getAttribute("data-id"));
        if (!id || seen.has(id)) return;

        const previewSvg = s(item.querySelector(".icon-content svg")?.outerHTML).trim();
        if (!previewSvg) return;

        const anchor = item.querySelector('a[href^="/detail/"]');
        const rawPath = s(anchor?.getAttribute("href"), `/detail/${id}.html`);
        const detailPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

        let name = n(anchor?.textContent || "");
        if (!name) name = n(item.querySelector("p")?.textContent || "");
        if (!name) name = `icon-${id}`;

        items.push({
          provider: "cainiao",
          id,
          name,
          previewSvg,
          detailUrl: this.toAbs(SOURCE_MAP.cainiao, detailPath),
        });
        seen.add(id);
        added += 1;
      });

      if (!added) break;
    }

    this.searchCache.set(key, {at: now, items});
    return items;
  }

  /* 鈹€鈹€ Detail fetching 鈹€鈹€ */

  async getDetail(source, icon) {
    const key = `d:${source.id}:${n(icon?.id) || n(icon?.detailUrl)}`;
    const now = Date.now();
    const cached = this.detailCache.get(key);
    if (cached && now - cached.at < DETAIL_TTL) return cached.detail;

    let detail;
    if (source.id === "iconfont") detail = await this.getIconfontDetail(icon);
    else detail = await this.getCainiaoDetail(icon);

    this.detailCache.set(key, {at: now, detail});
    return detail;
  }

  async getIconfontDetail(icon) {
    const id = n(icon?.id);
    if (!id) throw new Error("iconfont id missing");

    const json = await this.requestJson(
      `${SOURCE_MAP.iconfont.origin}/api/icon/iconInfo.json?id=${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Referer: `${SOURCE_MAP.iconfont.origin}/search/index?searchType=icon`,
          Origin: SOURCE_MAP.iconfont.origin,
          "User-Agent": "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
      SOURCE_MAP.iconfont.origin
    );

    if (Number(json?.code) !== 200) throw new Error(s(json?.message, "iconfont detail error"));
    const d = json?.data || {};
    const c = Array.isArray(d.collections) && d.collections.length ? d.collections[0] : null;

    const creator = d?.creater || d?.creator || {};
    const creatorUid = n(creator?.id || d?.user_id || "");
    const creatorNid = n(creator?.nid || "");
    const authorUrl = creatorUid
      ? `${SOURCE_MAP.iconfont.origin}/user/detail?uid=${encodeURIComponent(creatorUid)}${creatorNid ? `&nid=${encodeURIComponent(creatorNid)}` : ""}`
      : "";

    const avatarUrl = this.toAbs(SOURCE_MAP.iconfont, httpsUrl(s(creator?.avatar || d?.avatar || "")));

    const fees = n(c?.fees || "");
    const copyrightType = n(c?.copyright || "");
    const collectionLicense = n(c?.license || "");
    const collectionName = n(c?.name || "");
    const collectionUrl = c?.id
      ? `${SOURCE_MAP.iconfont.origin}/collections/detail?cid=${encodeURIComponent(c.id)}`
      : "";
    const commercialUrl = s(c?.url || "").trim();

    const palette = this.extractColors(s(d.path_attributes), s(d.show_svg), s(d.origin_file));
    const svg = s(d.origin_file).trim() || s(d.show_svg).trim() || this.buildIconfontSvg(d) || s(icon?.previewSvg).trim();

    return {
      title: cleanTitleText(d.name || icon?.name || this.t("unnamed")),
      author: n(creator?.nickname || "") || this.t("unknownAuthor"),
      authorUrl,
      avatarUrl,
      updatedAt: fmtDate(d.updated_at),
      license: collectionLicense || (copyrightType === "opensource" ? this.t("licenseOpenSource") : (copyrightType === "original" ? this.t("licenseOriginal") : this.t("unlabeled"))),
      licenseUrl: ICONFONT_COPYRIGHT_TERMS_URL,
      usageLines: [],
      usageLinkUrl: ICONFONT_COPYRIGHT_TERMS_URL,
      svg,
      defaultColor: palette[0] || FALLBACK_COLOR,
      detailUrl: `${SOURCE_MAP.iconfont.origin}/detail/index?icon_id=${encodeURIComponent(id)}`,
      collectionName,
      collectionUrl,
      commercialUrl,
      tags: n(d.slug).split(/[\uFF0C,\s]+/).map((x) => n(x)).filter(Boolean),
      favorCount: parseIntSafe(d.favorCount, 0),
      paletteColors: palette,
      copyrightUrl: ICONFONT_COPYRIGHT_TERMS_URL,
      fees,
      copyrightType,
    };
  }

  async getCainiaoDetail(icon) {
    const id = n(icon?.id);
    const detailUrl = s(icon?.detailUrl) || this.toAbs(SOURCE_MAP.cainiao, `/detail/${id}.html`);

    const html = await this.requestText(
      detailUrl,
      {
        method: "GET",
        headers: {
          Referer: `${SOURCE_MAP.cainiao.origin}/`,
          Origin: SOURCE_MAP.cainiao.origin,
          "User-Agent": "Mozilla/5.0",
        },
      },
      SOURCE_MAP.cainiao.origin
    );

    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    const root = doc.querySelector(".main-detail") || doc.body || doc;

    const spans = Array.from(root.querySelectorAll("span"));
    const authorSpan = spans.find((x) => /^(?:\u4f5c\u8005|author)\s*[:\uFF1A]/i.test(n(x.textContent)));
    const licSpan = spans.find((x) => /^(?:\u534f\u8bae|license)\s*[:\uFF1A]/i.test(n(x.textContent)));
    const authorLink = authorSpan?.querySelector("a[href]");
    const licLink = licSpan?.querySelector("a[href]");

    const usageLines = [];
    let usageLinkUrl = "";

    const usageLabel = Array.from(root.querySelectorAll("p")).find((p) => {
      const txt = n(p.textContent);
      return txt.startsWith("\u4f7f\u7528\u8bb8\u53ef") || txt.toLowerCase().startsWith("license");
    });
    const usageContainer = usageLabel?.parentElement || null;

    if (usageContainer) {
      Array.from(usageContainer.querySelectorAll("p.mt-1.text-gray-400")).forEach((p) => {
        const line = n(p.textContent);
        if (!line) return;
        if (/^(?:\u5927\u5c0f|\u5bbd\u5ea6|\u989c\u8272|size|width|color)\s*[:\uFF1A]/i.test(line)) return;
        usageLines.push(line);
      });

      const link = usageContainer.querySelector("a[href]");
      if (link) {
        usageLinkUrl = this.toAbs(SOURCE_MAP.cainiao, link.getAttribute("href") || "");
      }
    }

    if (!usageLines.length) {
      root.querySelectorAll("p,li").forEach((node) => {
        const line = n(node.textContent);
        if (!line) return;
        if (/^(?:\u5927\u5c0f|\u5bbd\u5ea6|\u989c\u8272|size|width|color)\s*[:\uFF1A]/i.test(line)) return;
        if (/(?:\u5546\u7528|\u6388\u6743|\u8bb8\u53ef|copyright|license|commercial)/i.test(line)) {
          usageLines.push(line);
        }
      });
    }

    const usageDedup = [];
    const usageSet = new Set();
    usageLines.forEach((line) => {
      const t = n(line);
      if (!t || usageSet.has(t)) return;
      usageSet.add(t);
      usageDedup.push(t);
    });

    const svgEl = root.querySelector("#svg") || root.querySelector(".svg-box svg") || root.querySelector("svg");
    const svg = s(svgEl?.outerHTML || icon?.previewSvg).trim();

    let defaultColor = FALLBACK_COLOR;
    const colorBtn = root.querySelector(".color-button");
    if (colorBtn) {
      const style = s(colorBtn.getAttribute("style"));
      const m = style.match(/background-color\s*:\s*([^;]+)/i);
      const x = n(m ? m[1] : "");
      defaultColor = normalizeHex(x) || rgbToHex(x) || defaultColor;
    }

    const fallbackUsageLink = this.toAbs(
      SOURCE_MAP.cainiao,
      root.querySelector('a[href*="license" i], a[href*="xieyi" i], a[href*="protocol" i]')?.getAttribute("href") || ""
    );

    return {
      title: cleanTitleText(root.querySelector("h1")?.textContent || icon?.name || this.t("unnamed")),
      author: n(s(authorLink?.textContent) || s(authorSpan?.textContent).replace(/^.*[:\uFF1A]\s*/, "")) || this.t("unknownAuthor"),
      authorUrl: this.toAbs(SOURCE_MAP.cainiao, authorLink?.getAttribute("href") || ""),
      license: n(s(licLink?.textContent) || s(licSpan?.textContent).replace(/^.*[:\uFF1A]\s*/, "")) || this.t("unlabeled"),
      licenseUrl: this.toAbs(SOURCE_MAP.cainiao, licLink?.getAttribute("href") || ""),
      usageLines: usageDedup,
      usageLinkUrl: usageLinkUrl || fallbackUsageLink,
      svg,
      defaultColor: isHex(defaultColor) ? defaultColor : FALLBACK_COLOR,
      detailUrl,
      paletteColors: this.extractColors(svg),
    };
  }

  extractUsage(raw) {
    if (Array.isArray(raw)) return raw.map((x) => n(x)).filter(Boolean);
    return String(raw || "").split(/[\r\n;,\uFF0C]+/).map((x) => n(x)).filter(Boolean);
  }

  extractColors(...texts) {
    const set = new Set();
    texts.forEach((text) => {
      const matches = String(text || "").match(/#[0-9a-fA-F]{3,8}/g) || [];
      matches.forEach((m) => {
        const h = normalizeHex(m);
        if (h) set.add(h);
      });
    });
    return Array.from(set).slice(0, 16);
  }

  normalizeSlotColorMap(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    Object.entries(input).forEach(([slotId, color]) => {
      const id = String(slotId || "").trim();
      const hex = normalizeHex(color);
      if (!id || !hex) return;
      out[id] = hex;
    });
    return out;
  }

  getColorAnalysis(detail, icon) {
    const host = detail && typeof detail === "object" ? detail : null;
    if (host && host.__ifColorAnalysis) return host.__ifColorAnalysis;
    const rawSvg = s(detail?.svg).trim() || s(icon?.previewSvg).trim();
    const currentColorFallback = isHex(detail?.defaultColor) ? detail.defaultColor : FALLBACK_COLOR;
    const analysis = this.inspectSvgColorSlots(rawSvg, currentColorFallback);
    if (host) host.__ifColorAnalysis = analysis;
    return analysis;
  }

  getResolvedSlotColors(analysis, slotColors = {}, fallbackColor = FALLBACK_COLOR) {
    if (!Array.isArray(analysis?.slots) || !analysis.slots.length) return [];
    const overrides = this.normalizeSlotColorMap(slotColors);
    return analysis.slots.map((slot) => {
      const override = normalizeHex(overrides[String(slot.id)]);
      if (override) return override;
      return displayColorFromToken(slot.displayColor || slot.token, fallbackColor);
    });
  }

  inspectSvgColorSlots(rawSvg, currentColorFallback = FALLBACK_COLOR) {
    const fallback = isHex(currentColorFallback) ? currentColorFallback : FALLBACK_COLOR;
    const empty = {slots: []};
    if (!rawSvg) return empty;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return empty;

      const all = [svg, ...svg.querySelectorAll("*")];
      const slotMap = new Map();
      const slotList = [];
      const props = ["fill", "stroke", "stop-color", "color"];
      const graphicSelector = "path,circle,rect,polygon,polyline,ellipse,line,use,text,tspan";
      const graphicTags = new Set(graphicSelector.split(","));
      const paintServerTags = new Set(["lineargradient", "radialgradient", "pattern"]);
      const nodeIndexByEl = new Map(all.map((el, index) => [el, index]));

      const ensureSlot = (key, options = {}) => {
        let slot = slotMap.get(key);
        if (!slot) {
          slot = {
            id: s(options.id, String(slotList.length)),
            order: Number.isFinite(options.order) ? options.order : slotList.length,
            token: s(options.token),
            displayColor: displayColorFromToken(options.token, fallback),
            nodeIndexes: new Set(),
            sources: [],
          };
          slotMap.set(key, slot);
          slotList.push(slot);
          return slot;
        }

        if (!slot.token && options.token) slot.token = s(options.token);
        if ((!slot.displayColor || !isHex(slot.displayColor)) && options.token) {
          slot.displayColor = displayColorFromToken(options.token, fallback);
        }
        if (Number.isFinite(options.order)) slot.order = Math.min(slot.order, options.order);
        return slot;
      };

      const collectUrlRefs = (value) => {
        const refs = [];
        const re = /url\(\s*(['"]?)([^)"']+)\1\s*\)/gi;
        let match = null;
        const text = s(value);
        while ((match = re.exec(text))) {
          const rawRef = s(match[2]).trim();
          const ref = s(rawRef.split("#").pop()).trim();
          if (ref) refs.push(ref);
        }
        return refs;
      };

      const findPaintServerOwnerId = (el) => {
        let node = el;
        while (node instanceof Element) {
          if (!paintServerTags.has(node.tagName.toLowerCase())) {
            node = node.parentElement;
            continue;
          }
          const id = s(node.getAttribute("id")).trim();
          if (id) return id;
          node = node.parentElement;
        }
        return "";
      };

      const hasIndexedSlots = all.some((el) => /^\d+$/.test(s(el.getAttribute("data-colorindex")).trim()));

      if (hasIndexedSlots) {
        all.forEach((el, nodeIndex) => {
          const slotId = s(el.getAttribute("data-colorindex")).trim();
          if (!/^\d+$/.test(slotId)) return;

          const sources = [];
          let firstToken = "";
          props.forEach((attrName) => {
            const value = s(el.getAttribute(attrName)).trim();
            if (!this.isReplacableColor(value)) return;
            if (!firstToken) firstToken = normalizeColorToken(value);
            sources.push({nodeIndex, kind: "attr", attrName});
          });

          const style = el.style;
          props.forEach((propName) => {
            const value = s(style?.getPropertyValue(propName)).trim();
            if (!this.isReplacableColor(value)) return;
            if (!firstToken) firstToken = normalizeColorToken(value);
            sources.push({nodeIndex, kind: "style", propName});
          });

          const slot = ensureSlot(`i:${slotId}`, {
            id: slotId,
            order: parseIntSafe(slotId, slotList.length),
            token: firstToken,
          });
          sources.forEach((source) => slot.sources.push(source));
        });
      } else {
        const linkSlot = (value, source, nodeIndex) => {
          if (!this.isReplacableColor(value)) return;
          const token = normalizeColorToken(value);
          if (!token) return;
          const slot = ensureSlot(`c:${token}`, {token});
          slot.sources.push(source);
        };

        all.forEach((el, nodeIndex) => {
          props.forEach((attrName) => {
            linkSlot(s(el.getAttribute(attrName)).trim(), {nodeIndex, kind: "attr", attrName}, nodeIndex);
          });

          const style = el.style;
          props.forEach((propName) => {
            linkSlot(s(style?.getPropertyValue(propName)).trim(), {nodeIndex, kind: "style", propName}, nodeIndex);
          });
        });
      }

      const slotById = new Map(slotList.map((slot) => [String(slot.id), slot]));
      const sourceSlotMap = new Map();
      const paintServerSlots = new Map();

      const pushSourceSlot = (nodeIndex, kind, propName, slotId) => {
        const key = `${nodeIndex}:${kind}:${propName}`;
        if (!sourceSlotMap.has(key)) sourceSlotMap.set(key, new Set());
        sourceSlotMap.get(key).add(String(slotId));
      };

      slotList.forEach((slot) => {
        slot.sources.forEach((source) => {
          const propName = source.kind === "attr" ? source.attrName : source.propName;
          pushSourceSlot(source.nodeIndex, source.kind, propName, slot.id);

          if (propName !== "stop-color") return;
          const ownerId = findPaintServerOwnerId(all[source.nodeIndex]);
          if (!ownerId) return;
          if (!paintServerSlots.has(ownerId)) paintServerSlots.set(ownerId, new Set());
          paintServerSlots.get(ownerId).add(String(slot.id));
        });
      });

      const readInlinePaint = (el, nodeIndex, propName) => {
        const styleVal = s(el.style?.getPropertyValue(propName)).trim();
        if (styleVal) {
          return {
            value: styleVal,
            slotIds: Array.from(sourceSlotMap.get(`${nodeIndex}:style:${propName}`) || []),
          };
        }

        const attrVal = s(el.getAttribute(propName)).trim();
        if (attrVal) {
          return {
            value: attrVal,
            slotIds: Array.from(sourceSlotMap.get(`${nodeIndex}:attr:${propName}`) || []),
          };
        }

        return null;
      };

      const colorCache = new Map();
      const resolveColorSlots = (graphicIndex) => {
        if (colorCache.has(graphicIndex)) return colorCache.get(graphicIndex);

        const out = [];
        let node = all[graphicIndex];
        while (node instanceof Element) {
          const nodeIndex = nodeIndexByEl.get(node);
          if (!Number.isInteger(nodeIndex)) break;
          const def = readInlinePaint(node, nodeIndex, "color");
          if (!def) {
            node = node.parentElement;
            continue;
          }

          const token = normalizeColorToken(def.value);
          if (!token || token === "inherit") {
            node = node.parentElement;
            continue;
          }
          if (token === "currentColor") {
            node = node.parentElement;
            continue;
          }
          colorCache.set(graphicIndex, def.slotIds);
          return def.slotIds;
        }

        colorCache.set(graphicIndex, out);
        return out;
      };

      const resolvePaintSlots = (graphicIndex, propName) => {
        let node = all[graphicIndex];
        while (node instanceof Element) {
          const nodeIndex = nodeIndexByEl.get(node);
          if (!Number.isInteger(nodeIndex)) break;
          const def = readInlinePaint(node, nodeIndex, propName);
          if (!def) {
            node = node.parentElement;
            continue;
          }

          const token = normalizeColorToken(def.value);
          if (!token || token === "inherit") {
            node = node.parentElement;
            continue;
          }
          if (token === "none" || token === "transparent") return [];
          if (token === "currentColor") return resolveColorSlots(graphicIndex);

          const refs = collectUrlRefs(def.value);
          if (refs.length) {
            const ids = new Set();
            refs.forEach((ref) => {
              (paintServerSlots.get(ref) || []).forEach((slotId) => ids.add(slotId));
            });
            return Array.from(ids);
          }

          return def.slotIds;
        }
        return [];
      };

      all.forEach((el, nodeIndex) => {
        if (!(el instanceof SVGGraphicsElement)) return;
        const tagName = el.tagName.toLowerCase();
        if (!graphicTags.has(tagName)) return;
        if (el.closest("defs")) return;

        const slotIds = new Set([
          ...resolvePaintSlots(nodeIndex, "fill"),
          ...resolvePaintSlots(nodeIndex, "stroke"),
        ]);
        slotIds.forEach((slotId) => {
          const slot = slotById.get(String(slotId));
          if (slot) slot.nodeIndexes.add(nodeIndex);
        });
      });

      slotList.sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id), "en"));

      const slots = slotList
        .map((slot, order) => ({
          id: String(slot.id),
          order,
          token: s(slot.token),
          displayColor: displayColorFromToken(slot.token || slot.displayColor, fallback),
          nodeIndexes: Array.from(slot.nodeIndexes).sort((a, b) => a - b),
          sources: slot.sources.slice(),
        }))
        .filter((slot) => slot.sources.length > 0 || slot.nodeIndexes.length > 0);

      return {slots};
    } catch {
      return empty;
    }
  }

  applySlotColors(rawSvg, slotColors = {}, options = {}) {
    if (!rawSvg) return "";
    const analysis = options.analysis || this.inspectSvgColorSlots(rawSvg, options.currentColorFallback || FALLBACK_COLOR);
    if (!Array.isArray(analysis?.slots) || !analysis.slots.length) return rawSvg;

    const colorMap = new Map(
      Object.entries(this.normalizeSlotColorMap(slotColors))
        .filter(([, color]) => !!color)
        .map(([slotId, color]) => [String(slotId), color])
    );

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return rawSvg;

      const all = [svg, ...svg.querySelectorAll("*")];
      const interactive = options.markInteractive === true;
      const activeSlot = s(options.activeSlot).trim();
      const nodeSlots = interactive ? new Map() : null;

      all.forEach((el) => {
        el.removeAttribute("data-if-slotindexes");
        el.removeAttribute("data-if-active-slot");
      });

      analysis.slots.forEach((slot) => {
        const slotId = String(slot.id);
        const nextColor = colorMap.get(slotId);

        if (interactive) {
          slot.nodeIndexes.forEach((nodeIndex) => {
            if (!nodeSlots.has(nodeIndex)) nodeSlots.set(nodeIndex, []);
            const refs = nodeSlots.get(nodeIndex);
            if (!refs.includes(slotId)) refs.push(slotId);
          });
        }

        if (!nextColor) return;
        slot.sources.forEach((source) => {
          const el = all[source.nodeIndex];
          if (!(el instanceof Element)) return;

          if (source.kind === "attr") {
            if (el.hasAttribute(source.attrName)) el.setAttribute(source.attrName, nextColor);
            return;
          }

          if (source.kind === "style") {
            el.style.setProperty(source.propName, nextColor);
          }
        });
      });

      if (interactive) {
        nodeSlots.forEach((slotIds, nodeIndex) => {
          const el = all[nodeIndex];
          if (!(el instanceof Element)) return;
          if (slotIds.length === 1) el.setAttribute("data-colorindex", slotIds[0]);
          else if (slotIds.length > 1) el.setAttribute("data-if-slotindexes", slotIds.join(","));
          if (activeSlot && slotIds.includes(activeSlot)) el.setAttribute("data-if-active-slot", "1");
        });
      }

      return new XMLSerializer().serializeToString(svg);
    } catch {
      return rawSvg;
    }
  }

  toAbs(source, input) {
    const x = s(input).trim();
    if (!x) return "";
    try {
      return new URL(x, `${source.origin}/`).toString();
    } catch {
      return "";
    }
  }

  buildPalette(defaultColor) {
    const out = [];
    const seen = new Set();
    const push = (x) => {
      const h = normalizeHex(x);
      if (!h || seen.has(h)) return;
      seen.add(h);
      out.push(h);
    };

    push(defaultColor);
    SWATCHES.forEach(push);
    return out.slice(0, SWATCHES.length + 1);
  }

  /* 鈹€鈹€ Import dialog (FIX #2: avatar with referrerpolicy + error fallback) 鈹€鈹€ */


  /* 鈹€鈹€ Import dialog (FIX #2: avatar with referrerpolicy + error fallback) 鈹€鈹€ */

  buildImportDialogPanelHtml(source, icon, detail, keyword, navState = null) {
    const iconName = this.escapeHtml(cleanTitleText(detail?.title || icon?.name || this.t("unnamed")));
    const iconId = this.escapeHtml(s(icon?.id, "-"));
    const kw = this.escapeHtml(s(keyword));
    const sourceOrigin = this.escapeHtml(s(source?.origin));
    const sourceName = this.escapeHtml(s(source?.name));
    const canPrev = !!(navState && navState.hasPrev);
    const canNext = !!(navState && navState.hasNext);

    const prevSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5L8 12L15 19"/></svg>`;
    const nextSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L16 12L9 19"/></svg>`;
    const navHtml = `
        <button type="button" class="if-market-nav-btn if-market-nav-btn--prev" data-role="nav-prev" aria-label="Previous icon"${canPrev ? "" : " disabled"}>${prevSvg}</button>
        <button type="button" class="if-market-nav-btn if-market-nav-btn--next" data-role="nav-next" aria-label="Next icon"${canNext ? "" : " disabled"}>${nextSvg}</button>
      `;

    const authorText = this.escapeHtml(s(detail?.author, this.t("unknownAuthor")));
    const authorUrl = s(detail?.authorUrl);
    const authorHtml = authorUrl
      ? `<a href="${this.escapeHtml(authorUrl)}" target="_blank" rel="noreferrer">${authorText}</a>`
      : authorText;

    const licText = this.escapeHtml(s(detail?.license, this.t("unlabeled")));
    const licUrl = s(detail?.licenseUrl);
    const licHtml = licUrl
      ? `<a href="${this.escapeHtml(licUrl)}" target="_blank" rel="noreferrer">${licText}</a>`
      : licText;

    const isIconfont = s(source?.id) === "iconfont";

    const usageLines = Array.isArray(detail?.usageLines)
      ? detail.usageLines.map((x) => n(x)).filter(Boolean)
      : [];
    const usageLinesFinal = usageLines.length
      ? usageLines
      : (isIconfont ? [] : [
          this.t("usageCommercialNotice"),
          this.t("usagePluginDisclaimer"),
        ]);
    const usageHtml = usageLinesFinal.map((x) => `<li>${this.escapeHtml(x)}</li>`).join("");

    const usageLink = s(detail?.usageLinkUrl || detail?.licenseUrl);
    const usageLinkHtml = usageLink
      ? `<a href="${this.escapeHtml(usageLink)}" target="_blank" rel="noreferrer">${this.escapeHtml(this.t("learnMore"))}</a>`
      : "";
    const showUsageBlock = !isIconfont && (!!usageLinesFinal.length || !!usageLinkHtml);

    const defaultColor = isHex(detail?.defaultColor) ? detail.defaultColor : FALLBACK_COLOR;
    const colorAnalysis = this.getColorAnalysis(detail, icon);
    const colorSlots = Array.isArray(colorAnalysis?.slots) ? colorAnalysis.slots : [];
    const slotSelectHtml = colorSlots.length > 1
      ? `<label class="if-market-slot-select-wrap" data-role="slot-wrap" style="--if-slot:${colorSlots[0].displayColor};">
          <span class="if-market-slot-swatch"></span>
          <select class="if-market-slot-select" data-role="slot-select" aria-label="Color slot">
            ${colorSlots.map((slot, idx) => `<option value="${this.escapeHtml(String(slot.id))}">#${idx + 1}</option>`).join("")}
          </select>
        </label>`
      : "";
    const swatches = this.buildPalette(defaultColor)
      .map(
        (c) => `<button type="button" class="if-market-swatch${c.toLowerCase() === defaultColor.toLowerCase() ? " is-active" : ""}" data-color="${c}" style="--if-swatch:${c};" aria-label="${c}"></button>`
      )
      .join("");

    const avatarUrl = httpsUrl(s(detail?.avatarUrl));
    const avatarHtml = avatarUrl
      ? `<img class="if-iconfont-avatar" src="${this.escapeHtml(avatarUrl)}" alt="${authorText}" referrerpolicy="no-referrer" style="display:none" /><div class="if-iconfont-avatar if-iconfont-avatar--placeholder if-iconfont-avatar--loading"></div>`
      : `<div class="if-iconfont-avatar if-iconfont-avatar--placeholder">?</div>`;

    const collectionName = this.escapeHtml(s(detail?.collectionName));
    const collectionUrl = s(detail?.collectionUrl);
    const collectionHtml = collectionName
      ? (collectionUrl ? `<a href="${this.escapeHtml(collectionUrl)}" target="_blank" rel="noreferrer">${collectionName}</a>` : collectionName)
      : this.escapeHtml(this.t("unlabeled"));

    const tagsHtml = Array.isArray(detail?.tags) && detail.tags.length
      ? detail.tags.map((x) => `<span class="if-iconfont-tag">${this.escapeHtml(x)}</span>`).join("")
      : `<span class="if-iconfont-tag">${this.escapeHtml(this.t("none"))}</span>`;

    const commercialUrl = s(detail?.commercialUrl);
    const commercialHtml = commercialUrl
      ? `<p>${this.escapeHtml(this.t("commercial"))}${this.escapeHtml("\uFF1A")}<a href="${this.escapeHtml(commercialUrl)}" target="_blank" rel="noreferrer">${this.escapeHtml(this.t("commercialLink"))}</a></p>`
      : "";

    const feeTag = s(detail?.fees) === "free"
      ? `<span class="if-iconfont-meta-tag">${this.escapeHtml(this.t("tagFree"))}</span>`
      : (s(detail?.fees) === "charge" ? `<span class="if-iconfont-meta-tag">${this.escapeHtml(this.t("tagPaid"))}</span>` : "");
    const copyrightTag = s(detail?.copyrightType) === "original"
      ? `<span class="if-iconfont-meta-tag">${this.escapeHtml(this.t("tagOriginal"))}</span>`
      : (s(detail?.copyrightType) === "opensource" ? `<span class="if-iconfont-meta-tag">${this.escapeHtml(this.t("tagThirdParty"))}</span>` : "");
    const iconfontHeadTags = [feeTag, copyrightTag].filter(Boolean).join("");

    const copyright = s(detail?.copyrightUrl)
      ? `<a href="${this.escapeHtml(s(detail?.copyrightUrl))}" target="_blank" rel="noreferrer">${this.escapeHtml(this.t("copyrightInfo"))}</a>`
      : (ICONFONT_COPYRIGHT_TERMS_URL
          ? `<a href="${this.escapeHtml(ICONFONT_COPYRIGHT_TERMS_URL)}" target="_blank" rel="noreferrer">${this.escapeHtml(this.t("copyrightInfo"))}</a>`
          : "");

    return isIconfont
      ? `
      <div class="if-market-consent-panel if-market-dialog--iconfont" role="dialog" aria-modal="true">
        ${navHtml}
        <div class="if-market-consent-body">
          <div class="if-iconfont-head">
            <div class="if-iconfont-headline">
              <h2 class="if-iconfont-name">${iconName}</h2>
              ${iconfontHeadTags}
              ${copyright}
            </div>
            <div class="if-iconfont-author-row">
              ${avatarHtml}
              <div class="if-iconfont-author-meta">
                <p>${this.escapeHtml(this.t("author"))}${this.escapeHtml("\uFF1A")}${authorHtml}</p>
                ${s(detail?.updatedAt) ? `<p>${this.escapeHtml(this.t("updatedAt"))}${this.escapeHtml("\uFF1A")}${this.escapeHtml(s(detail.updatedAt))}</p>` : ""}
              </div>
            </div>
          </div>

          <div class="if-market-main if-market-main--iconfont">
            <div class="if-market-preview if-market-preview--iconfont" data-role="preview"></div>
            <div class="if-market-side if-market-side--iconfont">
              <div class="if-iconfont-info-card">
                <p>${this.escapeHtml(this.t("iconId"))}${this.escapeHtml("\uFF1A")}${iconId}</p>
                ${kw ? `<p>${this.escapeHtml(this.t("keyword"))}${this.escapeHtml("\uFF1A")}${kw}</p>` : ""}
                <p>${this.escapeHtml(this.t("source"))}${this.escapeHtml("\uFF1A")}<a href="${sourceOrigin}" target="_blank" rel="noreferrer">${sourceName}</a></p>
                <p>${this.escapeHtml(this.t("favorites"))}${this.escapeHtml("\uFF1A")}${this.escapeHtml(String(parseIntSafe(detail?.favorCount, 0)))}</p>
                <p>${this.escapeHtml(this.t("collection"))}${this.escapeHtml("\uFF1A")}${collectionHtml}</p>
                ${commercialHtml}
                <div class="if-iconfont-tags">${this.escapeHtml(this.t("tags"))}${this.escapeHtml("\uFF1A")}${tagsHtml}</div>
              </div>

              <div class="if-market-color-wrap">
                <label class="if-market-color-keep">
                  <input type="checkbox" data-role="keep-original" checked />
                  <span>${this.escapeHtml(this.t("keepOriginalColor"))}</span>
                </label>
                ${slotSelectHtml}
                <label class="if-market-color-input">
                  <span>${this.escapeHtml(this.t("importColor"))}</span>
                  <input type="color" data-role="color-picker" value="${defaultColor}" disabled />
                </label>
                <div class="if-market-swatches" data-role="swatches">${swatches}</div>
                <p class="if-market-color-tip">${this.escapeHtml(this.t("colorTip"))}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="if-market-consent-footer">
          <label class="if-market-consent-check">
            <input type="checkbox" data-role="agree" />
            <span>${this.escapeHtml(this.t("consent"))}</span>
          </label>
          <div class="if-market-consent-actions">
            <button type="button" class="b3-button b3-button--text if-market-confirm-btn" data-role="confirm">${this.escapeHtml(this.t("confirm"))}</button>
          </div>
        </div>
      </div>
      `
      : `
      <div class="if-market-consent-panel if-market-dialog--compact" role="dialog" aria-modal="true">
        ${navHtml}
        <div class="if-market-consent-body">
          <div class="if-market-headline">
            <h2 class="if-market-name">${iconName}</h2>
            <span class="if-market-head-meta">${this.escapeHtml(this.t("author"))}${this.escapeHtml("\uFF1A")}${authorHtml}</span>
            <span class="if-market-head-meta">${this.escapeHtml(this.t("license"))}${this.escapeHtml("\uFF1A")}${licHtml}</span>
          </div>

          <div class="if-market-main">
            <div class="if-market-preview" data-role="preview"></div>
            <div class="if-market-side">
              <div class="if-market-meta-lines">
                <p>${this.escapeHtml(this.t("iconId"))}${this.escapeHtml("\uFF1A")}${iconId}</p>
                ${kw ? `<p>${this.escapeHtml(this.t("keyword"))}${this.escapeHtml("\uFF1A")}${kw}</p>` : ""}
                <p>${this.escapeHtml(this.t("source"))}${this.escapeHtml("\uFF1A")}<a href="${sourceOrigin}" target="_blank" rel="noreferrer">${sourceName}</a></p>
              </div>

              <div class="if-market-color-wrap">
                <label class="if-market-color-keep">
                  <input type="checkbox" data-role="keep-original" checked />
                  <span>${this.escapeHtml(this.t("keepOriginalColor"))}</span>
                </label>
                ${slotSelectHtml}
                <label class="if-market-color-input">
                  <span>${this.escapeHtml(this.t("importColor"))}</span>
                  <input type="color" data-role="color-picker" value="${defaultColor}" disabled />
                </label>
                <div class="if-market-swatches" data-role="swatches">${swatches}</div>
                <p class="if-market-color-tip">${this.escapeHtml(this.t("colorTip"))}</p>
              </div>
              ${showUsageBlock ? `
              <div class="if-market-license-box">
                <div class="if-market-license-title">${this.escapeHtml(this.t("licenseTitle"))}</div>
                <ul class="if-market-license-list">${usageHtml}</ul>
                ${usageLinkHtml ? `<p class="if-market-consent-links">${usageLinkHtml}</p>` : ""}
              </div>
              ` : ""}
            </div>
          </div>
        </div>
        <div class="if-market-consent-footer">
          <label class="if-market-consent-check">
            <input type="checkbox" data-role="agree" />
            <span>${this.escapeHtml(this.t("consent"))}</span>
          </label>
          <div class="if-market-consent-actions">
            <button type="button" class="b3-button b3-button--text if-market-confirm-btn" data-role="confirm">${this.escapeHtml(this.t("confirm"))}</button>
          </div>
        </div>
      </div>
      `;
  }

  showImportDialog(source, icon, detail, keyword, navState = null) {
    if (this.dialogPromise) return this.dialogPromise;
    this.removeDialog();

    const navItems = Array.isArray(navState?.items) && navState.items.length ? navState.items : null;
    let currentIndex = navItems ? Math.max(0, Math.min(navItems.length - 1, parseIntSafe(navState?.index, 0))) : 0;
    const resolveCurrent = () => {
      const x = navItems ? (navItems[currentIndex] || {}) : {};
      return {
        btn: x.btn instanceof HTMLElement ? x.btn : null,
        source: x.source || source,
        icon: x.icon || icon,
      };
    };

    let current = resolveCurrent();
    let currentBtn = current.btn;
    let currentSource = current.source;
    let currentIcon = current.icon;
    let currentDetail = detail;

    this.dialogPromise = new Promise((resolve) => {
      this.dialogResolve = resolve;
      let done = false;
      let consentWarnTimer = 0;
      let dialog = null;
      let navigating = false;
      let navToken = 0;

      const cleanup = () => {
        if (consentWarnTimer) {
          clearTimeout(consentWarnTimer);
          consentWarnTimer = 0;
        }
        if (this.dialogCleanup === cleanup) this.dialogCleanup = null;
      };
      this.dialogCleanup = cleanup;

      const settle = (payload) => {
        if (done) return;
        done = true;
        cleanup();
        const r = this.dialogResolve;
        this.dialogResolve = null;
        this.dialogPromise = null;
        if (r) r(payload);
      };

      const canceledPayload = () => ({
        confirmed: false,
        keepOriginalColor: true,
        selectedColor: "",
        slotColors: {},
        source: currentSource,
        icon: currentIcon,
        detail: currentDetail,
        btn: currentBtn,
      });

      const dialogOpts = {
        title: "",
        content: `<div class="if-market-dialog-stage" data-role="dialog-stage"></div>`,
        width: "min(920px, 92vw)",
        containerClassName: "if-market-import-container",
        destroyCallback: () => {
          if (this.importDialog === dialog) this.importDialog = null;
          settle(canceledPayload());
        },
      };
      dialog = new Dialog(dialogOpts);
      this.importDialog = dialog;

      const stage = dialog.element?.querySelector?.('[data-role="dialog-stage"]');
      if (!(stage instanceof HTMLElement)) {
        settle(canceledPayload());
        dialog.destroy();
        return;
      }

      const mountPanel = () => {
        if (done) return;
        if (consentWarnTimer) {
          clearTimeout(consentWarnTimer);
          consentWarnTimer = 0;
        }

        const hasPrev = !!navItems && currentIndex > 0;
        const hasNext = !!navItems && currentIndex < navItems.length - 1;
        stage.innerHTML = this.buildImportDialogPanelHtml(currentSource, currentIcon, currentDetail, keyword, {hasPrev, hasNext});

        const root = stage.querySelector(".if-market-consent-panel");
        if (!(root instanceof HTMLElement)) return;

        const avatarUrl = httpsUrl(s(currentDetail?.avatarUrl));
        const avatarImg = root.querySelector("img.if-iconfont-avatar");
        const avatarPlaceholder = root.querySelector(".if-iconfont-avatar--placeholder");
        if (avatarImg instanceof HTMLImageElement) {
          const origAvatarUrl = avatarUrl;
          let triedFallback = false;

          const showLoading = () => {
            avatarImg.style.display = "none";
            if (avatarPlaceholder instanceof HTMLElement) {
              avatarPlaceholder.style.display = "";
              avatarPlaceholder.classList.add("if-iconfont-avatar--loading");
              avatarPlaceholder.textContent = "";
            }
          };

          const showReady = () => {
            avatarImg.style.display = "";
            if (avatarPlaceholder instanceof HTMLElement) {
              avatarPlaceholder.style.display = "none";
              avatarPlaceholder.classList.remove("if-iconfont-avatar--loading");
              avatarPlaceholder.textContent = "?";
            }
          };

          const showFallback = () => {
            avatarImg.style.display = "none";
            if (avatarPlaceholder instanceof HTMLElement) {
              avatarPlaceholder.style.display = "";
              avatarPlaceholder.classList.remove("if-iconfont-avatar--loading");
              avatarPlaceholder.textContent = "?";
            }
          };

          const fetchFallback = () => {
            if (!origAvatarUrl || triedFallback) {
              showFallback();
              return;
            }
            triedFallback = true;
            showLoading();
            this.fetchAvatarDataUrl(origAvatarUrl).then((dataUrl) => {
              avatarImg.src = dataUrl;
            }).catch(() => {
              showFallback();
            });
          };

          showLoading();
          avatarImg.addEventListener("load", showReady);
          avatarImg.addEventListener("error", fetchFallback);

          if (avatarImg.complete) {
            if (avatarImg.naturalWidth > 0) showReady();
            else fetchFallback();
          }
        }

        const agree = root.querySelector('[data-role="agree"]');
        const keep = root.querySelector('[data-role="keep-original"]');
        const color = root.querySelector('[data-role="color-picker"]');
        const sw = root.querySelector('[data-role="swatches"]');
        const slotWrap = root.querySelector('[data-role="slot-wrap"]');
        const slotSelect = root.querySelector('[data-role="slot-select"]');
        const ok = root.querySelector('[data-role="confirm"]');
        const host = root.querySelector('[data-role="preview"]');
        const navPrev = root.querySelector('[data-role="nav-prev"]');
        const navNext = root.querySelector('[data-role="nav-next"]');
        const consentCheck = root.querySelector(".if-market-consent-check");
        const baseSvg = s(currentDetail?.svg || currentIcon?.previewSvg);
        const defaultColor = isHex(currentDetail?.defaultColor) ? currentDetail.defaultColor : FALLBACK_COLOR;
        const colorAnalysis = this.getColorAnalysis(currentDetail, currentIcon);
        const colorSlots = Array.isArray(colorAnalysis?.slots) ? colorAnalysis.slots : [];
        const slotLookup = new Map(colorSlots.map((slot) => [String(slot.id), slot]));
        const slotOverrides = new Map();
        let activeSlot = colorSlots.length ? String(colorSlots[0].id) : "";

        const getSlotColor = (slotId) => {
          const override = normalizeHex(slotOverrides.get(String(slotId)));
          if (override) return override;
          const slot = slotLookup.get(String(slotId));
          return isHex(slot?.displayColor) ? slot.displayColor : defaultColor;
        };

        const getSlotOverrideObject = () => {
          const out = {};
          slotOverrides.forEach((value, slotId) => {
            const hex = normalizeHex(value);
            if (!hex) return;
            out[String(slotId)] = hex;
          });
          return out;
        };

        const syncSwatch = () => {
          if (!(sw instanceof HTMLElement) || !(color instanceof HTMLInputElement)) return;
          const cur = normalizeHex(color.value).toLowerCase();
          sw.querySelectorAll("[data-color]").forEach((el) => {
            const c = normalizeHex(el.getAttribute("data-color")).toLowerCase();
            el.classList.toggle("is-active", !!cur && cur === c);
          });
        };

        const drawActiveSlotOutline = (svg) => {
          if (!(svg instanceof SVGSVGElement) || !activeSlot) return;

          let activeNodes = Array.from(svg.querySelectorAll('[data-if-active-slot="1"]'))
            .filter((el) => el instanceof SVGGraphicsElement)
            .filter((el) => el.tagName.toLowerCase() !== "svg")
            .filter((el, _, arr) => !arr.some((other) => other !== el && other.contains(el)));
          if (!activeNodes.length) return;

          const ns = "http://www.w3.org/2000/svg";
          const normalizeOutlineNode = (node, stroke, width, dasharray = "") => {
            if (!(node instanceof Element)) return;

            node.removeAttribute("id");
            node.removeAttribute("class");
            node.removeAttribute("filter");
            node.removeAttribute("data-colorindex");
            node.removeAttribute("data-if-slotindexes");
            node.removeAttribute("data-if-active-slot");

            if (node instanceof SVGGraphicsElement && node.tagName.toLowerCase() !== "g") {
              node.removeAttribute("fill-opacity");
              node.removeAttribute("stroke-opacity");
              node.setAttribute("fill", "none");
              node.setAttribute("stroke", stroke);
              node.setAttribute("stroke-width", width);
              node.setAttribute("vector-effect", "non-scaling-stroke");
              node.setAttribute("stroke-linejoin", "round");
              node.setAttribute("stroke-linecap", "round");
              node.setAttribute("paint-order", "stroke");
              if (dasharray) node.setAttribute("stroke-dasharray", dasharray);
              else node.removeAttribute("stroke-dasharray");
              node.style.removeProperty("fill");
              node.style.removeProperty("stroke");
              node.style.removeProperty("filter");
            }

            Array.from(node.children).forEach((child) => normalizeOutlineNode(child, stroke, width, dasharray));
          };

          const buildOutlineLayer = (stroke, width, dasharray = "") => {
            const layer = document.createElementNS(ns, "g");
            layer.setAttribute("data-if-active-outline", "1");
            layer.setAttribute("pointer-events", "none");

            activeNodes.forEach((node) => {
              const ancestors = [];
              let parent = node.parentElement;
              while (parent instanceof SVGElement && parent !== svg) {
                ancestors.push(parent);
                parent = parent.parentElement;
              }

              let cursor = layer;
              ancestors.reverse().forEach((ancestor) => {
                const branch = ancestor.cloneNode(false);
                normalizeOutlineNode(branch, stroke, width, dasharray);
                cursor.appendChild(branch);
                cursor = branch;
              });

              const clone = node.cloneNode(true);
              normalizeOutlineNode(clone, stroke, width, dasharray);
              cursor.appendChild(clone);
            });

            return layer;
          };

          svg.appendChild(buildOutlineLayer("#ffffff", "4"));
          svg.appendChild(buildOutlineLayer("#2563eb", "2", "6 4"));
        };

        const syncSlots = () => {
          if (slotWrap instanceof HTMLElement && slotSelect instanceof HTMLSelectElement && colorSlots.length > 1) {
            const activeMeta = slotLookup.get(activeSlot);
            if (activeMeta) {
              slotWrap.style.setProperty("--if-slot", getSlotColor(activeMeta.id));
              slotSelect.value = activeMeta.id;
            }
          }

          if (color instanceof HTMLInputElement) {
            const current = activeSlot ? getSlotColor(activeSlot) : (normalizeHex(color.value) || defaultColor);
            if (isHex(current)) color.value = current;
            color.disabled = !!keep?.checked || (!!colorSlots.length && !activeSlot);
          }

          syncSwatch();
        };

        const render = () => {
          if (!(host instanceof HTMLElement)) return;
          host.innerHTML = "";
          host.classList.toggle("if-market-preview--interactive", colorSlots.length > 0);

          const keepOriginal = !!keep?.checked;
          let text = baseSvg;
          if (colorSlots.length > 0) {
            const overrides = keepOriginal ? {} : getSlotOverrideObject();
            text = this.applySlotColors(baseSvg, overrides, {
              analysis: colorAnalysis,
              markInteractive: true,
              activeSlot,
            });
          } else if (!keepOriginal) {
            const pick = s(color?.value, FALLBACK_COLOR);
            text = this.applyColor(baseSvg, pick);
          }

          const svg = this.safeSvgElement(text, colorSlots.length > 0);
          if (!svg) {
            host.textContent = this.t("previewUnavailable");
            return;
          }

          const w = parseFloat(s(svg.getAttribute("width")));
          const h = parseFloat(s(svg.getAttribute("height")));
          if (!svg.hasAttribute("viewBox") && Number.isFinite(w) && Number.isFinite(h)) {
            svg.setAttribute("viewBox", `0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`);
          }

          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svg.style.position = "static";
          svg.style.width = "72%";
          svg.style.height = "72%";
          svg.style.maxWidth = "72%";
          svg.style.maxHeight = "72%";
          svg.style.color = defaultColor;
          svg.style.pointerEvents = colorSlots.length > 0 ? "auto" : "none";

          host.appendChild(svg);
          drawActiveSlotOutline(svg);
          syncSlots();
        };

        const notifyConsentRequired = () => {
          const msg = this.t("consentRequired");
          if (typeof showMessage === "function") showMessage(msg, 2500);
          else console.warn(msg);

          if (consentCheck instanceof HTMLElement) {
            consentCheck.classList.remove("if-market-consent-check--warn");
            void consentCheck.offsetWidth;
            consentCheck.classList.add("if-market-consent-check--warn");
            if (consentWarnTimer) clearTimeout(consentWarnTimer);
            consentWarnTimer = window.setTimeout(() => {
              if (consentCheck instanceof HTMLElement) consentCheck.classList.remove("if-market-consent-check--warn");
              consentWarnTimer = 0;
            }, 900);
          }

          if (agree instanceof HTMLElement) agree.focus();
        };

        const finalize = (confirmed) => {
          const keepOriginal = !!keep?.checked;
          settle({
            confirmed: !!confirmed,
            keepOriginalColor: keepOriginal,
            selectedColor: keepOriginal || colorSlots.length ? "" : s(color?.value, FALLBACK_COLOR),
            slotColors: keepOriginal ? {} : getSlotOverrideObject(),
            source: currentSource,
            icon: currentIcon,
            detail: currentDetail,
            btn: currentBtn,
          });
          if (this.importDialog === dialog) this.importDialog = null;
          dialog.destroy();
        };

        const navigate = (step) => {
          if (!navItems || (step !== -1 && step !== 1) || navigating) return;
          const nextIndex = currentIndex + step;
          if (nextIndex < 0 || nextIndex >= navItems.length) return;

          navigating = true;
          navToken += 1;
          const token = navToken;

          if (navPrev instanceof HTMLButtonElement) navPrev.disabled = true;
          if (navNext instanceof HTMLButtonElement) navNext.disabled = true;
          if (ok instanceof HTMLButtonElement) ok.disabled = true;

          const next = navItems[nextIndex] || {};
          const nextBtn = next.btn instanceof HTMLElement ? next.btn : null;
          const nextSource = next.source || source;
          const nextIcon = next.icon || icon;

          this.getDetail(nextSource, nextIcon).then((nextDetail) => {
            if (done || token !== navToken) return;
            currentIndex = nextIndex;
            currentBtn = nextBtn;
            currentSource = nextSource;
            currentIcon = nextIcon;
            currentDetail = nextDetail;
            mountPanel();
          }).catch((err) => {
            if (done || token !== navToken) return;
            const msg = this.t("downloadFailed", {source: s(nextSource?.name, this.t("storeTitle")), msg: safeMsg(err)});
            if (typeof showMessage === "function") showMessage(msg, 3000, "error");
            else console.error(msg);
            if (navPrev instanceof HTMLButtonElement) navPrev.disabled = false;
            if (navNext instanceof HTMLButtonElement) navNext.disabled = false;
            if (ok instanceof HTMLButtonElement) ok.disabled = false;
          }).finally(() => {
            if (token === navToken) navigating = false;
          });
        };

        agree?.addEventListener("change", () => {
          if (agree?.checked && consentCheck instanceof HTMLElement) {
            consentCheck.classList.remove("if-market-consent-check--warn");
          }
        });
        keep?.addEventListener("change", () => {
          render();
        });
        color?.addEventListener("input", () => {
          if (colorSlots.length > 0 && activeSlot) {
            const hex = normalizeHex(color.value);
            if (!hex) return;
            if (keep) keep.checked = false;
            slotOverrides.set(activeSlot, hex);
          }
          render();
        });

        slotSelect?.addEventListener("change", () => {
          const slotId = s(slotSelect.value).trim();
          if (!slotLookup.has(slotId)) return;
          activeSlot = slotId;
          render();
        });

        if (host instanceof HTMLElement && colorSlots.length) {
          host.addEventListener("click", (e) => {
            const el = e.target?.closest?.("[data-colorindex], [data-if-slotindexes]");
            if (!(el instanceof Element)) return;
            const slotIds = [];
            const directSlot = s(el.getAttribute("data-colorindex")).trim();
            if (slotLookup.has(directSlot)) slotIds.push(directSlot);
            s(el.getAttribute("data-if-slotindexes"))
              .split(",")
              .map((x) => s(x).trim())
              .forEach((slotId) => {
                if (!slotLookup.has(slotId) || slotIds.includes(slotId)) return;
                slotIds.push(slotId);
              });
            if (!slotIds.length) return;
            if (slotIds.length === 1) {
              activeSlot = slotIds[0];
            } else {
              const currentIndex = slotIds.indexOf(activeSlot);
              activeSlot = currentIndex >= 0
                ? slotIds[(currentIndex + 1) % slotIds.length]
                : slotIds[0];
            }
            render();
          });
        }

        if (sw instanceof HTMLElement) {
          sw.addEventListener("click", (e) => {
            const el = e.target?.closest?.("[data-color]");
            if (!(el instanceof HTMLElement)) return;
            const hex = normalizeHex(el.getAttribute("data-color"));
            if (!hex) return;
            if (keep) keep.checked = false;
            if (colorSlots.length > 0 && activeSlot) {
              slotOverrides.set(activeSlot, hex);
            }
            if (color instanceof HTMLInputElement) {
              color.disabled = false;
              color.value = hex;
            }
            render();
          });
        }

        ok?.addEventListener("click", () => {
          if (!agree?.checked) {
            notifyConsentRequired();
            return;
          }
          finalize(true);
        });
        navPrev?.addEventListener("click", () => navigate(-1));
        navNext?.addEventListener("click", () => navigate(1));

        render();
      };

      mountPanel();
    });

    return this.dialogPromise;
  }

  removeDialog() {
    if (typeof this.dialogCleanup === "function") {
      this.dialogCleanup();
      this.dialogCleanup = null;
    }
    const dlg = this.importDialog;
    this.importDialog = null;
    if (dlg && typeof dlg.destroy === "function") {
      try {
        dlg.destroy();
      } catch {
        // ignore
      }
    }
    document.querySelectorAll(".if-market-consent-mask").forEach((el) => el.remove());
  }

  /* 鈹€鈹€ SVG color application 鈹€鈹€ */

  isReplacableColor(val) {
    const v = s(val).trim().toLowerCase();
    if (!v) return false;
    if (v === "none" || v === "transparent" || v === "inherit") return false;
    if (v.startsWith("url(")) return false;
    return true;
  }

  applyColor(rawSvg, color) {
    const target = normalizeHex(color) || FALLBACK_COLOR;
    if (!rawSvg) return "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return rawSvg;

      const shapes = "path,circle,rect,polygon,polyline,ellipse,line,use,g,text,tspan";
      const all = [svg, ...svg.querySelectorAll("*")];

      all.forEach((el) => {
        el.removeAttribute("data-colorindex");

        const fill = s(el.getAttribute("fill")).trim();
        if (this.isReplacableColor(fill)) {
          el.setAttribute("fill", target);
        }

        const stroke = s(el.getAttribute("stroke")).trim();
        if (this.isReplacableColor(stroke)) {
          el.setAttribute("stroke", target);
        }

        const stop = s(el.getAttribute("stop-color")).trim();
        if (this.isReplacableColor(stop)) {
          el.setAttribute("stop-color", target);
        }

        const c = s(el.getAttribute("color")).trim();
        if (this.isReplacableColor(c)) {
          el.setAttribute("color", target);
        }

        const style = s(el.getAttribute("style"));
        if (style) {
          const replaced = style
            .replace(/fill\s*:\s*([^;]+)/gi, (m, v) => this.isReplacableColor(v) ? `fill:${target}` : m)
            .replace(/stroke\s*:\s*([^;]+)/gi, (m, v) => this.isReplacableColor(v) ? `stroke:${target}` : m)
            .replace(/color\s*:\s*([^;]+)/gi, (m, v) => this.isReplacableColor(v) ? `color:${target}` : m)
            .replace(/stop-color\s*:\s*([^;]+)/gi, (m, v) => this.isReplacableColor(v) ? `stop-color:${target}` : m);
          if (replaced !== style) el.setAttribute("style", replaced);
        }
      });

      svg.querySelectorAll(shapes).forEach((el) => {
        if (!el.hasAttribute("fill") && !el.hasAttribute("stroke") && !s(el.getAttribute("style")).includes("fill")) {
          el.setAttribute("fill", target);
        }
      });

      return new XMLSerializer().serializeToString(svg);
    } catch {
      return rawSvg;
    }
  }

  /* 鈹€鈹€ Emoji insertion 鈹€鈹€ */

  triggerNativeSelection(btn) {
    if (!(btn instanceof HTMLElement) || !btn.isConnected) return false;
    try {
      btn.click();
      return true;
    } catch {
      // Fallback for environments where synthetic click is blocked.
    }
    try {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const shared = {bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0};

      btn.dispatchEvent(new PointerEvent("pointerdown", {...shared, pointerId: 1}));
      btn.dispatchEvent(new MouseEvent("mousedown", shared));
      btn.dispatchEvent(new PointerEvent("pointerup", {...shared, pointerId: 1}));
      btn.dispatchEvent(new MouseEvent("mouseup", shared));
      btn.dispatchEvent(new MouseEvent("click", shared));
    } catch {
      return false;
    }
    return true;
  }

  prepareNativeEmojiButton(btn, unicodePath) {
    if (!(btn instanceof HTMLElement)) return false;
    btn.classList.add("emojis__item", "ariaLabel");
    btn.setAttribute("data-unicode", unicodePath);
    btn.dataset.ifReady = "1";
    btn.dataset.ifSaving = "0";
    btn.classList.remove("if-market-item--saving");
    return true;
  }

  resolveLiveResultButton(btn, source, icon) {
    if (btn instanceof HTMLElement && btn.isConnected) return btn;
    const provider = s(source?.id || btn?.dataset?.ifProvider).trim();
    const iconId = s(icon?.id !== undefined && icon?.id !== null ? String(icon.id) : btn?.dataset?.ifIconId).trim();
    if (!provider || !iconId) return null;
    const nodes = document.querySelectorAll('.emojis__item[data-if-market="1"]');
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (s(node.dataset.ifProvider).trim() !== provider) continue;
      if (s(node.dataset.ifIconId).trim() !== iconId) continue;
      return node;
    }
    return null;
  }

  getAllProtyles() {
    try {
      if (typeof getAllEditor !== "function") return [];
      const editors = getAllEditor();
      if (!Array.isArray(editors)) return [];
      return editors
        .map((editor) => editor?.protyle || editor)
        .filter((protyle) => protyle && protyle.hint && protyle.toolbar);
    } catch {
      return [];
    }
  }

  getCustomEmojiCategory() {
    const emojis = globalThis?.siyuan?.emojis;
    if (!Array.isArray(emojis)) return null;
    const first = emojis[0];
    if (first && Array.isArray(first.items)) return first;
    return null;
  }

  syncEditorsEmojiMap() {
    const category = this.getCustomEmojiCategory();
    const customItems = Array.isArray(category?.items) ? category.items : [];
    const protyles = this.getAllProtyles();

    protyles.forEach((protyle) => {
      const lute = protyle?.lute;
      const hintPath = s(protyle?.options?.hint?.emojiPath).trim();
      if (!lute || typeof lute.PutEmojis !== "function" || !hintPath) return;
      const map = {};
      customItems.forEach((item) => {
        const keywords = s(item?.keywords).trim();
        const unicode = s(item?.unicode).trim();
        if (!keywords || !unicode) return;
        map[keywords] = `${hintPath}/${unicode}`;
      });
      try {
        lute.PutEmojis(map);
      } catch {
        // ignore per-editor sync errors
      }
    });
  }

  ensureRuntimeCustomEmoji(unicodePath) {
    const target = s(unicodePath).trim();
    if (!target || target.indexOf(".") < 0) return;
    const alias = s(target.split(".")[0]).trim();
    if (!alias) return;

    if (!globalThis?.siyuan) return;
    if (!Array.isArray(globalThis.siyuan.emojis)) {
      globalThis.siyuan.emojis = [{id: "custom", title: "Custom", items: []}];
    }
    if (!globalThis.siyuan.emojis[0] || !Array.isArray(globalThis.siyuan.emojis[0].items)) {
      globalThis.siyuan.emojis[0] = {id: "custom", title: "Custom", items: []};
    }

    const items = globalThis.siyuan.emojis[0].items;
    const exists = items.some((item) => s(item?.unicode).trim() === target || s(item?.keywords).trim() === alias);
    if (exists) return;

    items.unshift({
      unicode: target,
      keywords: alias,
      description: alias,
      description_zh_cn: alias,
      description_ja_jp: alias,
    });
  }

  async reloadEmojiConf() {
    try {
      const resp = await fetch("/api/system/getEmojiConf", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: "{}",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || json?.code !== 0 || !Array.isArray(json?.data)) return false;
      if (globalThis?.siyuan) globalThis.siyuan.emojis = json.data;
      return true;
    } catch {
      return false;
    }
  }

  async refreshRuntimeEmojiCache(unicodePath) {
    await this.reloadEmojiConf();
    this.ensureRuntimeCustomEmoji(unicodePath);
    this.syncEditorsEmojiMap();
  }

  findProtyleByHintElement(hintElement) {
    if (!(hintElement instanceof HTMLElement)) return null;
    const list = this.getAllProtyles();
    for (const protyle of list) {
      if (protyle?.hint?.element === hintElement) return protyle;
    }
    return null;
  }

  resolveHintProtyle(selectionCtx) {
    const direct = selectionCtx?.protyle;
    if (direct?.hint && direct?.toolbar) return direct;

    const hintElement = selectionCtx?.hintElement;
    if (hintElement instanceof HTMLElement) {
      const matched = this.findProtyleByHintElement(hintElement);
      if (matched) return matched;
    }

    const list = this.getAllProtyles();
    for (const protyle of list) {
      const el = protyle?.hint?.element;
      if (el instanceof HTMLElement && el.isConnected && !el.classList.contains("fn__none")) return protyle;
    }
    return null;
  }

  captureSelectionContext(btn = null) {
    const ctx = {
      range: null,
      hintElement: null,
      protyle: null,
      hintLastIndex: -1,
      hintSplitChar: "",
    };

    try {
      const sel = document.getSelection();
      if (sel && sel.rangeCount) {
        ctx.range = sel.getRangeAt(0).cloneRange();
      }
    } catch {
      // keep best-effort context
    }

    const hintElement = btn instanceof HTMLElement ? btn.closest(".protyle-hint, .hint--menu") : null;
    if (hintElement instanceof HTMLElement) {
      ctx.hintElement = hintElement;
      const protyle = this.findProtyleByHintElement(hintElement);
      if (protyle) {
        ctx.protyle = protyle;
        try {
          if (protyle?.toolbar?.range) {
            ctx.range = protyle.toolbar.range.cloneRange();
          }
        } catch {
          // ignore
        }
        const lastIndex = Number(protyle?.hint?.lastIndex);
        if (Number.isFinite(lastIndex)) ctx.hintLastIndex = Math.trunc(lastIndex);
        ctx.hintSplitChar = s(protyle?.hint?.splitChar).trim();
      }
    }

    if (!(ctx.range instanceof Range)) {
      if (ctx.protyle || ctx.hintElement) return ctx;
      return null;
    }
    return ctx;
  }

  restoreSelectionRange(range) {
    if (!(range instanceof Range)) return false;
    try {
      const sel = document.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }

  restoreSelectionContext(ctx) {
    return this.restoreSelectionRange(ctx?.range);
  }

  focusProtyle(protyle) {
    try {
      const inst = typeof protyle?.getInstance === "function" ? protyle.getInstance() : null;
      if (inst && typeof inst.focus === "function") {
        inst.focus();
        return true;
      }
    } catch {
      // ignore
    }

    try {
      const el = protyle?.wysiwyg?.element;
      if (el instanceof HTMLElement && typeof el.focus === "function") {
        el.focus();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  ensureHintLeadingSpace(protyle, hintKeyword, hintStartIndex = -1) {
    const range = protyle?.toolbar?.range;
    const hint = protyle?.hint;
    if (!(range instanceof Range) || !(hint instanceof Object)) return;
    if (!(range.startContainer instanceof Text) || range.startContainer !== range.endContainer) return;

    const node = range.startContainer;
    const text = s(node.textContent);
    if (!text) return;

    let start = Number.isFinite(hintStartIndex) ? Math.trunc(hintStartIndex) : Number(hint.lastIndex);
    if (!Number.isFinite(start) || start < 0) return;
    start = Math.max(0, Math.min(text.length, start));

    const kw = s(hintKeyword).trim();
    if (kw) {
      const token = `:${kw}`;
      const cursor = Math.max(0, Math.min(text.length, Number(range.endOffset) || 0));
      const left = text.slice(0, cursor);
      const found = left.lastIndexOf(token);
      if (found >= 0) start = found;
    }

    if (start <= 0 || /\s/.test(text[start - 1])) {
      hint.lastIndex = start;
      return;
    }

    const oldStart = Number(range.startOffset) || 0;
    const oldEnd = Number(range.endOffset) || 0;
    const nextText = `${text.slice(0, start)} ${text.slice(start)}`;
    node.textContent = nextText;

    const shift = (offset) => {
      const n = Number(offset) || 0;
      return n >= start ? n + 1 : n;
    };
    range.setStart(node, Math.max(0, Math.min(nextText.length, shift(oldStart))));
    range.setEnd(node, Math.max(0, Math.min(nextText.length, shift(oldEnd))));
    hint.lastIndex = start + 1;
  }

  applyHintFill(unicodePath, selectionCtx = null, hintKeyword = "") {
    const target = s(unicodePath).trim();
    if (!target) return false;

    const protyle = this.resolveHintProtyle(selectionCtx);
    const hint = protyle?.hint;
    if (!protyle || !hint || typeof hint.fill !== "function" || !protyle?.toolbar) return false;

    let range = null;
    try {
      if (selectionCtx?.range instanceof Range) {
        range = selectionCtx.range.cloneRange();
      } else if (protyle.toolbar.range instanceof Range) {
        range = protyle.toolbar.range.cloneRange();
      }
    } catch {
      range = null;
    }
    if (!(range instanceof Range)) return false;

    this.focusProtyle(protyle);
    protyle.toolbar.range = range;
    this.restoreSelectionRange(range);

    const splitChar = s(selectionCtx?.hintSplitChar || hint.splitChar).trim() || ":";
    const lastIndexRaw = Number(selectionCtx?.hintLastIndex);
    const lastIndex = Number.isFinite(lastIndexRaw) ? Math.trunc(lastIndexRaw) : Number(hint.lastIndex);

    hint.splitChar = splitChar;
    if (Number.isFinite(lastIndex) && lastIndex >= 0) hint.lastIndex = lastIndex;

    this.ensureHintLeadingSpace(protyle, hintKeyword, hint.lastIndex);
    this.focusProtyle(protyle);
    this.restoreSelectionRange(protyle.toolbar.range);

    try {
      hint.fill(target, protyle, true);
      return true;
    } catch {
      return false;
    }
  }

  async applyImportedSelection(btn, source, icon, unicodePath, selectionCtx = null, hintKeyword = "", isHintMode = false) {
    if (isHintMode) {
      const filled = this.applyHintFill(unicodePath, selectionCtx, hintKeyword);
      if (filled) return true;
    }

    const liveBtn = this.resolveLiveResultButton(btn, source, icon);
    if (liveBtn) {
      this.prepareNativeEmojiButton(liveBtn, unicodePath);
      await new Promise((r) => requestAnimationFrame(() => r()));
      this.restoreSelectionContext(selectionCtx);
      if (this.triggerNativeSelection(liveBtn)) return true;
    }
    return await this.directInsertEmoji(unicodePath, selectionCtx);
  }

  collectEmojiPanels() {
    const out = [];
    const seen = new Set();
    const push = (panel) => {
      if (!(panel instanceof HTMLElement)) return;
      if (seen.has(panel)) return;
      seen.add(panel);
      out.push(panel);
    };
    document.querySelectorAll(".protyle-hint .emojis__panel").forEach(push);
    document.querySelectorAll(".b3-dialog .emojis__panel").forEach(push);
    document.querySelectorAll(".emojis__panel").forEach(push);
    return out;
  }

  findNativeEmojiButton(unicodePath) {
    const target = s(unicodePath).trim();
    if (!target) return null;
    const nodes = document.querySelectorAll('.emojis__item[data-unicode]:not([data-if-market="1"])');
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (s(node.getAttribute("data-unicode")).trim() === target) return node;
    }
    return null;
  }

  async directInsertEmoji(unicodePath, selectionCtx = null) {
    const target = s(unicodePath).trim();
    if (!target) return false;

    const existing = this.findNativeEmojiButton(target);
    if (existing) {
      this.restoreSelectionContext(selectionCtx);
      if (this.triggerNativeSelection(existing)) return true;
    }

    const panels = this.collectEmojiPanels();
    for (const panel of panels) {
      if (!(panel instanceof HTMLElement)) continue;
      const host = panel.closest(".protyle-hint, .b3-dialog");
      if (!(host instanceof HTMLElement)) continue;

      const temp = document.createElement("button");
      temp.type = "button";
      temp.className = "emojis__item ariaLabel";
      temp.setAttribute("data-unicode", target);
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      temp.style.top = "-9999px";
      temp.style.pointerEvents = "none";
      temp.tabIndex = -1;
      temp.textContent = "\u200b";
      panel.appendChild(temp);

      this.restoreSelectionContext(selectionCtx);
      const ok = this.triggerNativeSelection(temp);
      temp.remove();
      if (ok) return true;
    }
    return false;
  }

  /* 鈹€鈹€ File operations 鈹€鈹€ */

  async saveToEmojiStore(source, icon, detail, context = {}) {
    let raw = s(detail?.svg).trim();
    if (!raw) raw = s(icon?.previewSvg).trim();
    if (!raw) throw new Error(this.t("errorNoSvg"));

    const keepOriginalColor = context.keepOriginalColor === true;
    const requestedColor = normalizeHex(s(context.selectedColor).trim());
    const slotColors = this.normalizeSlotColorMap(context.slotColors);
    const colorAnalysis = this.getColorAnalysis(detail, icon);
    const originalSlotColors = this.getResolvedSlotColors(colorAnalysis, {}, detail?.defaultColor);
    const resolvedSlotColors = this.getResolvedSlotColors(colorAnalysis, slotColors, detail?.defaultColor);
    const slotVariantSignature = encodeColorVector(resolvedSlotColors);
    const hasSlotOverrides = Object.keys(slotColors).length > 0
      && !!slotVariantSignature
      && resolvedSlotColors.some((color, index) => color !== originalSlotColors[index]);
    const appliedColor = keepOriginalColor ? "" : (requestedColor || FALLBACK_COLOR);
    if (!keepOriginalColor) {
      if (hasSlotOverrides) {
        raw = this.applySlotColors(raw, slotColors, {analysis: colorAnalysis});
      } else if (requestedColor) {
        raw = this.applyColor(raw, appliedColor);
      }
    }

    const cleaned = this.sanitizeSvg(raw);
    if (!cleaned) throw new Error(this.t("errorInvalidSvg"));

    const idPart = s(icon?.id ? String(icon.id) : "").trim() || String(Date.now());
    const namePart = slug(s(icon?.name) || s(detail?.title));
    const baseNameStem = namePart ? `${namePart}-${idPart}` : `emoji-${source.id}-${idPart}`;
    // Include color in file stem so repeated imports of one icon with different colors do not share one path.
    const colorKey = keepOriginalColor
      ? "orig"
      : (hasSlotOverrides
          ? `v${slotVariantSignature}`
          : (requestedColor ? `c${appliedColor.slice(1)}` : "orig"));
    const baseName = `${baseNameStem}-${colorKey}`;

    const fileName = `${baseName}.svg`;
    const storageDir = this.getSourceStorageDir(source.id);
    const unicodePath = `${storageDir}/${fileName}`;
    const savedBase = await this.writeEmojiFile(source, fileName, cleaned, "image/svg+xml");

    const legacyMetaPath = `${savedBase}/${storageDir}/${baseName}.meta.json`;
    await this.removeFileIfExists(legacyMetaPath);

    return {unicodePath};
  }

  sanitizeSvg(raw, options = {}) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return "";

      const preserveColorMarkers = options.preserveColorMarkers === true;

      svg.removeAttribute("id");
      svg.removeAttribute("class");
      const rootStyle = svg.style;
      if (rootStyle) {
        const safeRootStyle = [];
        ["fill", "stroke", "color", "stop-color", "overflow"].forEach((propName) => {
          const value = s(rootStyle.getPropertyValue(propName)).trim();
          if (!value) return;
          safeRootStyle.push(`${propName}:${value}`);
        });
        if (safeRootStyle.length) svg.setAttribute("style", safeRootStyle.join(";"));
        else svg.removeAttribute("style");
      } else {
        svg.removeAttribute("style");
      }

      svg.querySelectorAll("script,foreignObject").forEach((el) => el.remove());
      [svg, ...svg.querySelectorAll("*")].forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
          if (!preserveColorMarkers && (attr.name === "data-colorindex" || attr.name.startsWith("data-if-"))) {
            el.removeAttribute(attr.name);
          }
        }
      });

      return new XMLSerializer().serializeToString(svg);
    } catch {
      return "";
    }
  }

  getEmojiBaseCandidates() {
    const ordered = [];
    const push = (base) => {
      const norm = s(base).trim();
      if (!norm || ordered.includes(norm)) return;
      ordered.push(norm);
    };
    push(this.emojiBase);
    push("/data/emojis");
    push("/emojis");
    return ordered;
  }

  async resolveOpenEmojiBase() {
    if (s(this.emojiBase).trim()) return this.emojiBase;
    for (const base of ["/data/emojis", "/emojis"]) {
      const rows = await this.readDirSafe(base);
      if (rows.length) return base;
    }
    return "/data/emojis";
  }

  getWorkspaceDir() {
    return s(globalThis?.siyuan?.config?.system?.workspaceDir).trim();
  }

  getDesktopShell() {
    try {
      const electron = require("electron");
      if (electron?.shell?.openPath) return electron.shell;
    } catch {
      // ignore
    }
    try {
      const remote = require("@electron/remote");
      if (remote?.shell?.openPath) return remote.shell;
    } catch {
      // ignore
    }
    return null;
  }

  async openSourceStorageFolder(sourceId) {
    const source = SOURCE_MAP[sourceId];
    if (!source) return;

    const workspaceDir = this.getWorkspaceDir();
    const shell = this.getDesktopShell();
    if (!workspaceDir || !shell) {
      if (typeof showMessage === "function") showMessage(this.t("errorOpenFolderUnsupported"), 3000, "error");
      return;
    }

    try {
      const path = require("path");
      const fs = require("fs");
      const base = await this.resolveOpenEmojiBase();
      const relBase = String(base || "").replace(/^\/+/, "");
      const relDir = this.getSourceStorageDir(source.id);
      const fullPath = path.join(workspaceDir, relBase, ...relDir.split("/").filter(Boolean));
      fs.mkdirSync(fullPath, {recursive: true});
      const result = await shell.openPath(fullPath);
      if (typeof result === "string" && result.trim()) {
        throw new Error(result.trim());
      }
    } catch (err) {
      if (typeof showMessage === "function") {
        showMessage(this.t("errorOpenFolderFailed", {msg: safeMsg(err)}), 3000, "error");
      }
    }
  }

  async writeEmojiFile(source, fileName, content, mime = "text/plain") {
    let lastErr = null;
    const bases = this.getEmojiBaseCandidates();
    const storageDir = this.getSourceStorageDir(source.id);
    for (const base of bases) {
      const filePath = `${base}/${storageDir}/${fileName}`;
      try {
        await this.putFile(filePath, content, fileName, mime);
        this.emojiBase = base;
        return base;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error(this.t("errorWriteFile"));
  }

  async putFile(path, content, fileName, mime = "text/plain") {
    const form = new FormData();
    form.append("path", path);
    form.append("isDir", "false");
    form.append("modTime", String(Date.now()));
    form.append("file", new Blob([String(content)], {type: mime}), fileName);

    const {ok, json, status} = await this.callPutFile(form);
    if (!ok) throw new Error(json?.msg || `HTTP ${status}`);
    if (json?.code !== 0) throw new Error(json?.msg || this.t("errorWriteFile"));
  }

  async cleanupLegacyMetaFiles() {
    const bases = ["/data/emojis", "/emojis"];

    for (const base of bases) {
      for (const source of SOURCES) {
        const dir = `${base}/${source.dir}`;
        const rows = await this.readDirSafe(dir);
        if (!rows.length) continue;

        for (const row of rows) {
          const name = s(row?.name || row?.path || "");
          if (!name.endsWith(".meta.json")) continue;
          const fullPath = `${dir}/${name.replace(/^.*[\\/]/, "")}`;
          await this.removeFileBestEffort(fullPath);
        }
      }
    }
  }

  async readDirSafe(path) {
    try {
      const resp = await fetch("/api/file/readDir", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({path}),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || json?.code !== 0 || !Array.isArray(json?.data)) {
        return [];
      }
      return json.data;
    } catch {
      return [];
    }
  }

  async removeFileIfExists(path) {
    const fullPath = s(path).trim();
    if (!fullPath) return;

    const idx = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
    if (idx <= 0) return;
    const dir = fullPath.slice(0, idx);
    const fileName = fullPath.slice(idx + 1);
    if (!fileName) return;

    const rows = await this.readDirSafe(dir);
    const exists = rows.some((row) => {
      const rawName = s(row?.name || row?.path || "");
      const rowName = rawName.replace(/^.*[\\/]/, "");
      const isDir = row?.isDir === true || row?.isDir === "true";
      return rowName === fileName && !isDir;
    });

    if (!exists) return;
    await this.removeFileBestEffort(fullPath);
  }

  async removeFileBestEffort(path) {
    try {
      await fetch("/api/file/removeFile", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({path}),
      });
    } catch {
      // ignore cleanup failure
    }
  }

  async callPutFile(form) {
    const resp = await fetch("/api/file/putFile", {
      method: "POST",
      body: form,
      credentials: "include",
      headers: {
        ...authHeaders(),
      },
    });
    const json = await resp.json().catch(() => null);
    return {ok: resp.ok, status: resp.status, json};
  }

  /* 鈹€鈹€ Network requests 鈹€鈹€ */

  async fetchAvatarDataUrl(url) {
    const errors = [];

    try {
      return await this.fetchAvatarByFetch(url);
    } catch (err) {
      errors.push(err);
    }

    try {
      return await this.fetchAvatarByForwardProxy(url);
    } catch (err) {
      errors.push(err);
    }

    try {
      return await this.fetchAvatarByNode(url);
    } catch (err) {
      errors.push(err);
    }

    throw errors.length ? errors[errors.length - 1] : new Error("Failed to fetch avatar");
  }

  async fetchAvatarByFetch(url) {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: `${SOURCE_MAP.iconfont.origin}/`,
        Accept: "image/*,*/*",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await this.blobToDataUrl(await resp.blob());
  }

  async fetchAvatarByForwardProxy(url) {
    const data = await this.requestByForwardProxy(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: `${SOURCE_MAP.iconfont.origin}/`,
          Origin: SOURCE_MAP.iconfont.origin,
          Accept: "image/*,*/*",
        },
      },
      "base64"
    );
    const ct = this.forwardProxyContentType(data, "image/png").split(";")[0].trim() || "image/png";
    const body = this.forwardProxyBody(data);
    if (!body) throw new Error("Empty avatar body");
    return `data:${ct};base64,${body}`;
  }

  fetchAvatarByNode(url) {
    return new Promise((resolve, reject) => {
      const node = this.getNodeHttpClients();
      if (!node) {
        reject(new Error("Node HTTP APIs unavailable"));
        return;
      }

      const {https, http, Buffer: NodeBuffer} = node;
      const doFetch = (target, depth) => {
        if (depth > 4) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsed = new URL(target);
        const client = parsed.protocol === "http:" ? http : https;
        const req = client.request(
          parsed,
          {
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0",
              Referer: `${SOURCE_MAP.iconfont.origin}/`,
              Accept: "image/*,*/*",
            },
          },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              doFetch(new URL(res.headers.location, target).toString(), depth + 1);
              return;
            }
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
              const buffer = NodeBuffer.concat(chunks);
              const ct = s(res.headers["content-type"], "image/png").split(";")[0].trim() || "image/png";
              resolve(`data:${ct};base64,${buffer.toString("base64")}`);
            });
          }
        );
        req.on("error", reject);
        req.end();
      };

      doFetch(url, 0);
    });
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(s(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Read blob failed"));
      reader.readAsDataURL(blob);
    });
  }

  async requestJson(url, options = {}, origin = "") {
    const text = await this.requestText(url, options, origin);
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid JSON: ${safeMsg(err)}`);
    }
  }

  async requestText(url, options = {}, origin = "") {
    const errors = [];

    try {
      return await this.requestByFetch(url, options);
    } catch (err) {
      errors.push(err);
    }

    try {
      const data = await this.requestByForwardProxy(url, options, "text");
      return this.forwardProxyBody(data);
    } catch (err) {
      errors.push(err);
    }

    if (!this.canUseNodeHttp()) {
      throw errors.length ? errors[errors.length - 1] : new Error("No available request transport");
    }

    try {
      return await this.requestByNode(url, options, origin, 0);
    } catch (err) {
      errors.push(err);
      throw errors[errors.length - 1];
    }
  }

  async requestByFetch(url, options = {}) {
    const resp = await fetch(url, {
      method: s(options.method, "GET"),
      headers: options.headers || {},
      body: options.body,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  }

  async requestByForwardProxy(url, options = {}, responseEncoding = "text") {
    const method = s(options.method, "GET").toUpperCase();

    const headers = {};
    Object.entries(options.headers || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) headers[k] = String(v);
    });

    let body = options.body;
    if (body instanceof URLSearchParams) body = body.toString();
    else if (body !== undefined && body !== null && typeof body !== "string") body = String(body);
    else if (body === undefined || body === null) body = "";

    const contentTypePair = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type");
    const payload = {
      url,
      method,
      timeout: 15000,
      contentType: contentTypePair ? contentTypePair[1] : "application/json",
      headers: Object.keys(headers).length ? [headers] : [],
      payload: body,
      payloadEncoding: "text",
      responseEncoding,
    };

    const resp = await fetch("/api/network/forwardProxy", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const code = Number(json?.code ?? json?.Code ?? -1);
    if (code !== 0) throw new Error(s(json?.msg ?? json?.Msg, `forwardProxy error (${json?.code ?? json?.Code ?? "unknown"})`));

    const data = json?.data ?? json?.Data ?? {};
    const status = Number(data?.status ?? data?.StatusCode ?? data?.statusCode ?? 0);
    if (!status) throw new Error("Invalid forwardProxy status");
    if (status >= 400) throw new Error(`HTTP ${status}`);
    return data;
  }

  forwardProxyBody(data) {
    if (!data || typeof data !== "object") return "";
    if (data.body !== undefined && data.body !== null) return String(data.body);
    if (data.Body !== undefined && data.Body !== null) return String(data.Body);
    return "";
  }

  forwardProxyContentType(data, fallback = "") {
    if (!data || typeof data !== "object") return fallback;
    if (data.contentType !== undefined && data.contentType !== null) return String(data.contentType);
    if (data.ContentType !== undefined && data.ContentType !== null) return String(data.ContentType);
    return fallback;
  }

  canUseNodeHttp() {
    return !!this.getNodeHttpClients();
  }

  getNodeHttpClients() {
    if (typeof require !== "function") return null;

    let https;
    let http;
    try {
      https = require("https");
      http = require("http");
    } catch {
      return null;
    }

    if (!https || typeof https.request !== "function") return null;
    if (!http || typeof http.request !== "function") return null;
    if (typeof Buffer === "undefined" || typeof Buffer.concat !== "function" || typeof Buffer.byteLength !== "function") return null;
    return {https, http, Buffer};
  }

  requestByNode(url, options = {}, origin = "", depth = 0) {
    return new Promise((resolve, reject) => {
      const node = this.getNodeHttpClients();
      if (!node) {
        reject(new Error("Node HTTP APIs unavailable"));
        return;
      }

      const {https, http, Buffer: NodeBuffer} = node;

      const parsed = new URL(url);
      const client = parsed.protocol === "http:" ? http : https;
      const method = s(options.method, "GET").toUpperCase();

      const headers = {};
      Object.entries(options.headers || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) headers[k] = String(v);
      });
      if (!hasHeader(headers, "User-Agent")) headers["User-Agent"] = "Mozilla/5.0";
      const o = origin || `${parsed.protocol}//${parsed.host}`;
      if (!hasHeader(headers, "Referer")) headers.Referer = `${o}/`;
      if (!hasHeader(headers, "Origin")) headers.Origin = o;

      let body = options.body;
      if (body instanceof URLSearchParams) body = body.toString();
      else if (body !== undefined && body !== null && typeof body !== "string") body = String(body);
      if (body && !hasHeader(headers, "Content-Length")) headers["Content-Length"] = String(NodeBuffer.byteLength(body, "utf8"));

      const req = client.request(
        parsed,
        {method, headers},
        (res) => {
          const status = Number(res.statusCode || 0);

          if (status >= 300 && status < 400 && res.headers.location) {
            if (depth >= 5) {
              reject(new Error("Too many redirects."));
              return;
            }
            const next = new URL(res.headers.location, url).toString();
            this.requestByNode(next, options, origin, depth + 1).then(resolve).catch(reject);
            return;
          }

          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            if (status >= 400) {
              reject(new Error(`HTTP ${status}`));
              return;
            }
            resolve(raw);
          });
        }
      );

      req.on("error", (err) => reject(err));
      if (body) req.write(body);
      req.end();
    });
  }

  /* 鈹€鈹€ DOM helpers 鈹€鈹€ */

  safeSvgElement(raw, interactive = false) {
    const text = this.sanitizeSvg(raw, {preserveColorMarkers: interactive});
    if (!text) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.display = "block";
      svg.style.pointerEvents = interactive ? "auto" : "none";
      return document.importNode(svg, true);
    } catch {
      return null;
    }
  }

  escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

module.exports = EmojiMarketPlugin;



