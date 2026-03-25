// --- CHART INITIALIZATION ---
// Setup common chart styling
Chart.defaults.color = '#6b7280';
Chart.defaults.font.family = "'Inter', sans-serif";

const soilCtx = document.getElementById('soilChart').getContext('2d');
const weatherCtx = document.getElementById('weatherChart').getContext('2d');
const waterCtx = document.getElementById('waterChart').getContext('2d');

const maxDataPoints = 30; // approx 60 seconds (updates every 2s)

const soilChart = new Chart(soilCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Soil Moisture (%)', data: [], borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.1)', borderWidth: 2, fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } }, animation: { duration: 0 }, elements: { point: { radius: 0 } } }
});

const weatherChart = new Chart(weatherCtx, {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [
            { label: 'Temperature (┬░C)', data: [], borderColor: '#f97316', borderWidth: 2, tension: 0.4, yAxisID: 'y' },
            { label: 'Humidity (%)', data: [], borderColor: '#0ea5e9', borderWidth: 2, tension: 0.4, yAxisID: 'y1' }
        ] 
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'linear', display: true, position: 'left' }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } }, animation: { duration: 0 }, elements: { point: { radius: 0 } } }
});

const waterChart = new Chart(waterCtx, {
    type: 'bar',
    data: { labels: ['Today'], datasets: [{ label: 'Water Used (Liters)', data: [0], backgroundColor: '#0ea5e9', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } }, animation: { duration: 0 }, elements: { point: { radius: 0 } } }
});

// --- ANALYTICS DATA ENGINE ---
let totalWaterLiters = 0;
let irrigationCount = 0;
let lastMotorState = 0;
let sumTemp = 0;
let sumMoist = 0;
let readingsCount = 0;

// Smart Insights & Alerts Tracking
let motorConsecutiveOnTicks = 0;
let highestTemp = -999;
let lowestMoist = 999;
let lastAlertTimestamp = 0;
let previousMoisture = null;
let startingMoistureBeforeIrrigation = null;
let drySoilConsecutiveTicks = 0;
let previousTankLevel = null;

// Energy & Motor Tracking
const POWER_KW = 0.5; // kW
const COST_PER_KWH = 6.0; // Ôé╣
let irrTicksToday = 0;
let irrTicksSession = 0;
let tankTicksToday = 0;
let tankTicksSession = 0;
let lastTankMotorState = 0;

// Flow rate constant (Liters per second of motor ON)
const FLOW_RATE_LPS = 0.5;
// the update is every 2 seconds roughly.
const SECONDS_PER_TICK = 2;

function formatRuntime(ticks) {
    let sec = ticks * SECONDS_PER_TICK;
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
}

