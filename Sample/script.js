/**
 * ESP32 Smart Agriculture Logic - Real-world Architecture
 * Tank Management + Irrigation Management
 */

// ==========================================
// 1. CONFIGURATION 
// ==========================================
const ESP32_BASE_URL = ""; 

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const soilValue = document.getElementById('soilMoistureValue');
const tankValue = document.getElementById('tankLevelValue');

// Badges
const tempBadge = document.getElementById('tempBadge');
const humBadge = document.getElementById('humBadge');

// Status Panels
const tankStatusMessage = document.getElementById('tankStatusMessage');
const tankStatusBox = document.getElementById('tankStatusBox');
const irrigationStatusMessage = document.getElementById('irrigationStatusMessage');
const irrigationStatusBox = document.getElementById('irrigationStatusBox');

// Controls
const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');

const tankToggle = document.getElementById('tankToggle');
const tankMotorLabel = document.getElementById('tankMotorLabel');

const irrigationToggle = document.getElementById('irrigationToggle');
const irrigationMotorLabel = document.getElementById('irrigationMotorLabel');

const systemLogs = document.getElementById('systemLogs');

const connDot = document.getElementById('connDot');
const statusMessage = document.getElementById('statusMessage');

// State tracking
let isUpdatingUI = false;
let historyChart;

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================
function animateValue(obj, start, end, duration) {
    if(!obj) return;
    if(Math.abs(end - parseFloat(obj.innerText)) < 0.5) {
        obj.innerText = end.toFixed(1);
        return;
    }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = (progress * (end - start) + start).toFixed(1);
        obj.innerText = current;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = end.toFixed(1);
        }
    };
    window.requestAnimationFrame(step);
}

function updateBadge(badgeElement, state, text) {
    if(!badgeElement) return;
    badgeElement.className = `status-badge badge-${state}`;
    badgeElement.innerText = text;
}

// ==========================================
// 4. CHART METRICS
// ==========================================
function initChart() {
    const ctx = document.getElementById('farmChart').getContext('2d');
    
    let tempGradient = ctx.createLinearGradient(0, 0, 0, 300);
    tempGradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
    tempGradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
    
    let humGradient = ctx.createLinearGradient(0, 0, 0, 300);
    humGradient.addColorStop(0, 'rgba(14, 165, 233, 0.4)');
    humGradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.color = '#9cbca4';

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: tempGradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#f59e0b',
                    pointRadius: 4,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#0ea5e9',
                    backgroundColor: humGradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#0ea5e9',
                    pointRadius: 4,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, suggestedMin: 10, suggestedMax: 80 }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

function updateChart(temp, hum) {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (historyChart.data.labels.length > 15) {
        historyChart.data.labels.shift();
        historyChart.data.datasets[0].data.shift();
        historyChart.data.datasets[1].data.shift();
    }
    historyChart.data.labels.push(timeNow);
    historyChart.data.datasets[0].data.push(parseFloat(temp) || 0);
    historyChart.data.datasets[1].data.push(parseFloat(hum) || 0);
    historyChart.update('none');
}

// ==========================================
// 5. API FETCHING & DATA HANDLING
// ==========================================

async function fetchSensorData() {
    try {
        let isSimulated = false;
        let data;

        try {
            const response = await fetch(`${ESP32_BASE_URL}/data`);
            if (!response.ok) throw new Error("Offline");
            data = await response.json();
        } catch(e) {
            isSimulated = true;
            
            // Generate simulated coherent data logic
            data = generateSimulatedState();
        }
        
        updateDashboardUI(data);
        updateChart(data.temperature, data.humidity);
        setConnectionStatus(true, isSimulated);
        
        if (!isSimulated) {
            fetchLogs();
        } else {
            simulateLogs(data);
        }

    } catch (error) {
        console.error(error);
        setConnectionStatus(false);
    }
}

// Keep simulation stable for visual demo
let simTank = 75;
let simSoil = 45;

function generateSimulatedState() {
    const isAuto = modeToggle.checked ? 1 : 0;
    
    // Motor checks based on toggle states if manual
    let tankMotor = tankToggle.checked ? 1 : 0;
    let irrMotor = irrigationToggle.checked ? 1 : 0;

    // Simulate auto logic loosely
    if (isAuto) {
        if (simTank < 30) tankMotor = 1;
        if (simTank > 95) tankMotor = 0;
        
        if (simSoil < 35 && simTank > 10) irrMotor = 1;
        if (simSoil > 70) irrMotor = 0;
    }

    // Adjust variables naturally
    if (tankMotor) simTank += 2;
    if (irrMotor) {
        simTank -= 1;
        simSoil += 1.5;
    } else {
        simSoil -= 0.2;
    }
    
    // Clamping
    if (simTank > 100) simTank = 100;
    if (simTank < 0) simTank = 0;
    if (simSoil > 100) simSoil = 100;
    if (simSoil < 0) simSoil = 0;

    return {
        temperature: (Math.random() * 2 + 25).toFixed(1),
        humidity: (Math.random() * 5 + 50).toFixed(1),
        soilMoisture: simSoil.toFixed(1),
        tankLevel: simTank.toFixed(1),
        autoMode: isAuto,
        tankMotor: tankMotor,
        irrigationMotor: irrMotor
    };
}


