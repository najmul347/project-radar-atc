// Scenarios and Flight Plans Library for Project RADAR ATC Training System
// Supports 15 persistent slots with routings that transit GOLF and exit via another waypoint.

const fs = require('fs');
const path = require('path');

const SCENARIOS_FILE = path.join(__dirname, 'scenarios.json');

const WAYPOINTS = {
  GOLF: { x: 0, y: 0 },
  ALPHA: { x: 22, y: 30 },       // Northeast Fix
  BRAVO: { x: 32, y: 2 },        // East Fix
  CHARLIE: { x: 30, y: -28 },    // Southeast Fix
  DELTA: { x: -30, y: -28 },     // Southwest Fix
  ECHO: { x: -32, y: -3 },       // West Fix
  FOXTROT: { x: -22, y: 18 }     // Northwest Fix
};

const CORRIDOR_ROUTINGS = {
  'NW_SE': {
    id: 'NW_SE',
    name: 'NW Entry: FOXTROT ➔ GOLF ➔ CHARLIE (Exit SE)',
    entryFix: 'FOXTROT',
    transitFix: 'GOLF',
    exitFix: 'CHARLIE',
    route: 'FOXTROT-GOLF-CHARLIE',
    waypoints: ['FOXTROT', 'GOLF', 'CHARLIE'],
    spawnPoint: { x: -44, y: 36 },
    exitOutbound: { x: 48, y: -44 }
  },
  'NW_E': {
    id: 'NW_E',
    name: 'NW Entry: FOXTROT ➔ GOLF ➔ BRAVO (Exit E)',
    entryFix: 'FOXTROT',
    transitFix: 'GOLF',
    exitFix: 'BRAVO',
    route: 'FOXTROT-GOLF-BRAVO',
    waypoints: ['FOXTROT', 'GOLF', 'BRAVO'],
    spawnPoint: { x: -44, y: 36 },
    exitOutbound: { x: 50, y: 3 }
  },
  'NE_SW': {
    id: 'NE_SW',
    name: 'NE Entry: ALPHA ➔ GOLF ➔ DELTA (Exit SW)',
    entryFix: 'ALPHA',
    transitFix: 'GOLF',
    exitFix: 'DELTA',
    route: 'ALPHA-GOLF-DELTA',
    waypoints: ['ALPHA', 'GOLF', 'DELTA'],
    spawnPoint: { x: 32, y: 44 },
    exitOutbound: { x: -48, y: -44 }
  },
  'NE_W': {
    id: 'NE_W',
    name: 'NE Entry: ALPHA ➔ GOLF ➔ ECHO (Exit W)',
    entryFix: 'ALPHA',
    transitFix: 'GOLF',
    exitFix: 'ECHO',
    route: 'ALPHA-GOLF-ECHO',
    waypoints: ['ALPHA', 'GOLF', 'ECHO'],
    spawnPoint: { x: 32, y: 44 },
    exitOutbound: { x: -50, y: -4 }
  },
  'E_W': {
    id: 'E_W',
    name: 'E Entry: BRAVO ➔ GOLF ➔ ECHO (Exit W)',
    entryFix: 'BRAVO',
    transitFix: 'GOLF',
    exitFix: 'ECHO',
    route: 'BRAVO-GOLF-ECHO',
    waypoints: ['BRAVO', 'GOLF', 'ECHO'],
    spawnPoint: { x: 46, y: 3 },
    exitOutbound: { x: -50, y: -4 }
  },
  'E_NW': {
    id: 'E_NW',
    name: 'E Entry: BRAVO ➔ GOLF ➔ FOXTROT (Exit NW)',
    entryFix: 'BRAVO',
    transitFix: 'GOLF',
    exitFix: 'FOXTROT',
    route: 'BRAVO-GOLF-FOXTROT',
    waypoints: ['BRAVO', 'GOLF', 'FOXTROT'],
    spawnPoint: { x: 46, y: 3 },
    exitOutbound: { x: -48, y: 39 }
  },
  'SE_NW': {
    id: 'SE_NW',
    name: 'SE Entry: CHARLIE ➔ GOLF ➔ FOXTROT (Exit NW)',
    entryFix: 'CHARLIE',
    transitFix: 'GOLF',
    exitFix: 'FOXTROT',
    route: 'CHARLIE-GOLF-FOXTROT',
    waypoints: ['CHARLIE', 'GOLF', 'FOXTROT'],
    spawnPoint: { x: 44, y: -40 },
    exitOutbound: { x: -48, y: 39 }
  },
  'SE_NE': {
    id: 'SE_NE',
    name: 'SE Entry: CHARLIE ➔ GOLF ➔ ALPHA (Exit NE)',
    entryFix: 'CHARLIE',
    transitFix: 'GOLF',
    exitFix: 'ALPHA',
    route: 'CHARLIE-GOLF-ALPHA',
    waypoints: ['CHARLIE', 'GOLF', 'ALPHA'],
    spawnPoint: { x: 44, y: -40 },
    exitOutbound: { x: 34, y: 46 }
  },
  'SW_NW': {
    id: 'SW_NW',
    name: 'SW Entry: DELTA ➔ GOLF ➔ FOXTROT (Exit NW)',
    entryFix: 'DELTA',
    transitFix: 'GOLF',
    exitFix: 'FOXTROT',
    route: 'DELTA-GOLF-FOXTROT',
    waypoints: ['DELTA', 'GOLF', 'FOXTROT'],
    spawnPoint: { x: -44, y: -40 },
    exitOutbound: { x: -48, y: 39 }
  },
  'SW_NE': {
    id: 'SW_NE',
    name: 'SW Entry: DELTA ➔ GOLF ➔ ALPHA (Exit NE)',
    entryFix: 'DELTA',
    transitFix: 'GOLF',
    exitFix: 'ALPHA',
    route: 'DELTA-GOLF-ALPHA',
    waypoints: ['DELTA', 'GOLF', 'ALPHA'],
    spawnPoint: { x: -44, y: -40 },
    exitOutbound: { x: 34, y: 46 }
  },
  'W_E': {
    id: 'W_E',
    name: 'W Entry: ECHO ➔ GOLF ➔ BRAVO (Exit E)',
    entryFix: 'ECHO',
    transitFix: 'GOLF',
    exitFix: 'BRAVO',
    route: 'ECHO-GOLF-BRAVO',
    waypoints: ['ECHO', 'GOLF', 'BRAVO'],
    spawnPoint: { x: -46, y: -4 },
    exitOutbound: { x: 50, y: 3 }
  },
  'W_SE': {
    id: 'W_SE',
    name: 'W Entry: ECHO ➔ GOLF ➔ CHARLIE (Exit SE)',
    entryFix: 'ECHO',
    transitFix: 'GOLF',
    exitFix: 'CHARLIE',
    route: 'ECHO-GOLF-CHARLIE',
    waypoints: ['ECHO', 'GOLF', 'CHARLIE'],
    spawnPoint: { x: -46, y: -4 },
    exitOutbound: { x: 48, y: -44 }
  }
};

