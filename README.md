# War Thunder Live Downloader & Manager ✈️📦

![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

A premium, high-performance desktop application for **War Thunder** players to search, download, favorite, and automatically install custom camouflages (skins) and sights directly into the game.

No more manual zip downloading, extracting, folder renaming, or permissions errors!

---

## ✨ Key Features (v1.5.0)

* ⚡ **1-Click Auto-Updater**: Built-in update engine checks GitHub Releases automatically and installs app updates directly from the dashboard.
* ⭐ **Favorites System**: Star any skin or sight from the live feed or installed library to build your personal collection and filter with `⭐ Favorites Only`.
* 🎯 **Smart Auto-Detection**: Automatically scans all drive letters (`A-Z`) to find Steam and standalone War Thunder installations, as well as `production\UserSights` save folders.
* 🎮 **Real-Time Telemetry Companion**: Connects with War Thunder's live web engine (`localhost:8111`) while in battle or test flight to display your active vehicle and find matching modifications with one click.
* 🧹 **Intelligent Archive Extraction**: Handles complex `.zip` archives automatically, cleanly placing skins in `UserSkins` and sights in `UserSights\all_tanks`.
* 🔒 **User Temp Directory Protection**: Resolves Windows `Program Files` permission restrictions by isolating downloads inside user `%TEMP%` storage.
* 🔓 **Session Cookie Integration**: Option to input your Gaijin session cookie (`identity_sid`) to unlock restricted, historical, or authentic camouflage content on WT Live.
* 🛠️ **Sights Structure Repair**: Built-in 1-click repair utility to move loose sight `.blk` files into the required `all_tanks` directory.

---

## 💻 Installation & Usage

### Method 1: Desktop App (Recommended)
1. Download the latest installer `warthunderlivedownloadmanager_1.5.0_x64-setup.exe` from [GitHub Releases](https://github.com/MigueXYZ/warthunderlivedownloadmanager/releases).
2. Run the installer and launch **War Thunder Live Manager**.
3. The app will auto-detect your War Thunder installation and sights path.

### Method 2: Development / Source Mode
1. Clone the repository and install Node.js dependencies:
   ```bash
   git clone https://github.com/MigueXYZ/warthunderlivedownloadmanager.git
   cd warthunderlivedownloadmanager
   npm install
   ```
2. Launch dev mode using Tauri:
   ```bash
   npm run tauri dev
   ```

---

## ⚙️ Configuration & Setup

Upon opening the app, check the **Settings** panel (⚙️):

1. **Game Folder**: Main War Thunder folder (e.g., `H:\SteamLibrary\steamapps\common\War Thunder`).
2. **Sights Folder**: Target saves folder for custom tank sights (e.g., `C:\Users\<User>\Documents\My Games\WarThunder\Saves\<UserID>\production\UserSights`).
3. **Session Cookie (Optional)**: Paste your `identity_sid` cookie from `live.warthunder.com` (press `F12` -> Application -> Cookies) to view age-restricted or historical posts.

---

## 📜 License & Acknowledgments

Distributed under the MIT License. Developed for the War Thunder community.
Special thanks to Gaijin Entertainment and WT Live creators.
