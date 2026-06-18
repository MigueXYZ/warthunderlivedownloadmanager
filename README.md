# War Thunder Live Downloader & Manager ✈️📦

A premium, local desktop-assisted web application that connects to `live.warthunder.com` to search, download, and automatically install custom skins (camouflages) and sights directly into your folders.

No more manual downloading, extracting, renaming, and copying zip files!

---

## ✨ Features

*   🔍 **Seamless WT Live Feed Integration**: Browse skins and sights directly from the app, sorted by popularity, downloads, comments, or date.
*   ⚡ **One-Click Installation**: Simply click "Install" and the backend downloads, extracts, and organizes the folders in your `UserSkins` or `UserSights` directory.
*   🧹 **Intelligent ZIP Extraction**: WT Live creators package their zips in many different ways. This app inspects the structure and extracts them cleanly—preventing files from being dumped directly in the root folders.
*   🔓 **Unlock Restricted Content**: Option to paste your Gaijin Session Cookie (`identity_sid`) to browse anime, historical, or restricted mods that Gaijin filters out for unauthenticated visitors.
*   🎮 **Active Vehicle Companion**: Automatically polls War Thunder's telemetry engine (`http://localhost:8111`) while the game is running. When you enter a match or test flight, it displays your active vehicle and offers a one-click button to search top-rated skins/sights for it.
*   🗑️ **Library Management**: View all custom skins and sights currently installed on your PC, with one-click deletion to free up disk space.

---

## 🚀 How to Run the App

1.  Open your terminal inside this project directory.
2.  Start the local server by running:
    ```bash
    npm start
    ```
    *(If script execution policies block npm on Windows, run `npm.cmd start` or `node server.js` instead).*
3.  Open your browser and navigate to:
    **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ First-Time Setup

Once you open the web UI, you will find three input fields at the top of the page:

1.  **Game Folder**: Set this to your main War Thunder game installation path (e.g. `C:\Program Files (x86)\Steam\steamapps\common\War Thunder`). Custom skins will be automatically installed in this directory under `UserSkins`.
2.  **Sights Folder**: Set this to your modern War Thunder custom saves directory under Documents. The application automatically attempts to find this for you, looking under:
    `C:\Users\<YourUserName>\Documents\My Games\WarThunder\Saves\<YourUserID>\production\UserSights`
    Custom sights will be extracted directly here inside the `all_tanks` folder.
3.  **Session Cookie (Optional)**: If you want to see all posts on the website (including restricted/nsfw/historical mods), you can paste your `identity_sid` session cookie.
    *   **How to get it**:
        1. Log in to `live.warthunder.com` in your browser.
        2. Press **F12** on your keyboard to open Developer Tools.
        3. Navigate to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox).
        4. Expand **Cookies** on the left menu and select `https://live.warthunder.com`.
        5. Look for the cookie named `identity_sid`, copy its **Value**, and paste it into the app settings.

Click **Save Settings** to verify and save all configurations.

---

## ⚙️ How Telemetry Tracking Works

1.  Launch **War Thunder**.
2.  Start a Match, Custom Battle, or Test Flight.
3.  The sidebar's status panel will turn green and say **WT Client Active**.
4.  Click **Find Skins & Sights** to immediately list all WT Live creations for your active vehicle!
