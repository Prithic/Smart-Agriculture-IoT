// ==========================================
// 1. CONFIGURATION
// ==========================================
const BASE_URL = ""; 
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

// // Terminal & Drawer Elements
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

const nodeWellIcon = document.querySelector('#node-well .node-icon');
const nodeTankIcon = document.getElementById('tankVisual');
const nodeFieldIcon = document.querySelector('#node-field .node-icon');

const nodeTankStatus = document.getElementById('node-tank-status');
const nodeFieldStatus = document.getElementById('node-field-status');
const tankWaterLevel = document.getElementById('tankWaterLevel');

// Sensor Panels
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const soilValue = document.getElementById('soilValue');
const tankValue = document.getElementById('tankValue');

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

// ==========================================
// 3. API POLLING & DATA HANDLING
// ==========================================
async function fetchSensorData() {
    loadingSpinner.classList.add('active');
    try {
        let isSimulated = false;
        let data;

        try {
            const response = await fetch(`${BASE_URL}/data`);
            if (!response.ok) throw new Error("Offline");
            data = await response.json();
            setOnlineStatus(true);
        } catch(e) {
            isSimulated = true;
            data = generateSimData();
            setOnlineStatus(true, true); // Simulated online
        }

        updateUI(data);
        if (typeof window.processAnalytics === 'function') {
            window.processAnalytics(data);
        }

    } catch (error) {
        setOnlineStatus(false);
    } finally {
        setTimeout(() => loadingSpinner.classList.remove('active'), 500); // Small delay for visual cue
    }
}

