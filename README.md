# Project RADAR ATC Training System

A full-stack, real-time web application for basic Air Traffic Control training built with **Node.js**, **Express**, **Socket.io**, and **vanilla JavaScript / HTML5 Canvas**, matching **TopSky / Eurocat ATM** radar aesthetics and the authentic airway sector structure.

## Overview & Architecture

Both the **Student ATC Position** (`/atc`) and the **Pseudo-Pilot Position** (`/pilot`) share the **same authentic dark-themed radar screen view**.

### Multi-Session Management (Sessions 01, 02, 03)
- **3 Concurrent Isolated Training Sessions**:
  - Each session accommodates 1 student controller and 1 pseudo-pilot / supervisor.
  - All sessions initialize strictly **PAUSED at 01:00:00 UTC**.
  - Student and pilot cannot change sessions from their stations (session navigation is managed via the portal lobby).
  - Supervisor / Pilot runs or pauses their session independently without impacting other sessions.

### Top Menu Bar
- **Top-Left ATM Controls**:
  - `01:00:00 UTC` (Live Simulation Clock)
  - `02L/02C/02R` (Active Runways)
  - `1013` (Standard Atmospheric Pressure QNH)
  - `E10` (Radar Range / Sector Code)

### Sector & Airway Structure
- **7 Waypoints (Fixes)**:
  - Central Hub: **`GOLF`** (0, 0)
  - Perimeter Fixes: **`ALPHA`** (NE), **`BRAVO`** (E), **`CHARLIE`** (SE), **`DELTA`** (SW), **`ECHO`** (W), **`FOXTROT`** (NW)
- **Dashed Blue Airway Network**:
  - Outer perimeter hexagon connecting all 6 perimeter fixes.
  - Crossing radials through GOLF (`FOXTROT-GOLF-CHARLIE`, `ECHO-GOLF-BRAVO`, `ALPHA-GOLF-DELTA`).
  - Extended outward entry/exit corridors to sector boundaries.
- **6 Maroon Danger Areas (`DA24`, `DA13`, `DA12`, `DA11`, `DA1`, `DA2`)**:
  - Placed strictly inside sector pockets with **zero intersection** with any airway segments.

### Flight Label & In-Label Dropdown Bar
- **Line 1**: Callsign (`MAS642`), Assigned Heading (`H 047°▾`).
- **Line 2**: Mode-C Altitude (`280`), Cleared Flight Level (`FL280▾`).
- **Line 3**: Ground Speed (`0420kt`), Destination (`WMKK`).
- **Line 4**: Exit Flight Level (`XFL FL250`) and Climb/Descent Requirement Indicator (`▲CLB` / `▼DES`).
- **In-Label Altitude Dropdown**:
  - 53 increments: `A020` to `A110` (1,000 ft steps) and `FL130` to `FL550` (1,000 ft steps).
  - Initial view displays 5 centered options (2,000 ft below, active level, 2,000 ft above) with scroll up/down and search filter.
- **In-Label Heading Dropdown**:
  - 72 increments: `360°` to `355°` in 5° steps.
  - Initial view displays 5 centered options (10° & 5° below, active heading, 5° & 10° above) with scroll up/down and search filter.
- **Right-Click Context Menu Actions**:
  - **"Assume" / "Release"**: Takes control (turns label white `#ffffff`) or releases track (returns label to maroon `#dc264e`).
  - **"Toggle Route (Green)"**: Toggles the aircraft's full flight routing highlighted in vivid neon green (`#22c55e`) with dashed core line and waypoint rings.

### Safety Alerts & 90-Second Lookahead Warnings
- **90-Second Danger Area Proximity Alert (`DA`)**:
  - Automatically predicts 90-second trajectory projection against all 6 Danger Area polygons (`DA1`–`DA24`).
  - If the aircraft is within 90 seconds of entering or approaching a Danger Area:
    - **Yellow flashing border** on the flight label.
    - **`DA` badge** in bold yellow/black on the **top left** of the flight label.