let mockLogLines = [];
let lastLogEvent = "";

function simulateLogs(data) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    
    if (mockLogLines.length === 0) {
        mockLogLines.push(`[${time}] 🌾 Base Station Booted.`);
        mockLogLines.push(`[${time}] 🌱 Flow controllers calibrated.`);
    }

    // Event-based logging
    if (data.tankMotor === 1 && lastLogEvent !== "tank_on") {
        mockLogLines.push(`[${time}] 💧 WELL PUMP: Tank filling started (Level: ${data.tankLevel}%)`);
        lastLogEvent = "tank_on";
    }
    if (data.tankMotor === 0 && lastLogEvent === "tank_on") {
        mockLogLines.push(`[${time}] 🛑 WELL PUMP: Tank filling stopped (Level: ${data.tankLevel}%)`);
        lastLogEvent = "tank_off";
    }

    if (data.irrigationMotor === 1 && lastLogEvent !== "irr_on") {
        mockLogLines.push(`[${time}] 🚿 IRRIGATION: Valve opened to field (Soil: ${data.soilMoisture}%)`);
        lastLogEvent = "irr_on";
    }
    if (data.irrigationMotor === 0 && lastLogEvent === "irr_on") {
        mockLogLines.push(`[${time}] 🛑 IRRIGATION: Valve closed. Soil moisture optimal.`);
        lastLogEvent = "irr_off";
    }

    // Periodic heartbeat
    if (Math.random() > 0.9) {
        mockLogLines.push(`[${time}] INFO: Heartbeat normal. T:${data.temperature}°C`);
    }

    if (mockLogLines.length > 25) mockLogLines.shift();
    
    const logsText = mockLogLines.join('\n');
    if (systemLogs.innerText !== logsText) {
        systemLogs.innerText = logsText;
        systemLogs.parentElement.scrollTop = systemLogs.parentElement.scrollHeight;
    }
}

async function fetchLogs() {
    try {
        const response = await fetch(`${ESP32_BASE_URL}/logs`);
        if (response.ok) {
            const logs = await response.text();
            if(systemLogs.innerText !== logs) {
                systemLogs.innerText = logs;
                systemLogs.parentElement.scrollTop = systemLogs.parentElement.scrollHeight;
            }
        }
    } catch (e) {}
}

// ==========================================
// 6. UI RENDER LOGIC
// ==========================================

