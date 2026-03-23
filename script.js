// ==========================================
// 1. CONFIGURATION
// ==========================================
const ESP32_IP = "10.187.109.98"; 
const BASE_URL = `http://${ESP32_IP}`;
const TANK_SAFETY_THRESHOLD = 5; // %

// ==========================================
// 2. DOM ELEMENTS
// ==========================================

// Header
const connDot = document.getElementById('connDot');
const headerStatusMsg = document.getElementById('headerStatusMsg');
const modeToggle = document.getElementById('modeToggle');
const modeLabelHeader = document.getElementById('modeLabelHeader');

// Map Flow Elements
const pathWellTank = document.getElementById('svg-flow-t');
const pathTankField = document.getElementById('svg-flow-i');

// Terminal & Drawer Elements
const btnOpenSerial = document.getElementById('btnOpenSerial');
const btnCloseSerial = document.getElementById('btnCloseSerial');
const serialDrawer = document.getElementById('serialDrawer');
const serialOverlay = document.getElementById('serialOverlay');
const termConsole = document.getElementById('termConsole');
const termInput = document.getElementById('termInput');
const btnSendTerm = document.getElementById('btnSendTerm');
const btnClearTerm = document.getElementById('btnClearTerm');
const btnDownloadLog = document.getElementById('btnDownloadLog');
const chkAutoscroll = document.getElementById('chkAutoscroll');
const chkTimestamps = document.getElementById('chkTimestamps');
const baudRateSelect = document.getElementById('baudRate');
const serialNotif = document.getElementById('serialNotif');

const nodeWellIcon = document.querySelector('#node-well .node-icon');
const nodeTankIcon = document.getElementById('tankVisual');
const nodeFieldIcon = document.querySelector('#node-field .node-icon');

const nodeTankStatusHeader = document.getElementById('node-tank-status');
const nodeFieldStatusHeader = document.getElementById('node-field-status');
const tankWaterLevel = document.getElementById('tankWaterLevel');

// Telemetry Fields (Updated IDs)
const temperatureEl = document.getElementById('temperature');
const humidityEl = document.getElementById('humidity');
const moistureEl = document.getElementById('moisture');
const tankStatusEl = document.getElementById('tankStatus');

// Controls
const tankToggle = document.getElementById('tankToggle');
const tankMotorBadge = document.getElementById('tankMotorBadge');
const tankControlItem = tankToggle.closest('.control-item');

const irrToggle = document.getElementById('irrToggle');
const irrMotorBadge = document.getElementById('irrMotorBadge');
const irrControlItem = irrToggle.closest('.control-item');

// Diagnostics Section
const diagMode = document.getElementById('diagMode');
const diagTank = document.getElementById('diagTank');
const diagIrr = document.getElementById('diagIrr');
const diagAlerts = document.getElementById('diagAlerts');

// Footer
const footConn = document.getElementById('footConn');
const footTime = document.getElementById('footTime');
const loadingSpinner = document.getElementById('loadingSpinner');

let isUpdating = false;
let userScrolledUp = false;

// ==========================================
// 3. FETCH DATA (REAL API)
// ==========================================
async function fetchData() {
    loadingSpinner.classList.add('active');
    try {
        const response = await fetch(`${BASE_URL}/data`);
        if (!response.ok) throw new Error("Offline");
        
        const data = await response.json();
        setOnlineStatus(true);
        updateUI(data);

        // Process incoming logs from ESP32
        if (data.logs && data.logs.trim() !== "") {
            const lines = data.logs.trim().split('\n');
            lines.forEach(line => addLog(line, 'response'));
        }

        // Notify analytics engine
        if (typeof window.processAnalytics === 'function') {
            window.processAnalytics(data);
        }
    } catch (error) {
        console.warn("Retrying... ESP32 Link Down:", error.message);
        setOnlineStatus(false);
    } finally {
        setTimeout(() => loadingSpinner.classList.remove('active'), 500);
    }
}

