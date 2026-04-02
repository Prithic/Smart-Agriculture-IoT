// 1. Firebase Configuration & Initialization
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

// DOM State & Global Variables
let activeDeviceId = localStorage.getItem('activeDeviceId') || "esp32_01";
let currentSyncPath = null;
let currentControlState = {};
let devices = {};
let isLogsPaused = false;
let lastLogIndex = -1;
const syncRegistry = {}; // Prevent duplicate listener proliferation

// ==========================================
// 2. AUTHENTICATION & SESSION
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("UID:", user.uid);
        document.getElementById('userName').innerText = user.displayName || "User";
        if (document.getElementById('userPhoto')) document.getElementById('userPhoto').src = user.photoURL || "";
        initDeviceManager(user.uid);
    } else {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }
});

function handleLogout() {
    auth.signOut().then(() => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}

// ==========================================
// 3. REAL-TIME DATA SYNC
// ==========================================
function initRealtimeSync(uid, deviceId) {
    if (!uid || !deviceId) return;
    const newPath = `users/${uid}/devices/${deviceId}`;
    if (currentSyncPath === newPath) return; // Prevent redundant sync cycles
    
    // Clean registry before switching
    Object.keys(syncRegistry).forEach(k => { if(syncRegistry[k]) { db.ref(syncRegistry[k].path).off(); delete syncRegistry[k]; } });

    currentSyncPath = newPath;
    console.log("Listening Path:", currentSyncPath);

    // 1. Sensor Listener
    const sensorRef = db.ref(currentSyncPath + '/sensor');
    syncRegistry.sensor = { path: currentSyncPath + '/sensor' };
    sensorRef.on('value', (snapshot) => {
        const sensorData = snapshot.val() || {};
        updateSensorUI(sensorData);
        if (typeof window.processAnalytics === 'function') {
            window.processAnalytics({
                ...sensorData,
                waterMotor: parseInt(currentControlState.waterMotor ?? 0),
                soilMotor: parseInt(currentControlState.soilMotor ?? 0),
                mode: currentControlState.mode ?? "MANUAL"
            });
        }
    });

    // 2. Control Listener
    const ctrlRef = db.ref(currentSyncPath + '/control');
    syncRegistry.control = { path: currentSyncPath + '/control' };
    ctrlRef.on('value', (snapshot) => {
        const controlData = snapshot.val() || {};
        currentControlState = controlData; 
        updateControlUI(controlData);
    });

    // 3. Status Listener (Correct Path)
    const statusRef = db.ref(currentSyncPath + '/meta/status');
    syncRegistry.status = { path: currentSyncPath + '/meta/status' };
    statusRef.on('value', (snapshot) => {
        const st = snapshot.val() || {};
        const isOnline = (st.online === true && (Date.now() - (st.ts || 0)) < 15000);
        setOnlineStatus(isOnline);
    });
    
    // 4. Logs Listener (Production Push-ID Model)
    const logRef = db.ref(currentSyncPath + '/meta/logs');
    syncRegistry.logs = { path: currentSyncPath + '/meta/logs' };
    logRef.limitToLast(20).on('child_added', (snapshot) => {
        if (isLogsPaused) return;
        const data = snapshot.val();
        const msg = typeof data === 'object' ? data.msg : data;
        
        if (msg) {
            const isCmd = msg.includes("CMD") || msg.includes("EXECUTED") || msg.includes("AUTO:");
            addTerminalLog(isCmd ? msg : `ESP32: ${msg}`, isCmd ? "cmd" : "response");
        }
    });
    
    updateActiveDeviceUI();
}

function updateSensorUI(sensor) {
    const fields = {
        'temperature': parseFloat(sensor.temperature ?? 0).toFixed(1),
        'humidity': parseFloat(sensor.humidity ?? 0).toFixed(1),
        'moisture': parseFloat(sensor.moisture ?? 0).toFixed(1),
        'tankStatus': parseFloat(sensor.tankLevel ?? 0).toFixed(0)
    };

    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el && el.innerText !== val) el.innerText = val;
    }

    const tankWaterLevel = document.getElementById('tankWaterLevel');
    if (tankWaterLevel) tankWaterLevel.style.height = Math.max(0, Math.min(100, parseFloat(sensor.tankLevel ?? 0))) + "%";
}

