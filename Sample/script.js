// ==========================================
// 1. CONFIGURATION
// ==========================================
const BASE_URL = ""; 

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

    // 3. Flow Map Animations & Controls Linkage
    const isTankOn = data.tankMotor === 1;
    const isIrrOn = data.irrigationMotor === 1;

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
// 6. LOGGING & TERMINAL
// ==========================================
function addLog(msg, type = "sys") {
    if(!termConsole) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    
    const line = document.createElement('div');
    line.className = 'term-line';
    if(type === 'sys') line.classList.add('sys-msg');
    if(type === 'cmd') line.classList.add('cmd');
    if(type === 'ok') line.classList.add('response');
    
    if(type === 'cmd') {
        line.innerHTML = `<span class="term-time">[${timeStr}]</span> > ${msg}`;
    } else {
        line.innerHTML = `<span class="term-time">[${timeStr}]</span> ${msg}`;
    }
    
    termConsole.appendChild(line);
    termConsole.scrollTop = termConsole.scrollHeight;
    
    if (termConsole.childElementCount > 150) {
        termConsole.removeChild(termConsole.firstChild);
    }
}

// Terminal Interactivity

// Drawer Toggle Logic
function openDrawer() {
    if(serialDrawer) serialDrawer.classList.add('open');
    if(serialOverlay) serialOverlay.classList.add('open');
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
    
    // 1. Echo command
    addLog(text, 'cmd');
    termInput.value = '';
    
    // 2. Simulated Response
    setTimeout(() => {
        addLog(`Executed: ${text}`, 'ok');
    }, 400);
}

if(btnSendTerm) {
    btnSendTerm.addEventListener('click', sendCommand);
}
if(termInput) {
    termInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendCommand();
    });
}
if(btnClearTerm) {
    btnClearTerm.addEventListener('click', () => {
        termConsole.innerHTML = '<div class="term-line sys-msg">--- Terminal Cleared ---</div>';
    });
}

// System Ping Loop
setInterval(() => {
    addLog("System running...", "sys");
}, 5000);

// ==========================================
// 7. SIMULATION FALLBACK
// ==========================================
let sTank = 80;
let sSoil = 60;
function generateSimData() {
    let mode = modeToggle.checked ? 1 : 0;
    let tMotor = tankToggle.checked ? 1 : 0;
    let iMotor = irrToggle.checked ? 1 : 0;

    if(mode) {
        tMotor = sTank < 30 ? 1 : (sTank > 95 ? 0 : tMotor);
        iMotor = sSoil < 40 && sTank > 10 ? 1 : (sSoil > 80 ? 0 : iMotor);
    }

    if(tMotor && !iMotor) { sTank += 3; }
    else if(tMotor && iMotor) { sTank += 1; sSoil += 2; }
    else if(!tMotor && iMotor) { sTank -= 2; sSoil += 2; }
    else { sSoil -= 0.5; }

    sTank = Math.max(0, Math.min(100, sTank));
    sSoil = Math.max(0, Math.min(100, sSoil));

    if (window.lastTM !== tMotor) { addLog(`Tank ${tMotor ? 'Started Filling' : 'Stopped'}`, tMotor?'sys':'warn'); window.lastTM = tMotor; }
    if (window.lastIM !== iMotor) { addLog(`Irrigation ${iMotor ? 'ON' : 'OFF'}`, iMotor?'sys':'warn'); window.lastIM = iMotor; }

    return {
        temperature: (25 + Math.random() * 2).toFixed(1),
        humidity: (50 + Math.random() * 5).toFixed(1),
        soilMoisture: sSoil,
        tankLevel: sTank,
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