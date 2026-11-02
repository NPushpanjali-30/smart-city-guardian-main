# Smart City Guardian: Desktop (macOS) & Mobile (Android) Packaging Guide

## 1. Overview

Smart City Guardian has been compiled and packaged into native applications for both **macOS** and **Android (APK)**:

```
                                  Smart City Guardian Platform
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
                     v                                                   v
        Native macOS Desktop App                               Native Android APK
  - Framework: Electron 33 & Packager                   - Framework: Capacitor 8 & Android Gradle
  - Output: `Smart City Guardian.app` & `.dmg`          - Output: `SmartCityGuardian.apk`
  - macOS Titlebar: `hiddenInset` traffic lights         - Permissions: GPS, Network, Notifications
  - macOS App Menu & System Tray                         - Fully self-contained offline bundle
  - Native Desktop NotificationCenter                    - Hardware accelerated webview
```

---

## 2. Release Artifacts Inventory

All production bundles are pre-compiled and located in the [`release/`](file:///Volumes/maha/smart%20city%20guardian/release) directory:

| Artifact | Platform | Format | Size | Location |
|---|---|---|---|---|
| **macOS App Bundle** | macOS (Apple Silicon arm64) | `.app` Directory Bundle | ~280 MB | [`release/Smart City Guardian.app`](file:///Volumes/maha/smart%20city%20guardian/release/Smart%20City%20Guardian.app) |
| **macOS Disk Image** | macOS (Universal / arm64) | `.dmg` Apple Disk Image | 311 MB | [`release/SmartCityGuardian-macOS.dmg`](file:///Volumes/maha/smart%20city%20guardian/release/SmartCityGuardian-macOS.dmg) |
| **Android APK** | Android (API 29–36, v2.0.0) | `.apk` Native Package | 9.8 MB | [`release/SmartCityGuardian.apk`](file:///Volumes/maha/smart%20city%20guardian/release/SmartCityGuardian.apk) |

---

## 3. macOS Application Architecture & Capabilities

### 3.1 App Structure (`apps/desktop`)
- **Main Process**: [`apps/desktop/src/main.cjs`](file:///Volumes/maha/smart%20city%20guardian/apps/desktop/src/main.cjs)
- **Preload Bridge**: [`apps/desktop/src/preload.cjs`](file:///Volumes/maha/smart%20city%20guardian/apps/desktop/src/preload.cjs)
- **Embedded Web Assets**: [`apps/desktop/web-dist/`](file:///Volumes/maha/smart%20city%20guardian/apps/desktop/web-dist)

### 3.2 Native macOS Integrations
1. **Apple Native Window Frame**: Configured with `titleBarStyle: 'hiddenInset'` and `trafficLightPosition: { x: 18, y: 18 }`, seamlessly blending window controls into the sleek dark UI.
2. **macOS Native Application Menu**:
   - `Cmd+1`: Instant jump to Dashboard
   - `Cmd+2`: Open Live Risk Map
   - `Cmd+3`: Open Emergency Alerts
   - `Cmd+4`: Open EOC Authority Control Center
   - `Cmd+Shift+B`: Trigger EOC Emergency Broadcast
3. **NotificationCenter Integration**: Broadcasts system-level notification banners directly into macOS NotificationCenter.
4. **Dual Server Resolver**:
   - Detects if Vite local dev server (`http://localhost:5173`) is active for live hot-reloading.
   - If offline, automatically starts an embedded lightweight internal HTTP server serving the production bundle with client-side SPA routing.

### 3.3 How to Launch & Install on macOS
- **Direct Run**: Double-click [`release/Smart City Guardian.app`](file:///Volumes/maha/smart%20city%20guardian/release/Smart%20City%20Guardian.app) or run in terminal:
  ```bash
  open "release/Smart City Guardian.app"
  ```
- **Install from DMG**: Double-click [`release/SmartCityGuardian-macOS.dmg`](file:///Volumes/maha/smart%20city%20guardian/release/SmartCityGuardian-macOS.dmg) and drag the application to your `/Applications` folder.

---

## 4. Android Application Architecture & Capabilities

### 4.1 App Structure (`apps/web/android`)
- **Framework**: Capacitor 8.0 with Android Gradle Plugin.
- **Config**: [`apps/web/capacitor.config.ts`](file:///Volumes/maha/smart%20city%20guardian/apps/web/capacitor.config.ts)
- **Manifest**: [`apps/web/android/app/src/main/AndroidManifest.xml`](file:///Volumes/maha/smart%20city%20guardian/apps/web/android/app/src/main/AndroidManifest.xml)
- **Application ID**: `org.smartcity.guardian`
- **Application Name**: `Smart City Guardian`

### 4.2 Native Android Capabilities & Disaster Early Warning
- **Version**: Version Code `2`, Version Name `2.0.0`
- **Native Disaster Notification Engine**:
  - Direct integration with `@capacitor/local-notifications` creating a high-priority Android Notification Channel (`disaster-alerts`, `IMPORTANCE_HIGH`) with heads-up banner, red LED lighting, and vibration patterns.
  - Web Audio synthesized dual-tone emergency alert siren (880 Hz / 698 Hz pulses) working across all devices.
  - Persistent in-app emergency heads-up warning banner with instant "View Safe Evacuation Route" action.
  - Automated early warning triggers from real-time hydrology predictions, cloudburst alerts, and proximity monitoring within 10 km.
  - One-click disaster drill simulation buttons directly from the Navbar and Alerts center.
- **Permissions**:
  - `android.permission.INTERNET` (API telemetry & live WebSocket streams)
  - `android.permission.ACCESS_NETWORK_STATE` (Network offline/online monitoring)
  - `android.permission.ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION` (Citizen GPS routing & proximity alerts)
  - `android.permission.POST_NOTIFICATIONS` (Android 13+ push and disaster early warning notifications)
  - `android.permission.VIBRATE` (Emergency alert haptic vibration)
  - `android.permission.WAKE_LOCK` (Screen wake for critical life-safety alerts)
- **Local Network Support**: `android:usesCleartextTraffic="true"` configured to allow communication with local EOC servers or edge Wi-Fi gateways.
- **Assets Bundling**: All production web assets are pre-packaged into `assets/public/` within the APK, allowing full offline boot without requiring an active internet connection.

### 4.3 How to Install on Android
1. **Transfer to Device**: Connect Android phone via USB or download [`release/SmartCityGuardian.apk`](file:///Volumes/maha/smart%20city%20guardian/release/SmartCityGuardian.apk).
2. **Install via ADB (Command Line)**:
   ```bash
   adb install -r release/SmartCityGuardian.apk
   ```
3. **Manual Install**: Enable "Install from Unknown Sources" on Android, open `SmartCityGuardian.apk` in Files, and tap **Install**.

---

## 5. Rebuilding Desktop & Mobile Artifacts

### Rebuilding the macOS App:
```bash
npm run build:web
cp -r apps/web/dist apps/desktop/web-dist
npx @electron/packager apps/desktop "Smart City Guardian" --platform=darwin --arch=arm64 --electron-version=33.4.11 --out=apps/desktop/dist --overwrite
cp -r "apps/desktop/dist/Smart City Guardian-darwin-arm64/Smart City Guardian.app" "release/Smart City Guardian.app"
hdiutil create -volname "Smart City Guardian" -srcfolder "release/Smart City Guardian.app" -ov -format UDZO "release/SmartCityGuardian-macOS.dmg"
```

### Rebuilding the Android APK:
```bash
npm run build:web
npx cap sync android --target=apps/web
export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
export ANDROID_HOME="/Users/maha/development/android-sdk"
cd apps/web/android && ./gradlew assembleDebug
cp apps/web/android/app/build/outputs/apk/debug/app-debug.apk release/SmartCityGuardian.apk
```