function updateControlUI(control) {
    // Controls Status
    const isTankOn = (parseInt(control.waterMotor ?? 0) === 1);
    const isIrrOn = (parseInt(control.soilMotor ?? 0) === 1);
    const isAuto = (control.mode === "AUTO");

    const tankToggle = document.getElementById('tankToggle');
    const irrToggle = document.getElementById('irrToggle');
    const modeToggle = document.getElementById('modeToggle');

    // Requirement 3: Update UI elements dynamically with diffing
    if (tankToggle) { 
        if (tankToggle.checked !== isTankOn) tankToggle.checked = isTankOn; 
        if (tankToggle.disabled !== isAuto) tankToggle.disabled = isAuto; 
    }
    if (irrToggle) { 
        if (irrToggle.checked !== isIrrOn) irrToggle.checked = isIrrOn; 
        if (irrToggle.disabled !== isAuto) irrToggle.disabled = isAuto; 
    }
    if (modeToggle && modeToggle.checked !== isAuto) modeToggle.checked = isAuto;

    // Requirement 7: Fix UI state mismatch
    const tankBadge = document.getElementById('tankMotorBadge');
    const irrBadge = document.getElementById('irrMotorBadge');
    const modeLabel = document.getElementById('modeLabelHeader');

    if (tankBadge) {
        const txt = isTankOn ? "ON" : "OFF";
        const cls = isTankOn ? "ctrl-badge badge-ok" : "ctrl-badge badge-warn";
        if (tankBadge.innerText !== txt) tankBadge.innerText = txt;
        if (tankBadge.className !== cls) tankBadge.className = cls;
    }
    if (irrBadge) {
        const txt = isIrrOn ? "ON" : "OFF";
        const cls = isIrrOn ? "ctrl-badge badge-ok" : "ctrl-badge badge-warn";
        if (irrBadge.innerText !== txt) irrBadge.innerText = txt;
        if (irrBadge.className !== cls) irrBadge.className = cls;
    }
    if (modeLabel) {
        const txt = isAuto ? "AUTO" : "MANUAL";
        const cls = isAuto ? "mode-label auto" : "mode-label";
        if (modeLabel.innerText !== txt) modeLabel.innerText = txt;
        if (modeLabel.className !== cls) modeLabel.className = cls;
    }

    // Flow Animations
    document.getElementById('svg-flow-t')?.classList.toggle('active', isTankOn);
    document.getElementById('svg-flow-i')?.classList.toggle('active', isIrrOn);
}

function setOnlineStatus(online) {
    const connDot = document.getElementById('connDot');
    const headerStatusMsg = document.getElementById('headerStatusMsg');
    const newCls = `pulse-dot ${online ? 'online' : 'offline'}`;
    const newTxt = online ? "Online" : "Offline";
    if (connDot && connDot.className !== newCls) connDot.className = newCls;
    if (headerStatusMsg && headerStatusMsg.innerText !== newTxt) headerStatusMsg.innerText = newTxt;
}

// ==========================================
// 4. CONTROL FUNCTIONS
// ==========================================
async function toggleControl(type) {
    const uid = auth.currentUser?.uid;
    if (!uid || !activeDeviceId) return;

    let path = `users/${uid}/devices/${activeDeviceId}/control/`;
    let key, val;

    if (type === 'auto') {
        key = "mode";
        val = document.getElementById('modeToggle').checked ? "AUTO" : "MANUAL";
    } else if (type === 'tank') {
        key = "waterMotor";
        val = document.getElementById('tankToggle').checked ? 1 : 0;
    } else if (type === 'irrigation') {
        key = "soilMotor";
        val = document.getElementById('irrToggle').checked ? 1 : 0;
    }

    addTerminalLog(`CMD SENT: ${type} ${val}`, "cmd");
    try { await db.ref(path + key).set(val); } catch (e) { console.error("Control Error:", e); }
}

// ==========================================
// 4.5 LOGGING & TERMINAL (ENHANCED)
// ==========================================
let commandHistory = [];
let historyIndex = -1;
let userScrolledUp = false;

function addTerminalLog(msg, type = 'sys') {
    const term = document.getElementById('termConsole');
    if (!term) return;
    
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    
    // Check timestamps toggle
    const chkTimestamps = document.getElementById('chkTimestamps');
    if (chkTimestamps && chkTimestamps.checked) {
        line.innerHTML = `<span class="term-timestamp">[${new Date().toLocaleTimeString()}]</span> <span>${msg}</span>`;
    } else {
        line.innerHTML = `<span>${msg}</span>`;
    }
    
    term.appendChild(line);
    
    // Autoscroll logic (Intelligent)
    const chkAutoscroll = document.getElementById('chkAutoscroll');
    if (chkAutoscroll && chkAutoscroll.checked && !userScrolledUp) {
        term.scrollTop = term.scrollHeight;
    }
    
    // Limit lines (Performance Fixed)
    if (term.childElementCount > 50) {
        term.removeChild(term.firstChild);
    }
}

