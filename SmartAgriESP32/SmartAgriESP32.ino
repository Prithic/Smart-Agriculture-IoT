#include <WiFi.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Firebase_ESP_Client.h>
#include "secrets.h"

// Provide the RTDB payload printing helper and sign-in helper
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// ===== FORWARD DECLARATIONS =====
void updateSensors();
void runAutomation();
void syncHardware();
void initFirebase();
void syncFirebase();
String executeCommand(String cmd);

// ===== WIFI =====
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

// ===== FIREBASE =====
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long sendDataPrevMillis = 0;

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

// ===== STATE =====
bool autoMode = true;
bool waterMotor = false;
bool soilMotor = false;
float temperature = 0;
float humidity = 0;
float moisture = 0;
int tankLevel = 0; 

// ===== LOGGING SYSTEM =====
const int MAX_LOG_LINES = 30;
String logLines[MAX_LOG_LINES];
int logCount = 0;
int globalLogIndex = 0;
bool logsChanged = false;

void addSystemLog(String msg) {
  Serial.println(msg);
  String entry = String(globalLogIndex++) + "|" + msg;
  
  if (logCount >= MAX_LOG_LINES) {
    for (int i = 1; i < MAX_LOG_LINES; i++) {
        logLines[i - 1] = logLines[i];
    }
    logLines[MAX_LOG_LINES - 1] = entry;
  } else {
    logLines[logCount++] = entry;
  }
  logsChanged = true;
}

String getLogsString() {
  String result = "";
  for(int i = 0; i < logCount; i++) {
    result += logLines[i] + "\n";
  }
  return result;
}

// ===== FIREBASE INIT =====
void initFirebase() {
  config.database_url = DATABASE_URL;
  config.signer.tokens.legacy_token = DATABASE_SECRET;
  Firebase.reconnectWiFi(true);
  Firebase.begin(&config, &auth);
  Serial.println("Firebase Connected");
}

