/**
 * Smart Agriculture IoT Dashboard Logic
 * Hybrid Mode: Simulates data locally for presentation purposes.
 * Real control is deferred to the Arduino IoT Cloud via the redirect button.
 */

// High Temperature Alert Threshold
const ALERT_TEMP = 35; // °C

// ==========================================
// 1. DOM ELEMENTS
// ==========================================
const tempValue = document.getElementById('tempValue');
const tempCard = document.getElementById('tempCard');
const humValue = document.getElementById('humValue');

const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');

const waterToggle = document.getElementById('waterMotorToggle');
const waterLabel = document.getElementById('waterMotorLabel');

const soilToggle = document.getElementById('soilMotorToggle');
const soilLabel = document.getElementById('soilMotorLabel');

const lastUpdatedTxt = document.getElementById('lastUpdated');

// ==========================================
// 2. DATA FETCHING (Node-RED Integration)
// ==========================================
const API = "http://localhost:1880";

async function fetchSensorData() {
    try {
        const res = await fetch(`${API}/data`);
        const data = await res.json();
        
        // Use the existing dashboard elements to display the data
        const temp = data.temperature !== undefined ? data.temperature : "--";
        const hum = data.humidity !== undefined ? data.humidity : "--";
        
        updateDashboard(temp, hum);
        lastUpdatedTxt.innerText = new Date().toLocaleTimeString();
        
        // Auto-update UI toggles if the data payload includes them
        if(data.mode !== undefined) updateToggleUI(modeToggle, modeLabel, data.mode, "Auto", "Manual");
        if(data.waterMotor !== undefined) updateToggleUI(waterToggle, waterLabel, data.waterMotor, "ON", "OFF");
        if(data.soilMotor !== undefined) updateToggleUI(soilToggle, soilLabel, data.soilMotor, "ON", "OFF");
    } catch (error) {
        console.error("Error fetching data from Node-RED:", error);
    }
}

// ==========================================
// 3. UI UPDATES
// ==========================================

function updateDashboard(temp, hum) {
    // Update text
    tempValue.innerText = temp;
    humValue.innerText = hum;

    // Apply alert styling for high temperature
    if (parseFloat(temp) > ALERT_TEMP) {
        tempValue.className = "value alert";
        tempValue.parentElement.parentElement.parentElement.classList.add("alert");
    } else {
        tempValue.className = "value normal";
        tempValue.parentElement.parentElement.parentElement.classList.remove("alert");
    }
    
    // Normal color for humidity
    humValue.className = "value normal";
}

function updateToggleUI(checkbox, label, isChecked, textOn, textOff) {
    checkbox.checked = isChecked;
    label.innerText = isChecked ? textOn : textOff;
    label.className = isChecked ? "control-label active" : "control-label inactive";
}

// ==========================================
// 4. TOGGLE EVENT HANDLERS
// ==========================================

// In hybrid mode, these represent "local" manual overrides or intentions
// If the user intends to genuinely change the physical system, they are
// directed to use the "Manage on Arduino Cloud" button.

function toggleMode() {
    const isAuto = modeToggle.checked;
    updateToggleUI(modeToggle, modeLabel, isAuto, "Auto", "Manual");
    
    // UI behavior constraint: if Auto, you cannot manually toggle motors here
    waterToggle.disabled = isAuto;
    soilToggle.disabled = isAuto;
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
// 5. INITIALIZATION
// ==========================================
// Start updating simulated data every 3 seconds
fetchSensorData();
setInterval(fetchSensorData, 3000);

// Initialize UI state
updateToggleUI(modeToggle, modeLabel, false, "Auto", "Manual");
updateToggleUI(waterToggle, waterLabel, false, "ON", "OFF");
updateToggleUI(soilToggle, soilLabel, false, "ON", "OFF");
