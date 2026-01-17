/**
 * Too Many Chats - SillyTavern Extension
 * Organizes chats per character into collapsible folders
 * Architecture: Move & Persist (v1.4.0)
 * @author chaaruze
 * @version 1.4.0
 */

(function () {
    'use strict';

    const MODULE_NAME = 'chat_folders';
    const EXTENSION_NAME = 'Too Many Chats';

    const defaultSettings = Object.freeze({
        folders: {},
        characterFolders: {},
        version: '1.4.0'
    });

    let observer = null;
    let isMoving = false; // Semaphore to prevent observer loops

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
        return null; // Should probably handle group chats separately or return null
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
            name: name || 'New Folder',
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
            refreshUI(); // Re-render headers
        }
    }

    function deleteFolder(folderId) {
        const settings = getSettings();
        const characterId = getCurrentCharacterId();
        if (!characterId) return;

        // Move chats to Uncategorized (conceptually, just remove from folder chat list)
        // They will automatically "fall out" into uncategorized on next render

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

            // Fast DOM update
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

    // ========== DOM ENGINE (The Core) ==========

    function refreshUI() {
        // Debounced or throttled if needed, but usually direct is fine for user actions
        organizeChats();
        injectAddButton();
    }

    /**
     * organizingChats: ensuring the DOM reflects the folder structure
     * 1. Ensure folder containers exist
     * 2. Find all chat blocks
     * 3. Move them into the correct folder container
     */
    function organizeChats() {
        if (isMoving) return;
        isMoving = true;

        try {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (!popup) return;

            // Find the container where ST puts chats
            // Usually it's a div with class .select_chat_block_wrapper or similar
            // We search for a known chat block to find its parent
            const sampleBlock = popup.querySelector('.select_chat_block');
            if (!sampleBlock) {
                // No chats? Maybe loading.
                // Or maybe we already moved them all.
                // Check if we have our own structure
                if (popup.querySelector('.tmc_root')) {
                    // We already built structure, let's re-verify contents
                } else {
                    return; // Can't start yet
                }
            }

            // Identify the Root Container
            let container;
            if (sampleBlock) {
                container = sampleBlock.parentElement;
            } else {
                container = popup.querySelector('.tmc_root')?.parentElement;
                if (!container) container = popup.querySelector('.select_chat_block_wrapper');
            }
            if (!container) return; // Should not happen

            // Ensure our Root Hub exists
            let root = container.querySelector('.tmc_root');
            if (!root) {
                root = document.createElement('div');
                root.className = 'tmc_root';
                // Prepend to be at the top
                container.prepend(root);
            }

            const characterId = getCurrentCharacterId();
            const settings = getSettings();
            const folderIds = (settings.characterFolders[characterId] || []);

            // 1. Build/Update Folder DOM Elements
            const folderElements = {}; // Map id -> element

            // Create "Uncategorized" first (will appear last via flex order or append order)
            // Actually, we want user-defined folders first.

            folderIds.forEach(fid => {
                const folder = settings.folders[fid];
                if (!folder) return;

                let fNode = root.querySelector(`.tmc_folder_row[data-id="${fid}"]`);
                if (!fNode) {
                    fNode = createFolderDOM(fid, folder);
                    root.appendChild(fNode);
                } else {
                    // Update header info (name/count)
                    updateFolderHeader(fNode, folder, fid);
                }
                folderElements[fid] = fNode.querySelector('.tmc_content');
            });

            // Uncategorized Folder
            let uncatNode = root.querySelector('.tmc_folder_row[data-id="uncategorized"]');
            if (!uncatNode) {
                uncatNode = createUncategorizedDOM();
                root.appendChild(uncatNode);
            }
            folderElements['uncategorized'] = uncatNode.querySelector('.tmc_content');


            // 2. Find ALL chat blocks (original ones)
            // They might be in the container root, OR already inside our folders
            // We need to gather them all and re-distribute
            const allBlocks = Array.from(container.querySelectorAll('.select_chat_block')); // This gets nested ones too

            allBlocks.forEach(block => {
                const fileName = block.getAttribute('file_name') || block.textContent.trim();
                if (!fileName) return;

                // Determine target folder
                const targetFid = getFolderForChat(fileName);
                const targetContent = folderElements[targetFid];

                // If block is NOT in the target content, move it
                if (block.parentElement !== targetContent) {
                    // Move it!
                    targetContent.appendChild(block);
                }

                // Attach Context Menu Listener (idempotent)
                if (!block.dataset.tmcInited) {
                    block.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showContextMenu(e, fileName);
                    });
                    block.dataset.tmcInited = 'true';
                }
            });

            // 3. Update Counts
            Object.keys(folderElements).forEach(fid => {
                const count = folderElements[fid].children.length;
                const row = folderElements[fid].closest('.tmc_folder_row');
                const countEl = row.querySelector('.tmc_count');
                if (countEl) countEl.textContent = count;

                // Hide Uncategorized if empty? maybe
                if (fid === 'uncategorized') {
                    row.style.display = count > 0 ? 'block' : 'none';
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
            <span class="tmc_toggle" data-id="${fid}">${folder.collapsed ? '▶' : '▼'}</span>
            <span class="tmc_icon">📁</span>
            <span class="tmc_name">${escapeHtml(folder.name)}</span>
            <span class="tmc_count">0</span>
            <div class="tmc_actions">
                <span class="tmc_btn tmc_edit">✏️</span>
                <span class="tmc_btn tmc_del">🗑️</span>
            </div>
        `;

        header.addEventListener('click', (e) => {
            if (!e.target.closest('.tmc_btn')) toggleCollapse(fid);
        });
        header.querySelector('.tmc_edit').addEventListener('click', (e) => {
            e.stopPropagation();
            const n = prompt('Rename:', folder.name);
            if (n) renameFolder(fid, n);
        });
        header.querySelector('.tmc_del').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete folder?')) deleteFolder(fid);
        });

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
            <span class="tmc_icon">📄</span>
            <span class="tmc_name">Uncategorized</span>
            <span class="tmc_count">0</span>
        `;
        // No collapse for uncat usually, or yes? Let's assume always visible or auto.

        const content = document.createElement('div');
        content.className = 'tmc_content';
        content.dataset.id = 'uncategorized';

        row.appendChild(header);
        row.appendChild(content);
        return row;
    }

    function updateFolderHeader(row, folder, fid) {
        row.querySelector('.tmc_name').textContent = folder.name;
        // Count updated later
    }

    function injectAddButton() {
        const popup = document.querySelector('#shadow_select_chat_popup');
        if (!popup) return;

        // Try different injection points
        const target = popup.querySelector('.shadow_select_chat_popup_header') ||
            popup.querySelector('h2') ||
            popup.querySelector('h3');

        if (target && !target.querySelector('.tmc_add_btn')) {
            const btn = document.createElement('span');
            btn.className = 'tmc_add_btn';
            btn.innerHTML = ' <span style="font-size:16px; cursor:pointer;" title="New Folder">📁+</span>';
            btn.onclick = (e) => { e.stopPropagation(); createFolder(prompt('Folder Name:')); };
            target.appendChild(btn);
        }
    }

    // ========== CONTEXT MENU ==========

    function showContextMenu(e, fileName) {
        document.querySelectorAll('.tmc_ctx').forEach(e => e.remove());

        const menu = document.createElement('div');
        menu.className = 'tmc_ctx';
        menu.style.top = e.pageY + 'px';
        menu.style.left = e.pageX + 'px';

        const settings = getSettings();
        const charId = getCurrentCharacterId();
        const folderIds = settings.characterFolders[charId] || [];

        let html = `<div class="tmc_ctx_head">Move "${fileName}"</div>`;
        folderIds.forEach(fid => {
            const f = settings.folders[fid];
            html += `<div class="tmc_ctx_item" data-fid="${fid}">📁 ${escapeHtml(f.name)}</div>`;
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
                if (name) {
                    createFolder(name);
                    // We can't move immediately because folder creation is async-ish (SaveSettings) 
                    // but createFolder calls refreshUI.
                    // We should wait conceptually, but for now let's just let user drag later or Select again
                    // Improve: Return ID from CreateFolder and move.
                    // But for now simplicity: User creates folder, then moves.
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
                // If nodes added to the WRAPPER (not our folders)
                if (m.target.classList.contains('select_chat_block_wrapper') || m.target.id === 'tmc_shadow_container') {
                    // Wait, we don't use tmc_shadow_container anymore.
                }

                if (m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1 && node.classList.contains('select_chat_block')) {
                            // A wild chat block appeared!
                            // Check if it's already in a folder. 
                            // If it's a direct child of wrapper, we must move it.
                            if (!node.closest('.tmc_content')) {
                                needsOrg = true;
                            }
                        }
                    }
                }
            }

            if (needsOrg) {
                organizeChats();
            }
        });

        // Watch the popup for any changes
        // We need to attach to body if popup is dynamic
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ========== INIT ==========

    function init() {
        console.log(`[${EXTENSION_NAME}] v1.4.0 Loading...`);
        const ctx = SillyTavern.getContext();

        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
            setTimeout(refreshUI, 100);
        });

        // Periodic check just in case (SillyTavern is chaotic)
        setInterval(() => {
            const popup = document.querySelector('#shadow_select_chat_popup');
            if (popup && popup.style.display !== 'none') {
                // If we see loose blocks, organize them
                const loose = popup.querySelectorAll('.select_chat_block_wrapper > .select_chat_block');
                if (loose.length > 0) organizeChats();
            }
        }, 2000);

        initObserver();
        // Initial run
        setTimeout(refreshUI, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