// ==========================================
// 4. UI UPDATER (REAL DATA)
// ==========================================
function updateUI(data) {
    isUpdating = true;

    // 1. Update Core Telemetry
    if (temperatureEl) temperatureEl.innerText = parseFloat(data.temperature).toFixed(1);
    if (humidityEl) humidityEl.innerText = parseFloat(data.humidity).toFixed(1);
    if (moistureEl) moistureEl.innerText = parseFloat(data.moisture).toFixed(1);
    
    // Schema Map: tankLevel instead of tankStatus
    const tank = parseFloat(data.tankLevel || data.tankStatus || 0);
    if (tankStatusEl) tankStatusEl.innerText = tank.toFixed(0);

    const temp = parseFloat(data.temperature);
    temp > 35 ? temperatureEl.classList.add('alert-text') : temperatureEl.classList.remove('alert-text');

    const moist = parseFloat(data.moisture);
    
    // Set Tank Level Visual
    if (tankWaterLevel) {
        let validTank = Math.max(0, Math.min(100, tank));
        tankWaterLevel.style.height = validTank + "%";
    }

    // 2. Map Status Badges
    if (tank < 30) {
        nodeTankStatusHeader.className = "node-state badge-alert";
        nodeTankStatusHeader.innerText = "LOW";
        if (tankStatusEl) tankStatusEl.classList.add('alert-text');
    } else {
        nodeTankStatusHeader.className = `node-state ${tank > 90 ? 'badge-ok' : 'badge-warn'}`;
        nodeTankStatusHeader.innerText = `${tank.toFixed(0)}%`;
        if (tankStatusEl) tankStatusEl.classList.remove('alert-text');
    }

    if (moist < 35) {
        nodeFieldStatusHeader.className = "node-state badge-warn";
        nodeFieldStatusHeader.innerText = "DRY";
        moistureEl.classList.add('alert-text');
    } else {
        nodeFieldStatusHeader.className = "node-state badge-ok";
        nodeFieldStatusHeader.innerText = "MOIST";
        moistureEl.classList.remove('alert-text');
    }

    // 3. Motor Synchronization
    const isTankOn = Number(data.waterMotor) === 1;
    const isIrrOn = Number(data.soilMotor) === 1;

    // Tank Fill Visuals
    if (isTankOn) {
        pathWellTank.classList.add('active');
        nodeWellIcon.classList.add('node-well-active');
        nodeTankIcon.classList.add('node-tank-active');
        tankControlItem.classList.add('active-outline');
        diagTank.innerText = "Filling";
        diagTank.className = "diag-value clr-blue";
    } else {
        pathWellTank.classList.remove('active');
        nodeWellIcon.classList.remove('node-well-active');
        nodeTankIcon.classList.remove('node-tank-active');
        tankControlItem.classList.remove('active-outline');
        diagTank.innerText = "Idle";
        diagTank.className = "diag-value";
    }

    // Irrigation Visuals
    if (isIrrOn) {
        pathTankField.classList.add('active');
        nodeFieldIcon.classList.add('node-field-active');
        nodeTankIcon.classList.add('node-tank-active');
        irrControlItem.classList.add('active-outline');
        diagIrr.innerText = "Irrigating";
        diagIrr.className = "diag-value clr-blue";
    } else {
        pathTankField.classList.remove('active');
        nodeFieldIcon.classList.remove('node-field-active');
        irrControlItem.classList.remove('active-outline');
        diagIrr.innerText = "Idle";
        diagIrr.className = "diag-value";
    }

    // 4. Update Switches & Badges
    tankToggle.checked = isTankOn;
    tankMotorBadge.innerText = isTankOn ? "ON" : "OFF";
    tankMotorBadge.className = isTankOn ? "ctrl-status on" : "ctrl-status off";

    irrToggle.checked = isIrrOn;
    irrMotorBadge.innerText = isIrrOn ? "ON" : "OFF";
    irrMotorBadge.className = isIrrOn ? "ctrl-status on" : "ctrl-status off";

    // Schema Map: data.mode ("AUTO"/"MANUAL")
    const isAuto = data.mode === "AUTO" || data.autoMode === 1;
    modeToggle.checked = isAuto;
    modeLabelHeader.innerText = isAuto ? "AUTO" : "MANUAL";
    modeLabelHeader.className = isAuto ? "mode-label auto" : "mode-label";

    diagMode.innerText = isAuto ? "AUTO" : "MANUAL";
    diagMode.className = isAuto ? "diag-value clr-green" : "diag-value clr-dark";

    tankToggle.disabled = isAuto;
    irrToggle.disabled = isAuto;

    // 5. Global Alerts Summary
    let alerts = [];
    if (tank < 30) alerts.push("Tank Empty");
    if (moist < 35) alerts.push("Soil Dry");
    if (temp > 35) alerts.push("Overheating");
    
    if (alerts.length > 0) {
        diagAlerts.innerText = alerts.join(', ');
        diagAlerts.className = "diag-value clr-red";
    } else {
        diagAlerts.innerText = "All Clear";
        diagAlerts.className = "diag-value clr-green";
    }

    footTime.innerText = new Date().toLocaleTimeString();
    isUpdating = false;
}