// ==========================================
// 4. UI UPDATER
// ==========================================
function updateUI(data) {
    isUpdating = true;

    // 1. Update Core Sensor Values
    if(tempValue) tempValue.innerText = parseFloat(data.temperature).toFixed(1);
    if(humValue) humValue.innerText = parseFloat(data.humidity).toFixed(1);
    if(soilValue) soilValue.innerText = parseFloat(data.soilMoisture).toFixed(1);
    if(tankValue) tankValue.innerText = parseFloat(data.tankLevel).toFixed(1);

    const temp = parseFloat(data.temperature);
    temp > 35 ? tempValue.classList.add('alert-text') : tempValue.classList.remove('alert-text');

    const tank = parseFloat(data.tankLevel);
    const moist = parseFloat(data.soilMoisture);
    
    // Set Tank Level Height Dynamically
    if(tankWaterLevel) {
        let validTank = Math.max(0, Math.min(100, tank));
        tankWaterLevel.style.height = validTank + "%";
    }

    // 2. Tank Badge & Diagnostic Map Logic
    if (tank < 30) {
        nodeTankStatus.className = "node-state badge-alert";
        nodeTankStatus.innerText = "LOW";
        tankValue.classList.add('alert-text');
    } else {
        nodeTankStatus.className = `node-state ${tank > 90 ? 'badge-ok' : 'badge-warn'}`;
        nodeTankStatus.innerText = `${tank.toFixed(0)}%`;
        tankValue.classList.remove('alert-text');
    }

    if (moist < 35) {
        nodeFieldStatus.className = "node-state badge-warn";
        nodeFieldStatus.innerText = "DRY";
        soilValue.classList.add('alert-text');
    } else {
        nodeFieldStatus.className = "node-state badge-ok";
        nodeFieldStatus.innerText = "MOIST";
        soilValue.classList.remove('alert-text');
    }

    // 2.5 Safety Cutoff Logic (ENFORCE even in Manual)
    const isIrrOn = Number(data.irrigationMotor) === 1;
    if (tank < TANK_SAFETY_THRESHOLD && isIrrOn) {
        addLog("EMERGENCY: Irrigation Cutoff - Tank Critically Low!", "warn");
        if (typeof triggerAlert === 'function') {
            triggerAlert("critical", "Motor Safety Cutoff", "Irrigation stopped to prevent dry running.");
        }
        // Force server sync to OFF
        toggleControl('irrigation');
        return; // Skip rest of UI update for this tick to prevent flickering
    }

    // 3. Flow Map Animations & Controls Linkage
    const isTankOn = Number(data.tankMotor) === 1;

    // Tank Path
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

    // Irr Path
    if (isIrrOn) {
        pathTankField.classList.add('active');
        nodeFieldIcon.classList.add('node-field-active');
        nodeTankIcon.classList.add('node-tank-active'); // Tank is also active if giving water
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

    // 4. Update Switches and Badges
    tankToggle.checked = isTankOn;
    tankMotorBadge.innerText = isTankOn ? "ON" : "OFF";
    tankMotorBadge.className = isTankOn ? "ctrl-status on" : "ctrl-status off";

    irrToggle.checked = isIrrOn;
    irrMotorBadge.innerText = isIrrOn ? "ON" : "OFF";
    irrMotorBadge.className = isIrrOn ? "ctrl-status on" : "ctrl-status off";

    const isAuto = data.autoMode === 1;
    modeToggle.checked = isAuto;
    modeLabelHeader.innerText = isAuto ? "AUTO" : "MANUAL";
    modeLabelHeader.className = isAuto ? "mode-label auto" : "mode-label";

    diagMode.innerText = isAuto ? "AUTO" : "MANUAL";
    diagMode.className = isAuto ? "diag-value clr-green" : "diag-value clr-dark";

    tankToggle.disabled = isAuto;
    irrToggle.disabled = isAuto;

    // 5. Global Alerts
    let alerts = [];
    if(tank < 30) alerts.push("Tank Empty");
    if(moist < 35) alerts.push("Soil Dry");
    if(temp > 35) alerts.push("Overheating");
    
    if (alerts.length > 0) {
        diagAlerts.innerText = alerts.join(', ');
        diagAlerts.className = "diag-value clr-red";
    } else {
        diagAlerts.innerText = "All Clear";
        diagAlerts.className = "diag-value clr-green";
    }

    // 6. Time Update
    footTime.innerText = new Date().toLocaleTimeString();

    isUpdating = false;
}

function setOnlineStatus(online, simulated = false) {
    if (online) {
        connDot.className = "pulse-dot online";
        headerStatusMsg.innerText = simulated ? "Online (Simulated)" : "Online";
        footConn.innerText = simulated ? "Connected to Local Simulation" : "Connected to ESP32 Edge";
    } else {
        connDot.className = "pulse-dot";
        headerStatusMsg.innerText = "Offline";
        footConn.innerText = "Connection Lost. Retrying...";
    }
}

// ==========================================
// 5. MANUAL CONTROLS
// ==========================================
async function toggleControl(type) {
    if (isUpdating) return;

    let url = "";
    let val = 0;

    if (type === 'auto') {
        val = modeToggle.checked ? 1 : 0;
        url = `${BASE_URL}/mode?auto=${val}`;
        addLog(`System shifted to ${val ? 'AUTO' : 'MANUAL'} mode`, 'sys');
    } else if (type === 'tank') {
        val = tankToggle.checked ? 1 : 0;
        url = `${BASE_URL}/control?water=${val}`;
        addLog(`Well Intake Motor turned ${val ? 'ON' : 'OFF'}`, val ? 'ok' : 'warn');
    } else if (type === 'irrigation') {
        val = irrToggle.checked ? 1 : 0;
        url = `${BASE_URL}/control?soil=${val}`;
        addLog(`Field Irrigation switched ${val ? 'ON' : 'OFF'}`, val ? 'ok' : 'warn');
    }

    try {
        await fetch(url);
        fetchSensorData();
    } catch(e) {
        // Fallback for simulation
        fetchSensorData();
    }
}

// ==========================================
// 6. LOGGING & TERMINAL (ENHANCED)
// ==========================================
let commandHistory = [];
let historyIndex = -1;

function addLog(msg, type = "sys") {
    if(!termConsole) return;
    
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    
    // Add Timestamp if enabled
    if (chkTimestamps && chkTimestamps.checked) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const ts = document.createElement('span');
        ts.className = 'term-timestamp';
        ts.innerText = `[${timeStr}]`;
        line.appendChild(ts);
    }
    
    const content = document.createElement('span');
    if(type === 'cmd') {
        content.innerText = `> ${msg}`;
    } else {
        content.innerText = msg;
    }
    line.appendChild(content);
    
    termConsole.appendChild(line);
    
    // Autoscroll logic (Intelligent)
    if (chkAutoscroll && chkAutoscroll.checked && !userScrolledUp) {
        termConsole.scrollTop = termConsole.scrollHeight;
    }

    
    // Limit lines to prevent memory bloat
    if (termConsole.childElementCount > 200) {
        termConsole.removeChild(termConsole.firstChild);
    }
}