function calculateBearing(a, b, c, d) {
  let x1, y1, x2, y2;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    x1 = a.x;
    y1 = a.y;
    x2 = b.x;
    y2 = b.y;
  } else {
    x1 = a;
    y1 = b;
    x2 = c;
    y2 = d;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  let rad = Math.atan2(dx, dy);
  let deg = Math.round((rad * 180 / Math.PI + 360) % 360);
  return deg === 0 ? 360 : deg;
}

// Realistic pool of standard RVSM flight levels (in feet)
const STANDARD_XFL_POOL = [
  21000, 23000, 24000, 25000, 26000, 27000, 28000, 29000, 30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000, 38000, 39000, 40000, 41000
];

// Generate random Exit Flight Level (XFL) with random mix of climbs and descents
function generateRandomXFL(altitude, forceDirection = null) {
  const climbPool = STANDARD_XFL_POOL.filter(fl => fl > altitude + 1500);
  const descentPool = STANDARD_XFL_POOL.filter(fl => fl < altitude - 1500);

  let isClimb;
  if (forceDirection === 'climb') {
    isClimb = true;
  } else if (forceDirection === 'descent') {
    isClimb = false;
  } else {
    if (climbPool.length === 0) isClimb = false;
    else if (descentPool.length === 0) isClimb = true;
    else isClimb = Math.random() < 0.5;
  }

  const pool = isClimb ? climbPool : descentPool;
  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return isClimb ? altitude + 4000 : Math.max(15000, altitude - 4000);
}

