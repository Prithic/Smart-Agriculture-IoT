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
    
    if (currentSyncPath) {
        db.ref(currentSyncPath + '/sensor').off();
        db.ref(currentSyncPath + '/control').off();
        db.ref(currentSyncPath + '/meta').off();
    }

    currentSyncPath = `users/${uid}/devices/${deviceId}`;
    console.log("Listening Path:", currentSyncPath);

    // 1. Sensor Listener
    db.ref(currentSyncPath + '/sensor').on('value', (snapshot) => {
        const sensorData = snapshot.val() || {};
        console.log("Firebase Data:", sensorData);
        if (sensorData) {
            updateSensorUI(sensorData);
            if (typeof window.processAnalytics === 'function') {
                window.processAnalytics({
                    ...sensorData,
                    waterMotor: parseInt(currentControlState.waterMotor ?? 0),
                    soilMotor: parseInt(currentControlState.soilMotor ?? 0),
                    mode: currentControlState.mode ?? "MANUAL"
                });
            }
        }
    });

    // 2. Control Listener (Requirement 1 & 2)
    db.ref(currentSyncPath + '/control').on('value', (snapshot) => {
        const controlData = snapshot.val() || {};
        currentControlState = controlData; 
        console.log("Control Data:", controlData); // Requirement 5
        updateControlUI(controlData); // Requirement 3 & 7
    });

    // 3. Meta (Heartbeat) Listener
    db.ref(currentSyncPath + '/meta').on('value', (snapshot) => {
        const metaData = snapshot.val() || {};
        const isOnline = (Date.now() - (metaData.lastActive || 0)) < 10000;
        setOnlineStatus(isOnline);
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
        if (el) el.innerText = val;
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

    // Requirement 3: Update UI elements dynamically
    if (tankToggle) { tankToggle.checked = isTankOn; tankToggle.disabled = isAuto; }
    if (irrToggle) { irrToggle.checked = isIrrOn; irrToggle.disabled = isAuto; }
    if (modeToggle) modeToggle.checked = isAuto;

    // Requirement 7: Fix UI state mismatch
    const tankBadge = document.getElementById('tankMotorBadge');
    const irrBadge = document.getElementById('irrMotorBadge');
    const modeLabel = document.getElementById('modeLabelHeader');

    if (tankBadge) {
        tankBadge.innerText = isTankOn ? "ON" : "OFF";
        tankBadge.className = isTankOn ? "ctrl-badge badge-ok" : "ctrl-badge badge-warn";
    }
    if (irrBadge) {
        irrBadge.innerText = isIrrOn ? "ON" : "OFF";
        irrBadge.className = isIrrOn ? "ctrl-badge badge-ok" : "ctrl-badge badge-warn";
    }
    if (modeLabel) {
        modeLabel.innerText = isAuto ? "AUTO" : "MANUAL";
        modeLabel.className = isAuto ? "mode-label auto" : "mode-label";
    }

    // Flow Animations
    document.getElementById('svg-flow-t')?.classList.toggle('active', isTankOn);
    document.getElementById('svg-flow-i')?.classList.toggle('active', isIrrOn);
}

function setOnlineStatus(online) {
    const connDot = document.getElementById('connDot');
    const headerStatusMsg = document.getElementById('headerStatusMsg');
    if (connDot) connDot.className = `pulse-dot ${online ? 'online' : 'offline'}`;
    if (headerStatusMsg) headerStatusMsg.innerText = online ? "Online" : "Offline";
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
    
    // Limit lines
    if (term.childElementCount > 200) {
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
    addTerminalLog(cmd, 'cmd');

    // Execute Cloud Write
    try { 
        await db.ref(`users/${uid}/devices/${activeDeviceId}/control/command`).set(cmd); 
        
        // Local Simulation Response (Since ESP32 doesn't send logs back)
        setTimeout(() => {
            const rawCmd = cmd.toLowerCase();
            if (rawCmd === 'help') {
                addTerminalLog("Available: STATUS, AUTO, MANUAL", "sys");
            } else if (rawCmd === 'auto') {
                addTerminalLog("Switching to AUTO mode...", "response");
            } else if (rawCmd === 'manual') {
                addTerminalLog("Switching to MANUAL mode...", "response");
            } else if (rawCmd === 'status') {
                addTerminalLog("Fetching status...", "sys");
            } else {
                addTerminalLog(`Command '${cmd}' sent to device.`, "response");
            }
        }, 300);
        
    } catch (e) { 
        addTerminalLog("Cloud Write Failed", "error"); 
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
            <span class="device-name-mini">${dev.name || id}</span>
            <span class="device-id-mini">${id}</span>
        </div>
    `).join('') || '<div class="device-empty">No devices found.</div>';
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

    // Ping / Baud Rate Simulation
    let heartbeatInterval;
    function startPing(speed) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            const drawer = document.getElementById('serialDrawer');
            if(drawer && drawer.classList.contains('open')) {
                addTerminalLog("Pinging edge device...", "sys");
            }
        }, speed);
    }

    const baudRateSelect = document.getElementById('baudRate');
    if(baudRateSelect) {
        startPing(baudRateSelect.value === "115200" ? 10000 : 20000);
        baudRateSelect.addEventListener('change', () => {
            const newRate = baudRateSelect.value;
            addTerminalLog(`Reconnecting at ${newRate} baud...`, "sys");
            setTimeout(() => {
                termConsole.innerHTML += '<div class="term-line sys-msg">--- Connection Re-established ---</div>';
                addTerminalLog(`Device online at ${newRate}.`, "response");
                startPing(newRate === "115200" ? 10000 : 20000);
                const chkAutoscroll = document.getElementById('chkAutoscroll');
                if(chkAutoscroll && chkAutoscroll.checked) termConsole.scrollTop = termConsole.scrollHeight;
            }, 800);
        });
    }

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