// Terminal Interactivity
function openDrawer() {
    if(serialDrawer) serialDrawer.classList.add('open');
    if(serialOverlay) serialOverlay.classList.add('open');
    termInput.focus();
}

function closeDrawer() {
    if(serialDrawer) serialDrawer.classList.remove('open');
    if(serialOverlay) serialOverlay.classList.remove('open');
}

if(btnOpenSerial) btnOpenSerial.addEventListener('click', openDrawer);
if(btnCloseSerial) btnCloseSerial.addEventListener('click', closeDrawer);
if(serialOverlay) serialOverlay.addEventListener('click', closeDrawer);

function sendCommand() {
    const text = termInput.value.trim();
    if(!text) return;
    
    // 1. History management
    commandHistory.push(text);
    if(commandHistory.length > 50) commandHistory.shift();
    historyIndex = -1;

    // 2. Echo command
    addLog(text, 'cmd');
    termInput.value = '';
    
    // 3. Simulated/API Execution
    setTimeout(() => {
        if (text.toLowerCase() === 'help') {
            addLog("Available: status, start, stop, reset, clear, mode auto|manual", "sys");
        } else if (text.toLowerCase().startsWith('mode')) {
            const m = text.split(' ')[1];
            if (m === 'auto' || m === 'manual') {
                addLog(`Switching to ${m.toUpperCase()}...`, "response");
                modeToggle.checked = (m === 'auto');
                toggleControl('auto');
            } else {
                addLog("Usage: mode auto | mode manual", "error");
            }
        } else {
            addLog(`Command '${text}' executed successfully.`, 'response');
        }
    }, 300);
}

// System Ping Loop (Visual only)
let heartbeatInterval;
function startPing() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    const speed = baudRateSelect.value === "115200" ? 10000 : 20000;
    heartbeatInterval = setInterval(() => {
        if(serialDrawer && serialDrawer.classList.contains('open')) {
            addLog("Pinging edge device...", "sys");
        }
    }, speed);
}

// Event Listeners for Terminal Controls
if(btnSendTerm) btnSendTerm.addEventListener('click', sendCommand);