// Helper to create an aircraft following a corridor routing transit GOLF
function makeAircraft(options) {
  const {
    id,
    callsign,
    type = 'B738',
    dest = 'WMKK',
    corridorId = 'SW_NW',
    altitude = 28000,
    speed = 420,
    progressFactor = 0 // 0 = at spawn boundary, 0.4 = halfway to GOLF, etc.
  } = options;

  // Determine exit flight level (XFL): random mix of climbing and descending flight levels
  let exitLevel = options.exitLevel;
  if (!exitLevel) {
    exitLevel = generateRandomXFL(altitude, options.forceDirection);
  }
  const exitFL = Math.round(exitLevel / 100);

  const corridor = CORRIDOR_ROUTINGS[corridorId] || CORRIDOR_ROUTINGS['SW_NW'];
  const p1 = corridor.spawnPoint;
  const p2 = WAYPOINTS[corridor.entryFix];
  const pG = WAYPOINTS.GOLF;

  let x = p1.x;
  let y = p1.y;
  let targetWpIndex = 0;
  let targetWp = corridor.entryFix;

  if (progressFactor > 0 && progressFactor <= 0.45) {
    x = p1.x + (p2.x - p1.x) * (progressFactor / 0.45);
    y = p1.y + (p2.y - p1.y) * (progressFactor / 0.45);
    targetWpIndex = 0;
  } else if (progressFactor > 0.45) {
    const f = (progressFactor - 0.45) / 0.55;
    x = p2.x + (pG.x - p2.x) * f;
    y = p2.y + (pG.y - p2.y) * f;
    targetWpIndex = 1;
    targetWp = 'GOLF';
  }

  const hdg = calculateBearing(x, y, WAYPOINTS[targetWp].x, WAYPOINTS[targetWp].y);

  return {
    id: id || 'AC_' + Math.random().toString(36).substr(2, 8),
    callsign,
    type,
    dest,
    route: corridor.route,
    corridorId: corridor.id,
    routeWaypoints: [...corridor.waypoints],
    targetWaypointIndex: targetWpIndex,
    exitOutbound: corridor.exitOutbound,
    isManualHeading: false,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    altitude,
    assignedAltitude: altitude,
    exitLevel,
    exitFL,
    heading: hdg,
    assignedHeading: hdg,
    speed,
    assignedSpeed: speed,
    labelOffsetX: 32,
    labelOffsetY: -26,
    isAssumed: false,
    pendingClearance: null,
    history: []
  };
}

