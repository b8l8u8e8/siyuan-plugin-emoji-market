[中文](README_zh_CN.md) | English

# Emoji Market

> Tired of the limited default icons in SiYuan Note? Can never find the right one for your document? **Emoji Market** connects you to massive icon libraries — if you can think of it, you can find it.

A [SiYuan Note](https://b3log.org/siyuan/) plugin that brings icon search results from major icon platforms directly into the native emoji panel. Search, preview, pick a color, and use — all in one flow, without leaving SiYuan.

## Icon Sources

| Source | Website | Scale | Description |
|--------|---------|-------|-------------|
| Iconfont | [iconfont.cn](https://www.iconfont.cn) | **30,000,000+** icons | Alibaba's vector icon library, one of the largest icon repositories in China |
| Cainiao Icons | [icon.sucai999.com](https://icon.sucai999.com) | **3,000,000+** icons | Free icon search and download platform with rich categories |

Combined, that's tens of millions of vector icons at your fingertips — from minimal line icons to detailed illustrations, in every category imaginable.

## How It Works

1. Open the emoji panel in SiYuan (click the emoji button on a document, or use `:` in text)
2. Type any keyword in the search box — results from both icon platforms appear instantly in an **"Emoji Market"** section below the built-in results
3. Click any icon to open a preview dialog showing author, license, and color options
4. Optionally pick a custom color, or keep the original
5. Check the confirmation box and click **"Use now"**
6. The icon is saved locally and **automatically applied** — no extra clicks needed

**Nothing is stored until you explicitly choose to use an icon.** Browsing and previewing are purely in-memory and leave no files behind.

## Where Are Icons Stored?

Icons you choose to use are saved as SVG files in SiYuan's standard custom emoji directories:

- `data/emojis/iconfont/` — icons from Iconfont
- `data/emojis/cainiao/` — icons from Cainiao Icons

These are regular SiYuan custom emoji files. They persist even if you uninstall the plugin, and they show up in the emoji panel just like any other custom emoji. The plugin itself stores no configuration or other data.

## Disclaimers

**This plugin is a convenience tool.** It provides a streamlined search-and-use interface. The icons themselves come from third-party platforms, not from the plugin author.

- All icons are sourced from **iconfont.cn** and **icon.sucai999.com**. The plugin author does **not** own, host, or distribute any icon assets.
- Each icon has its own **license** set by its creator. Some are free for personal use, some allow commercial use, some are paid. The license types vary per icon.
- **You are responsible** for checking whether your use of any icon complies with its license. The plugin shows author/license info where available but **cannot guarantee** its accuracy.
- **Iconfont** icons are subject to the [Iconfont Platform Service Agreement](https://terms.alicdn.com/legal-agreement/terms/platform_service/20220704165734807/20220704165734807.html). Check whether an icon is marked "free" or "paid", "original" or "third-party open source" before use.
- **Cainiao Icons** are subject to the platform's own terms and per-icon licenses.
- For **commercial use**, always verify you have proper authorization from the rights holder.
- This plugin is provided **"as-is"** with no warranty. The plugin author assumes **no liability** for any copyright or licensing issues.

## License

Plugin source code: [MIT License](LICENSE)

This license covers **only the plugin code**, not icons imported through it. Icons are governed by their own respective licenses.
