/**
 * ESP32 Smart Agriculture Dashboard Logic - Nature Theme
 * Real-time farm monitoring via simulated hardware endpoints
 */

// ==========================================
// 1. CONFIGURATION 
// ==========================================
// Base URL for the ESP32 server (Keep empty if hosted on ESP32 itself)
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
const soilBadge = document.getElementById('soilBadge');
const tankBadge = document.getElementById('tankBadge');

const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');

const waterToggle = document.getElementById('waterToggle');
const waterLabel = document.getElementById('waterLabel');

const soilToggle = document.getElementById('soilToggle');
const soilLabel = document.getElementById('soilLabel');

const systemLogs = document.getElementById('systemLogs');

const connDot = document.getElementById('connDot');
const statusMessage = document.getElementById('statusMessage');

// State tracking
let isUpdatingUI = false;
let historyChart;

// Helper: Animate Value Change
function animateValue(obj, start, end, duration) {
    if(!obj) return;
    // Don't animate if difference is tiny to avoid jitter
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

// Helper: Update Badge
function updateBadge(badgeElement, state, text) {
    if(!badgeElement) return;
    badgeElement.className = `status-badge badge-${state}`;
    badgeElement.innerText = text;
}

// ==========================================
// 3. CHART METRICS (Nature Theme Colors)
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
                    pointHoverRadius: 6,
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
                    pointHoverRadius: 6,
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
                tooltip: {
                    backgroundColor: 'rgba(10, 23, 16, 0.9)',
                    titleColor: '#e2f1e5',
                    bodyColor: '#e2f1e5',
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    usePointStyle: true,
                }
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
// 4. API FETCHING & DATA HANDLING
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
            data = {
                temperature: (Math.random() * 5 + 25).toFixed(1),
                humidity: (Math.random() * 10 + 50).toFixed(1),
                soilMoisture: (Math.random() * 20 + 40).toFixed(1),
                tankLevel: (Math.random() * 10 + 85).toFixed(1),
                autoMode: modeToggle.checked ? 1 : 0,
                waterMotor: waterToggle.checked ? 1 : 0,
                soilMotor: soilToggle.checked ? 1 : 0
            };
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

let mockLogLines = [];
function simulateLogs(data) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    
    if (mockLogLines.length === 0) {
        mockLogLines.push(`[${time}] 🌾 Farm Control System OS v3.1 Booted.`);
        mockLogLines.push(`[${time}] 🌱 Telemetry nodes actively broadcasting...`);
    }

    if (Math.random() > 0.7) {
        let alerts = [];
        if(parseFloat(data.temperature) > 29.5) alerts.push("TEMP WARN");
        if(parseFloat(data.tankLevel) < 20) alerts.push("TANK LOW");
        
        let msg = `[${time}] RECV: T:${data.temperature}°C H:${data.humidity}% SM:${data.soilMoisture}% | ${alerts.length ? '⚠️ ' + alerts.join(', ') : '✅ OK'}`;
        mockLogLines.push(msg);
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
// 5. UI RENDER LOGIC
// ==========================================

function updateDashboardUI(data) {
    isUpdatingUI = true;

    // Animate values
    animateValue(tempValue, parseFloat(tempValue.innerText) || 0, parseFloat(data.temperature), 500);
    animateValue(humValue, parseFloat(humValue.innerText) || 0, parseFloat(data.humidity), 500);
    animateValue(soilValue, parseFloat(soilValue.innerText) || 0, parseFloat(data.soilMoisture || 0), 500);
    animateValue(tankValue, parseFloat(tankValue.innerText) || 0, parseFloat(data.tankLevel || 0), 500);
    
    // Evaluate rules for Status Badges
    const temp = parseFloat(data.temperature);
    if(temp >= 35) {
        tempValue.classList.add("alert");
        updateBadge(tempBadge, 'alert', 'CRITICALLY HOT 🔴');
    } else if (temp >= 28) {
        tempValue.classList.remove("alert");
        updateBadge(tempBadge, 'warning', 'WARM ☀️');
    } else {
        tempValue.classList.remove("alert");
        updateBadge(tempBadge, 'normal', 'OPTIMAL 🌱');
    }

    const hum = parseFloat(data.humidity);
    if(hum < 30) updateBadge(humBadge, 'alert', 'TOO DRY 🏜️');
    else if(hum > 80) updateBadge(humBadge, 'warning', 'HUMID 🌧️');
    else updateBadge(humBadge, 'normal', 'BALANCED 💧');

    const moist = parseFloat(data.soilMoisture);
    if(moist < 30) updateBadge(soilBadge, 'alert', 'DRY SOIL 🏜️');
    else updateBadge(soilBadge, 'normal', 'HYDRATED 🌱');

    const tank = parseFloat(data.tankLevel);
    if(tank < 20) {
        tankValue.classList.add("alert");
        updateBadge(tankBadge, 'alert', 'REFILL URGENT ⚠️');
    } else if(tank > 85) {
        tankValue.classList.remove("alert");
        updateBadge(tankBadge, 'normal', 'TANK FULL 🌊');
    } else {
        tankValue.classList.remove("alert");
        updateBadge(tankBadge, 'normal', 'CAPACITY OK ✔️');
    }

    // Controls sync
    const isAuto = data.autoMode === 1;
    const isWaterOn = data.waterMotor === 1;
    const isSoilOn = data.soilMotor === 1;

    updateToggleUI(modeToggle, modeLabel, isAuto, "Auto System Mode 🤖", "Manual Setup 🧑‍🌾");
    updateToggleUI(waterToggle, waterLabel, isWaterOn, "Pump Flowing 🌊", "Pump Offline ❌");
    updateToggleUI(soilToggle, soilLabel, isSoilOn, "Motor Active ⚙️", "Motor Offline ❌");

    waterToggle.disabled = isAuto;
    soilToggle.disabled = isAuto;

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
        statusMessage.innerText = isSimulated ? "🟢 Telemetry Established (Simulation)" : "🟢 Live Array Connected";
        statusMessage.className = "status-normal";
    } else {
        connDot.className = "pulse-dot error";
        statusMessage.innerText = "🔴 Signal Lost";
        statusMessage.className = "status-alert";
    }
}

// ==========================================
// 6. CONTROL SIGNALING
// ==========================================
async function toggleControl(type) {
    if (isUpdatingUI) return; 

    let param = type;
    let value = 0;

    if (type === 'auto') {
        value = modeToggle.checked ? 1 : 0;
        updateToggleUI(modeToggle, modeLabel, value === 1, "Auto System Mode 🤖", "Manual Setup 🧑‍🌾");
        waterToggle.disabled = (value === 1);
        soilToggle.disabled = (value === 1);
        appendLog(`[OVERRIDE] Agent shifted telemetry to: ${value ? 'AUTONOMOUS' : 'MANUAL'}`);
    } 
    else if (type === 'water') {
        value = waterToggle.checked ? 1 : 0;
        updateToggleUI(waterToggle, waterLabel, value === 1, "Pump Flowing 🌊", "Pump Offline ❌");
        appendLog(`[COMMAND] Main Irrigation Valves: ${value ? 'OPENED' : 'CLOSED'}`);
    } 
    else if (type === 'soil') {
        value = soilToggle.checked ? 1 : 0;
        updateToggleUI(soilToggle, soilLabel, value === 1, "Motor Active ⚙️", "Motor Offline ❌");
        appendLog(`[COMMAND] Auxillary Nutrient Motors: ${value ? 'ENGAGED' : 'HALTED'}`);
    }

    try {
        const url = `${ESP32_BASE_URL}/control?${param}=${value}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        fetchSensorData();
    } catch (e) {
        // Soft fail for simulation
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
// 7. INITIALIZATION
// ==========================================
window.onload = () => {
    initChart();
    fetchSensorData();
    setInterval(fetchSensorData, 2000);
};