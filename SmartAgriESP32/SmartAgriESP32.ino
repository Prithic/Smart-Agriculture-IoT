#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Firebase_ESP_Client.h>
 #include "secrets.h"

// Provide the RTDB payload printing helper and sign-in helper
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>


// ===== WIFI =====
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

// ===== FIREBASE =====
// Note: DATABASE_URL and DATABASE_SECRET are defined in secrets.h

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long sendDataPrevMillis = 0;
bool signupOK = false;


// ===== PINS =====
#define DHTPIN 4
#define DHTTYPE DHT22
#define SOIL_PIN 34
#define TANK_LOW 14
#define TANK_HIGH 27
#define WATER_MOTOR_PIN 18
#define SOIL_MOTOR_PIN 19

// ===== OBJECTS =====
DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);

// ===== STATE =====
bool autoMode = true;
bool waterMotor = false;
bool soilMotor = false;
float temperature = 0;
float humidity = 0;
float moisture = 0;
int tankLevel = 0; 
long pendingBaud = 0;
unsigned long baudChangeTime = 0;

// ===== LOGGING SYSTEM =====
String systemLogs = ""; // Store last few logs
void addSystemLog(String msg) {
  if (systemLogs.length() > 500) systemLogs = ""; // Simple clear
  systemLogs += msg + "\n";
  Serial.println("SYSTEM: " + msg);
}

// ===== FIREBASE INIT =====
void initFirebase() {
  config.database_url = DATABASE_URL;
  config.signer.tokens.legacy_token = DATABASE_SECRET;
  Firebase.reconnectWiFi(true);
  Firebase.begin(&config, &auth);
  addSystemLog("Firebase Initializing...");
}

// ===== FIREBASE SYNC =====
void syncFirebase() {
  if (Firebase.ready() && (millis() - sendDataPrevMillis > 2500 || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();

    bool success = true;
    
    // 1. Send Sensor Data
    if (!Firebase.RTDB.setFloat(&fbdo, "/sensor/temperature", temperature)) success = false;
    if (!Firebase.RTDB.setFloat(&fbdo, "/sensor/humidity", humidity)) success = false;
    if (!Firebase.RTDB.setInt(&fbdo, "/sensor/moisture", (int)moisture)) success = false;
    if (!Firebase.RTDB.setInt(&fbdo, "/sensor/tankLevel", tankLevel)) success = false;

    if (success) {
      Serial.println("FIREBASE: Data sent successfully");
    } else {
      Serial.print("FIREBASE: Data send failed: ");
      Serial.println(fbdo.errorReason());
    }

    // 2. Read Control Data
    // Mode
    if (Firebase.RTDB.getString(&fbdo, "/control/mode")) {
      if (fbdo.dataType() == "string") {
        String m = fbdo.stringData();
        if (m == "AUTO") {
          if (!autoMode) {
            autoMode = true;
            addSystemLog("FIREBASE: Mode switched to AUTO");
          }
        } else if (m == "MANUAL") {
          if (autoMode) {
            autoMode = false;
            addSystemLog("FIREBASE: Mode switched to MANUAL");
          }
        }
      }
    }

    // Motors (Only if MANUAL)
    if (!autoMode) {
      if (Firebase.RTDB.getInt(&fbdo, "/control/waterMotor")) {
        bool val = (fbdo.intData() == 1);
        if (waterMotor != val) {
          waterMotor = val;
          addSystemLog("FIREBASE: Tank Motor " + String(waterMotor ? "ON" : "OFF"));
        }
      }
      if (Firebase.RTDB.getInt(&fbdo, "/control/soilMotor")) {
        bool val = (fbdo.intData() == 1);
        if (soilMotor != val) {
          soilMotor = val;
          addSystemLog("FIREBASE: Soil Motor " + String(soilMotor ? "ON" : "OFF"));
        }
      }
    }
  }
}

// ===== SENSOR UPDATE =====

void updateSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if(!isnan(t)) temperature = t;
  if(!isnan(h)) humidity = h;

  int rawSoil = analogRead(SOIL_PIN);
  moisture = map(rawSoil, 4095, 0, 0, 100); 

  int low = digitalRead(TANK_LOW);
  int high = digitalRead(TANK_HIGH);
  if (low == HIGH && high == HIGH) tankLevel = 0;       
  else if (low == LOW && high == HIGH) tankLevel = 50;  
  else tankLevel = 100;                                 
}