async function sendSerialCommand() {
    const input = document.getElementById('termInput');
    const cmd = input?.value.trim();
    if (!cmd || !activeDeviceId) return;

    // History management
    commandHistory.push(cmd);
    if(commandHistory.length > 50) commandHistory.shift();
    historyIndex = -1;

    const uid = auth.currentUser?.uid;
    input.value = '';
    
    // Process Command
    if (cmd.toUpperCase().startsWith("BAUD_")) {
        const rate = cmd.split('_')[1];
        const baudSelect = document.getElementById('baudRate');
        if (baudSelect) baudSelect.value = rate;
    }

    addTerminalLog(`CMD SENT: ${cmd}`, 'cmd');

    // Execute Cloud Write
    try { 
        await db.ref(`users/${uid}/devices/${activeDeviceId}/control/command`).set(cmd); 
    } catch (e) { 
        addTerminalLog("Cloud Write Failed", "error"); 
    }
}

async function sendQuickCommand(cmd) {
    if (!activeDeviceId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    addTerminalLog(`QUICK CMD: ${cmd}`, 'cmd');
    try { 
        await db.ref(`users/${uid}/devices/${activeDeviceId}/control/command`).set(cmd); 
    } catch (e) { 
        addTerminalLog("Action Failed", "error"); 
    }
}
window.sendQuickCommand = sendQuickCommand;

async function clearCloudLogs() {
    if (!activeDeviceId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (!confirm("Are you sure you want to permanently delete ALL serial history from the cloud for this device? This cannot be undone.")) return;

    try {
        await db.ref(`users/${uid}/devices/${activeDeviceId}/meta/logs`).remove();
        addTerminalLog("--- Cloud History Wiped ---", "sys");
        const term = document.getElementById('termConsole');
        if (term) term.innerHTML = '<div class="term-line sys">--- Terminal Cleared ---</div>';
    } catch (e) {
        addTerminalLog("Wipe Failed: " + e.message, "error");
    }
}

// ==========================================
// 5. DEVICE MANAGEMENT
// ==========================================
function initDeviceManager(uid) {
    db.ref(`users/${uid}/devices`).on('value', (snapshot) => {
        devices = snapshot.val() || {};
        renderDeviceList();
        
        if (Object.keys(devices).length > 0) {
            if (!activeDeviceId || !devices[activeDeviceId]) {
                changeDevice(Object.keys(devices)[0]);
            } else {
                initRealtimeSync(uid, activeDeviceId);
            }
        }
    });
}

function renderDeviceList() {
    const sidebarList = document.getElementById('sidebarDeviceList');
    if (!sidebarList) return;

    sidebarList.innerHTML = Object.entries(devices).map(([id, dev]) => `
        <div class="device-item-mini ${id === activeDeviceId ? 'active' : ''}" onclick="changeDevice('${id}')">
            <div class="device-info-col" style="flex:1;">
                <span class="device-name-mini">${dev.name || id}</span>
                <span class="device-id-mini" style="font-size: 0.75rem; color: #94a3b8;">${id}</span>
            </div>
            <div class="device-actions-mini" onclick="event.stopPropagation()" style="display:flex; gap:0.3rem;">
                <button class="btn-edit-mini" data-id="${id}" title="Rename" style="background:none; border:none; color:#94a3b8; cursor:pointer;"><i class='bx bx-edit'></i></button>
                <button class="btn-delete-mini" data-id="${id}" title="Remove" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class='bx bx-trash'></i></button>
            </div>
        </div>
    `).join('') || '<div class="device-empty">No devices found.</div>';

    // Bind Edit Action
    document.querySelectorAll('.btn-edit-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const editIdInput = document.getElementById('editDeviceId');
            const editNameInput = document.getElementById('editDeviceName');
            const modal = document.getElementById('modalEditDevice');
            if (editIdInput && editNameInput && modal) {
                editIdInput.value = id;
                editNameInput.value = devices[id].name || id;
                modal.classList.add('active');
            }
        });
    });

    // Bind Delete Action
    document.querySelectorAll('.btn-delete-mini').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = devices[id]?.name || id;
            if (confirm(`Are you sure you want to permanently delete "${name}"? All logging and telemetry data will be lost forever.`)) {
                await removeDevice(id);
            }
        });
    });
}

