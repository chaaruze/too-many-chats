/**
 * Too Many Chats - SillyTavern Extension
 * Organizes chats per character into collapsible folders
 * v1.5.1 - Critical Fix for Folder Duplication
 * @author chaaruze
 * @version 1.5.1
 */

(function () {
    'use strict';

    const MODULE_NAME = 'chat_folders';
    const EXTENSION_NAME = 'Too Many Chats';

    const defaultSettings = Object.freeze({
        folders: {},
        characterFolders: {},
        version: '1.5.1'
    });

    let observer = null;
    let isOrganizing = false;
    let organizeDebounceTimer = null;

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
        if (!name || !name.trim()) return;
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) {
            toastr.warning('Please select a character first');
            return;
        }

        const folderId = generateId();
        const existingCount = (settings.characterFolders[characterId] || []).length;

        settings.folders[folderId] = {
            name: name.trim(),
            chats: [],
            collapsed: false,
            order: existingCount
        };

        if (!settings.characterFolders[characterId]) settings.characterFolders[characterId] = [];
        settings.characterFolders[characterId].push(folderId);

        saveSettings();
        scheduleOrganize();
    }

    function renameFolder(folderId, newName) {
        if (!newName || !newName.trim()) return;
        const settings = getSettings();
        if (settings.folders[folderId]) {
            settings.folders[folderId].name = newName.trim();
            saveSettings();
            scheduleOrganize();
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
        scheduleOrganize();
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

        const allFolderIds = settings.characterFolders[characterId] || [];
        for (const fid of allFolderIds) {
            const folder = settings.folders[fid];
            if (folder && folder.chats) {
                const idx = folder.chats.indexOf(fileName);
                if (idx > -1) folder.chats.splice(idx, 1);
            }
        }

        if (targetFolderId && targetFolderId !== 'uncategorized') {
            const folder = settings.folders[targetFolderId];
            if (folder) {
                if (!folder.chats) folder.chats = [];
                folder.chats.push(fileName);
            }
        }

        saveSettings();
        scheduleOrganize();
    }

    function getFolderForChat(fileName) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return 'uncategorized';

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

    function scheduleOrganize() {
        clearTimeout(organizeDebounceTimer);
        organizeDebounceTimer = setTimeout(organizeChats, 100);
    }

    function organizeChats() {
        if (isOrganizing) return;
        isOrganizing = true;

        try {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (!popup || popup.style.display === 'none') return;

            // Find the wrapper where ST puts chat blocks
            const wrapper = popup.querySelector('.select_chat_block_wrapper');
            if (!wrapper) return;

            // CRITICAL: Only create ONE root, and clean up any extras
            let roots = wrapper.querySelectorAll('.tmc_root');
            let root;
            if (roots.length > 1) {
                // Duplicates detected! Clean up all but the first
                for (let i = 1; i < roots.length; i++) {
                    roots[i].remove();
                }
            }
            root = wrapper.querySelector('.tmc_root');
            if (!root) {
                root = document.createElement('div');
                root.className = 'tmc_root';
                wrapper.prepend(root);
            }

            const characterId = getCurrentCharacterId();
            if (!characterId) return;

            const settings = getSettings();
            const folderIds = settings.characterFolders[characterId] || [];

            // Track existing folder elements
            const existingFolderRows = new Map();
            root.querySelectorAll('.tmc_folder_row').forEach(row => {
                existingFolderRows.set(row.dataset.id, row);
            });

            // Expected folder IDs (including uncategorized)
            const expectedIds = new Set([...folderIds, 'uncategorized']);

            // Remove folders that shouldn't exist
            existingFolderRows.forEach((row, id) => {
                if (!expectedIds.has(id)) {
                    row.remove();
                }
            });

            // Create/update user folders
            const folderContents = {};
            folderIds.forEach(fid => {
                const folder = settings.folders[fid];
                if (!folder) return;

                let fNode = root.querySelector(`.tmc_folder_row[data-id="${fid}"]`);
                if (!fNode) {
                    fNode = createFolderDOM(fid, folder);
                    root.appendChild(fNode);
                } else {
                    // Update name if changed
                    const nameEl = fNode.querySelector('.tmc_name');
                    if (nameEl && nameEl.textContent !== folder.name) {
                        nameEl.textContent = folder.name;
                    }
                }
                folderContents[fid] = fNode.querySelector('.tmc_content');
            });

            // Create/get uncategorized
            let uncatNode = root.querySelector('.tmc_folder_row[data-id="uncategorized"]');
            if (!uncatNode) {
                uncatNode = createUncategorizedDOM();
                root.appendChild(uncatNode);
            }
            folderContents['uncategorized'] = uncatNode.querySelector('.tmc_content');

            // Gather ALL chat blocks (including those already in folders)
            const allBlocks = Array.from(wrapper.querySelectorAll('.select_chat_block'));

            // Move each block to correct folder
            allBlocks.forEach(block => {
                const fileName = block.getAttribute('file_name') || block.textContent.trim();
                if (!fileName) return;

                const targetFid = getFolderForChat(fileName);
                const targetContent = folderContents[targetFid];

                if (targetContent && block.parentElement !== targetContent) {
                    targetContent.appendChild(block);
                }

                // Context menu (once)
                if (!block.dataset.tmcCtx) {
                    block.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showContextMenu(e, fileName);
                    });
                    block.dataset.tmcCtx = '1';
                }
            });

            // Update counts
            Object.entries(folderContents).forEach(([fid, content]) => {
                const count = content.children.length;
                const row = content.closest('.tmc_folder_row');
                const countEl = row?.querySelector('.tmc_count');
                if (countEl) countEl.textContent = count;

                if (fid === 'uncategorized') {
                    row.style.display = count > 0 ? '' : 'none';
                }
            });

            // Inject add button
            injectAddButton(popup);

        } catch (err) {
            console.error('[TMC] Error:', err);
        } finally {
            isOrganizing = false;
        }
    }

    function createFolderDOM(fid, folder) {
        const row = document.createElement('div');
        row.className = 'tmc_folder_row';
        row.dataset.id = fid;

        const header = document.createElement('div');
        header.className = 'tmc_header';
        header.innerHTML = `
            <div class="tmc_header_main">
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

        header.querySelector('.tmc_header_main').addEventListener('click', () => toggleCollapse(fid));
        header.querySelector('.tmc_edit').addEventListener('click', (e) => {
            e.stopPropagation();
            const n = prompt('Rename:', folder.name);
            if (n) renameFolder(fid, n);
        });
        header.querySelector('.tmc_del').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${folder.name}"?`)) deleteFolder(fid);
        });

        const content = document.createElement('div');
        content.className = 'tmc_content';
        content.dataset.id = fid;
        content.style.display = folder.collapsed ? 'none' : '';

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
            <div class="tmc_header_main">
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

    function injectAddButton(popup) {
        if (popup.querySelector('.tmc_add_btn')) return;

        const headerRow = popup.querySelector('.shadow_select_chat_popup_header') || popup.querySelector('h3');
        if (!headerRow) return;

        const btn = document.createElement('div');
        btn.className = 'tmc_add_btn menu_button';
        btn.innerHTML = '<i class="fa-solid fa-folder-plus"></i>';
        btn.title = 'New Folder';
        btn.onclick = (e) => {
            e.stopPropagation();
            const n = prompt('New Folder Name:');
            if (n) createFolder(n);
        };

        const closeBtn = headerRow.querySelector('#select_chat_cross');
        if (closeBtn) {
            headerRow.insertBefore(btn, closeBtn);
        } else {
            headerRow.appendChild(btn);
        }
    }

    // ========== CONTEXT MENU ==========

    function showContextMenu(e, fileName) {
        document.querySelectorAll('.tmc_ctx').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'tmc_ctx';
        menu.style.top = e.pageY + 'px';
        menu.style.left = e.pageX + 'px';

        const settings = getSettings();
        const charId = getCurrentCharacterId();
        const folderIds = settings.characterFolders[charId] || [];

        let html = `<div class="tmc_ctx_head">Move to folder</div>`;
        folderIds.forEach(fid => {
            const f = settings.folders[fid];
            if (f) html += `<div class="tmc_ctx_item" data-fid="${fid}">📁 ${escapeHtml(f.name)}</div>`;
        });
        html += `<div class="tmc_ctx_sep"></div>`;
        html += `<div class="tmc_ctx_item" data-fid="uncategorized">📄 Uncategorized</div>`;
        html += `<div class="tmc_ctx_item tmc_new">➕ New Folder</div>`;

        menu.innerHTML = html;
        document.body.appendChild(menu);

        menu.onclick = (ev) => {
            const item = ev.target.closest('.tmc_ctx_item');
            if (!item) return;
            if (item.classList.contains('tmc_new')) {
                const name = prompt('Folder Name:');
                if (name) createFolder(name);
            } else {
                moveChat(fileName, item.dataset.fid);
            }
            menu.remove();
        };

        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 50);
    }

    // ========== OBSERVER ==========

    function initObserver() {
        if (observer) observer.disconnect();

        observer = new MutationObserver(() => {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (popup && popup.style.display !== 'none') {
                // Check for loose blocks
                const wrapper = popup.querySelector('.select_chat_block_wrapper');
                if (wrapper) {
                    const looseBlocks = Array.from(wrapper.children).filter(
                        el => el.classList.contains('select_chat_block')
                    );
                    if (looseBlocks.length > 0) {
                        scheduleOrganize();
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ========== INIT ==========

    function init() {
        console.log(`[${EXTENSION_NAME}] v1.5.1 Loading...`);
        const ctx = SillyTavern.getContext();

        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, scheduleOrganize);

        // Periodic fallback check
        setInterval(() => {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (popup && popup.style.display !== 'none') {
                const wrapper = popup.querySelector('.select_chat_block_wrapper');
                const roots = wrapper?.querySelectorAll('.tmc_root');
                // If duplicates or loose blocks, fix it
                if (roots && roots.length > 1) {
                    scheduleOrganize();
                }
            }
        }, 3000);

        initObserver();
        setTimeout(scheduleOrganize, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