// ===== AUTOMATION =====
void runAutomation() {
  if (!autoMode) return;

  bool prevWater = waterMotor;
  bool prevSoil = soilMotor;

  if (tankLevel <= 20) waterMotor = true;
  else if (tankLevel >= 90) waterMotor = false;

  if (moisture < 40 && tankLevel > 0) {
    soilMotor = true;
  } else if (moisture > 80 || tankLevel == 0) {
    soilMotor = false;
  }

  if (waterMotor != prevWater) addSystemLog("AUTO: Tank Motor " + String(waterMotor ? "ON" : "OFF"));
  if (soilMotor != prevSoil) addSystemLog("AUTO: Irrigation " + String(soilMotor ? "ON" : "OFF"));
}

// ===== HARDWARE SYNC =====
void syncHardware() {
  digitalWrite(WATER_MOTOR_PIN, waterMotor ? LOW : HIGH); 
  digitalWrite(SOIL_MOTOR_PIN, soilMotor ? LOW : HIGH);
}

// ===== COMMAND EXECUTION =====
String executeCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  String result = "";

  if (cmd == "TANK_ON") {
    waterMotor = true; autoMode = false;
    result = "Tank Motor ON";
  }
  else if (cmd == "TANK_OFF") {
    waterMotor = false; autoMode = false;
    result = "Tank Motor OFF";
  }
  else if (cmd == "IRR_ON") {
    soilMotor = true; autoMode = false;
    result = "Irrigation ON";
  }
  else if (cmd == "IRR_OFF") {
    soilMotor = false; autoMode = false;
    result = "Irrigation OFF";
  }
  else if (cmd == "AUTO") {
    autoMode = true;
    result = "Mode: AUTO";
  }
  else if (cmd == "MANUAL") {
    autoMode = false;
    result = "Mode: MANUAL";
  }
  else if (cmd.startsWith("BAUD_")) {
    long newBaud = cmd.substring(5).toInt();
    if (newBaud > 0) {
      pendingBaud = newBaud;
      baudChangeTime = millis() + 500;
      result = "Baud rate changing to " + String(newBaud);
    }
  }
  else if (cmd == "STATUS") {
    updateSensors();
    result = "T:" + String(temperature) + " H:" + String(humidity) + " M:" + String(moisture) + " Tank:" + String(tankLevel);
  }
  else {
    result = "Unknown Command: " + cmd;
  }

  addSystemLog(result);
  return result;
}

// ===== API HANDLERS =====
void handleData() {
  updateSensors();
  StaticJsonDocument<1024> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["moisture"] = moisture;
  doc["tankLevel"] = tankLevel;
  doc["waterMotor"] = waterMotor ? 1 : 0;
  doc["soilMotor"] = soilMotor ? 1 : 0;
  doc["mode"] = autoMode ? "AUTO" : "MANUAL";
  doc["logs"] = systemLogs;
  
  systemLogs = ""; // Clear buffer after sending to web

  String response;
  serializeJson(doc, response);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", response);
}

void handleControl() {
  String response = "";
  if (server.hasArg("tank")) {
    response = executeCommand(server.arg("tank").toInt() == 1 ? "TANK_ON" : "TANK_OFF");
  }
  if (server.hasArg("soil")) {
    if (response != "") response += " | ";
    response += executeCommand(server.arg("soil").toInt() == 1 ? "IRR_ON" : "IRR_OFF");
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", response);
}

void handleMode() {
  String response = "";
  if (server.hasArg("state")) {
    response = executeCommand(server.arg("state") == "auto" ? "AUTO" : "MANUAL");
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", response);
}

void handleSerial() {
  if (server.hasArg("cmd")) {
    String response = executeCommand(server.arg("cmd"));
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", response);
  } else {
    server.send(400, "text/plain", "Missing cmd");
  }
}

void checkSerial() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      addSystemLog("> " + input);
      executeCommand(input);
    }
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(WATER_MOTOR_PIN, OUTPUT);
  pinMode(SOIL_MOTOR_PIN, OUTPUT);
  pinMode(TANK_LOW, INPUT_PULLUP);
  pinMode(TANK_HIGH, INPUT_PULLUP);
  digitalWrite(WATER_MOTOR_PIN, HIGH);
  digitalWrite(SOIL_MOTOR_PIN, HIGH);
  dht.begin();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nReady! IP: " + WiFi.localIP().toString());

  server.on("/data", handleData);
  server.on("/control", handleControl);
  server.on("/mode", handleMode);
  server.on("/serial", handleSerial);
  server.begin();
  initFirebase();
}

void loop() {
  server.handleClient();
  checkSerial();
  syncFirebase();
  if (pendingBaud > 0 && millis() > baudChangeTime) {
    Serial.end(); delay(100); Serial.begin(pendingBaud);
    pendingBaud = 0;
  }
  updateSensors();
  if (autoMode) runAutomation();
  syncHardware();
}