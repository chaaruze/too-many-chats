/**
 * Chat Folders Extension for SillyTavern
 * Organizes chats per character into collapsible folders
 * @author chaaruze
 * @version 1.0.0
 */

(function () {
    'use strict';

    const MODULE_NAME = 'chat_folders';
    const EXTENSION_NAME = 'Chat Folders';

    // Default settings structure
    const defaultSettings = Object.freeze({
        folders: {},           // { folderId: { name, chats[], collapsed, order } }
        characterFolders: {},  // { characterAvatar: [folderIds] }
        version: '1.0.0'
    });

    // Get extension settings
    function getSettings() {
        const context = SillyTavern.getContext();
        const { extensionSettings } = context;

        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }

        // Migration: ensure all keys exist
        for (const key of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
                extensionSettings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
            }
        }

        return extensionSettings[MODULE_NAME];
    }

    // Save settings
    function saveSettings() {
        const context = SillyTavern.getContext();
        context.saveSettingsDebounced();
    }

    // Generate unique ID
    function generateId() {
        return 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Get current character identifier
    function getCurrentCharacterId() {
        const context = SillyTavern.getContext();
        if (context.characterId !== undefined && context.characters[context.characterId]) {
            return context.characters[context.characterId].avatar || context.characters[context.characterId].name;
        }
        return null;
    }

    // ========== FOLDER MANAGEMENT ==========

    function createFolder(name) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return null;

        const folderId = generateId();
        const folderCount = Object.keys(settings.folders).filter(id => 
            settings.characterFolders[characterId]?.includes(id)
        ).length;

        settings.folders[folderId] = {
            name: name || 'New Folder',
            chats: [],
            collapsed: false,
            order: folderCount
        };

        if (!settings.characterFolders[characterId]) {
            settings.characterFolders[characterId] = [];
        }
        settings.characterFolders[characterId].push(folderId);

        saveSettings();
        refreshFolderUI();
        return folderId;
    }

    function renameFolder(folderId, newName) {
        const settings = getSettings();
        if (settings.folders[folderId]) {
            settings.folders[folderId].name = newName;
            saveSettings();
            refreshFolderUI();
        }
    }

    function deleteFolder(folderId) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId || !settings.folders[folderId]) return;

        // Remove folder from character's folder list
        const charFolders = settings.characterFolders[characterId];
        if (charFolders) {
            const index = charFolders.indexOf(folderId);
            if (index > -1) {
                charFolders.splice(index, 1);
            }
        }

        // Delete the folder itself
        delete settings.folders[folderId];
        saveSettings();
        refreshFolderUI();
    }

    function toggleFolderCollapse(folderId) {
        const settings = getSettings();
        if (settings.folders[folderId]) {
            settings.folders[folderId].collapsed = !settings.folders[folderId].collapsed;
            saveSettings();
            refreshFolderUI();
        }
    }

    function moveChatToFolder(chatFile, targetFolderId) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return;

        // Remove from all existing folders for this character
        const charFolderIds = settings.characterFolders[characterId] || [];
        for (const fid of charFolderIds) {
            if (settings.folders[fid] && settings.folders[fid].chats) {
                const idx = settings.folders[fid].chats.indexOf(chatFile);
                if (idx > -1) {
                    settings.folders[fid].chats.splice(idx, 1);
                }
            }
        }

        // Add to target folder (if not 'uncategorized')
        if (targetFolderId && targetFolderId !== 'uncategorized' && settings.folders[targetFolderId]) {
            if (!settings.folders[targetFolderId].chats) {
                settings.folders[targetFolderId].chats = [];
            }
            settings.folders[targetFolderId].chats.push(chatFile);
        }

        saveSettings();
        refreshFolderUI();
    }

    function getFoldersForCurrentCharacter() {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return [];

        const folderIds = settings.characterFolders[characterId] || [];
        return folderIds
            .map(id => ({ id, ...settings.folders[id] }))
            .filter(f => f.name) // Filter out deleted/invalid folders
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function getChatFolder(chatFile) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return null;

        const folderIds = settings.characterFolders[characterId] || [];
        for (const fid of folderIds) {
            if (settings.folders[fid]?.chats?.includes(chatFile)) {
                return fid;
            }
        }
        return null;
    }

    // ========== UI COMPONENTS ==========

    function createManageFoldersButton() {
        const btn = document.createElement('div');
        btn.id = 'chat_folders_manage_btn';
        btn.className = 'menu_button menu_button_icon';
        btn.title = 'Manage Chat Folders';
        btn.innerHTML = `
            <i class="fa-solid fa-folder-tree"></i>
            <span data-i18n="Folders">Folders</span>
        `;
        btn.addEventListener('click', openFolderModal);
        return btn;
    }

    function openFolderModal() {
        // Remove existing modal if any
        const existing = document.getElementById('chat_folders_modal');
        if (existing) existing.remove();

        const folders = getFoldersForCurrentCharacter();
        const characterId = getCurrentCharacterId();

        if (!characterId) {
            toastr.warning('Please select a character first.');
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'chat_folders_modal';
        modal.className = 'chat_folders_modal_overlay';
        modal.innerHTML = `
            <div class="chat_folders_modal_content">
                <div class="chat_folders_modal_header">
                    <h3><i class="fa-solid fa-folder-tree"></i> Manage Chat Folders</h3>
                    <span class="chat_folders_modal_close" title="Close">&times;</span>
                </div>
                <div class="chat_folders_modal_body">
                    <div class="chat_folders_new_folder">
                        <input type="text" id="chat_folders_new_name" placeholder="New folder name..." maxlength="50">
                        <button id="chat_folders_add_btn" class="menu_button" title="Create Folder">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div class="chat_folders_list" id="chat_folders_list">
                        ${folders.length === 0 ? '<div class="chat_folders_empty">No folders yet. Create one above!</div>' : ''}
                        ${folders.map(f => `
                            <div class="chat_folders_item" data-folder-id="${f.id}">
                                <i class="fa-solid fa-folder chat_folders_icon"></i>
                                <span class="chat_folders_name">${escapeHtml(f.name)}</span>
                                <span class="chat_folders_count">${f.chats?.length || 0} chats</span>
                                <button class="chat_folders_edit_btn menu_button" title="Rename">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button class="chat_folders_delete_btn menu_button" title="Delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.chat_folders_modal_close').addEventListener('click', closeFolderModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeFolderModal();
        });

        modal.querySelector('#chat_folders_add_btn').addEventListener('click', () => {
            const input = modal.querySelector('#chat_folders_new_name');
            const name = input.value.trim();
            if (name) {
                createFolder(name);
                input.value = '';
                openFolderModal(); // Refresh modal
            }
        });

        modal.querySelector('#chat_folders_new_name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#chat_folders_add_btn').click();
            }
        });

        // Edit/delete handlers
        modal.querySelectorAll('.chat_folders_edit_btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.chat_folders_item');
                const folderId = item.dataset.folderId;
                const nameSpan = item.querySelector('.chat_folders_name');
                const newName = prompt('Rename folder:', nameSpan.textContent);
                if (newName && newName.trim()) {
                    renameFolder(folderId, newName.trim());
                    openFolderModal(); // Refresh
                }
            });
        });

        modal.querySelectorAll('.chat_folders_delete_btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.chat_folders_item');
                const folderId = item.dataset.folderId;
                const nameSpan = item.querySelector('.chat_folders_name');
                if (confirm(`Delete folder "${nameSpan.textContent}"? Chats will become uncategorized.`)) {
                    deleteFolder(folderId);
                    openFolderModal(); // Refresh
                }
            });
        });
    }

    function closeFolderModal() {
        const modal = document.getElementById('chat_folders_modal');
        if (modal) modal.remove();
    }

    // ========== CHAT LIST INTEGRATION ==========

    function refreshFolderUI() {
        const chatList = document.getElementById('chat_list');
        if (!chatList) return;

        const characterId = getCurrentCharacterId();
        if (!characterId) return;

        const folders = getFoldersForCurrentCharacter();
        const settings = getSettings();

        // Get all chat items
        const chatItems = Array.from(chatList.querySelectorAll('.select_chat_block'));
        if (chatItems.length === 0) return;

        // Build chat file to element map
        const chatMap = new Map();
        chatItems.forEach(item => {
            const chatFile = item.getAttribute('file_name') || item.dataset.fileName;
            if (chatFile) {
                chatMap.set(chatFile, item);
            }
        });

        // Remove existing folder wrappers
        chatList.querySelectorAll('.chat_folder_wrapper').forEach(w => w.remove());

        // Create folder wrappers
        const fragment = document.createDocumentFragment();
        const assignedChats = new Set();

        folders.forEach(folder => {
            const wrapper = document.createElement('div');
            wrapper.className = 'chat_folder_wrapper';
            wrapper.dataset.folderId = folder.id;

            const header = document.createElement('div');
            header.className = 'chat_folder_header';
            header.innerHTML = `
                <i class="fa-solid fa-chevron-${folder.collapsed ? 'right' : 'down'} chat_folder_toggle"></i>
                <i class="fa-solid fa-folder${folder.collapsed ? '' : '-open'} chat_folder_icon"></i>
                <span class="chat_folder_name">${escapeHtml(folder.name)}</span>
                <span class="chat_folder_badge">${folder.chats?.length || 0}</span>
            `;
            header.addEventListener('click', () => toggleFolderCollapse(folder.id));

            const content = document.createElement('div');
            content.className = 'chat_folder_content';
            if (folder.collapsed) content.classList.add('collapsed');

            // Move chats into folder
            (folder.chats || []).forEach(chatFile => {
                const chatEl = chatMap.get(chatFile);
                if (chatEl) {
                    assignedChats.add(chatFile);
                    content.appendChild(chatEl.cloneNode(true));
                }
            });

            wrapper.appendChild(header);
            wrapper.appendChild(content);
            fragment.appendChild(wrapper);
        });

        // Create uncategorized section
        const uncategorizedChats = Array.from(chatMap.entries())
            .filter(([file]) => !assignedChats.has(file));

        if (uncategorizedChats.length > 0) {
            const uncatWrapper = document.createElement('div');
            uncatWrapper.className = 'chat_folder_wrapper chat_folder_uncategorized';
            uncatWrapper.innerHTML = `
                <div class="chat_folder_header">
                    <i class="fa-solid fa-file-alt chat_folder_icon"></i>
                    <span class="chat_folder_name">Uncategorized</span>
                    <span class="chat_folder_badge">${uncategorizedChats.length}</span>
                </div>
            `;
            const content = document.createElement('div');
            content.className = 'chat_folder_content';
            uncategorizedChats.forEach(([, el]) => {
                content.appendChild(el.cloneNode(true));
            });
            uncatWrapper.appendChild(content);
            fragment.appendChild(uncatWrapper);
        }

        // Only inject if we have folders defined
        if (folders.length > 0) {
            // Hide original items and prepend folder view
            chatItems.forEach(item => item.style.display = 'none');
            chatList.prepend(fragment);

            // Re-attach click handlers for cloned elements
            attachChatClickHandlers();
            attachContextMenus();
        }
    }

    function attachChatClickHandlers() {
        document.querySelectorAll('.chat_folder_content .select_chat_block').forEach(item => {
            item.addEventListener('click', function() {
                const fileName = this.getAttribute('file_name') || this.dataset.fileName;
                if (fileName) {
                    // Trigger SillyTavern's native chat selection
                    const original = document.querySelector(`.select_chat_block[file_name="${fileName}"]:not(.chat_folder_content .select_chat_block)`);
                    if (original) original.click();
                }
            });
        });
    }

    function attachContextMenus() {
        document.querySelectorAll('.chat_folder_content .select_chat_block, #chat_list > .select_chat_block').forEach(item => {
            item.addEventListener('contextmenu', handleChatContextMenu);
        });
    }

    function handleChatContextMenu(e) {
        e.preventDefault();
        
        const chatFile = this.getAttribute('file_name') || this.dataset.fileName;
        if (!chatFile) return;

        // Remove existing context menu
        const existing = document.getElementById('chat_folders_context_menu');
        if (existing) existing.remove();

        const folders = getFoldersForCurrentCharacter();
        const currentFolder = getChatFolder(chatFile);

        const menu = document.createElement('div');
        menu.id = 'chat_folders_context_menu';
        menu.className = 'chat_folders_context_menu';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';

        menu.innerHTML = `
            <div class="chat_folders_context_header">Move to folder:</div>
            ${folders.map(f => `
                <div class="chat_folders_context_item ${currentFolder === f.id ? 'active' : ''}" data-folder-id="${f.id}">
                    <i class="fa-solid fa-folder"></i> ${escapeHtml(f.name)}
                </div>
            `).join('')}
            <div class="chat_folders_context_divider"></div>
            <div class="chat_folders_context_item ${!currentFolder ? 'active' : ''}" data-folder-id="uncategorized">
                <i class="fa-solid fa-file-alt"></i> Uncategorized
            </div>
            <div class="chat_folders_context_divider"></div>
            <div class="chat_folders_context_item chat_folders_context_new">
                <i class="fa-solid fa-plus"></i> New Folder...
            </div>
        `;

        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.querySelectorAll('.chat_folders_context_item').forEach(item => {
            item.addEventListener('click', () => {
                const targetFolder = item.dataset.folderId;
                if (item.classList.contains('chat_folders_context_new')) {
                    const name = prompt('New folder name:');
                    if (name && name.trim()) {
                        const newFolderId = createFolder(name.trim());
                        if (newFolderId) {
                            moveChatToFolder(chatFile, newFolderId);
                        }
                    }
                } else {
                    moveChatToFolder(chatFile, targetFolder);
                }
                menu.remove();
            });
        });

        // Close menu on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }

    // ========== UTILITIES ==========

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== INITIALIZATION ==========

    async function init() {
        const context = SillyTavern.getContext();
        const { eventSource, event_types } = context;

        // Initialize settings
        getSettings();

        // Add manage button to chat header area
        const chatHeader = document.querySelector('#chat_header_back_button')?.parentElement;
        if (chatHeader && !document.getElementById('chat_folders_manage_btn')) {
            chatHeader.appendChild(createManageFoldersButton());
        }

        // Alternatively, add to past chats controls
        const pastChatsControls = document.querySelector('#option_select_chat')?.parentElement;
        if (pastChatsControls && !document.getElementById('chat_folders_manage_btn')) {
            pastChatsControls.appendChild(createManageFoldersButton());
        }

        // Listen for chat changes
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(refreshFolderUI, 100);
        });

        // Initial refresh
        setTimeout(refreshFolderUI, 500);

        console.log(`[${EXTENSION_NAME}] Extension loaded successfully!`);
    }

    // Wait for app to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