window.processAnalytics = function(data) {
    try {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });

        // Arrays maintenance (Soil)
        if(soilChart.data.labels.length > maxDataPoints) {
            soilChart.data.labels.shift();
            soilChart.data.datasets[0].data.shift();
        }
        soilChart.data.labels.push(timeLabel);
        soilChart.data.datasets[0].data.push(data.moisture);
        soilChart.update();

        // Arrays maintenance (Weather)
        if(weatherChart.data.labels.length > maxDataPoints) {
            weatherChart.data.labels.shift();
            weatherChart.data.datasets[0].data.shift();
            weatherChart.data.datasets[1].data.shift();
        }
        weatherChart.data.labels.push(timeLabel);
        weatherChart.data.datasets[0].data.push(data.temperature);
        weatherChart.data.datasets[1].data.push(data.humidity);
        weatherChart.update();

        // Arrays maintenance (Motor)
        let anyMotorOn = 0;

        // Irrigation Motor Logic
        let currentIrrMotor = Number(data.soilMotor) === 1 ? 1 : 0;
        if(currentIrrMotor === 1) {
            anyMotorOn = 1;
            totalWaterLiters += (FLOW_RATE_LPS * SECONDS_PER_TICK);
            
            if(lastMotorState === 0) {
                irrigationCount++;
                startingMoistureBeforeIrrigation = Number(data.moisture) || 0;
                irrTicksSession = 0;
            }
            irrTicksSession++;
            irrTicksToday++;
            motorConsecutiveOnTicks++;
            
            // Alert: Dry Run Detection
            const currentTankLevel = Number(data.tankLevel ?? data.tankStatus ?? 0);
            if (previousTankLevel !== null && previousTankLevel === currentTankLevel && motorConsecutiveOnTicks > 3) {
                if (typeof triggerAlert === 'function') {
                    triggerAlert("warn", "Dry Run Detected", "Motor is actively running but water tank level is unchanged.");
                }
            }
        } else {
            if (lastMotorState === 1 && startingMoistureBeforeIrrigation !== null) {
                let gained = (Number(data.moisture) || 0) - startingMoistureBeforeIrrigation;
                const efficiencyEl = document.getElementById('insightEfficiency');
                if (efficiencyEl) efficiencyEl.innerText = `+${gained.toFixed(1)}% per cycle`;
                startingMoistureBeforeIrrigation = null;
            }
            motorConsecutiveOnTicks = 0;
        }
        lastMotorState = currentIrrMotor;

        // Tank Motor Logic
        let currentTankMotor = Number(data.waterMotor) === 1 ? 1 : 0;
        if(currentTankMotor === 1) {
            anyMotorOn = 1;
            if(lastTankMotorState === 0) tankTicksSession = 0;
            tankTicksSession++;
            tankTicksToday++;
        }
        lastTankMotorState = currentTankMotor;

        // Energy Math: E = P * t (in hours) => 0.5 kW * (seconds / 3600)
        let totalTicksToday = irrTicksToday + tankTicksToday;
        let totalTicksSession = irrTicksSession + tankTicksSession;
        let energyToday = POWER_KW * ((totalTicksToday * SECONDS_PER_TICK) / 3600);
        let energySession = POWER_KW * ((totalTicksSession * SECONDS_PER_TICK) / 3600);
        let costToday = energyToday * COST_PER_KWH;

        // Averages Tracking
        sumTemp += parseFloat(data.temperature);
        sumMoist += parseFloat(data.moisture);
        readingsCount++;
        const avgTemp = (sumTemp / readingsCount).toFixed(1);
        const avgMoist = (sumMoist / readingsCount).toFixed(1);

        // Smart Insights Calculations
        const dryingEl = document.getElementById('insightDrying');
        if (previousMoisture !== null && dryingEl) {
            let drop = previousMoisture - data.moisture;
            if (drop > 0) dryingEl.innerText = `-${drop.toFixed(1)}% / 2s`;
            else if (drop === 0) dryingEl.innerText = `Stable`;
        }
        previousMoisture = data.moisture;

        const envEl = document.getElementById('insightEnv');
        if (envEl) {
            let envMsg = "Nominal conditions.";
            if (data.temperature > 32 && data.humidity < 40) envMsg = "High evapotranspiration. Needs more water.";
            else if (data.temperature < 20 && data.humidity > 70) envMsg = "Low evaporation. Reduce watering.";
            envEl.innerText = envMsg;
        }

        // Weekly summary bounds
        if (data.temperature > highestTemp) highestTemp = data.temperature;
        if (data.moisture < lowestMoist) lowestMoist = data.moisture;
        
        // Alerts Triggering
        if (typeof triggerAlert === 'function') {
            if (motorConsecutiveOnTicks > 15) triggerAlert("warn", "Extended Irrigation Warning", "Motor has been running continuously for suspiciously long.");
            if (data.temperature > 40) triggerAlert("warn", "Critical Heat Anomaly", `Temperature exceeded 40┬░C (Current: ${data.temperature}┬░C)`);
            if (data.moisture < 20) {
                drySoilConsecutiveTicks++;
                if (drySoilConsecutiveTicks > 10) triggerAlert("warn", "Severe Soil Desiccation", "Soil moisture critically low for an extended period.");
            } else {
                drySoilConsecutiveTicks = 0;
            }
        }

        // Utilities
        const trkIrrTime = document.getElementById('trkIrrTime');
        const trkIrrSession = document.getElementById('trkIrrSession');
        const trkTankTime = document.getElementById('trkTankTime');
        const trkTankSession = document.getElementById('trkTankSession');
        
        if (trkIrrTime) { const val = formatRuntime(irrTicksToday); if (trkIrrTime.innerText !== val) trkIrrTime.innerText = val; }
        if (trkIrrSession) { const val = formatRuntime(irrTicksSession); if (trkIrrSession.innerText !== val) trkIrrSession.innerText = val; }
        if (trkTankTime) { const val = formatRuntime(tankTicksToday); if (trkTankTime.innerText !== val) trkTankTime.innerText = val; }
        if (trkTankSession) { const val = formatRuntime(tankTicksSession); if (trkTankSession.innerText !== val) trkTankSession.innerText = val; }
        
        const trkEnergyToday = document.getElementById('trkEnergyToday');
        const trkEnergySession = document.getElementById('trkEnergySession');
        const trkCostToday = document.getElementById('trkCostToday');
        
        if (trkEnergyToday) { const val = `${energyToday.toFixed(3)} kWh`; if (trkEnergyToday.innerText !== val) trkEnergyToday.innerText = val; }
        if (trkEnergySession) { const val = `${energySession.toFixed(3)} kWh`; if (trkEnergySession.innerText !== val) trkEnergySession.innerText = val; }
        if (trkCostToday) { const val = `₹ ${costToday.toFixed(2)}`; if (trkCostToday.innerText !== val) trkCostToday.innerText = val; }
        
        const powerDrawEl = document.getElementById('trkPowerDraw');
        if (powerDrawEl) {
            const txt = anyMotorOn ? `${POWER_KW} kW` : "0 kW";
            const cls = anyMotorOn ? 'clr-red' : 'clr-green';
            if (powerDrawEl.innerText !== txt) powerDrawEl.innerText = txt;
            if (powerDrawEl.className !== cls) powerDrawEl.className = cls;
        }

        // Update Reports DOM
        const repWater = document.getElementById('repWater');
        const repCycles = document.getElementById('repCycles');
        const repTemp = document.getElementById('repTemp');
        const repMoist = document.getElementById('repMoist');
        
        if (repWater) { const val = `${totalWaterLiters.toFixed(2)} L`; if (repWater.innerText !== val) repWater.innerText = val; }
        if (repCycles) { const val = irrigationCount.toString(); if (repCycles.innerText !== val) repCycles.innerText = val; }
        if (repTemp) { const val = `${avgTemp} °C`; if (repTemp.innerText !== val) repTemp.innerText = val; }
        if (repMoist) { const val = `${avgMoist} %`; if (repMoist.innerText !== val) repMoist.innerText = val; }
        
        const repTotalRuntime = document.getElementById('repTotalRuntime');
        const repTotalEnergy = document.getElementById('repTotalEnergy');
        const repTotalCost = document.getElementById('repTotalCost');
        
        if (repTotalRuntime) { const val = formatRuntime(totalTicksToday); if (repTotalRuntime.innerText !== val) repTotalRuntime.innerText = val; }
        if (repTotalEnergy) { const val = `${energyToday.toFixed(2)} kWh`; if (repTotalEnergy.innerText !== val) repTotalEnergy.innerText = val; }
        if (repTotalCost) { const val = `₹ ${costToday.toFixed(2)}`; if (repTotalCost.innerText !== val) repTotalCost.innerText = val; }

        const repHighTemp = document.getElementById('repHighTemp');
        const repLowMoist = document.getElementById('repLowMoist');
        if (repHighTemp) { const val = `${highestTemp.toFixed(1)} °C`; if (repHighTemp.innerText !== val) repHighTemp.innerText = val; }
        if (repLowMoist) { const val = `${lowestMoist.toFixed(1)} %`; if (repLowMoist.innerText !== val) repLowMoist.innerText = val; }
        
        // Weekly Estimates
        let weekEnergy = energyToday * 7;
        document.getElementById('repWeekWater').innerText = (totalWaterLiters * 7).toFixed(1);
        document.getElementById('repWeekEnergy').innerText = `${weekEnergy.toFixed(2)} kWh`;
        document.getElementById('repWeekCost').innerText = `Ôé╣ ${(weekEnergy * COST_PER_KWH).toFixed(2)}`;

        // Energy Insight logic
        const engInsight = document.getElementById('insightEnergyTxt');
        const engIcon = document.getElementById('insightEnergyIcon');
        if (engInsight && engIcon) {
            if (energyToday > 2.0) {
                engInsight.innerText = "High usage detected";
                engIcon.style.color = '#dc2626'; // red
            } else if (energyToday > 0.5) {
                engInsight.innerText = "Nominal usage today";
                engIcon.style.color = '#f59e0b'; // orange
            } else {
                engInsight.innerText = "Highly efficient";
                engIcon.style.color = '#10b981'; // green
            }
        }

        // Crop Health Indicator
        const led = document.getElementById('cropStatusLed');
        const txt = document.getElementById('cropStatusText');
        const desc = document.getElementById('cropStatusDesc');

        if (led && txt && desc) {
            led.className = 'status-circle';
            if (avgMoist > 40 && avgMoist < 80 && avgTemp > 20 && avgTemp < 30) {
                led.classList.add('good');
                led.innerHTML = "<i class='bx bx-check'></i>";
                txt.innerText = "Optimal Health";
                desc.innerText = "Soil moisture and thermal metrics are squarely in the optimal zone.";
            } else if (avgMoist < 25 || avgMoist > 90 || avgTemp > 38) {
                led.classList.add('critical');
                led.innerHTML = "<i class='bx bx-x'></i>";
                txt.innerText = "Critical Condition";
                desc.innerText = "Severe risk of wilting or waterlogging detected.";
            } else {
                led.innerHTML = "<i class='bx bx-minus'></i>";
                txt.innerText = "Moderate Warning";
                desc.innerText = "Metrics are drifting outside ideal bounds; system auto-correcting.";
            }
        }
        
        previousTankLevel = Number(data.tankLevel ?? data.tankStatus ?? 0);
    } catch (err) {
        console.error("CRITICAL ANALYTICS CRASH:", err);
        if (typeof triggerAlert === 'function') {
            triggerAlert("warn", "JS Execution Diagnostics", err.message);
        }
    }
};