// Build initial 15 flight plan scenarios
function buildDefaultScenarios() {
  const list = [];

  // Slot 1: Baseline Single Inbound (MAS642)
  list.push({
    id: 1,
    title: 'Scenario 01: Baseline Single Traffic (MAS642)',
    description: 'MAS642 inbound SW (DELTA ➔ GOLF ➔ FOXTROT) at FL280',
    updatedAt: new Date().toISOString(),
    aircraft: [
      {
        id: 'AC1',
        callsign: 'MAS642',
        type: 'B738',
        dest: 'WMKK',
        route: 'DELTA-GOLF-FOXTROT',
        corridorId: 'SW_NW',
        routeWaypoints: ['GOLF', 'FOXTROT'],
        targetWaypointIndex: 0,
        exitOutbound: { x: -48, y: 39 },
        isManualHeading: false,
        x: -24.0,
        y: -22.4,
        altitude: 28000,
        assignedAltitude: 28000,
        exitLevel: 36000, // XFL FL360 (Climb from FL280 by exit point)
        exitFL: 360,
        heading: 47,
        assignedHeading: 47,
        speed: 420,
        assignedSpeed: 420,
        labelOffsetX: 32,
        labelOffsetY: -26,
        isAssumed: false,
        pendingClearance: null,
        history: []
      }
    ]
  });

  // Slot 2: Opposite Direction Crossing at GOLF
  list.push({
    id: 2,
    title: 'Scenario 02: Head-On Crossing at GOLF',
    description: 'MAS642 (SW to NW) & SIA411 (NW to SE) crossing at GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S2_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 420, progressFactor: 0.35, exitLevel: 34000 }), // Climb to FL340
      makeAircraft({ id: 'AC_S2_2', callsign: 'SIA411', type: 'A359', corridorId: 'NW_SE', altitude: 33000, speed: 450, progressFactor: 0.30, exitLevel: 25000 })  // Descent to FL250
    ]
  });

  // Slot 3: East-West Airway Crossing via GOLF
  list.push({
    id: 3,
    title: 'Scenario 03: East-West Radial Transit',
    description: 'TCW212 (East to West) & KLM801 (West to East) transiting GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S3_1', callsign: 'TCW212', type: 'A320', corridorId: 'E_W', altitude: 31000, speed: 410, progressFactor: 0.35, exitLevel: 37000 }), // Climb to FL370
      makeAircraft({ id: 'AC_S3_2', callsign: 'KLM801', type: 'B77W', corridorId: 'W_E', altitude: 35000, speed: 460, progressFactor: 0.30, exitLevel: 27000 })  // Descent to FL270
    ]
  });

  // Slot 4: 90° Perpendicular Convergence
  list.push({
    id: 4,
    title: 'Scenario 04: Perpendicular Convergence at GOLF',
    description: 'AXM342 (NW to E) & QFA15 (NE to SW) converging at 90°',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S4_1', callsign: 'AXM342', type: 'A320', corridorId: 'NW_E', altitude: 29000, speed: 420, progressFactor: 0.35, exitLevel: 23000 }), // Descent to FL230
      makeAircraft({ id: 'AC_S4_2', callsign: 'QFA15', type: 'B789', corridorId: 'NE_SW', altitude: 33000, speed: 440, progressFactor: 0.32, exitLevel: 39000 })  // Climb to FL390
    ]
  });

  // Slot 5: Triple Convergence at GOLF Hub
  list.push({
    id: 5,
    title: 'Scenario 05: Triple Convergence at GOLF',
    description: '3 inbounds (SW, NW, NE) converging simultaneously on GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S5_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 420, progressFactor: 0.35, exitLevel: 35000 }), // Climb to FL350
      makeAircraft({ id: 'AC_S5_2', callsign: 'SIA411', type: 'A359', corridorId: 'NW_SE', altitude: 31000, speed: 430, progressFactor: 0.30, exitLevel: 23000 }), // Descent to FL230
      makeAircraft({ id: 'AC_S5_3', callsign: 'CAL772', type: 'B77W', corridorId: 'NE_W', altitude: 35000, speed: 450, progressFactor: 0.28, exitLevel: 29000 })  // Descent to FL290
    ]
  });

  // Slot 6: Same-Airway In-Trail Separation Drill
  list.push({
    id: 6,
    title: 'Scenario 06: Same-Airway In-Trail Follow',
    description: 'MAS642 & MAS884 in-trail along DELTA ➔ GOLF ➔ FOXTROT',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S6_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 410, progressFactor: 0.55, exitLevel: 21000 }), // Descent to FL210
      makeAircraft({ id: 'AC_S6_2', callsign: 'MAS884', type: 'B738', corridorId: 'SW_NW', altitude: 32000, speed: 440, progressFactor: 0.20, exitLevel: 38000 })  // Climb to FL380
    ]
  });

  // Slot 7: Four-Corner Hub Transit (NW, NE, SE, SW)
  list.push({
    id: 7,
    title: 'Scenario 07: Four-Corner Hub Transit',
    description: '4 aircraft entering from NW, NE, SE, SW all transiting GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S7_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 420, progressFactor: 0.38, exitLevel: 36000 }), // Climb to FL360
      makeAircraft({ id: 'AC_S7_2', callsign: 'SIA411', type: 'A359', corridorId: 'NW_SE', altitude: 31000, speed: 430, progressFactor: 0.32, exitLevel: 25000 }), // Descent to FL250
      makeAircraft({ id: 'AC_S7_3', callsign: 'GIA821', type: 'B77W', corridorId: 'SE_NW', altitude: 33000, speed: 440, progressFactor: 0.28, exitLevel: 39000 }), // Climb to FL390
      makeAircraft({ id: 'AC_S7_4', callsign: 'CAL552', type: 'A333', corridorId: 'NE_SW', altitude: 35000, speed: 450, progressFactor: 0.35, exitLevel: 27000 })  // Descent to FL270
    ]
  });

  // Slot 8: Climbing vs Level Crossing Separation Drill
  list.push({
    id: 8,
    title: 'Scenario 08: Climbing vs Level Crossing Drill',
    description: 'AXM502 climbing A100 to FL340 crossing BAH912 level at FL290',
    updatedAt: new Date().toISOString(),
    aircraft: [
      {
        ...makeAircraft({ id: 'AC_S8_1', callsign: 'AXM502', type: 'A320', corridorId: 'W_SE', altitude: 10000, speed: 400, progressFactor: 0.30, exitLevel: 34000 }),
        assignedAltitude: 34000
      },
      makeAircraft({ id: 'AC_S8_2', callsign: 'BAH912', type: 'B789', corridorId: 'NE_SW', altitude: 29000, speed: 430, progressFactor: 0.35, exitLevel: 21000 }) // Descent to FL210
    ]
  });

  // Slot 9: Reciprocal Flow Conflict Drill
  list.push({
    id: 9,
    title: 'Scenario 09: Reciprocal Flow Conflict',
    description: 'JST112 (East to NW) & SLK404 (NW to East) reciprocal via GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S9_1', callsign: 'JST112', type: 'A320', corridorId: 'E_NW', altitude: 31000, speed: 410, progressFactor: 0.35, exitLevel: 37000 }), // Climb to FL370
      makeAircraft({ id: 'AC_S9_2', callsign: 'SLK404', type: 'B738', corridorId: 'NW_E', altitude: 33000, speed: 420, progressFactor: 0.32, exitLevel: 25000 })  // Descent to FL250
    ]
  });

  // Slot 10: High-Speed Overtake Drill
  list.push({
    id: 10,
    title: 'Scenario 10: High-Speed Overtake Separation',
    description: 'Fast B77W (480 kt) overtaking slower A320 (380 kt) into GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S10_1', callsign: 'LNI202', type: 'A320', corridorId: 'SE_NE', altitude: 30000, speed: 380, progressFactor: 0.50, exitLevel: 38000 }), // Climb to FL380
      makeAircraft({ id: 'AC_S10_2', callsign: 'QFA10', type: 'B77W', corridorId: 'SE_NE', altitude: 34000, speed: 480, progressFactor: 0.20, exitLevel: 26000 })  // Descent to FL260
    ]
  });

  // Slot 11: Sector Peak Rush (5 Aircraft)
  list.push({
    id: 11,
    title: 'Scenario 11: Sector Peak Rush (5 Aircraft)',
    description: '5 inbounds sequencing through GOLF across different corridors',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S11_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 420, progressFactor: 0.40, exitLevel: 36000 }), // Climb to FL360
      makeAircraft({ id: 'AC_S11_2', callsign: 'SIA411', type: 'A359', corridorId: 'NW_SE', altitude: 31000, speed: 430, progressFactor: 0.35, exitLevel: 25000 }), // Descent to FL250
      makeAircraft({ id: 'AC_S11_3', callsign: 'GIA821', type: 'B77W', corridorId: 'SE_NW', altitude: 33000, speed: 440, progressFactor: 0.30, exitLevel: 39000 }), // Climb to FL390
      makeAircraft({ id: 'AC_S11_4', callsign: 'CAL552', type: 'A333', corridorId: 'NE_SW', altitude: 35000, speed: 450, progressFactor: 0.25, exitLevel: 27000 }), // Descent to FL270
      makeAircraft({ id: 'AC_S11_5', callsign: 'KLM801', type: 'B77W', corridorId: 'W_E', altitude: 29000, speed: 450, progressFactor: 0.20, exitLevel: 21000 })   // Descent to FL210
    ]
  });

  // Slot 12: Sector Saturation (6 Aircraft Full Hub)
  list.push({
    id: 12,
    title: 'Scenario 12: Sector Saturation (6 Aircraft)',
    description: 'All 6 airway corridors active simultaneously transiting GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S12_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 28000, speed: 420, progressFactor: 0.45, exitLevel: 36000 }), // Climb to FL360
      makeAircraft({ id: 'AC_S12_2', callsign: 'SIA411', type: 'A359', corridorId: 'NW_SE', altitude: 31000, speed: 430, progressFactor: 0.40, exitLevel: 23000 }), // Descent to FL230
      makeAircraft({ id: 'AC_S12_3', callsign: 'GIA821', type: 'B77W', corridorId: 'SE_NW', altitude: 33000, speed: 440, progressFactor: 0.35, exitLevel: 39000 }), // Climb to FL390
      makeAircraft({ id: 'AC_S12_4', callsign: 'CAL552', type: 'A333', corridorId: 'NE_SW', altitude: 35000, speed: 450, progressFactor: 0.30, exitLevel: 27000 }), // Descent to FL270
      makeAircraft({ id: 'AC_S12_5', callsign: 'KLM801', type: 'B77W', corridorId: 'W_E', altitude: 29000, speed: 440, progressFactor: 0.25, exitLevel: 35000 }),   // Climb to FL350
      makeAircraft({ id: 'AC_S12_6', callsign: 'TCW212', type: 'A320', corridorId: 'E_W', altitude: 37000, speed: 410, progressFactor: 0.20, exitLevel: 25000 })    // Descent to FL250
    ]
  });

  // Slot 13: Conflict Resolution Drill
  list.push({
    id: 13,
    title: 'Scenario 13: Immediate Conflict Resolution',
    description: 'Two co-altitude aircraft at FL310 converging on GOLF',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S13_1', callsign: 'MAS642', type: 'B738', corridorId: 'SW_NW', altitude: 31000, speed: 430, progressFactor: 0.85, exitLevel: 37000 }), // Climb to FL370
      makeAircraft({ id: 'AC_S13_2', callsign: 'AXM210', type: 'A320', corridorId: 'W_E', altitude: 31000, speed: 430, progressFactor: 0.85, exitLevel: 25000 })   // Descent to FL250
    ]
  });

  // Slot 14: Custom Saved Scenario A
  list.push({
    id: 14,
    title: 'Scenario 14: Custom Flight Plans A',
    description: 'Pre-configured customizable slot for supervisor traffic injection',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S14_1', callsign: 'TCW501', type: 'B738', corridorId: 'NW_SE', altitude: 30000, speed: 420, progressFactor: 0.30, exitLevel: 38000 }), // Climb to FL380
      makeAircraft({ id: 'AC_S14_2', callsign: 'BAH332', type: 'A320', corridorId: 'SW_NE', altitude: 32000, speed: 410, progressFactor: 0.25, exitLevel: 24000 })  // Descent to FL240
    ]
  });

  // Slot 15: Custom Saved Scenario B
  list.push({
    id: 15,
    title: 'Scenario 15: Custom Flight Plans B',
    description: 'Pre-configured customizable slot for supervisor traffic injection',
    updatedAt: new Date().toISOString(),
    aircraft: [
      makeAircraft({ id: 'AC_S15_1', callsign: 'SIA890', type: 'A359', corridorId: 'NE_W', altitude: 34000, speed: 460, progressFactor: 0.35, exitLevel: 26000 }), // Descent to FL260
      makeAircraft({ id: 'AC_S15_2', callsign: 'MAS114', type: 'B789', corridorId: 'SE_NW', altitude: 36000, speed: 450, progressFactor: 0.25, exitLevel: 40000 })  // Climb to FL400
    ]
  });

  return list;
}