function updateDashboardUI(data) {
    isUpdatingUI = true;

    // Animate values
    animateValue(tempValue, parseFloat(tempValue.innerText) || 0, parseFloat(data.temperature), 500);
    animateValue(humValue, parseFloat(humValue.innerText) || 0, parseFloat(data.humidity), 500);
    animateValue(soilValue, parseFloat(soilValue.innerText) || 0, parseFloat(data.soilMoisture || 0), 500);
    animateValue(tankValue, parseFloat(tankValue.innerText) || 0, parseFloat(data.tankLevel || 0), 500);
    
    // Environmental Alerts
    const temp = parseFloat(data.temperature);
    if(temp >= 35) {
        tempValue.classList.add("alert");
        updateBadge(tempBadge, 'alert', 'CRITICALLY HOT 🔴');
    } else {
        tempValue.classList.remove("alert");
        updateBadge(tempBadge, 'normal', 'OPTIMAL 🌱');
    }

    const hum = parseFloat(data.humidity);
    if(hum < 30) updateBadge(humBadge, 'alert', 'TOO DRY 🏜️');
    else updateBadge(humBadge, 'normal', 'BALANCED 💧');

    // System Status Logic (IMPORTANT)
    const tank = parseFloat(data.tankLevel);
    const isTankMotorOn = data.tankMotor === 1;
    
    if (tank < 30) {
        tankValue.classList.add("alert");
        tankStatusBox.className = "status-message-box msg-alert";
        tankStatusMessage.innerHTML = "⚠️ Tank Low – Refill Required";
    } else if (tank > 90) {
        tankValue.classList.remove("alert");
        tankStatusBox.className = "status-message-box msg-normal";
        tankStatusMessage.innerHTML = "✅ Tank Full – Motor Stopped";
    } else {
        tankValue.classList.remove("alert");
        if (isTankMotorOn) {
            tankStatusBox.className = "status-message-box msg-active";
            tankStatusMessage.innerHTML = "🔄 Tank Filling from Well...";
        } else {
            tankStatusBox.className = "status-message-box msg-normal";
            tankStatusMessage.innerHTML = "✔️ Capacity Stable – System Idle";
        }
    }

    const moist = parseFloat(data.soilMoisture);
    const isIrrOn = data.irrigationMotor === 1;

    if (moist < 35) {
        irrigationStatusBox.className = "status-message-box msg-warning";
        irrigationStatusMessage.innerHTML = "🏜️ Soil Dry – Irrigation Required";
    } else if (isIrrOn) {
        irrigationStatusBox.className = "status-message-box msg-active";
        irrigationStatusMessage.innerHTML = "🚿 Field Irrigation Active...";
    } else {
        irrigationStatusBox.className = "status-message-box msg-normal";
        irrigationStatusMessage.innerHTML = "💧 Soil Moist – System Idle";
    }

    // Highlight row if motor is actively running
    const tankRow = tankToggle.closest('.control-row');
    const irrRow = irrigationToggle.closest('.control-row');
    
    isTankMotorOn ? tankRow.classList.add('active-state') : tankRow.classList.remove('active-state');
    isIrrOn ? irrRow.classList.add('active-state') : irrRow.classList.remove('active-state');

    // Controls sync
    const isAuto = data.autoMode === 1;

    updateToggleUI(modeToggle, modeLabel, isAuto, "Auto System Mode 🤖", "Manual Override 🧑‍🌾");
    updateToggleUI(tankToggle, tankMotorLabel, isTankMotorOn, "PUMP ACTIVE ✨", "PUMP OFFLINE ❌");
    updateToggleUI(irrigationToggle, irrigationMotorLabel, isIrrOn, "VALVE OPEN 🌊", "VALVE CLOSED ❌");

    tankToggle.disabled = isAuto;
    irrigationToggle.disabled = isAuto;

    isUpdatingUI = false;
}

function updateToggleUI(checkbox, label, isChecked, textOn, textOff) {
    checkbox.checked = isChecked;
    label.innerText = isChecked ? textOn : textOff;
    label.className = isChecked ? "control-label active" : "control-label inactive";
}

function setConnectionStatus(isOnline, isSimulated = false) {
    if(isOnline) {
        connDot.className = "pulse-dot online";
        statusMessage.innerText = isSimulated ? "🟢 Edge Array Linked (Simulated)" : "🟢 Live Array Connected";
        statusMessage.className = "status-normal";
    } else {
        connDot.className = "pulse-dot error";
        statusMessage.innerText = "🔴 Signal Lost";
        statusMessage.className = "status-alert";
    }
}

// ==========================================
// 7. CONTROL SIGNALING
// ==========================================
async function toggleControl(type) {
    if (isUpdatingUI) return; 

    let param = type;
    let value = 0;

    if (type === 'auto') {
        value = modeToggle.checked ? 1 : 0;
        updateToggleUI(modeToggle, modeLabel, value === 1, "Auto System Mode 🤖", "Manual Override 🧑‍🌾");
        tankToggle.disabled = (value === 1);
        irrigationToggle.disabled = (value === 1);
        appendLog(`[OVERRIDE] Agent shifted telemetry to: ${value ? 'AUTONOMOUS' : 'MANUAL'}`);
    } 
    else if (type === 'tank') {
        value = tankToggle.checked ? 1 : 0;
        updateToggleUI(tankToggle, tankMotorLabel, value === 1, "PUMP ACTIVE ✨", "PUMP OFFLINE ❌");
        appendLog(`[MANUAL COMMAND] Tank Well Pump: ${value ? 'ENGAGED' : 'HALTED'}`);
    } 
    else if (type === 'irrigation') {
        value = irrigationToggle.checked ? 1 : 0;
        updateToggleUI(irrigationToggle, irrigationMotorLabel, value === 1, "VALVE OPEN 🌊", "VALVE CLOSED ❌");
        appendLog(`[MANUAL COMMAND] Field Irrigation Valve: ${value ? 'OPENED' : 'CLOSED'}`);
    }

    try {
        const url = `${ESP32_BASE_URL}/control?${param}=${value}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        fetchSensorData();
    } catch (e) {
        // Soft fail for simulation
        fetchSensorData(); 
    }
}

function appendLog(text) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    mockLogLines.push(`[${time}] ${text}`);
    if (mockLogLines.length > 25) mockLogLines.shift();
    systemLogs.innerText = mockLogLines.join('\n');
    systemLogs.parentElement.scrollTop = systemLogs.parentElement.scrollHeight;
}

// ==========================================
// 8. INITIALIZATION
// ==========================================
window.onload = () => {
    initChart();
    fetchSensorData();
    setInterval(fetchSensorData, 2000);
};