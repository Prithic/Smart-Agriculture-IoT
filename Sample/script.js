/**
 * ESP32 Smart Agriculture Dashboard Logic
 * Fetches JSON from /data every 2s, updates toggles, and handles controls via /control
 */

// ==========================================
// 1. CONFIGURATION 
// ==========================================
// Base URL for the ESP32 server. 
// If the HTML is hosted directly ON the ESP32 (e.g. SPIFFS), keep it empty ("").
// If hosting locally on your PC to test against the ESP32 IP, change to "http://ESP32_IP_ADDRESS".
const ESP32_BASE_URL = ""; 

// Thresholds for alerts
const ALERT_TEMP_HIGH = 35; // °C

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const tempCard = document.getElementById('tempCard');

const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');

const waterToggle = document.getElementById('waterToggle');
const waterLabel = document.getElementById('waterLabel');

const soilToggle = document.getElementById('soilToggle');
const soilLabel = document.getElementById('soilLabel');

const systemLogs = document.getElementById('systemLogs');
const lastUpdatedTxt = document.getElementById('lastUpdated');

const connDot = document.getElementById('connDot');
const statusMessage = document.getElementById('statusMessage');

// State tracking to prevent fighting with user input
let isUpdatingUI = false;

// ==========================================
// 3. API FETCHING & UPDATES
// ==========================================

async function fetchSensorData() {
    try {
        const response = await fetch(`${ESP32_BASE_URL}/data`);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        // Expected JSON: { "temperature": 25.5, "humidity": 60, "waterMotor": 1, "soilMotor": 0, "autoMode": 1 }
        
        updateDashboardUI(data);
        setConnectionStatus(true);
        lastUpdatedTxt.innerText = new Date().toLocaleTimeString();

        // Fetch logs separately
        fetchLogs();
    } catch (error) {
        console.error("Error fetching ESP32 data:", error);
        setConnectionStatus(false);
    }
}

async function fetchLogs() {
    try {
        const response = await fetch(`${ESP32_BASE_URL}/logs`);
        if (response.ok) {
            const logs = await response.text();
            
            // Only update if logs changed to prevent scroll jumping
            if(systemLogs.innerText !== logs) {
                systemLogs.innerText = logs;
                // Auto-scroll to bottom of logs
                systemLogs.parentElement.scrollTop = systemLogs.parentElement.scrollHeight;
            }
        }
    } catch (error) {
        // Silently fail log fetch if main connection is also failing
    }
}

// ==========================================
// 4. UI RENDER LOGIC
// ==========================================

function updateDashboardUI(data) {
    isUpdatingUI = true;

    // 1. Update Temperature
    const t = parseFloat(data.temperature) || 0;
    tempValue.innerText = t.toFixed(1);
    
    // Alert logic
    if (t > ALERT_TEMP_HIGH) {
        tempValue.className = "value alert";
        tempCard.style.borderColor = "var(--alert-color)";
    } else {
        tempValue.className = "value normal";
        tempCard.style.borderColor = "var(--border-color)";
    }

    // 2. Update Humidity
    const h = parseFloat(data.humidity) || 0;
    humValue.innerText = h.toFixed(1);
    humValue.className = "value normal";

    // 3. Sync Toggles (1 = true/ON/AUTO, 0 = false/OFF/MANUAL)
    const isAuto = data.autoMode === 1;
    const isWaterOn = data.waterMotor === 1;
    const isSoilOn = data.soilMotor === 1;

    updateToggleUI(modeToggle, modeLabel, isAuto, "AUTO", "MANUAL");
    updateToggleUI(waterToggle, waterLabel, isWaterOn, "ON", "OFF");
    updateToggleUI(soilToggle, soilLabel, isSoilOn, "ON", "OFF");

    // Disable motor toggles if in AUTO mode
    waterToggle.disabled = isAuto;
    soilToggle.disabled = isAuto;

    isUpdatingUI = false;
}

function updateToggleUI(checkbox, label, isChecked, textOn, textOff) {
    checkbox.checked = isChecked;
    label.innerText = isChecked ? textOn : textOff;
    label.className = isChecked ? "control-label active" : "control-label inactive";
}

function setConnectionStatus(isOnline) {
    if(isOnline) {
        connDot.className = "pulse-dot online";
        statusMessage.innerText = "System Online";
        statusMessage.className = "status-normal";
    } else {
        connDot.className = "pulse-dot error";
        statusMessage.innerText = "Connection Error";
        statusMessage.className = "status-alert";
    }
}

// ==========================================
// 5. CONTROL SIGNALING
// ==========================================

/**
 * Triggered by toggle switches onchange event.
 * type can be 'auto', 'water', or 'soil'
 */
async function toggleControl(type) {
    // Prevent recursive loop when UI is updated by incoming data
    if (isUpdatingUI) return; 

    let param = type;
    let value = 0;

    if (type === 'auto') {
        value = modeToggle.checked ? 1 : 0;
        updateToggleUI(modeToggle, modeLabel, value === 1, "AUTO", "MANUAL");
        waterToggle.disabled = (value === 1);
        soilToggle.disabled = (value === 1);
    } 
    else if (type === 'water') {
        value = waterToggle.checked ? 1 : 0;
        updateToggleUI(waterToggle, waterLabel, value === 1, "ON", "OFF");
    } 
    else if (type === 'soil') {
        value = soilToggle.checked ? 1 : 0;
        updateToggleUI(soilToggle, soilLabel, value === 1, "ON", "OFF");
    }

    // Send control signal to ESP32
    try {
        const url = `${ESP32_BASE_URL}/control?${param}=${value}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("Control command failed");
        console.log(`Successfully sent ${param}=${value}`);
        
        // Immediately fetch data to confirm state
        fetchSensorData();
    } catch (error) {
        console.error("Failed to send control:", error);
        // Warning: Might want to visually revert the toggle here if the command failed.
    }
}

// ==========================================
// 6. INITIALIZATION
// ==========================================
window.onload = () => {
    // Fetch immediately on load
    fetchSensorData();
    
    // Start interval for real-time updates every 2000ms (2 seconds)
    setInterval(fetchSensorData, 2000);
};