# 📁 Chat Folders - SillyTavern Extension

Organize your chats per character into collapsible folders for better organization and navigation.

![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-orange)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **Per-Character Folders** - Each character has their own set of folders
- **Collapsible Folders** - Expand/collapse folders with persistent state
- **Right-Click Menu** - Quickly move chats between folders
- **Modal Management** - Dedicated UI for creating, renaming, and deleting folders
- **Visual Indicators** - Folder icons, chat counts, and expand arrows
- **Dark Theme** - Seamlessly matches SillyTavern's interface

## 📦 Installation

### Method 1: Via Git (Recommended)
1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Enter the repository URL:
   ```
   https://github.com/chaaruze/st-chat-folders
   ```
4. Click **Install**
5. Refresh the page

### Method 2: Manual Installation
1. Download this repository as a ZIP
2. Extract to `SillyTavern/data/<your-user>/extensions/st-chat-folders`
3. Restart SillyTavern

## 🚀 Usage

### Creating Folders
1. Click the **📁 Folders** button in the chat header
2. Enter a folder name and click **+**
3. Your new folder is ready!

### Moving Chats to Folders
1. **Right-click** on any chat in the chat list
2. Select **Move to folder** → Choose destination
3. Or select **New Folder...** to create and move in one step

### Collapse/Expand
- Click on any folder header to toggle its visibility
- State is saved automatically

### Managing Folders
- **Rename**: Click ✏️ in the folder modal
- **Delete**: Click 🗑️ (chats become uncategorized)

## 📸 Screenshots

*Coming soon*

## 🛠️ Technical Details

- **Data Storage**: Uses SillyTavern's `extensionSettings` API
- **Per-Character**: Folder data is keyed by character avatar
- **Non-Destructive**: Deleting folders doesn't delete chats

## 📄 License

MIT License - feel free to modify and share!

## 🤝 Contributing

Issues and pull requests are welcome!

---

Made with ❤️ by [chaaruze](https://github.com/chaaruze)