if(termInput) {
    termInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            sendCommand();
        } else if(e.key === 'ArrowUp') {
            if(commandHistory.length > 0) {
                if(historyIndex === -1) historyIndex = commandHistory.length - 1;
                else if(historyIndex > 0) historyIndex--;
                termInput.value = commandHistory[historyIndex];
                e.preventDefault();
            }
        } else if(e.key === 'ArrowDown') {
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

if(btnClearTerm) {
    btnClearTerm.addEventListener('click', () => {
        termConsole.innerHTML = '<div class="term-line sys-msg">--- Terminal Cleared ---</div>';
    });
}

if(btnDownloadLog) {
    btnDownloadLog.addEventListener('click', () => {
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
        addLog("Session log exported successfully.", "sys");
    });
}

if(baudRateSelect) {
    baudRateSelect.addEventListener('change', () => {
        const newRate = baudRateSelect.value;
        addLog(`Reconnecting at ${newRate} baud...`, "sys");
        // Simulate a small delay for reconnection
        setTimeout(() => {
            termConsole.innerHTML += '<div class="term-line sys-msg">--- Connection Re-established ---</div>';
            addLog(`Device online at ${newRate}.`, "response");
            startPing();
            if(chkAutoscroll.checked) termConsole.scrollTop = termConsole.scrollHeight;
        }, 800);
    });
}

// Intelligent Autoscroll Detection
let userScrolledUp = false;
if (termConsole) {
    termConsole.addEventListener('scroll', () => {
        const threshold = 50; // px from bottom
        const atBottom = termConsole.scrollHeight - termConsole.scrollTop - termConsole.clientHeight < threshold;
        userScrolledUp = !atBottom;
    });
}

// Initial setup
startPing();




// ==========================================
// 7. SIMULATION FALLBACK
// ==========================================
let sTank = 80;
let sSoil = 60;
let sTemp = 25.0;
let sHum = 60.0;
let motorForceOnTicks = 0;

function generateSimData() {
    let mode = modeToggle.checked ? 1 : 0;
    let tMotor = tankToggle.checked ? 1 : 0;
    let iMotor = irrToggle.checked ? 1 : 0;

    // 5% chance to force an extreme event (bypassing normal mode to trigger alerts)
    if (Math.random() < 0.05 && motorForceOnTicks === 0) motorForceOnTicks = 20;

    if(mode && motorForceOnTicks === 0) {
        tMotor = sTank < 30 ? 1 : (sTank > 95 ? 0 : tMotor);
        iMotor = sSoil < 40 && sTank >= TANK_SAFETY_THRESHOLD ? 1 : (sSoil > 80 || sTank < TANK_SAFETY_THRESHOLD ? 0 : iMotor);
    }

    // Manual Safety Override in Simulation
    if (!mode && sTank < TANK_SAFETY_THRESHOLD) {
        iMotor = 0; 
    }

    if (motorForceOnTicks > 0) {
        iMotor = 1;
        motorForceOnTicks--;
    }

    // Evaluate Motor Actions
    if(tMotor && !iMotor) { sTank += 3; }
    else if(tMotor && iMotor) { sTank += 1; sSoil += 2; }
    else if(!tMotor && iMotor) { sTank -= 2; sSoil += 2; }
    else { sSoil -= 0.5; } // default soil drying

    // Rare Dry Run anomaly -> Tank motor runs but level doesn't increase, or Irrigation runs but tank doesn't drop
    if (iMotor && Math.random() < 0.05) sTank += 2; 

    // Slow drifting for Temp & Humidity
    sTemp += (Math.random() - 0.45) * 0.5;
    sHum += (Math.random() - 0.5) * 1.5;

    // Anomalous Spikes
    if (Math.random() < 0.01) sTemp = 42; 
    if (Math.random() < 0.01) sSoil = 10; 

    // Bounds checking
    sTank = Math.max(0, Math.min(100, sTank));
    sSoil = Math.max(0, Math.min(100, sSoil));
    sTemp = Math.max(10, Math.min(45, sTemp));
    sHum = Math.max(20, Math.min(100, sHum));

    if (window.lastTM !== tMotor) { addLog(`Tank ${tMotor ? 'Started Filling' : 'Stopped'}`, tMotor?'sys':'warn'); window.lastTM = tMotor; }
    if (window.lastIM !== iMotor) { addLog(`Irrigation ${iMotor ? 'ON' : 'OFF'}`, iMotor?'sys':'warn'); window.lastIM = iMotor; }

    return {
        temperature: sTemp.toFixed(1),
        humidity: sHum.toFixed(1),
        soilMoisture: sSoil.toFixed(1),
        tankLevel: sTank.toFixed(1),
        autoMode: mode,
        tankMotor: tMotor,
        irrigationMotor: iMotor
    };
}

// Init
window.onload = () => {
    addLog("Dashboard initialized", "ok");
    fetchSensorData();
    setInterval(fetchSensorData, 2000);
};