// ===== FIREBASE SYNC =====
void syncFirebase() {
  if (Firebase.ready() && (millis() - sendDataPrevMillis > 3000 || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();

    String basePath = "/users/" + String(USER_ID) + "/devices/" + String(DEVICE_ID);
    bool success = true;
    
    // 1. Send Sensor Data
    if (!Firebase.RTDB.setFloat(&fbdo, basePath + "/sensor/temperature", temperature)) success = false;
    if (!Firebase.RTDB.setFloat(&fbdo, basePath + "/sensor/humidity", humidity)) success = false;
    if (!Firebase.RTDB.setInt(&fbdo, basePath + "/sensor/moisture", (int)moisture)) success = false;
    if (!Firebase.RTDB.setInt(&fbdo, basePath + "/sensor/tankLevel", tankLevel)) success = false;
    
    // 2. Heartbeat (lastActive)
    if (!Firebase.RTDB.setTimestamp(&fbdo, basePath + "/meta/lastActive")) success = false;

    if (logsChanged) {
        if (Firebase.RTDB.setString(&fbdo, basePath + "/meta/logs", getLogsString())) {
            logsChanged = false;
        }
    }

    if (success) {
      static int syncCount = 0;
      if (syncCount++ % 20 == 0) addSystemLog("Sending Data..."); // Reduce spam
    } else {
      addSystemLog("Sync failed: " + fbdo.errorReason());
    }

    // 3. Read Control Data
    if (Firebase.RTDB.getString(&fbdo, basePath + "/control/mode")) {
      if (fbdo.dataType() == "string") {
        String m = fbdo.stringData();
        if (m == "AUTO" && !autoMode) {
          addSystemLog("CMD RECEIVED: mode AUTO");
          autoMode = true;
          Firebase.RTDB.setString(&fbdo, basePath + "/control/mode", "AUTO");
          addSystemLog("EXECUTED: mode AUTO");
        } else if (m == "MANUAL" && autoMode) {
          addSystemLog("CMD RECEIVED: mode MANUAL");
          autoMode = false;
          Firebase.RTDB.setString(&fbdo, basePath + "/control/mode", "MANUAL");
          addSystemLog("EXECUTED: mode MANUAL");
        }
      }
    }

    if (!autoMode) {
      if (Firebase.RTDB.getInt(&fbdo, basePath + "/control/waterMotor")) {
        bool val = (fbdo.intData() == 1);
        if (waterMotor != val) {
          addSystemLog("CMD RECEIVED: waterMotor " + String(val ? "ON" : "OFF"));
          waterMotor = val;
          Firebase.RTDB.setInt(&fbdo, basePath + "/control/waterMotor", waterMotor ? 1 : 0);
          addSystemLog("EXECUTED: waterMotor " + String(val ? "ON" : "OFF"));
        }
      }
      if (Firebase.RTDB.getInt(&fbdo, basePath + "/control/soilMotor")) {
        bool val = (fbdo.intData() == 1);
        if (soilMotor != val) {
          addSystemLog("CMD RECEIVED: soilMotor " + String(val ? "ON" : "OFF"));
          soilMotor = val;
          Firebase.RTDB.setInt(&fbdo, basePath + "/control/soilMotor", soilMotor ? 1 : 0);
          addSystemLog("EXECUTED: soilMotor " + String(val ? "ON" : "OFF"));
        }
      }
    } else {
      Firebase.RTDB.setInt(&fbdo, basePath + "/control/waterMotor", waterMotor ? 1 : 0);
      Firebase.RTDB.setInt(&fbdo, basePath + "/control/soilMotor", soilMotor ? 1 : 0);
    }

    // 4. Cloud Serial Command
    if (Firebase.RTDB.getString(&fbdo, basePath + "/control/command")) {
      if (fbdo.dataType() == "string") {
        String cmd = fbdo.stringData();
        if (cmd != "" && cmd != "NONE") {
          addSystemLog("CMD RECEIVED: " + cmd);
          String execRes = executeCommand(cmd);
          addSystemLog("EXECUTED: " + execRes);
          // Clear command once executed
          Firebase.RTDB.setString(&fbdo, basePath + "/control/command", "NONE");
        }
      }
    }
  }
}

// ===== SENSOR UPDATE (TEST MODE - NO SENSORS) =====
void updateSensors() {
  // Generate random data to test Firebase and Dashboard without physical hardware
  temperature = random(20, 36);
  humidity = random(40, 81);
  moisture = random(30, 91);
  tankLevel = random(10, 101);
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
  
  String result = "UNKNOWN CMD";
  if (cmd == "AUTO") { autoMode = true; result = "AUTO"; }
  else if (cmd == "MANUAL") { autoMode = false; result = "MANUAL"; }
  else if (cmd == "STATUS") { 
    updateSensors(); 
    result = "T:" + String((int)temperature) + " H:" + String((int)humidity); 
  }
  else if (cmd == "TANK_ON") { waterMotor = true; autoMode = false; result = "Tank ON"; }
  else if (cmd == "TANK_OFF") { waterMotor = false; autoMode = false; result = "Tank OFF"; }
  else if (cmd == "IRR_ON") { soilMotor = true; autoMode = false; result = "Irrigation ON"; }
  else if (cmd == "IRR_OFF") { soilMotor = false; autoMode = false; result = "Irrigation OFF"; }
  else if (cmd.startsWith("BAUD_")) {
    long newBaud = cmd.substring(5).toInt();
    if (newBaud > 0) {
      pendingBaud = newBaud;
      baudChangeTime = millis() + 500;
      result = "Baud rate changing to " + String(newBaud);
    }
  }
  
  return result;
}

void checkSerial() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      addSystemLog("CMD RECEIVED: " + input);
      String res = executeCommand(input);
      addSystemLog("EXECUTED: " + res);
    }
  }
}

void setup() {
  Serial.begin(9600);
  addSystemLog("Booting...");
  pinMode(WATER_MOTOR_PIN, OUTPUT);
  pinMode(SOIL_MOTOR_PIN, OUTPUT);
  pinMode(TANK_LOW, INPUT_PULLUP);
  pinMode(TANK_HIGH, INPUT_PULLUP);
  digitalWrite(WATER_MOTOR_PIN, HIGH);
  digitalWrite(SOIL_MOTOR_PIN, HIGH);
  dht.begin();
  
  WiFi.begin(ssid, password);
  
  Serial.print("WiFi Connecting...");
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  addSystemLog("WiFi Connected");
  
  initFirebase();
}

void loop() {
  checkSerial();
  syncFirebase();
  updateSensors();
  if (autoMode) runAutomation();
  syncHardware();
}