- **90-Second Traffic Advisory / Potential Conflict (`TA`)**:
  - Predicts 4D trajectory convergence between all aircraft pairs over the next 90 seconds.
  - If two aircraft are projected to breach standard radar separation (< 3.0 NM lateral and < 1,000 ft vertical) within 90 seconds:
    - **Red flashing border** on both flight labels.
    - **`TA` badge** in bold red/white on the **top left** of the flight label.
    - Takes visual priority over DA alerts if both conditions are met simultaneously.

### Spawn New Aircraft & Automated Corridor Routing
- **Entry Corridor Routings (All transit GOLF to exit waypoint)**:
  - `NW_SE`: FOXTROT ➔ GOLF ➔ CHARLIE (Exit SE)
  - `NW_E`: FOXTROT ➔ GOLF ➔ BRAVO (Exit E)
  - `NE_SW`: ALPHA ➔ GOLF ➔ DELTA (Exit SW)
  - `NE_W`: ALPHA ➔ GOLF ➔ ECHO (Exit W)
  - `E_W`: BRAVO ➔ GOLF ➔ ECHO (Exit W)
  - `E_NW`: BRAVO ➔ GOLF ➔ FOXTROT (Exit NW)
  - `SE_NW`: CHARLIE ➔ GOLF ➔ FOXTROT (Exit NW)
  - `SE_NE`: CHARLIE ➔ GOLF ➔ ALPHA (Exit NE)
  - `SW_NE`: DELTA ➔ GOLF ➔ ALPHA (Exit NE)
  - `SW_NW`: DELTA ➔ GOLF ➔ FOXTROT (Exit NW)
  - `W_E`: ECHO ➔ GOLF ➔ BRAVO (Exit E)
  - `W_SE`: ECHO ➔ GOLF ➔ CHARLIE (Exit SE)
- **Spawn Controls**:
  - Offers **altitude and speed only** (manual heading input removed).
  - Aircraft automatically spawns outside the corridor, calculates bearing towards entry fix, sequences through `GOLF`, and exits via the assigned waypoint.
  - Option to save newly spawned aircraft directly to the Flight Plans Library (Slots 1–15).

### "Load Game" Flight Plans & Scenarios Library (15 Slots)
- Located beside the **＋ Spawn** button as **📂 Load Game**.
- **15 Persistent Scenarios** stored on disk (`scenarios.json`):
  1. *Scenario 01*: Baseline Single Traffic (MAS642)
  2. *Scenario 02*: Head-On Crossing at GOLF
  3. *Scenario 03*: East-West Radial Transit
  4. *Scenario 04*: Perpendicular Convergence at GOLF
  5. *Scenario 05*: Triple Convergence at GOLF
  6. *Scenario 06*: Same-Airway In-Trail Follow
  7. *Scenario 07*: Four-Corner Hub Transit
  8. *Scenario 08*: Climbing vs Level Crossing Drill
  9. *Scenario 09*: Reciprocal Flow Conflict
  10. *Scenario 10*: High-Speed Overtake Separation
  11. *Scenario 11*: Sector Peak Rush (5 Aircraft)
  12. *Scenario 12*: Sector Saturation (6 Aircraft)
  13. *Scenario 13*: Immediate Conflict Resolution
  14. *Scenario 14*: Custom Flight Plans A
  15. *Scenario 15*: Custom Flight Plans B
- Allows instructors/supervisors to instantly load any scenario into their session or save active sector traffic into any slot.

### Access Control & User Accounts Management
- **Starting Page Authentication**:
  - Requires credentials to access the training portal.
  - **Administrator Account**: Username `admin1` • Password `corosRADAR`.
- **Administrator Privileges**:
  - Logging in as `admin1` activates the **User Accounts & Credentials Administration Window**.
  - Administrator can key in new usernames and passwords for student controllers and pseudo-pilots.
  - Accounts are saved to persistent storage (`users.json`).
- **Standard User Access**:
  - Accounts created by the administrator access the multi-session training portal with user creation controls hidden.

### URLs & Stations
- **Starting Access Portal / Login**: [http://localhost:3000/](http://localhost:3000/)
- **Student ATC Radar**: [http://localhost:3000/atc?session=1](http://localhost:3000/atc?session=1)
- **Pseudo-Pilot / Supervisor Console**: [http://localhost:3000/pilot?session=1](http://localhost:3000/pilot?session=1)
