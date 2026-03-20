# 🌱 Smart Agriculture IoT Dashboard

An advanced, premium IoT-based farm automation and monitoring dashboard. Designed for high-performance agricultural management, providing real-time telemetry, automated irrigation, energy tracking, and intelligent crop health insights.

---

## 🌟 Key Features

### 📡 Real-Time Monitoring
- **Precision Telemetry**: Track field temperature, humidity, and soil moisture with high accuracy.
- **Fluid Dynamics**: Monitor water tank levels in real-time with interactive visual feedback.
- **Heartbeat System**: Visual connection status indicator for ESP32/Edge devices.

### ⚙️ Intelligent Control
- **Dual Motor Automation**:
  - **Tank Fill System**: Manages water intake from source to storage.
  - **Irrigation System**: Precisely waters fields based on crop needs.
- **Hybrid Modes**: Toggle between **Automated Intelligence** and **Manual Override**.
- **Safety Cutoffs**: Integrated logic to prevent dry-running and overheating.

### 📊 Advanced Analytics & Reports
- **Dynamic Charting**: Visualize soil moisture trends and atmospheric conditions over time.
- **Usage Tracking**: Estimation of water dispensed (Liters) and energy consumed (kWh).
- **Economic Insights**: Real-time cost estimation for power usage.
- **Crop Health Indicator**: Aggregate health score based on sensor data fusion.

### 🛠️ Hardware Diagnostics
- **Built-in Serial Monitor**: Interactive terminal for real-time debugging and command execution.
- **Flow Topology**: Interactive SVG map showing the active state of the entire farm ecosystem.
- **Simulation Mode**: Instant fallback to simulation if hardware is offline.

---

## 🛠️ Technology Stack

- **Core**: HTML5, Vanilla JavaScript.
- **Styling**: Modern CSS3 with **Glassmorphism** aesthetics.
- **Visualization**: [Chart.js](https://www.chartjs.org/) for high-performance rendering.
- **Iconography**: [Boxicons](https://boxicons.com/).
- **Typography**: Inter (Google Fonts).

---

## 🔌 Hardware Integration (Recommended)

To deploy this in a real-world scenario, you will need:
- **MCU**: ESP32 (Recommended for built-in Wi-Fi).
- **Sensors**: 
  - DHT22 (Temperature & Humidity).
  - Capacitive Soil Moisture Sensor.
  - HC-SR04 Ultrasonic Sensor (Tank Level).
- **Actuators**: 
  - 2-Channel Relay Module (for Motors).
  - Water Pumps (Intake & Irrigation).

---

## 🚀 Getting Started

### 💻 Local Development
1. Clone the repository.
2. Open `index.html` in any modern web browser.
3. The system will automatically start in **Simulation Mode** if no ESP32 is detected.

### 🛰️ Hardware Setup
1. Flash your ESP32 with the provided firmware in the `SmartAgriESP32/` directory.
2. Ensure the ESP32 and your computer are on the same network.
3. Update the `BASE_URL` in `script.js` to match your ESP32's IP address.
   ```javascript
   const BASE_URL = "http://192.168.1.100"; // Replace with your device IP
   ```

---

## 📂 Project Structure

- `index.html` - The primary dashboard entry point.
- `style.css` - Premium UI styling and animations.
- `script.js` - Core logic, API polling, and manual overrides.
- `analytics.js` - Data engine, charting, and intelligent notifications.
- `SmartAgriESP32/` - ESP32 firmware source code (`SmartAgriESP32.ino`).

---

## 🔮 Future Roadmap

- [ ] Multi-Field Support (Manage multiple zones from one dashboard).
- [ ] Mobile App Integration (Flutter/React Native).
- [ ] AI Prediction (Yield estimation based on historical data).
- [ ] Cloud Data Logging (Firebase/AWS IoT integration).

---
Developed for the **Smart Agriculture IoT** initiative. 🌿
---