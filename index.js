/**
 * Too Many Chats - SillyTavern Extension
 * Organizes chats per character into collapsible folders
 * Architecture: Move & Persist (v1.5.0)
 * @author chaaruze
 * @version 1.5.0
 */

(function () {
    'use strict';

    const MODULE_NAME = 'chat_folders';
    const EXTENSION_NAME = 'Too Many Chats';

    const defaultSettings = Object.freeze({
        folders: {},
        characterFolders: {},
        version: '1.5.0'
    });

    let observer = null;
    let isMoving = false;

    // ========== SETTINGS ==========

    function getSettings() {
        const context = SillyTavern.getContext();
        const { extensionSettings } = context;

        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }

        for (const key of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
                extensionSettings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
            }
        }

        return extensionSettings[MODULE_NAME];
    }

    function saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    }

    // ========== HELPERS ==========

    function generateId() {
        return 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function getCurrentCharacterId() {
        const context = SillyTavern.getContext();
        if (context.characterId !== undefined && context.characters[context.characterId]) {
            return context.characters[context.characterId].avatar || context.characters[context.characterId].name;
        }
        return null;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== FOLDER LOGIC ==========

    function createFolder(name) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) {
            toastr.warning('Please select a character first');
            return;
        }

        const folderId = generateId();
        const existingCount = (settings.characterFolders[characterId] || []).length;

        settings.folders[folderId] = {
            name: name || 'Folder',
            chats: [],
            collapsed: false,
            order: existingCount
        };

        if (!settings.characterFolders[characterId]) settings.characterFolders[characterId] = [];
        settings.characterFolders[characterId].push(folderId);

        saveSettings();
        refreshUI();
    }

    function renameFolder(folderId, newName) {
        const settings = getSettings();
        if (settings.folders[folderId]) {
            settings.folders[folderId].name = newName;
            saveSettings();
            refreshUI();
        }
    }

    function deleteFolder(folderId) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return;

        const charFolders = settings.characterFolders[characterId];
        if (charFolders) {
            const idx = charFolders.indexOf(folderId);
            if (idx > -1) charFolders.splice(idx, 1);
        }

        delete settings.folders[folderId];
        saveSettings();
        refreshUI();
    }

    function toggleCollapse(folderId) {
        const settings = getSettings();
        if (settings.folders[folderId]) {
            settings.folders[folderId].collapsed = !settings.folders[folderId].collapsed;
            saveSettings();

            const content = document.querySelector(`.tmc_content[data-id="${folderId}"]`);
            const icon = document.querySelector(`.tmc_toggle[data-id="${folderId}"]`);
            if (content) content.style.display = settings.folders[folderId].collapsed ? 'none' : 'block';
            if (icon) icon.textContent = settings.folders[folderId].collapsed ? '▶' : '▼';
        }
    }

    function moveChat(fileName, targetFolderId) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return;

        // Remove from source
        const allFolderIds = settings.characterFolders[characterId] || [];
        for (const fid of allFolderIds) {
            const folder = settings.folders[fid];
            if (folder && folder.chats) {
                const idx = folder.chats.indexOf(fileName);
                if (idx > -1) folder.chats.splice(idx, 1);
            }
        }

        // Add to target
        if (targetFolderId && targetFolderId !== 'uncategorized') {
            const folder = settings.folders[targetFolderId];
            if (folder) {
                if (!folder.chats) folder.chats = [];
                folder.chats.push(fileName);
            }
        }

        saveSettings();
        refreshUI();
    }

    function getFolderForChat(fileName) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return null;

        const folderIds = settings.characterFolders[characterId] || [];
        for (const fid of folderIds) {
            const folder = settings.folders[fid];
            if (folder && folder.chats && folder.chats.includes(fileName)) {
                return fid;
            }
        }
        return 'uncategorized';
    }

    // ========== DOM ENGINE ==========

    function refreshUI() {
        organizeChats();
        injectAddButton();
    }

    function organizeChats() {
        if (isMoving) return;
        isMoving = true;

        try {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (!popup) return;

            const sampleBlock = popup.querySelector('.select_chat_block');
            let container;
            if (sampleBlock) {
                container = sampleBlock.parentElement;
            } else {
                container = popup.querySelector('.tmc_root')?.parentElement;
                if (!container) container = popup.querySelector('.select_chat_block_wrapper');
            }
            if (!container) return;

            let root = container.querySelector('.tmc_root');
            if (!root) {
                root = document.createElement('div');
                root.className = 'tmc_root';
                container.prepend(root);
            }

            const characterId = getCurrentCharacterId();
            const settings = getSettings();
            const folderIds = (settings.characterFolders[characterId] || []);
            const folderElements = {};

            // Create/Update Folders
            folderIds.forEach(fid => {
                const folder = settings.folders[fid];
                if (!folder) return;

                let fNode = root.querySelector(`.tmc_folder_row[data-id="${fid}"]`);
                if (!fNode) {
                    fNode = createFolderDOM(fid, folder);
                    root.appendChild(fNode);
                } else {
                    updateFolderHeader(fNode, folder, fid);
                }
                folderElements[fid] = fNode.querySelector('.tmc_content');
            });

            // Uncategorized
            let uncatNode = root.querySelector('.tmc_folder_row[data-id="uncategorized"]');
            if (!uncatNode) {
                uncatNode = createUncategorizedDOM();
                root.appendChild(uncatNode);
            }
            folderElements['uncategorized'] = uncatNode.querySelector('.tmc_content');

            // Move Chats
            const allBlocks = Array.from(container.querySelectorAll('.select_chat_block'));
            allBlocks.forEach(block => {
                const fileName = block.getAttribute('file_name') || block.textContent.trim();
                if (!fileName) return;

                const targetFid = getFolderForChat(fileName);
                const targetContent = folderElements[targetFid];

                if (block.parentElement !== targetContent) {
                    targetContent.appendChild(block);
                }

                if (!block.dataset.tmcInited) {
                    block.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showContextMenu(e, fileName);
                    });
                    block.dataset.tmcInited = 'true';
                }
            });

            // Counts & Cleanup
            Object.keys(folderElements).forEach(fid => {
                const count = folderElements[fid].children.length;
                const row = folderElements[fid].closest('.tmc_folder_row');
                const countEl = row.querySelector('.tmc_count');
                if (countEl) countEl.textContent = count;

                if (fid === 'uncategorized') {
                    row.style.display = count > 0 ? 'block' : 'none';
                    // If no folders exist, maybe hide the uncategorized header too? 
                    // But user wanted overhaul. Let's keep it visible.
                }
            });

        } catch (err) {
            console.error('[TMC] Error organizing:', err);
        } finally {
            isMoving = false;
        }
    }

    function createFolderDOM(fid, folder) {
        const row = document.createElement('div');
        row.className = 'tmc_folder_row';
        row.dataset.id = fid;

        const header = document.createElement('div');
        header.className = 'tmc_header';
        header.innerHTML = `
            <div class="tmc_header_main" title="Toggle Collapse">
                <span class="tmc_toggle" data-id="${fid}">${folder.collapsed ? '▶' : '▼'}</span>
                <span class="tmc_icon">📁</span>
                <span class="tmc_name">${escapeHtml(folder.name)}</span>
                <span class="tmc_count">0</span>
            </div>
            <div class="tmc_actions">
                <div class="tmc_btn tmc_edit" title="Rename"><i class="fa-solid fa-pencil"></i></div>
                <div class="tmc_btn tmc_del" title="Delete"><i class="fa-solid fa-trash"></i></div>
            </div>
        `;

        // FIXED: Better Event Delegation
        const editBtn = header.querySelector('.tmc_edit');
        const delBtn = header.querySelector('.tmc_del');
        const mainHeader = header.querySelector('.tmc_header_main');

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const n = prompt('Rename Folder:', folder.name);
            if (n && n.trim()) renameFolder(fid, n.trim());
        });

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete folder "${folder.name}"? Chats will be uncategorized.`)) {
                deleteFolder(fid);
            }
        });

        mainHeader.addEventListener('click', () => toggleCollapse(fid));

        const content = document.createElement('div');
        content.className = 'tmc_content';
        content.dataset.id = fid;
        content.style.display = folder.collapsed ? 'none' : 'block';

        row.appendChild(header);
        row.appendChild(content);
        return row;
    }

    function createUncategorizedDOM() {
        const row = document.createElement('div');
        row.className = 'tmc_folder_row tmc_uncat';
        row.dataset.id = 'uncategorized';

        const header = document.createElement('div');
        header.className = 'tmc_header';
        header.innerHTML = `
            <div class="tmc_header_main" style="cursor:default">
                <span class="tmc_icon">📄</span>
                <span class="tmc_name">Uncategorized</span>
                <span class="tmc_count">0</span>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'tmc_content';
        content.dataset.id = 'uncategorized';

        row.appendChild(header);
        row.appendChild(content);
        return row;
    }

    function updateFolderHeader(row, folder, fid) {
        row.querySelector('.tmc_name').textContent = folder.name;
    }

    function injectAddButton() {
        const popup = document.querySelector('#shadow_select_chat_popup');
        if (!popup) return;

        const headerRow = popup.querySelector('.shadow_select_chat_popup_header') ||
            popup.querySelector('h3');

        if (headerRow && !headerRow.querySelector('.tmc_add_btn')) {
            const btn = document.createElement('div');
            btn.className = 'tmc_add_btn menu_button'; // Use ST class
            btn.innerHTML = '<i class="fa-solid fa-folder-plus"></i>';
            btn.title = "New Folder";
            btn.onclick = (e) => {
                e.stopPropagation();
                const n = prompt('New Folder Name:');
                if (n && n.trim()) createFolder(n.trim());
            };

            // Insert next to close button or at end
            const closeBtn = headerRow.querySelector('#select_chat_cross');
            if (closeBtn) {
                headerRow.insertBefore(btn, closeBtn);
            } else {
                headerRow.appendChild(btn);
            }
        }
    }

    // ========== CONTEXT MENU ==========

    function showContextMenu(e, fileName) {
        document.querySelectorAll('.tmc_ctx').forEach(e => e.remove());

        const menu = document.createElement('div');
        menu.className = 'tmc_ctx list-group'; // ST Native look
        menu.style.top = e.pageY + 'px';
        menu.style.left = e.pageX + 'px';

        const settings = getSettings();
        const charId = getCurrentCharacterId();
        const folderIds = settings.characterFolders[charId] || [];

        let html = `<div class="tmc_ctx_head">Move "${fileName}"</div>`;
        folderIds.forEach(fid => {
            const f = settings.folders[fid];
            html += `<div class="tmc_ctx_item list-group-item" data-fid="${fid}">📁 ${escapeHtml(f.name)}</div>`;
        });
        html += `<div class="tmc_ctx_sep"></div>`;
        html += `<div class="tmc_ctx_item list-group-item" data-fid="uncategorized">📄 Uncategorized</div>`;
        html += `<div class="tmc_ctx_item list-group-item tmc_new">➕ New Folder</div>`;

        menu.innerHTML = html;
        document.body.appendChild(menu);

        menu.onclick = (ev) => {
            const item = ev.target.closest('.tmc_ctx_item');
            if (!item) return;
            if (item.classList.contains('tmc_new')) {
                const name = prompt('Folder Name:');
                if (name && name.trim()) {
                    createFolder(name.trim());
                    // Note: Ideally we move to the new folder immediately, 
                    // but we'd need to wait for ID generation and sync. 
                    // For now, user just creates it.
                }
            } else {
                moveChat(fileName, item.dataset.fid);
            }
            menu.remove();
        };

        setTimeout(() => {
            document.addEventListener('click', function c() {
                menu.remove();
                document.removeEventListener('click', c);
            }, { once: true });
        }, 100);
    }

    // ========== OBSERVER ==========

    function initObserver() {
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutations) => {
            let needsOrg = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1 && node.classList.contains('select_chat_block')) {
                            if (!node.closest('.tmc_content')) {
                                needsOrg = true;
                            }
                        }
                    }
                }
            }
            if (needsOrg) organizeChats();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ========== INIT ==========

    function init() {
        console.log(`[${EXTENSION_NAME}] v1.5.0 Loading...`);
        const ctx = SillyTavern.getContext();

        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
            setTimeout(refreshUI, 100);
        });

        setInterval(() => {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (popup && popup.style.display !== 'none') {
                const loose = popup.querySelectorAll('.select_chat_block_wrapper > .select_chat_block');
                if (loose.length > 0) organizeChats();
            }
        }, 2000);

        initObserver();
        setTimeout(refreshUI, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
