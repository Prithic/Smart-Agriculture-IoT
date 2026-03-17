/**
 * Smart Agriculture IoT Dashboard Logic
 * Hybrid Mode + Node-RED Integration + Chart Visualization
 */

// ==========================================
// 1. CONFIGURATION & DOM ELEMENTS
// ==========================================
const API = "http://localhost:1880";
const ALERT_TEMP = 35; // °C threshold for alert

// DOM Elements
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const tempGauge = document.getElementById('tempGauge');
const humGauge = document.getElementById('humGauge');
const tempCard = document.getElementById('tempCard');

const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');
const waterToggle = document.getElementById('waterMotorToggle');
const waterLabel = document.getElementById('waterMotorLabel');
const soilToggle = document.getElementById('soilMotorToggle');
const soilLabel = document.getElementById('soilMotorLabel');

const lastUpdatedTxt = document.getElementById('lastUpdated');
const refreshIcon = document.getElementById('refreshIcon');
const pulseDot = document.querySelector('.pulse-dot');
const statusMessage = document.getElementById('statusMessage');

// Chart instance
let historyChart;

// ==========================================
// 2. CHART INITIALIZATION
// ==========================================
function initChart() {
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    // Gradient for temperature line
    let tempGradient = ctx.createLinearGradient(0, 0, 0, 400);
    tempGradient.addColorStop(0, 'rgba(251, 146, 60, 0.5)');   // Orange transparent
    tempGradient.addColorStop(1, 'rgba(251, 146, 60, 0.0)');

    // Gradient for humidity line
    let humGradient = ctx.createLinearGradient(0, 0, 0, 400);
    humGradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');    // Blue transparent
    humGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    // Setting up global font for chart
    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.color = '#94a3b8';

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Time labels
            datasets: [
                {
                    label: 'Temp (°C)',
                    data: [],
                    borderColor: '#f97316',
                    backgroundColor: tempGradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#f97316',
                    pointBorderWidth: 2,
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
                    pointBorderWidth: 2,
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
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    usePointStyle: true,
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { maxTicksLimit: 7 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    suggestedMin: 10,
                    suggestedMax: 80
                }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

function updateChartData(temp, hum) {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const maxDataPoints = 15; // Keep last 15 ticks showing
    
    if (historyChart.data.labels.length > maxDataPoints) {
        historyChart.data.labels.shift();
        historyChart.data.datasets[0].data.shift();
        historyChart.data.datasets[1].data.shift();
    }
    
    // Convert logic to ensure numerical parsing
    const tempNum = parseFloat(temp) || 0;
    const humNum = parseFloat(hum) || 0;

    // Only add logic if data is valid number
    if(tempNum > 0 || humNum > 0) {
        historyChart.data.labels.push(timeNow);
        historyChart.data.datasets[0].data.push(tempNum);
        historyChart.data.datasets[1].data.push(humNum);
        historyChart.update('none'); // Update without full animation jump
    }
}

// ==========================================
// 3. DATA FETCHING (Simulation Mode)
// ==========================================

async function fetchSensorData(isManual = false) {
    try {
        if (isManual) refreshIcon.classList.add('bx-spin');

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate fake data
        const temp = (Math.random() * 15 + 20).toFixed(1); // 20 - 35
        const hum = (Math.random() * 30 + 40).toFixed(1);  // 40 - 70

        updateDashboardUI(temp, hum);
        updateChartData(temp, hum);
        
        lastUpdatedTxt.innerText = new Date().toLocaleTimeString();
        setSystemStatus(true);
        
    } catch (error) {
        console.error("Error generating fake data:", error);
        setSystemStatus(false);
    } finally {
        if (isManual) setTimeout(() => refreshIcon.classList.remove('bx-spin'), 500);
    }
}

function manualRefresh() {
    fetchSensorData(true);
}

// ==========================================
// 4. UI UPDATES
// ==========================================

function updateDashboardUI(temp, hum) {
    tempValue.innerText = temp;
    humValue.innerText = hum;

    const tVal = parseFloat(temp) || 0;
    const hVal = parseFloat(hum) || 0;

    // Map gauge widths (assuming ranges: temp 0-50, hum 0-100)
    tempGauge.style.width = `${Math.min((tVal / 50) * 100, 100)}%`;
    humGauge.style.width = `${Math.min((hVal / 100) * 100, 100)}%`;

    // Apply alert styling for high temperature
    if (tVal > ALERT_TEMP) {
        tempValue.parentElement.parentElement.parentElement.classList.add("alert");
        tempValue.classList.add("alert");
    } else {
        tempValue.parentElement.parentElement.parentElement.classList.remove("alert");
        tempValue.classList.remove("alert");
    }
}

function updateToggleUI(checkbox, label, isChecked, textOn, textOff) {
    checkbox.checked = isChecked;
    label.innerText = isChecked ? textOn : textOff;
    label.className = isChecked ? "control-label active" : "control-label inactive";
}

function setSystemStatus(isOnline) {
    if(isOnline) {
        pulseDot.classList.remove('error');
        statusMessage.innerText = "System Online";
        statusMessage.className = "status-normal";
    } else {
        pulseDot.classList.add('error');
        statusMessage.innerText = "Connection Error";
        statusMessage.className = "status-alert";
    }
}

// ==========================================
// 5. TOGGLE EVENT HANDLERS
// ==========================================
function toggleMode() {
    const isAuto = modeToggle.checked;
    updateToggleUI(modeToggle, modeLabel, isAuto, "Auto", "Manual");
    
    waterToggle.disabled = isAuto;
    soilToggle.disabled = isAuto;
    
    // To complete full integration later:
    // fetch(`${API}/control`, { method: 'POST', body: JSON.stringify({ mode: isAuto }) })
}

function toggleWaterMotor() {
    const isOn = waterToggle.checked;
    updateToggleUI(waterToggle, waterLabel, isOn, "ON", "OFF");
}

function toggleSoilMotor() {
    const isOn = soilToggle.checked;
    updateToggleUI(soilToggle, soilLabel, isOn, "ON", "OFF");
}

// ==========================================
// 6. INITIALIZATION
// ==========================================
window.onload = () => {
    initChart();
    
    // Initial fetch
    fetchSensorData();
    
    // Interval loop (3s)
    setInterval(() => fetchSensorData(false), 3000);
    
    // Initialize UI state visually
    updateToggleUI(modeToggle, modeLabel, modeToggle.checked, "Auto", "Manual");
    updateToggleUI(waterToggle, waterLabel, waterToggle.checked, "ON", "OFF");
    updateToggleUI(soilToggle, soilLabel, soilToggle.checked, "ON", "OFF");
};
