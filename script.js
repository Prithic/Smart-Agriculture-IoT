/**
 * Smart Agriculture IoT Dashboard Logic
 * This script connects to the Arduino IoT Cloud REST API.
 */

// ==========================================
// 1. CONFIGURATION (PLACEHOLDERS)
// ==========================================
// Replace these with your actual Arduino IoT Cloud Credentials
const API_CONFIG = {
    clientId: 'YOUR_CLIENT_ID_HERE',        // e.g. "a1b2c3d4..."
    clientSecret: 'YOUR_CLIENT_SECRET_HERE',// e.g. "XyZ123..."
    thingId: 'YOUR_THING_ID_HERE',          // The ID of your Thing
    
    // IDs or names of your variables in the Arduino Cloud
    vars: {
        temperatureId: 'temperature_var_id',
        humidityId: 'humidity_var_id',
        modeId: 'mode_var_id',              // Boolean (true=Auto, false=Manual)
        waterMotorId: 'water_motor_var_id',     // Boolean
        soilMotorId: 'soil_motor_var_id'        // Boolean
    }
};

// Application state
let accessToken = null;
let isDemoMode = true; // Set to false to use real API once credentials are put in above!

// High Temperature Alert Threshold
const ALERT_TEMP = 35; // °C

// ==========================================
// 2. DOM ELEMENTS
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
const statusMessage = document.getElementById('statusMessage');
const loadingIndicator = document.getElementById('loadingIndicator');

// ==========================================
// 3. API INTEGRATION (AUTHENTICATION)
// ==========================================
/**
 * Obtains an OAuth Access token using Client Credentials
 */
async function getAccessToken() {
    // If in demo mode, skip actual authentication
    if (isDemoMode) return "demo_token";

    const url = 'https://api2.arduino.cc/iot/v1/clients/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', API_CONFIG.clientId);
    params.append('client_secret', API_CONFIG.clientSecret);
    params.append('audience', 'https://api2.arduino.cc/iot');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        
        if (!response.ok) throw new Error('Auth failed');
        
        const data = await response.json();
        accessToken = data.access_token;
        console.log("Authenticated successfully.");
        return accessToken;
    } catch (error) {
        console.error('Error getting access token:', error);
        updateSystemStatus("Authentication Failed", "error");
        return null;
    }
}

// ==========================================
// 4. DATA FETCHING 
// ==========================================
/**
 * Fetches the latest data from the Thing properties
 */
async function fetchSensorData() {
    showLoading(true);
    
    // -- Demo Mode Simulation --
    if (isDemoMode) {
        setTimeout(() => {
            // Generate random values for demo
            const mockTemp = (Math.random() * 15 + 22).toFixed(1); // 22 - 37
            const mockHum = (Math.random() * 20 + 40).toFixed(1);  // 40 - 60
            
            updateDashboard(mockTemp, mockHum);
            lastUpdatedTxt.innerText = new Date().toLocaleTimeString();
            showLoading(false);
            updateSystemStatus("System Online", "normal");
        }, 500); // simulate network delay
        return;
    }
    // --------------------------

    // Real API Request
    if (!accessToken) await getAccessToken();
    if (!accessToken) return showLoading(false);

    try {
        const url = `https://api2.arduino.cc/iot/v2/things/${API_CONFIG.thingId}/properties`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            // Token might be expired
            if(response.status === 401) {
                accessToken = null;
                return;
            }
            throw new Error('Failed to fetch data');
        }

        const properties = await response.json();
        
        // Find properties by their ID or Name. The exact mapping depends on your setup.
        // Assuming your properties array looks like [{id: '...', value: 25.5}, ...]
        let temp = "--", hum = "--";
        
        properties.forEach(prop => {
            if (prop.id === API_CONFIG.vars.temperatureId || prop.name === 'temperature') temp = prop.value.toFixed(1);
            if (prop.id === API_CONFIG.vars.humidityId || prop.name === 'humidity') hum = prop.value.toFixed(1);
            
            // Sync UI state if things changed in the cloud externally
            if (prop.id === API_CONFIG.vars.modeId) updateToggleUI(modeToggle, modeLabel, prop.value, "Auto", "Manual");
            if (prop.id === API_CONFIG.vars.waterMotorId) updateToggleUI(waterToggle, waterLabel, prop.value, "ON", "OFF");
            if (prop.id === API_CONFIG.vars.soilMotorId) updateToggleUI(soilToggle, soilLabel, prop.value, "ON", "OFF");
        });

        updateDashboard(temp, hum);
        lastUpdatedTxt.innerText = new Date().toLocaleTimeString();
        updateSystemStatus("System Online", "normal");

    } catch (error) {
        console.error('Error fetching data:', error);
        updateSystemStatus("Connection Error", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * Updates a specific property (variable) in the Arduino Cloud
 */
async function sendCommand(propertyId, value) {
    if (isDemoMode) return console.log(`[DEMO] Sending ${value} to ${propertyId}`);
    
    if (!accessToken) await getAccessToken();
    
    try {
        const url = `https://api2.arduino.cc/iot/v2/things/${API_CONFIG.thingId}/properties/${propertyId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: value })
        });
        
        if (!response.ok) throw new Error('Command failed');
        console.log(`Successfully updated ${propertyId} to ${value}`);
    } catch (error) {
        console.error('Error sending command:', error);
        updateSystemStatus("Failed to send command", "error");
    }
}

// ==========================================
// 5. UI UPDATES
// ==========================================

function updateDashboard(temp, hum) {
    // Update basic text
    tempValue.innerText = temp;
    humValue.innerText = hum;

    // Apply alert styling for high temperature
    if (parseFloat(temp) > ALERT_TEMP) {
        tempValue.className = "value alert";
        tempValue.parentElement.parentElement.parentElement.classList.add("alert"); // add alert border to card
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
// 6. TOGGLE EVENT HANDLERS
// ==========================================

// These functions are called by the 'onchange' attributes in index.html
function toggleMode() {
    const isAuto = modeToggle.checked;
    updateToggleUI(modeToggle, modeLabel, isAuto, "Auto", "Manual");
    sendCommand(API_CONFIG.vars.modeId, isAuto);
    
    // If auto mode is enabled, we might want to disable manual motor toggles in UI
    waterToggle.disabled = isAuto;
    soilToggle.disabled = isAuto;
}

function toggleWaterMotor() {
    const isOn = waterToggle.checked;
    updateToggleUI(waterToggle, waterLabel, isOn, "ON", "OFF");
    sendCommand(API_CONFIG.vars.waterMotorId, isOn);
}

function toggleSoilMotor() {
    const isOn = soilToggle.checked;
    updateToggleUI(soilToggle, soilLabel, isOn, "ON", "OFF");
    sendCommand(API_CONFIG.vars.soilMotorId, isOn);
}

// ==========================================
// 7. UTILS
// ==========================================
function showLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

function updateSystemStatus(msg, type) {
    statusMessage.innerText = msg;
    statusMessage.className = type === "error" ? "status-alert" : "status-normal";
}

// ==========================================
// 8. INITIALIZATION
// ==========================================
// Start polling every 3 seconds (adjustable, 2-5s per requirements)
fetchSensorData(); // Initial fetch
setInterval(fetchSensorData, 3000);

// Initialize UI state
updateToggleUI(modeToggle, modeLabel, false, "Auto", "Manual");
updateToggleUI(waterToggle, waterLabel, false, "ON", "OFF");
updateToggleUI(soilToggle, soilLabel, false, "ON", "OFF");
