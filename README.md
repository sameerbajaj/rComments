# rComments - Reddit Hover Comments (Manifest V3)

A Chrome/Firefox extension that lets you hover over any Reddit comments link to view the comments and their replies in a beautiful, non-obtrusive overlay.

> [!NOTE]
> This repository is a fork and modernization of the original, unmaintained [iampueroo/rComments](https://github.com/iampueroo/rComments) extension. Full credit goes to the original author, [@iampueroo](https://github.com/iampueroo), for the core logic, design, and initial implementation.

## What's New in this Fork?
* **Manifest V3 Upgrade**: The original extension was written in Manifest V2, which is deprecated by modern browsers. This version has been fully upgraded to Manifest V3 to ensure continued support and compatibility.
* **Modern Maintenance**: Ready for continued updates, styling improvements, and new features.

---

## Features
* **Hover to Preview**: Simply hover over the "comments" link on any Reddit post to load a preview of the discussion.
* **Inline Navigation**: View nested comment trees and replies right inside the hover tooltip.
* **Fast & Lightweight**: Fetches comments directly from Reddit's JSON endpoints without loading heavy page assets.

---

## Installation (Developer Mode)

Since this extension is maintained locally and upgraded for Manifest V3, you can load it directly into your browser:

1. **Download/Clone** this repository to your local machine.
2. Open your browser and navigate to the extensions page:
   * **Chrome**: `chrome://extensions/`
   * **Edge**: `edge://extensions/`
   * **Brave**: `brave://extensions/`
3. Enable **Developer mode** (usually a toggle in the top-right corner).
4. Click **Load unpacked** (or **Load unpacked extension**).
5. Select the folder containing this extension (the folder with `manifest.json`).

---

## Contributing & License
We welcome contributions to help keep this extension fast and compatible with Reddit's layout changes.

As the original repository did not include an explicit open-source license, this repository is published for personal use, archiving, and collaborative improvement. All original copyrights belong to [@iampueroo](https://github.com/iampueroo).
