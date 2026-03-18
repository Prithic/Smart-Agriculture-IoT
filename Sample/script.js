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

// ==========================================
// 3. CHART METRICS (Nature Theme Colors)
// ==========================================
function initChart() {
    const ctx = document.getElementById('farmChart').getContext('2d');
    
    // Smooth eco gradients
    let tempGradient = ctx.createLinearGradient(0, 0, 0, 300);
    tempGradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');   // Orange/Sun
    tempGradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
    
    let humGradient = ctx.createLinearGradient(0, 0, 0, 300);
    humGradient.addColorStop(0, 'rgba(14, 165, 233, 0.4)');   // Blue/Water
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
                    tension: 0.4 // Smooth waves
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
                    tension: 0.4 // Smooth waves
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
    const maxPoints = 15;
    
    if (historyChart.data.labels.length > maxPoints) {
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
// 4. API FETCHING
// ==========================================

async function fetchSensorData() {
    try {
        // Fallback simulated data if API fails to fetch (e.g. running from standard HTML file locally)
        let isSimulated = false;
        let data;

        try {
            const response = await fetch(`${ESP32_BASE_URL}/data`);
            if (!response.ok) throw new Error("Offline");
            data = await response.json();
        } catch(e) {
            // Simulated Data block for demonstration of UI design
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
        
        // Handle Logs
        if (!isSimulated) {
            fetchLogs();
        } else {
            // Simulate log streaming
            simulateLogs(data);
        }

    } catch (error) {
        console.error(error);
        setConnectionStatus(false);
    }
}

let mockLogLines = [];
function simulateLogs(data) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0,-1);
    
    if (mockLogLines.length === 0) {
        mockLogLines.push(`[${timestamp}] 🌾 Farm OS v2.0 Initialized.`);
        mockLogLines.push(`[${timestamp}] 🌱 Sensors calibrated. Commencing telemetry...`);
    }

    if (Math.random() > 0.6) {
        mockLogLines.push(`[${timestamp}] READ: Temp ${data.temperature}°C | Moist ${data.soilMoisture}% | Tank ${data.tankLevel}%`);
    }

    if (mockLogLines.length > 20) mockLogLines.shift();
    
    if (systemLogs.innerText !== mockLogLines.join('\n')) {
        systemLogs.innerText = mockLogLines.join('\n');
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

    tempValue.innerText = data.temperature;
    humValue.innerText = data.humidity;
    soilValue.innerText = data.soilMoisture || "--";
    tankValue.innerText = data.tankLevel || "--";
    
    // Alerts
    if (parseFloat(data.temperature) >= 35) tempValue.classList.add("alert");
    else tempValue.classList.remove("alert");

    if (parseFloat(data.tankLevel) < 20) tankValue.classList.add("alert");
    else tankValue.classList.remove("alert");

    // Controls sync
    const isAuto = data.autoMode === 1;
    const isWaterOn = data.waterMotor === 1;
    const isSoilOn = data.soilMotor === 1;

    updateToggleUI(modeToggle, modeLabel, isAuto, "AUTO", "MANUAL");
    updateToggleUI(waterToggle, waterLabel, isWaterOn, "ON", "OFF");
    updateToggleUI(soilToggle, soilLabel, isSoilOn, "ON", "OFF");

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
        statusMessage.innerText = isSimulated ? "🟢 Farm Connected (Simulation)" : "🟢 Farm Connected";
        statusMessage.className = "status-normal";
    } else {
        connDot.className = "pulse-dot error";
        statusMessage.innerText = "🔴 Offline";
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
        updateToggleUI(modeToggle, modeLabel, value === 1, "AUTO", "MANUAL");
        waterToggle.disabled = (value === 1);
        soilToggle.disabled = (value === 1);
        appendLog(`[ACTION] Switched Farming Mode to ${value ? 'AUTO' : 'MANUAL'}`);
    } 
    else if (type === 'water') {
        value = waterToggle.checked ? 1 : 0;
        updateToggleUI(waterToggle, waterLabel, value === 1, "ON", "OFF");
        appendLog(`[ACTION] Irrigation Pump toggled ${value ? 'ON' : 'OFF'}`);
    } 
    else if (type === 'soil') {
        value = soilToggle.checked ? 1 : 0;
        updateToggleUI(soilToggle, soilLabel, value === 1, "ON", "OFF");
        appendLog(`[ACTION] Tank Motor toggled ${value ? 'ON' : 'OFF'}`);
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
    const timestamp = new Date().toISOString().split('T')[1].slice(0,-1);
    mockLogLines.push(`[${timestamp}] ${text}`);
    if (mockLogLines.length > 20) mockLogLines.shift();
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