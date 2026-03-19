# Smart Agriculture System

An advanced IoT-based farm automation and monitoring dashboard designed for optimized agricultural management. This system provides real-time telemetry, automated irrigation, energy tracking, and intelligent insights to empower modern farming.

## 🚀 Features

- **Real-Time Telemetry**: Monitor field temperature, humidity, soil moisture, and water tank levels in real-time.
- **Dual Motor Control**: 
  - **Tank Fill Motor**: Automated/Manual control to manage water source to storage.
  - **Irrigation Motor**: Automated/Manual control for precise field watering.
- **Smart Automation**: Built-in logic to trigger motors based on soil moisture and tank level thresholds.
- **Visual Flow Topology**: An interactive SVG-based system map showing the state of the well, tank, and field.
- **Advanced Analytics**:
  - **Soil Moisture Trends**: Line charts for moisture levels over time.
  - **Weather Monitoring**: Temperature and humidity tracking.
  - **Water & Energy Usage**: Detailed estimation of water dispensed (Liters) and energy consumed (kWh/Cost).
- **Intelligent Alerts**: Real-time notifications for critical conditions like "Dry Run Detected", "Overheating", or "Severe Soil Desiccation".
- **Built-in Serial Monitor**: Interactive terminal for debugging and manual system commands.
- **Simulation Mode**: Integrated simulation fallback for testing without physical ESP32/IoT hardware.

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Modern Glassmorphism Design).
- **Libraries**: 
  - [Chart.js](https://www.chartjs.org/) for data visualization.
  - [Boxicons](https://boxicons.com/) for iconography.
  - Inter Google Font for clean typography.
- **Logic**: Vanilla JavaScript (Modular architecture).
- **Backend (Expected)**: ESP32 or similar edge devices with an HTTP API.

## 📁 Project Structure

- `index.html`: The main dashboard structure and layout.
- `style.css`: Comprehensive styling for the premium UI.
- `script.js`: Core logic for API polling, UI updates, and manual controls.
- `analytics.js`: Data engine for charts, usage tracking, and intelligent insights.

## 🔧 Getting Started

1. **Local Development**: Simply open `index.html` in a modern web browser.
2. **Hardware Integration**: Update `BASE_URL` in `script.js` to point to your IoT device endpoint (e.g., `http://192.168.1.100`).
3. **Simulation**: If no API is detected, the system automatically enters a sophisticated simulation mode.

## 📊 Analytics & Reporting

The system includes a dedicated "Reports" view that provides:
- Daily Summary Matrix (Total water, cycles, average metrics).
- Weekly Summary Prototypes (Estimated usage and costs).
- Crop Health Indicator (Aggregate status based on telemetry).

---
Developed for the **Smart Agriculture IoT** initiative.