class ScenarioManager {
  constructor() {
    this.scenarios = [];
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(SCENARIOS_FILE)) {
        const raw = fs.readFileSync(SCENARIOS_FILE, 'utf8');
        this.scenarios = JSON.parse(raw);
        if (!Array.isArray(this.scenarios) || this.scenarios.length !== 15) {
          this.scenarios = buildDefaultScenarios();
          this.saveToFile();
        }
      } else {
        this.scenarios = buildDefaultScenarios();
        this.saveToFile();
      }
    } catch (err) {
      console.error('Error loading scenarios file, falling back to defaults:', err);
      this.scenarios = buildDefaultScenarios();
    }
  }

  saveToFile() {
    try {
      fs.writeFileSync(SCENARIOS_FILE, JSON.stringify(this.scenarios, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving scenarios to file:', err);
    }
  }

  getAllSummaries() {
    return this.scenarios.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      updatedAt: s.updatedAt,
      aircraftCount: s.aircraft.length,
      routes: s.aircraft.map(a => `${a.callsign} (${a.route || a.corridorId || 'ROUTE'})`)
    }));
  }

  getScenario(id) {
    const slotId = parseInt(id, 10);
    return this.scenarios.find(s => s.id === slotId) || null;
  }

  saveScenario(id, title, description, aircraftList) {
    const slotId = parseInt(id, 10);
    let slot = this.scenarios.find(s => s.id === slotId);
    if (!slot) {
      slot = { id: slotId, title: `Scenario ${slotId}`, description: '', aircraft: [] };
      this.scenarios.push(slot);
    }
    if (title) slot.title = title;
    if (description !== undefined) slot.description = description;
    slot.updatedAt = new Date().toISOString();
    // Clone aircraft list cleanly
    slot.aircraft = aircraftList.map(a => ({
      id: a.id || 'AC_' + Math.random().toString(36).substr(2, 8),
      callsign: a.callsign,
      type: a.type || 'B738',
      dest: a.dest || 'WMKK',
      route: a.route || 'GOLF-TRANSIT',
      corridorId: a.corridorId || 'SW_NW',
      routeWaypoints: a.routeWaypoints || ['GOLF'],
      targetWaypointIndex: a.targetWaypointIndex !== undefined ? a.targetWaypointIndex : 0,
      exitOutbound: a.exitOutbound,
      isManualHeading: !!a.isManualHeading,
      x: a.x,
      y: a.y,
      altitude: a.altitude,
      assignedAltitude: a.assignedAltitude || a.altitude,
      exitLevel: a.exitLevel !== undefined ? a.exitLevel : 25000,
      exitFL: a.exitFL !== undefined ? a.exitFL : Math.round((a.exitLevel || 25000) / 100),
      heading: a.heading,
      assignedHeading: a.assignedHeading || a.heading,
      speed: a.speed,
      assignedSpeed: a.assignedSpeed || a.speed,
      labelOffsetX: a.labelOffsetX !== undefined ? a.labelOffsetX : 32,
      labelOffsetY: a.labelOffsetY !== undefined ? a.labelOffsetY : -26,
      isAssumed: false,
      pendingClearance: null,
      history: []
    }));

    this.saveToFile();
    return slot;
  }

  addAircraftToSlot(slotId, newAc) {
    const slot = this.getScenario(slotId);
    if (!slot) return null;
    slot.aircraft.push({ ...newAc });
    slot.updatedAt = new Date().toISOString();
    this.saveToFile();
    return slot;
  }
}

const scenarioManager = new ScenarioManager();

module.exports = {
  scenarioManager,
  CORRIDOR_ROUTINGS,
  WAYPOINTS,
  calculateBearing,
  makeAircraft,
  generateRandomXFL,
  STANDARD_XFL_POOL
};