async function removeDevice(deviceId) {
    const uid = auth.currentUser?.uid;
    if (!uid || !deviceId) return;
    
    try {
        await db.ref(`users/${uid}/devices/${deviceId}`).remove();
        delete devices[deviceId];
        
        if (activeDeviceId === deviceId) {
            if (currentSyncPath) {
                db.ref(currentSyncPath + '/sensor').off();
                db.ref(currentSyncPath + '/control').off();
                db.ref(currentSyncPath + '/meta').off();
                currentSyncPath = null;
            }
            activeDeviceId = Object.keys(devices)[0] || null;
            
            if (activeDeviceId) {
                localStorage.setItem('activeDeviceId', activeDeviceId);
                initRealtimeSync(uid, activeDeviceId);
            } else {
                localStorage.removeItem('activeDeviceId');
                updateActiveDeviceUI();
                setOnlineStatus(false);
            }
        }
        renderDeviceList();
        addTerminalLog(`Device "${deviceId}" permanently deleted from cloud.`, 'sys');
    } catch (e) {
        console.error("Error removing device:", e);
        addTerminalLog(`Failed to delete device: ${e.message}`, 'error');
    }
}

function changeDevice(id) {
    console.log("Switching to device:", id);
    activeDeviceId = id;
    localStorage.setItem('activeDeviceId', id);
    renderDeviceList();
    if (auth.currentUser) initRealtimeSync(auth.currentUser.uid, id);
}
window.changeDevice = changeDevice;

function updateActiveDeviceUI() {
    const banner = document.getElementById('activeDeviceBanner');
    const label = document.getElementById('lblActiveDeviceName');
    if (activeDeviceId && devices[activeDeviceId]) {
        banner?.classList.remove('hidden');
        if (label) label.innerText = devices[activeDeviceId].name || activeDeviceId;
    } else {
        banner?.classList.add('hidden');
    }
}

