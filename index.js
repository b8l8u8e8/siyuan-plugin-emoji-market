/* Emoji Market - SiYuan plugin (no-build single file) */

const {Plugin, showMessage, Setting, Dialog} = require("siyuan");

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
    this.settingSourceActionEls = new Map();
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
      this.dialogResolve({confirmed: false, keepOriginalColor: true, selectedColor: ""});
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
    this.settingSourceActionEls.clear();
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
    };
  }

  normalizeSettings(raw) {
    const defaults = this.defaultSettings();
    const data = raw && typeof raw === "object" ? raw : {};
    const enabledRaw = data.enabledSources && typeof data.enabledSources === "object" ? data.enabledSources : {};
    const maxRaw = data.maxPerSourceBySource && typeof data.maxPerSourceBySource === "object" ? data.maxPerSourceBySource : {};
    const legacyMax = Object.prototype.hasOwnProperty.call(data, "maxPerSource") ? data.maxPerSource : undefined;

    const enabledSources = {};
    const maxPerSourceBySource = {};
    SOURCES.forEach((source) => {
      if (Object.prototype.hasOwnProperty.call(enabledRaw, source.id)) {
        enabledSources[source.id] = !!enabledRaw[source.id];
      } else {
        enabledSources[source.id] = defaults.enabledSources[source.id];
      }

      const maxVal = Object.prototype.hasOwnProperty.call(maxRaw, source.id) ? maxRaw[source.id] : legacyMax;
      maxPerSourceBySource[source.id] = this.normalizeMaxPerSource(maxVal);
    });

    return {
      enabledSources,
      maxPerSourceBySource,
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
        const action = this.settingSourceActionEls.get(source.id);
        const enabled = this.isSourceEnabled(source.id);
        if (input instanceof HTMLInputElement) input.checked = enabled;
        if (maxInput instanceof HTMLInputElement) {
          maxInput.value = String(this.getMaxPerSource(source.id));
          maxInput.disabled = !enabled;
        }
        if (action instanceof HTMLElement) action.classList.toggle("is-disabled", !enabled);
      });
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
    this.settingSourceActionEls.clear();
    this.setting = new Setting({});
    this.setting.addItem({
      title: this.t("settingsSourcesTitle"),
      description: this.t("settingsSourcesDesc", {min: MIN_MAX_PER_SOURCE, max: MAX_MAX_PER_SOURCE}),
    });

    SOURCES.forEach((source) => {
      this.setting.addItem({
        title: source.name,
        description: "",
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

          checkbox.addEventListener("change", () => {
            const enabled = !!checkbox.checked;
            this.settingsData.enabledSources[source.id] = enabled;
            maxInput.disabled = !enabled;
            action.classList.toggle("is-disabled", !enabled);
            void this.saveSettingsData();
            this.refreshEnhancedPanels();
          });

          toggle.appendChild(checkbox);
          limitWrap.appendChild(limitLabel);
          limitWrap.appendChild(maxInput);
          limitWrap.appendChild(limitUnit);
          action.appendChild(toggle);
          action.appendChild(limitWrap);
          action.classList.toggle("is-disabled", !checkbox.checked);

          this.settingSourceInputs.set(source.id, checkbox);
          this.settingSourceMaxInputs.set(source.id, maxInput);
          this.settingSourceActionEls.set(source.id, action);
          return action;
        },
      });
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
    document.querySelectorAll(".if-market-title,.if-market-content").forEach((el) => el.remove());
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
    if (st?.title?.parentElement) st.title.remove();
    if (st?.content?.parentElement) st.content.remove();
  }

  ensureSection(st) {
    this._mutating = true;
    try {
      if (!(st.title instanceof HTMLElement)) {
        st.title = document.createElement("div");
        st.title.className = "if-market-title";
      }
      if (!(st.content instanceof HTMLElement)) {
        st.content = document.createElement("div");
        st.content.className = "emojis__content if-market-content";
      }

      if (st.title.parentElement !== st.panel || st.content.parentElement !== st.panel) {
        if (st.title.parentElement) st.title.remove();
        if (st.content.parentElement) st.content.remove();

        let titles = [];
        try {
          titles = Array.from(st.panel.children).filter(
            (el) => el instanceof HTMLElement && el.classList.contains("emojis__title")
          );
        } catch {
          titles = Array.from(st.panel.querySelectorAll(".emojis__title"));
        }
        const anchor = titles.length >= 2 ? titles[1] : null;
        if (anchor) {
          st.panel.insertBefore(st.title, anchor);
          st.panel.insertBefore(st.content, anchor);
        } else {
          st.panel.appendChild(st.title);
          st.panel.appendChild(st.content);
        }
      }

      st.title.textContent = this.t("storeTitle");
      return st.content;
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
    c.innerHTML = `<div class="if-market-searching">${this.escapeHtml(this.t("searching"))}</div>`;

    st.seq += 1;
    const seq = st.seq;

    try {
      const enabledSources = this.getEnabledSources();
      if (!enabledSources.length) {
        c.classList.remove("if-market-loading");
        c.innerHTML = `<div class="if-market-empty">${this.escapeHtml(this.t("settingsNoSourceEnabled"))}</div>`;
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
      c.innerHTML = `<div class="if-market-empty">${this.escapeHtml(this.t("searchFailed", {msg: safeMsg(err)}))}</div>`;
      this.showHintContainer(st);
    }
  }

  renderResults(st, kw, sources, bySource) {
    const c = this.ensureSection(st);
    this._mutating = true;
    try {
      c.classList.remove("if-market-loading");
      c.innerHTML = "";
      const frag = document.createDocumentFragment();
      sources.forEach((source) => {
        frag.appendChild(this.renderSourceBlock(source, kw, bySource[source.id] || {items: [], error: null}));
      });
      c.appendChild(frag);
    } finally {
      this._mutating = false;
    }
  }

  renderSourceBlock(source, kw, res) {
    const block = document.createElement("section");
    block.className = "if-market-source-block";

    const t = document.createElement("div");
    t.className = "if-market-source-title";
    t.textContent = `${this.t("storeTitle")} - ${source.name}`;
    block.appendChild(t);

    const body = document.createElement("div");
    body.className = "if-market-source-items";
    block.appendChild(body);

    if (res.error) {
      body.innerHTML = `<div class="if-market-empty">${this.escapeHtml(this.t("sourceSearchFailed", {source: source.name, msg: safeMsg(res.error)}))}</div>`;
      return block;
    }

    const items = Array.isArray(res.items) ? res.items.slice(0, this.getMaxPerSource(source.id)) : [];
    if (!items.length) {
      body.innerHTML = `<div class="if-market-empty">${this.escapeHtml(this.t("noResults", {kw}))}</div>`;
      return block;
    }

    const grid = document.createElement("div");
    grid.className = "if-market-item-grid";
    body.appendChild(grid);

    items.forEach((icon) => grid.appendChild(this.createResultButton(source, icon, kw)));
    return block;
  }

  /* 鈹€鈹€ Result buttons (FIX #1: no emojis__item class initially) 鈹€鈹€ */

  createResultButton(source, icon, kw) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "if-market-item";
    btn.setAttribute("aria-label", s(icon?.name, "icon"));
    btn.dataset.ifKeyword = kw;
    btn.dataset.ifProvider = source.id;
    btn.dataset.ifIconId = s(icon?.id);

    const preview = this.safeSvgElement(icon?.previewSvg);
    if (preview) btn.appendChild(preview);
    else btn.textContent = "?";

    btn.addEventListener("pointerdown", (e) => {
      if (btn.dataset.ifReady === "1") return;
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      if (btn.dataset.ifReady === "1") return;
      e.preventDefault();
      e.stopPropagation();
      void this.onPick(btn, source, icon);
    });

    return btn;
  }

  /* 鈹€鈹€ Pick & import (FIX #3: auto-select after import) 鈹€鈹€ */

  async onPick(btn, source, icon) {
    if (btn.dataset.ifSaving === "1") return;
    btn.dataset.ifSaving = "1";
    btn.classList.add("if-market-item--saving");

    try {
      const kw = s(btn.dataset.ifKeyword).trim();
      const selectionCtx = this.captureSelectionContext();
      const detail = await this.getDetail(source, icon);
      const decision = await this.showImportDialog(source, icon, detail, kw);
      if (!decision?.confirmed) return;

      const saved = await this.saveToEmojiStore(source, icon, detail, {
        keyword: kw,
        selectedColor: decision.selectedColor,
        keepOriginalColor: decision.keepOriginalColor,
      });

      await this.applyImportedSelection(btn, source, icon, saved.unicodePath, selectionCtx);
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

    const params = new URLSearchParams();
    params.set("q", keyword);
    params.set("page", "1");
    params.set("count", String(this.getMaxPerSource("iconfont") * 2));
    params.set("sortType", "updated_at");
    params.set("fromCollection", "1");

    const ref = `${SOURCE_MAP.iconfont.origin}/search/index?searchType=icon&q=${encodeURIComponent(keyword)}`;
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

    const rows = Array.isArray(json?.data?.icons) ? json.data.icons : [];
    const items = [];
    const seen = new Set();

    rows.forEach((row) => {
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

    const url = `${SOURCE_MAP.cainiao.origin}/s-${encodeURIComponent(keyword)}-1.html`;
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

    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    const items = [];
    const seen = new Set();

    doc.querySelectorAll(".icon-item").forEach((item) => {
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
    });

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
    const authorSpan = spans.find((x) => /^作者[:：]/.test(n(x.textContent)));
    const licSpan = spans.find((x) => /^协议[:：]/.test(n(x.textContent)));
    const authorLink = authorSpan?.querySelector("a[href]");
    const licLink = licSpan?.querySelector("a[href]");

    const usageLines = [];
    let usageLinkUrl = "";

    const usageLabel = Array.from(root.querySelectorAll("p")).find((p) => n(p.textContent).startsWith("使用许可"));
    const usageContainer = usageLabel?.parentElement || null;

    if (usageContainer) {
      Array.from(usageContainer.querySelectorAll("p.mt-1.text-gray-400")).forEach((p) => {
        const line = n(p.textContent);
        if (!line) return;
        if (/^(大小|宽度|颜色)[:：]/.test(line)) return;
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
        if (/^(大小|宽度|颜色)[:：]/.test(line)) return;
        if (/(商用使用范围|修改与衍生|归属权|使用许可)/.test(line)) {
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
      author: n(s(authorLink?.textContent) || s(authorSpan?.textContent).replace(/^作者[:：]\s*/, "")) || this.t("unknownAuthor"),
      authorUrl: this.toAbs(SOURCE_MAP.cainiao, authorLink?.getAttribute("href") || ""),
      license: n(s(licLink?.textContent) || s(licSpan?.textContent).replace(/^协议[:：]\s*/, "")) || this.t("unlabeled"),
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
    return String(raw || "").split(/[\r\n;,，]+/).map((x) => n(x)).filter(Boolean);
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

  toAbs(source, input) {
    const x = s(input).trim();
    if (!x) return "";
    try {
      return new URL(x, `${source.origin}/`).toString();
    } catch {
      return "";
    }
  }

  buildPalette(detail, defaultColor) {
    const out = [];
    const seen = new Set();
    const push = (x) => {
      const h = normalizeHex(x);
      if (!h || seen.has(h)) return;
      seen.add(h);
      out.push(h);
    };

    push(defaultColor);
    if (Array.isArray(detail?.paletteColors)) detail.paletteColors.forEach(push);
    SWATCHES.forEach(push);
    return out.slice(0, 16);
  }

  /* 鈹€鈹€ Import dialog (FIX #2: avatar with referrerpolicy + error fallback) 鈹€鈹€ */

  showImportDialog(source, icon, detail, keyword) {
    if (this.dialogPromise) return this.dialogPromise;
    this.removeDialog();

    const iconName = this.escapeHtml(cleanTitleText(detail?.title || icon?.name || this.t("unnamed")));
    const iconId = this.escapeHtml(s(icon?.id, "-"));
    const kw = this.escapeHtml(s(keyword));
    const sourceOrigin = this.escapeHtml(source.origin);
    const sourceName = this.escapeHtml(source.name);

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

    const isIconfont = source.id === "iconfont";

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
    const swatches = this.buildPalette(detail, defaultColor)
      .map(
        (c) => `<button type="button" class="if-market-swatch${c.toLowerCase() === defaultColor.toLowerCase() ? " is-active" : ""}" data-color="${c}" style="--if-swatch:${c};" aria-label="${c}"></button>`
      )
      .join("");

    const avatarUrl = httpsUrl(s(detail?.avatarUrl));
    const avatarHtml = avatarUrl
      ? `<img class="if-iconfont-avatar" src="${this.escapeHtml(avatarUrl)}" alt="${authorText}" referrerpolicy="no-referrer" /><div class="if-iconfont-avatar if-iconfont-avatar--placeholder" style="display:none">?</div>`
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

    const html = isIconfont
      ? `
      <div class="if-market-consent-panel if-market-dialog--iconfont" role="dialog" aria-modal="true">
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

    this.dialogPromise = new Promise((resolve) => {
      this.dialogResolve = resolve;
      let done = false;
      let consentWarnTimer = 0;
      let dialog = null;

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

      dialog = new Dialog({
        title: `${this.t("storeTitle")} - ${source.name}`,
        content: html,
        width: this.isMobile ? "96vw" : "920px",
        height: this.isMobile ? "92vh" : "78vh",
        containerClassName: "if-market-import-container",
        destroyCallback: () => {
          if (this.importDialog === dialog) this.importDialog = null;
          settle({confirmed: false, keepOriginalColor: true, selectedColor: ""});
        },
      });
      this.importDialog = dialog;

      const root = dialog.element?.querySelector?.(".if-market-consent-panel");
      if (!(root instanceof HTMLElement)) {
        settle({confirmed: false, keepOriginalColor: true, selectedColor: ""});
        dialog.destroy();
        return;
      }

      const avatarImg = root.querySelector("img.if-iconfont-avatar");
      if (avatarImg) {
        const origAvatarUrl = avatarUrl;
        avatarImg.addEventListener("error", () => {
          if (origAvatarUrl) {
            this.fetchAvatarDataUrl(origAvatarUrl).then((dataUrl) => {
              avatarImg.src = dataUrl;
              avatarImg.style.display = "";
              const placeholder = avatarImg.nextElementSibling;
              if (placeholder) placeholder.style.display = "none";
            }).catch(() => {
              avatarImg.style.display = "none";
              const placeholder = avatarImg.nextElementSibling;
              if (placeholder) placeholder.style.display = "";
            });
          } else {
            avatarImg.style.display = "none";
            const placeholder = avatarImg.nextElementSibling;
            if (placeholder) placeholder.style.display = "";
          }
        });
      }

      const agree = root.querySelector('[data-role="agree"]');
      const keep = root.querySelector('[data-role="keep-original"]');
      const color = root.querySelector('[data-role="color-picker"]');
      const sw = root.querySelector('[data-role="swatches"]');
      const ok = root.querySelector('[data-role="confirm"]');
      const host = root.querySelector('[data-role="preview"]');
      const consentCheck = root.querySelector(".if-market-consent-check");
      const baseSvg = s(detail?.svg || icon?.previewSvg);

      const syncSwatch = () => {
        if (!(sw instanceof HTMLElement) || !(color instanceof HTMLInputElement)) return;
        const cur = normalizeHex(color.value).toLowerCase();
        sw.querySelectorAll("[data-color]").forEach((el) => {
          const c = normalizeHex(el.getAttribute("data-color")).toLowerCase();
          el.classList.toggle("is-active", !!cur && cur === c);
        });
      };

      const render = () => {
        if (!(host instanceof HTMLElement)) return;
        host.innerHTML = "";

        const keepOriginal = !!keep?.checked;
        const pick = s(color?.value, FALLBACK_COLOR);
        const text = keepOriginal ? baseSvg : this.applyColor(baseSvg, pick);

        const svg = this.safeSvgElement(text);
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
        svg.removeAttribute("style");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.style.position = "static";
        svg.style.width = "72%";
        svg.style.height = "72%";
        svg.style.maxWidth = "72%";
        svg.style.maxHeight = "72%";

        host.appendChild(svg);
        syncSwatch();
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
          selectedColor: keepOriginal ? "" : s(color?.value, FALLBACK_COLOR),
        });
        if (this.importDialog === dialog) this.importDialog = null;
        dialog.destroy();
      };

      agree?.addEventListener("change", () => {
        if (agree?.checked && consentCheck instanceof HTMLElement) {
          consentCheck.classList.remove("if-market-consent-check--warn");
        }
      });
      keep?.addEventListener("change", () => {
        if (color) color.disabled = !!keep.checked;
        render();
      });
      color?.addEventListener("input", render);

      if (sw instanceof HTMLElement) {
        sw.addEventListener("click", (e) => {
          const el = e.target?.closest?.("[data-color]");
          if (!(el instanceof HTMLElement)) return;
          const hex = normalizeHex(el.getAttribute("data-color"));
          if (!hex) return;
          if (keep) keep.checked = false;
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

      render();
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
    const nodes = document.querySelectorAll(".if-market-item");
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (s(node.dataset.ifProvider).trim() !== provider) continue;
      if (s(node.dataset.ifIconId).trim() !== iconId) continue;
      return node;
    }
    return null;
  }

  captureSelectionContext() {
    try {
      const sel = document.getSelection();
      if (!sel || !sel.rangeCount) return null;
      return {range: sel.getRangeAt(0).cloneRange()};
    } catch {
      return null;
    }
  }

  restoreSelectionContext(ctx) {
    if (!ctx?.range) return false;
    try {
      const sel = document.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(ctx.range);
      return true;
    } catch {
      return false;
    }
  }

  async applyImportedSelection(btn, source, icon, unicodePath, selectionCtx) {
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
    const nodes = document.querySelectorAll(".emojis__item[data-unicode]");
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

    const selectedColor = s(context.selectedColor).trim();
    if (selectedColor && context.keepOriginalColor === false) {
      raw = this.applyColor(raw, selectedColor);
    }

    const cleaned = this.sanitizeSvg(raw);
    if (!cleaned) throw new Error(this.t("errorInvalidSvg"));

    const idPart = s(icon?.id ? String(icon.id) : "").trim() || String(Date.now());
    const namePart = slug(s(icon?.name) || s(detail?.title));
    const baseName = namePart ? `${namePart}-${idPart}` : `emoji-${source.id}-${idPart}`;

    const fileName = `${baseName}.svg`;
    const unicodePath = `${source.dir}/${fileName}`;
    const savedBase = await this.writeEmojiFile(source, fileName, cleaned, "image/svg+xml");

    const legacyMetaPath = `${savedBase}/${source.dir}/${baseName}.meta.json`;
    await this.removeFileIfExists(legacyMetaPath);

    return {unicodePath};
  }

  sanitizeSvg(raw) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return "";

      svg.removeAttribute("id");
      svg.removeAttribute("class");
      svg.removeAttribute("style");

      svg.querySelectorAll("script,foreignObject").forEach((el) => el.remove());
      [svg, ...svg.querySelectorAll("*")].forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
          if (attr.name === "data-colorindex") el.removeAttribute(attr.name);
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

  async writeEmojiFile(source, fileName, content, mime = "text/plain") {
    let lastErr = null;
    const bases = this.getEmojiBaseCandidates();
    for (const base of bases) {
      const filePath = `${base}/${source.dir}/${fileName}`;
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

  safeSvgElement(raw) {
    const text = this.sanitizeSvg(raw);
    if (!text) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;
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