// ALERTS HELPER
function triggerAlert(type, title, msg) {
    const now = new Date();
    if (now.getTime() - lastAlertTimestamp < 10000) return; // Anti-spam 10s cooldown
    lastAlertTimestamp = now.getTime();
    
    const container = document.getElementById('alertsLogContainer');
    const noAlerts = document.getElementById('noAlertsMsg');
    if(noAlerts) noAlerts.style.display = 'none';

    const box = document.createElement('div');
    box.className = `alert-box ${type}`;
    box.innerHTML = `
        <div class="insight-icon" style="font-size: 1.8rem; color: ${type==='warn'?'#f59e0b':'#dc2626'};"><i class='bx bx-error'></i></div>
        <div>
            <div class="alert-time">${now.toLocaleTimeString()}</div>
            <div class="alert-title">${title}</div>
            <div class="alert-msg">${msg}</div>
        </div>
    `;
    container.prepend(box);
    if (container.children.length > 20) container.removeChild(container.lastChild);
}

document.getElementById('btnClearAlerts')?.addEventListener('click', () => {
    document.getElementById('alertsLogContainer').innerHTML = `<div style="padding: 1rem; background: #f8fafc; border-radius: 8px; text-align: center; color: var(--text-muted); font-style: italic;" id="noAlertsMsg">No critical alerts detected. The system is operating nominally.</div>`;
});
