// analytics.js
// --- TAB NAVIGATION ---
const tabBtns = document.querySelectorAll('.tab-btn');
const viewSections = document.querySelectorAll('.view-section');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class
        tabBtns.forEach(b => b.classList.remove('active'));
        viewSections.forEach(v => v.classList.remove('active'));
        
        // Add active class
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target')).classList.add('active');
    });
});

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
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } }, animation: { duration: 0 } }
});

const weatherChart = new Chart(weatherCtx, {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [
            { label: 'Temperature (°C)', data: [], borderColor: '#f97316', borderWidth: 2, tension: 0.4, yAxisID: 'y' },
            { label: 'Humidity (%)', data: [], borderColor: '#0ea5e9', borderWidth: 2, tension: 0.4, yAxisID: 'y1' }
        ] 
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'linear', display: true, position: 'left' }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } }, animation: { duration: 0 } }
});

const waterChart = new Chart(waterCtx, {
    type: 'bar',
    data: { labels: ['Today'], datasets: [{ label: 'Water Used (Liters)', data: [0], backgroundColor: '#0ea5e9', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } }, animation: { duration: 0 } }
});

// --- ANALYTICS DATA ENGINE ---
let totalWaterLiters = 0;
let irrigationCount = 0;
let lastMotorState = 0;
let sumTemp = 0;
let sumMoist = 0;
let readingsCount = 0;

// Flow rate constant (Liters per second of motor ON)
const FLOW_RATE_LPS = 0.5;
// the update is every 2 seconds roughly.
const SECONDS_PER_TICK = 2;

window.processAnalytics = function(data) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' });

    // Arrays maintenance (Soil)
    if(soilChart.data.labels.length > maxDataPoints) {
        soilChart.data.labels.shift();
        soilChart.data.datasets[0].data.shift();
    }
    soilChart.data.labels.push(timeLabel);
    soilChart.data.datasets[0].data.push(data.soilMoisture);
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

    // Water Usage & Cycles
    if(data.irrigationMotor === 1) {
        // Motor is on during this 2-second tick
        totalWaterLiters += (FLOW_RATE_LPS * SECONDS_PER_TICK);
        
        // Count cycles (edge detection 0 to 1)
        if(lastMotorState === 0) irrigationCount++;
    }
    lastMotorState = data.irrigationMotor;
    
    // Update Water bar chart
    waterChart.data.datasets[0].data[0] = parseFloat(totalWaterLiters.toFixed(2));
    waterChart.update();

    // Averages Tracking
    sumTemp += parseFloat(data.temperature);
    sumMoist += parseFloat(data.soilMoisture);
    readingsCount++;
    const avgTemp = (sumTemp / readingsCount).toFixed(1);
    const avgMoist = (sumMoist / readingsCount).toFixed(1);

    // Update Reports DOM
    document.getElementById('repWater').innerText = `${totalWaterLiters.toFixed(2)} L`;
    document.getElementById('repCycles').innerText = irrigationCount;
    document.getElementById('repTemp').innerText = `${avgTemp} °C`;
    document.getElementById('repMoist').innerText = `${avgMoist} %`;

    // Crop Health Indicator
    const led = document.getElementById('cropStatusLed');
    const txt = document.getElementById('cropStatusText');
    const desc = document.getElementById('cropStatusDesc');

    led.className = 'status-circle'; // reset
    if (avgMoist > 40 && avgMoist < 80 && avgTemp > 20 && avgTemp < 30) {
        led.classList.add('good');
        led.innerHTML = "<i class='bx bx-check'></i>";
        txt.innerText = "Optimal Health";
        desc.innerText = "Soil moisture and thermal metrics are squarely in the optimal zone.";
    } else if (avgMoist < 30 || avgMoist > 90 || avgTemp > 35) {
        led.classList.add('critical');
        led.innerHTML = "<i class='bx bx-x'></i>";
        txt.innerText = "Critical Condition";
        desc.innerText = "Severe risk of wilting or waterlogging detected.";
    } else {
        // Moderate (yellow, default)
        led.innerHTML = "<i class='bx bx-minus'></i>";
        txt.innerText = "Moderate Warning";
        desc.innerText = "Metrics are drifting outside ideal bounds; system auto-correcting.";
    }
};