function setOnlineStatus(online) {
    if (online) {
        connDot.className = "pulse-dot online";
        headerStatusMsg.innerText = "Online";
        footConn.innerText = "Connected to ESP32 Edge";
    } else {
        connDot.className = "pulse-dot offline";
        headerStatusMsg.innerText = "ESP32 Disconnected";
        footConn.innerText = "Connection Lost. Retrying...";
    }
}

// ==========================================
// 5. CONTROL FUNCTIONS (COMMAND-RESPONSE)
// ==========================================
async function toggleControl(type) {
    if (isUpdating) return;

    let url = "";
    let cmdString = "";
    if (type === 'auto') {
        const state = modeToggle.checked ? 'auto' : 'manual';
        url = `${BASE_URL}/mode?state=${state}`;
        cmdString = `mode=${state}`;
    } else if (type === 'tank') {
        const val = tankToggle.checked ? 1 : 0;
        url = `${BASE_URL}/control?tank=${val}`;
        cmdString = `tank=${val}`;
    } else if (type === 'irrigation') {
        const val = irrToggle.checked ? 1 : 0;
        url = `${BASE_URL}/control?soil=${val}`;
        cmdString = `soil=${val}`;
    }

    // 1. Log outgoing command
    addLog(cmdString, 'cmd');
    
    loadingSpinner.classList.add('active');
    try {
        // 2. Execute and capture response
        const res = await fetch(url);
        const text = await res.text();
        
        // 3. Log hardware confirmation
        addLog(text, 'response');
        
        // Finalize state sync
        setTimeout(fetchData, 400);
    } catch (e) {
        console.error("Control Error:", e);
        addLog("ESP32 not reachable. Check network.", "error");
    } finally {
        loadingSpinner.classList.remove('active');
    }
}

// ==========================================
// 6. LOGGING & SERIAL MONITOR (REAL API)
// ==========================================
let commandHistory = [];
let historyIndex = -1;

function addLog(msg, type = "sys") {
    if (!termConsole) return;
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ts = document.createElement('span');
    ts.className = 'term-timestamp';
    ts.innerText = `[${timeStr}]`;
    line.appendChild(ts);
    
    const content = document.createElement('span');
    
    // Prefix logic
    let displayMsg = msg;
    if (type === 'cmd') displayMsg = `> ${msg}`;
    else if (type === 'response') {
        displayMsg = msg.includes("ESP32:") ? msg : `ESP32: ${msg}`;
        // Show notification dot if terminal is closed
        if (!serialDrawer.classList.contains('open')) {
            serialNotif.classList.add('show');
        }
    }
    
    content.innerText = displayMsg;
    line.appendChild(content);
    termConsole.appendChild(line);
    
    // Improved Autoscroll
    if (chkAutoscroll && chkAutoscroll.checked && !userScrolledUp) {
        termConsole.scrollTop = termConsole.scrollHeight;
    }
    
    // Cleanup old logs (keep last 100)
    if (termConsole.childElementCount > 100) {
        termConsole.removeChild(termConsole.firstChild);
    }
}

async function sendCommand() {
    const text = termInput.value.trim();
    if (!text) return;
    
    commandHistory.push(text);
    if (commandHistory.length > 50) commandHistory.shift();
    historyIndex = -1;

    // 1. Log outgoing command
    addLog(text, 'cmd');
    termInput.value = '';
    
    try {
        // 2. Fetch from /serial and capture text
        const response = await fetch(`${BASE_URL}/serial?cmd=${encodeURIComponent(text)}`);
        const result = await response.text();
        
        // 3. Log response
        addLog(result, 'response');
    } catch (e) {
        addLog("ESP32 Connection Error.", "error");
    }
}