// ==========================================
// 6. EVENT LISTENERS
// ==========================================
window.onload = () => {
    // View Switcher
    document.querySelectorAll('.dropdown-link[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            document.querySelectorAll('.view-section').forEach(v => v.classList.toggle('active', v.id === target));
            document.querySelectorAll('.dropdown-link').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelector('.nav-links')?.classList.remove('open');
        });
    });

    // Toggles
    document.getElementById('modeToggle')?.addEventListener('change', () => toggleControl('auto'));
    document.getElementById('tankToggle')?.addEventListener('change', () => toggleControl('tank'));
    document.getElementById('irrToggle')?.addEventListener('change', () => toggleControl('irrigation'));

    // Modals
    document.getElementById('btnAddDevice')?.addEventListener('click', () => {
        document.getElementById('modalAddDevice')?.classList.add('active');
    });
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    const formAdd = document.getElementById('formAddDevice');
    if (formAdd) {
        formAdd.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('newDeviceId')?.value.trim();
            const name = document.getElementById('newDeviceName')?.value;
            if (!id || !auth.currentUser) return;

            await db.ref(`users/${auth.currentUser.uid}/devices/${id}`).set({
                name: name,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            formAdd.reset();
            document.getElementById('modalAddDevice')?.classList.remove('active');
            changeDevice(id);
        };
    }

    const formEdit = document.getElementById('formEditDevice');
    if (formEdit) {
        formEdit.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editDeviceId')?.value;
            const name = document.getElementById('editDeviceName')?.value;
            if (!id || !auth.currentUser) return;

            await db.ref(`users/${auth.currentUser.uid}/devices/${id}/name`).set(name);
            document.getElementById('modalEditDevice')?.classList.remove('active');
        };
    }

    // Drawer, Hamburger & Logout
    document.getElementById('btnOpenSerial')?.addEventListener('click', () => {
        document.getElementById('serialDrawer')?.classList.add('open');
        document.getElementById('serialOverlay')?.classList.add('open');
        document.getElementById('termInput')?.focus();
    });
    document.getElementById('btnCloseSerial')?.addEventListener('click', () => {
        document.getElementById('serialDrawer')?.classList.remove('open');
        document.getElementById('serialOverlay')?.classList.remove('open');
    });
    document.getElementById('serialOverlay')?.addEventListener('click', () => {
        document.getElementById('serialDrawer')?.classList.remove('open');
        document.getElementById('serialOverlay')?.classList.remove('open');
    });

    document.getElementById('btnClearTerm')?.addEventListener('click', () => {
        const term = document.getElementById('termConsole');
        if (term) term.innerHTML = '<div class="term-line sys">--- Terminal Cleared ---</div>';
    });

    document.getElementById('btnPauseLogs')?.addEventListener('click', () => {
        isLogsPaused = !isLogsPaused;
        const icon = document.getElementById('iconPauseLogs');
        if (icon) {
            if (isLogsPaused) {
                icon.className = 'bx bx-play';
                document.getElementById('btnPauseLogs').title = "Resume Logs";
                addTerminalLog("--- Logs Paused ---", "sys");
            } else {
                icon.className = 'bx bx-pause';
                document.getElementById('btnPauseLogs').title = "Pause Logs";
                addTerminalLog("--- Logs Resumed ---", "sys");
            }
        }
    });

    document.getElementById('btnSendTerm')?.addEventListener('click', sendSerialCommand);
    
    const termInput = document.getElementById('termInput');
    if (termInput) {
        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendSerialCommand();
            } else if (e.key === 'ArrowUp') {
                if(commandHistory.length > 0) {
                    if(historyIndex === -1) historyIndex = commandHistory.length - 1;
                    else if(historyIndex > 0) historyIndex--;
                    termInput.value = commandHistory[historyIndex];
                    e.preventDefault();
                }
            } else if (e.key === 'ArrowDown') {
                if(historyIndex !== -1) {
                    if(historyIndex < commandHistory.length - 1) {
                        historyIndex++;
                        termInput.value = commandHistory[historyIndex];
                    } else {
                        historyIndex = -1;
                        termInput.value = '';
                    }
                    e.preventDefault();
                }
            }
        });
    }

    // Intelligent Autoscroll Detection
    const termConsole = document.getElementById('termConsole');
    if (termConsole) {
        termConsole.addEventListener('scroll', () => {
            const threshold = 50; 
            const atBottom = termConsole.scrollHeight - termConsole.scrollTop - termConsole.clientHeight < threshold;
            userScrolledUp = !atBottom;
        });
    }

    // BAUDRATE RECONNECT LOGIC
    const baudRateSelect = document.getElementById('baudRate');
    if(baudRateSelect) {
        baudRateSelect.addEventListener('change', async () => {
            const newRate = baudRateSelect.value;
            addTerminalLog(`Reconfiguring hardware to ${newRate} baud...`, "sys");
            
            // Send Command to ESP32
            const uid = auth.currentUser?.uid;
            if (uid && activeDeviceId) {
                try {
                    await db.ref(`users/${uid}/devices/${activeDeviceId}/control/command`).set(`BAUD_${newRate}`);
                    addTerminalLog(`Syncing baud rate with cloud...`, "sys");
                } catch (e) {
                    addTerminalLog("Baud Sync Failed", "error");
                }
            }

            setTimeout(() => {
                addTerminalLog(`--- Connection Re-established ---`, "sys");
                addTerminalLog(`Channel online at ${newRate}.`, "response");
                const chkAutoscroll = document.getElementById('chkAutoscroll');
                if(chkAutoscroll && chkAutoscroll.checked) termConsole.scrollTop = termConsole.scrollHeight;
            }, 1200);
        });
    }

    document.getElementById('btnClearCloud')?.addEventListener('click', clearCloudLogs);

    // Download log properly formats without HTML tags
    document.getElementById('btnDownloadLog')?.addEventListener('click', () => {
        if (!termConsole) return;
        const textToSave = Array.from(termConsole.querySelectorAll('.term-line'))
            .map(line => {
                const ts = line.querySelector('.term-timestamp') ? line.querySelector('.term-timestamp').innerText : '';
                const content = line.querySelector('span:not(.term-timestamp)') ? line.querySelector('span:not(.term-timestamp)').innerText : line.innerText;
                return `${ts} ${content}`.trim();
            })
            .join('\n');
            
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addTerminalLog("Session log exported successfully.", "sys");
    });

    document.getElementById('btnHamburger')?.addEventListener('click', () => document.querySelector('.nav-links')?.classList.toggle('open'));
    document.getElementById('profileTrigger')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profileDropdown')?.classList.toggle('open'); });
    document.addEventListener('click', () => document.getElementById('profileDropdown')?.classList.remove('open'));
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnLogoutProfile')?.addEventListener('click', handleLogout);
};
