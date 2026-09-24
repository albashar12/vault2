let autoSyncInterval = null;
let lastRenderedHash = "";

const DEFAULT_USER = "admin";
const DEFAULT_PASS = "1234";

window.onload = function() {
    if (!localStorage.getItem('vault_user')) {
        localStorage.setItem('vault_user', DEFAULT_USER);
    }
    if (!localStorage.getItem('vault_pass')) {
        localStorage.setItem('vault_pass', DEFAULT_PASS);
    }

    setupDragAndDrop();
};

function handleFileSelect(input) {
    const fileDisplay = document.getElementById('fileNameDisplay');
    if (input.files && input.files[0]) {
        fileDisplay.innerText = "📁 Selected: " + input.files[0].name;
        fileDisplay.style.display = "block";
    } else {
        fileDisplay.style.display = "none";
    }
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        handleFileSelect(fileInput);
    }, false);
}

function loginUser() {
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value.trim();

    const savedUser = localStorage.getItem('vault_user');
    const savedPass = localStorage.getItem('vault_pass');

    if (u === savedUser && p === savedPass) {
        document.getElementById('lockScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';

        document.getElementById('botTokenInput').value = localStorage.getItem('tg_bot_token') || '';
        document.getElementById('chatIdInput').value = localStorage.getItem('tg_chat_id') || '';

        loadFromTelegram();

        if (!autoSyncInterval) {
            autoSyncInterval = setInterval(loadFromTelegram, 5000);
        }
    } else {
        alert('Incorrect username or password!');
    }
}

function togglePanel(panelId) {
    const p = document.getElementById(panelId);
    const isVisible = p.style.display === 'block';

    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('accountPanel').style.display = 'none';

    if (!isVisible) {
        p.style.display = 'block';
    }
}

function saveBotConfig() {
    const token = document.getElementById('botTokenInput').value.trim();
    const chatId = document.getElementById('chatIdInput').value.trim();

    if (!token || !chatId) {
        alert('Please fill in both Bot Token and Chat ID!');
        return;
    }

    localStorage.setItem('tg_bot_token', token);
    localStorage.setItem('tg_chat_id', chatId);

    alert('Bot configuration saved successfully!');
    togglePanel('settingsPanel');
    loadFromTelegram();
}

function updateCredentials() {
    const currPass = document.getElementById('currPassInput').value.trim();
    const newUser = document.getElementById('newUserInput').value.trim();
    const newPass = document.getElementById('newPassInput').value.trim();

    const savedPass = localStorage.getItem('vault_pass');

    if (currPass !== savedPass) {
        alert('Incorrect current password entered!');
        return;
    }

    if (!newUser || !newPass) {
        alert('Please fill in both the new username and new password!');
        return;
    }

    localStorage.setItem('vault_user', newUser);
    localStorage.setItem('vault_pass', newPass);

    alert('Username and password updated successfully! Please log in again with your new credentials.');
    logout();
}

function logout() {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    location.reload();
}

async function saveToTelegram() {
    const token = localStorage.getItem('tg_bot_token');
    const chatId = localStorage.getItem('tg_chat_id');

    if (!token || !chatId) {
        alert('Please click "⚙️ BOT CONFIG" first to set your Bot Token and Chat ID!');
        togglePanel('settingsPanel');
        return;
    }

    const content = document.getElementById('vaultContent').value.trim();
    const fileInput = document.getElementById('fileInput');

    if (!content && fileInput.files.length === 0) {
        alert('Please type something or select a file!');
        return;
    }

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', `[VAULT_FILE] ${content}`);
        
        let method = 'sendDocument';
        let paramName = 'document';

        if (file.type.startsWith('image/')) {
            method = 'sendPhoto';
            paramName = 'photo';
        } else if (file.type.startsWith('video/')) {
            method = 'sendVideo';
            paramName = 'video';
        }

        formData.append(paramName, file);

        try {
            let res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
                method: 'POST',
                body: formData
            });
            let result = await res.json();
            if (result.ok) {
                document.getElementById('vaultContent').value = '';
                fileInput.value = '';
                document.getElementById('fileNameDisplay').style.display = 'none';
                loadFromTelegram();
            } else {
                alert('Error: ' + result.description);
            }
        } catch (err) {
            alert('Network error: ' + err.message);
        }
    } else {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = {
            chat_id: chatId,
            text: `[VAULT_DATA]\n${content}`
        };

        try {
            let res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let result = await res.json();
            if (result.ok) {
                document.getElementById('vaultContent').value = '';
                loadFromTelegram();
            } else {
                alert('Error: ' + result.description);
            }
        } catch (err) {
            alert('Network error: ' + err.message);
        }
    }
}

async function loadFromTelegram() {
    const token = localStorage.getItem('tg_bot_token');
    const listDiv = document.getElementById('vaultList');
    const syncBadge = document.getElementById('syncStatus');

    if (!token) {
        listDiv.innerHTML = '<div style="color: #94a3b8; text-align: center;">Bot configuration is not set. Click "⚙️ BOT CONFIG" to configure.</div>';
        syncBadge.innerText = "NOT CONFIGURED";
        return;
    }

    try {
        syncBadge.innerText = "SYNCING...";
        let res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        let data = await res.json();

        if (!data.ok) {
            syncBadge.innerText = "ERROR";
            return;
        }

        syncBadge.innerText = "AUTO SYNC ACTIVE";

        let messages = data.result.map(u => u.message || u.channel_post).filter(m => m);
        let vaultMessages = messages.filter(m => (m.text && m.text.includes('[VAULT_DATA]')) || (m.caption && m.caption.includes('[VAULT_FILE]')));

        if (vaultMessages.length === 0) {
            listDiv.innerHTML = 'No data found.';
            return;
        }

        let currentHash = JSON.stringify(vaultMessages.map(m => m.message_id));
        if (currentHash === lastRenderedHash) {
            return; 
        }
        lastRenderedHash = currentHash;

        listDiv.innerHTML = '';
        for (let msg of vaultMessages.reverse()) {
            let date = new Date(msg.date * 1000).toLocaleString();
            let item = document.createElement('div');
            item.className = 'vault-item';
            
            let textContent = '';
            if (msg.text) {
                textContent = msg.text.replace('[VAULT_DATA]', '').trim();
            } else if (msg.caption) {
                textContent = msg.caption.replace('[VAULT_FILE]', '').trim();
            }

            let htmlContent = `<div class="meta">${date}</div><div>${escapeHtml(textContent)}</div>`;

            if (msg.photo && msg.photo.length > 0) {
                let photoObj = msg.photo[msg.photo.length - 1];
                let fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${photoObj.file_id}`);
                let fileData = await fileRes.json();
                if (fileData.ok) {
                    let fileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
                    htmlContent += `<img src="${fileUrl}" class="media-player" alt="Vault Image">`;
                }
            } 
            else if (msg.video) {
                let fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${msg.video.file_id}`);
                let fileData = await fileRes.json();
                if (fileData.ok) {
                    let fileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
                    htmlContent += `<video src="${fileUrl}" controls class="media-player"></video>`;
                }
            }

            item.innerHTML = htmlContent;
            listDiv.appendChild(item);
        }

    } catch (err) {
        syncBadge.innerText = "DISCONNECTED";
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