// Drawer Controls
if (btnOpenSerial) {
    btnOpenSerial.addEventListener('click', () => { 
        serialDrawer.classList.add('open'); 
        serialOverlay.classList.add('open'); 
        btnOpenSerial.classList.add('active');
        serialNotif.classList.remove('show'); // Clear notifications
        termInput.focus(); 
    });
}

if (btnCloseSerial) {
    btnCloseSerial.addEventListener('click', () => { 
        serialDrawer.classList.remove('open'); 
        serialOverlay.classList.remove('open'); 
        btnOpenSerial.classList.remove('active');
    });
}

if (serialOverlay) {
    serialOverlay.addEventListener('click', () => { 
        serialDrawer.classList.remove('open'); 
        serialOverlay.classList.remove('open'); 
        btnOpenSerial.classList.remove('active');
    });
}

if (btnSendTerm) btnSendTerm.addEventListener('click', sendCommand);
if (termInput) {
    termInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCommand();
        else if (e.key === 'ArrowUp') {
            if (commandHistory.length > 0) {
                if (historyIndex === -1) historyIndex = commandHistory.length - 1;
                else if (historyIndex > 0) historyIndex--;
                termInput.value = commandHistory[historyIndex];
                e.preventDefault();
            }
        } else if (e.key === 'ArrowDown') {
            if (historyIndex !== -1) {
                if (historyIndex < commandHistory.length - 1) { historyIndex++; termInput.value = commandHistory[historyIndex]; }
                else { historyIndex = -1; termInput.value = ''; }
                e.preventDefault();
            }
        }
    });
}

if (btnClearTerm) {
    btnClearTerm.addEventListener('click', () => { 
        termConsole.classList.add('clearing');
        setTimeout(() => {
            termConsole.innerHTML = '<div class="term-line sys-msg">--- Terminal Cleared ---</div>'; 
            termConsole.classList.remove('clearing');
            addLog("Terminal history wiped clean.", "sys");
        }, 300);
    });
}

if (btnDownloadLog) {
    btnDownloadLog.addEventListener('click', () => {
        const textToSave = Array.from(termConsole.querySelectorAll('.term-line')).map(line => {
            const ts = line.querySelector('.term-timestamp')?.innerText || '';
            const content = line.querySelector('span:not(.term-timestamp)')?.innerText || line.innerText;
            return `${ts} ${content}`.trim();
        }).join('\n');
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog("Session log exported successfully.", "sys");
    });
}

if (termConsole) {
    termConsole.addEventListener('scroll', () => {
        const threshold = 50;
        const atBottom = termConsole.scrollHeight - termConsole.scrollTop - termConsole.clientHeight < threshold;
        userScrolledUp = !atBottom;
    });
}

// Terminal Options Listeners
if (chkTimestamps) {
    chkTimestamps.addEventListener('change', () => {
        if (chkTimestamps.checked) termConsole.classList.add('show-timestamps');
        else termConsole.classList.remove('show-timestamps');
    });
}

if (baudRateSelect) {
    baudRateSelect.addEventListener('change', async () => {
        const newBaud = baudRateSelect.value;
        addLog(`Initiating hardware baud rate change to ${newBaud}...`, "sys");
        try {
            const response = await fetch(`${BASE_URL}/serial?cmd=BAUD_${newBaud}`);
            const text = await response.text();
            addLog(text, "response");
        } catch (e) {
            addLog("Baud Change Request Failed. Check ESP32 connectivity.", "error");
        }
    });
}

// ==========================================
// 7. INITIALIZATION
// ==========================================
window.onload = () => {
    addLog("Dashboard Unified Logs initialized.", "sys");
    // Sync initial timestamp visibility
    if (chkTimestamps && chkTimestamps.checked) termConsole.classList.add('show-timestamps');
    fetchData();
    setInterval(fetchData, 2000); // Polling every 2 seconds
};

// Global Listeners for Controls
if (modeToggle) modeToggle.addEventListener('change', () => toggleControl('auto'));
if (tankToggle) tankToggle.addEventListener('change', () => toggleControl('tank'));
if (irrToggle) irrToggle.addEventListener('change', () => toggleControl('irrigation'));