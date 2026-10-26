const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { scenarioManager, CORRIDOR_ROUTINGS, WAYPOINTS: SCENARIO_WAYPOINTS, calculateBearing, generateRandomXFL } = require('./scenarios');
const { userManager } = require('./users');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3000;

// Body parser
app.use(express.json());

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Explicit routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/atc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'atc.html'));
});

app.get('/pilot', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pilot.html'));
});

// Fixed Waypoints in Sector based on image001.png
const WAYPOINTS = [
  { id: 'ALPHA', name: 'ALPHA', x: 22, y: 30, description: 'Northeast Fix' },
  { id: 'BRAVO', name: 'BRAVO', x: 32, y: 2, description: 'East Fix' },
  { id: 'CHARLIE', name: 'CHARLIE', x: 30, y: -28, description: 'Southeast Fix' },
  { id: 'DELTA', name: 'DELTA', x: -30, y: -28, description: 'Southwest Fix' },
  { id: 'ECHO', name: 'ECHO', x: -32, y: -3, description: 'West Fix' },
  { id: 'FOXTROT', name: 'FOXTROT', x: -22, y: 18, description: 'Northwest Fix' },
  { id: 'GOLF', name: 'GOLF', x: 0, y: 0, description: 'Central Hub Fix' }
];

// 6 Danger Areas based on image001.png & IMG_6687.jpg (zero airway intersections)
const DANGER_AREAS = [
  {
    id: 'DA24',
    name: 'DA24',
    points: [ { x: -11, y: 17 }, { x: 5, y: 22 }, { x: -2, y: 10 }, { x: -12, y: 14 } ]
  },
  {
    id: 'DA13',
    name: 'DA13',
    points: [ { x: 18, y: 20 }, { x: 23, y: 5 }, { x: 10, y: 4 } ]
  },
  {
    id: 'DA12',
    name: 'DA12',
    points: [ { x: 14, y: -7 }, { x: 24, y: -7 }, { x: 24, y: -19 } ]
  },
  {
    id: 'DA11',
    name: 'DA11',
    points: [ { x: -4, y: -16 }, { x: 10, y: -18 }, { x: 6, y: -24 }, { x: -10, y: -22 } ]
  },
  {
    id: 'DA1',
    name: 'DA1',
    points: [ { x: -21, y: -7 }, { x: -11, y: -7 }, { x: -15, y: -12 } ]
  },
  {
    id: 'DA2',
    name: 'DA2',
    points: [ { x: -19, y: 5 }, { x: -10, y: 1 }, { x: -19, y: 1 } ]
  }
];

// Airway Segments connecting Waypoints (as seen in image001.png)
const AIRWAYS = [
  // Outer perimeter hexagon
  ['FOXTROT', 'ALPHA'],
  ['ALPHA', 'BRAVO'],
  ['BRAVO', 'CHARLIE'],
  ['CHARLIE', 'DELTA'],
  ['DELTA', 'ECHO'],
  ['ECHO', 'FOXTROT'],
  // Radial spokes through GOLF
  ['FOXTROT', 'GOLF'],
  ['GOLF', 'CHARLIE'],
  ['ECHO', 'GOLF'],
  ['GOLF', 'BRAVO'],
  ['ALPHA', 'GOLF'],
  ['GOLF', 'DELTA'],
  // Outward extension corridors to sector boundaries
  { from: 'FOXTROT', to: { x: -48, y: 39 } },
  { from: 'ALPHA', to: { x: 34, y: 46 } },
  { from: 'BRAVO', to: { x: 50, y: 3 } },
  { from: 'CHARLIE', to: { x: 48, y: -44 } },
  { from: 'DELTA', to: { x: -48, y: -44 } },
  { from: 'ECHO', to: { x: -50, y: -4 } }
];

// Initial Aircraft Fleet: Only MAS642 with routing DELTA-GOLF-FOXTROT
function createInitialFleet() {
  return [
    {
      id: 'AC1',
      callsign: 'MAS642',
      type: 'B738',
      dest: 'WMKK',
      route: 'DELTA-GOLF-FOXTROT',
      currentLeg: 'DELTA-GOLF', // transitions to GOLF-FOXTROT when reaching GOLF
      x: -24.0,                 // Positioned along the DELTA-GOLF airway
      y: -22.4,
      altitude: 28000,          // FL280
      assignedAltitude: 28000,
      exitLevel: 25000,         // XFL FL250 (descent by exit point)
      exitFL: 250,
      heading: 47,              // Initial heading towards GOLF (47°)
      assignedHeading: 47,
      speed: 420,
      assignedSpeed: 420,
      labelOffsetX: 32,
      labelOffsetY: -26,
      isAssumed: false,         // Default unassumed (maroon flight label)
      pendingClearance: null,
      history: []
    }
  ];
}

// Multi-Session Management (Sessions 1, 2, and 3)
// Initial clock starts PAUSED at 01:00:00 UTC (3600 seconds)
const INITIAL_SIM_TIME = 3600; // 01:00:00 UTC

function createSessionState(sessionId) {
  return {
    sessionId: String(sessionId),
    name: `Training Session 0${sessionId}`,
    sector: 'SECTOR 04',
    aircraft: createInitialFleet(),
    isPaused: true,           // Default paused as requested!
    simTimeSeconds: INITIAL_SIM_TIME, // Paused at 01:00 UTC
    sockets: new Map()        // socketId -> { role: 'atc' | 'pilot' }
  };
}

const SESSIONS = {
  '1': createSessionState('1'),
  '2': createSessionState('2'),
  '3': createSessionState('3')
};

function getSessionsSummary() {
  return ['1', '2', '3'].map((sid) => {
    const s = SESSIONS[sid];
    let students = 0;
    let pilots = 0;
    for (const info of s.sockets.values()) {
      if (info.role === 'atc') students++;
      if (info.role === 'pilot') pilots++;
    }
    return {
      sessionId: sid,
      name: s.name,
      sector: s.sector,
      isPaused: s.isPaused,
      simTimeSeconds: s.simTimeSeconds,
      aircraftCount: s.aircraft.length,
      studentsCount: students,
      pilotsCount: pilots
    };
  });
}

// Authentication & User Management REST APIs
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = userManager.authenticate(username, password);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
  res.json({ success: true, user });
});

app.get('/api/users', (req, res) => {
  res.json({ success: true, users: userManager.getAllUsers(true) });
});

app.post('/api/users', (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const newUser = userManager.addUser(username, password, role);
    res.json({ success: true, user: newUser, users: userManager.getAllUsers(true) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/users/:username', (req, res) => {
  try {
    const removed = userManager.deleteUser(req.params.username);
    res.json({ success: true, removed, users: userManager.getAllUsers(true) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// REST API for Session status summary
app.get('/api/sessions', (req, res) => {
  res.json(getSessionsSummary());
});

// REST API for 15 Flight Plan / Training Scenarios Library
app.get('/api/scenarios', (req, res) => {
  res.json(scenarioManager.getAllSummaries());
});

app.get('/api/scenarios/:id', (req, res) => {
  const s = scenarioManager.getScenario(req.params.id);
  if (!s) return res.status(404).json({ error: 'Scenario not found' });
  res.json(s);
});

// REST API for Entry Corridor Routings through GOLF
app.get('/api/corridors', (req, res) => {
  res.json(CORRIDOR_ROUTINGS);
});

// Calculate distance between two points in NM
function calculateDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Point in Polygon Test (Ray Casting)
function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Distance from point (px, py) to segment (x1, y1)-(x2, y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Check 90s DA Approaching and 90s TA Potential Conflict
function checkConflictsAndDA(aircraftList, dangerAreas) {
  const instantConflicts = new Set();
  const taAlerts = new Set();
  const daAlerts = new Set();

  const LOOKAHEAD_SECS = 90;
  const SAMPLE_STEPS = 10; // Check trajectory every 9s over next 90s

  // 1. TA Potential Conflict within 90 Seconds
  for (let i = 0; i < aircraftList.length; i++) {
    for (let j = i + 1; j < aircraftList.length; j++) {
      const a = aircraftList[i];
      const b = aircraftList[j];

      // Instantaneous check
      const dNow = calculateDistance(a.x, a.y, b.x, b.y);
      const altDiffNow = Math.abs(a.altitude - b.altitude);
      if (dNow < 3.0 && altDiffNow < 1000) {
        instantConflicts.add(a.id);
        instantConflicts.add(b.id);
        taAlerts.add(a.id);
        taAlerts.add(b.id);
      }

      // 90-Second Lookahead Trajectory Projection
      const vA = a.speed / 3600.0;
      const radA = (a.heading * Math.PI) / 180.0;
      const vxA = vA * Math.sin(radA);
      const vyA = vA * Math.cos(radA);

      const vB = b.speed / 3600.0;
      const radB = (b.heading * Math.PI) / 180.0;
      const vxB = vB * Math.sin(radB);
      const vyB = vB * Math.cos(radB);

      let conflictPredicted = false;
      for (let s = 1; s <= SAMPLE_STEPS; s++) {
        const t = (LOOKAHEAD_SECS / SAMPLE_STEPS) * s;
        const posAx = a.x + vxA * t;
        const posAy = a.y + vyA * t;
        const posBx = b.x + vxB * t;
        const posBy = b.y + vyB * t;

        // Altitude projection towards assigned level
        const vRateA = a.altitude < a.assignedAltitude ? 25 : (a.altitude > a.assignedAltitude ? -25 : 0);
        const altAt = a.altitude + vRateA * t;

        const vRateB = b.altitude < b.assignedAltitude ? 25 : (b.altitude > b.assignedAltitude ? -25 : 0);
        const altBt = b.altitude + vRateB * t;

        const dFuture = calculateDistance(posAx, posAy, posBx, posBy);
        const altDiffFuture = Math.abs(altAt - altBt);

        if (dFuture < 3.0 && altDiffFuture < 1000) {
          conflictPredicted = true;
          break;
        }
      }

      if (conflictPredicted) {
        taAlerts.add(a.id);
        taAlerts.add(b.id);
      }
    }
  }

  // 2. 90-Second Danger Area Proximity Check
  aircraftList.forEach((ac) => {
    const v = ac.speed / 3600.0;
    const rad = (ac.heading * Math.PI) / 180.0;
    const vx = v * Math.sin(rad);
    const vy = v * Math.cos(rad);

    let approachingDA = false;

    for (const da of dangerAreas) {
      if (!da.points || da.points.length < 3) continue;

      for (let s = 0; s <= SAMPLE_STEPS; s++) {
        const t = (LOOKAHEAD_SECS / SAMPLE_STEPS) * s;
        const tx = ac.x + vx * t;
        const ty = ac.y + vy * t;

        if (pointInPolygon(tx, ty, da.points)) {
          approachingDA = true;
          break;
        }

        for (let i = 0, j = da.points.length - 1; i < da.points.length; j = i++) {
          const edgeDist = distToSegment(tx, ty, da.points[j].x, da.points[j].y, da.points[i].x, da.points[i].y);
          if (edgeDist < 1.0) {
            approachingDA = true;
            break;
          }
        }
        if (approachingDA) break;
      }
      if (approachingDA) break;
    }

    if (approachingDA) {
      daAlerts.add(ac.id);
    }
  });

  return { instantConflicts, taAlerts, daAlerts };
}

// Kinematic Constants
const TURN_RATE_PER_SEC = 3.0; // Standard rate turn: 3 degrees/sec
const CLIMB_DESCENT_RATE_PER_SEC = 1500.0 / 60.0; // 1500 ft/min = 25 ft/sec
const SPEED_ACCEL_RATE_PER_SEC = 2.5; // knots/sec

// Step simulation physics for a session's fleet
function stepSessionSimulation(session) {
  const { instantConflicts, taAlerts, daAlerts } = checkConflictsAndDA(session.aircraft, DANGER_AREAS);

  session.aircraft.forEach((ac) => {
    ac.hasConflict = instantConflicts.has(ac.id);
    ac.hasTAAlert = taAlerts.has(ac.id);
    ac.hasDAAlert = daAlerts.has(ac.id);

    // 1. Heading transition (Standard rate turn of 3 deg/sec)
    if (ac.heading !== ac.assignedHeading) {
      let diff = ((ac.assignedHeading - ac.heading + 540) % 360) - 180;
      if (Math.abs(diff) <= TURN_RATE_PER_SEC) {
        ac.heading = ac.assignedHeading;
      } else {
        ac.heading = (ac.heading + (diff > 0 ? TURN_RATE_PER_SEC : -TURN_RATE_PER_SEC) + 360) % 360;
        if (ac.heading === 0) ac.heading = 360;
      }
    }

    // 2. Altitude transition (1,500 ft/min = 25 ft/sec)
    if (ac.altitude !== ac.assignedAltitude) {
      let altDiff = ac.assignedAltitude - ac.altitude;
      if (Math.abs(altDiff) <= CLIMB_DESCENT_RATE_PER_SEC) {
        ac.altitude = ac.assignedAltitude;
      } else {
        ac.altitude += altDiff > 0 ? CLIMB_DESCENT_RATE_PER_SEC : -CLIMB_DESCENT_RATE_PER_SEC;
      }
    }

    // 3. Speed transition (2.5 knots/sec)
    if (ac.speed !== ac.assignedSpeed) {
      let spdDiff = ac.assignedSpeed - ac.speed;
      if (Math.abs(spdDiff) <= SPEED_ACCEL_RATE_PER_SEC) {
        ac.speed = ac.assignedSpeed;
      } else {
        ac.speed += spdDiff > 0 ? SPEED_ACCEL_RATE_PER_SEC : -SPEED_ACCEL_RATE_PER_SEC;
      }
    }

    // 4. Update Position forward based on current heading and ground speed
    const distNM = ac.speed / 3600.0;
    const headingRad = (ac.heading * Math.PI) / 180.0;
    const dx = distNM * Math.sin(headingRad);
    const dy = distNM * Math.cos(headingRad);

    // Save previous position into radar trail history (keep last 6 hits)
    if (!ac.history) ac.history = [];
    ac.history.push({ x: ac.x, y: ac.y, time: Date.now() });
    if (ac.history.length > 6) {
      ac.history.shift();
    }

    ac.x += dx;
    ac.y += dy;

    // Automatic Route Waypoint Progression (Transit GOLF and Exit via Waypoint)
    if (ac.routeWaypoints && ac.routeWaypoints.length > 0 && !ac.isManualHeading) {
      if (ac.targetWaypointIndex === undefined) ac.targetWaypointIndex = 0;

      if (ac.targetWaypointIndex < ac.routeWaypoints.length) {
        const nextWpName = ac.routeWaypoints[ac.targetWaypointIndex];
        const wpTarget = WAYPOINTS.find(w => w.name === nextWpName) || SCENARIO_WAYPOINTS[nextWpName];
        if (wpTarget) {
          const distToWp = Math.hypot(wpTarget.x - ac.x, wpTarget.y - ac.y);
          // Set assigned heading towards the target waypoint
          ac.assignedHeading = calculateBearing(ac, wpTarget);

          // If within 2.5 NM, sequence to next waypoint
          if (distToWp < 2.5) {
            ac.targetWaypointIndex++;
            if (ac.targetWaypointIndex < ac.routeWaypoints.length) {
              const newWpName = ac.routeWaypoints[ac.targetWaypointIndex];
              const newTarget = WAYPOINTS.find(w => w.name === newWpName) || SCENARIO_WAYPOINTS[newWpName];
              if (newTarget) {
                ac.assignedHeading = calculateBearing(ac, newTarget);
              }
            } else if (ac.exitOutbound) {
              // Reached exit fix, fly outbound radial
              ac.assignedHeading = calculateBearing(ac, ac.exitOutbound);
            }
          }
        }
      } else if (ac.exitOutbound) {
        ac.assignedHeading = calculateBearing(ac, ac.exitOutbound);
      }
    } else if (ac.route === 'DELTA-GOLF-FOXTROT' && !ac.pendingClearance && !ac.isManualHeading) {
      // Legacy MAS642 progression
      const distToGolf = Math.hypot(ac.x - 0, ac.y - 0);
      if (ac.currentLeg === 'DELTA-GOLF' && distToGolf < 2.5) {
        ac.currentLeg = 'GOLF-FOXTROT';
        ac.assignedHeading = 309; // Inbound to FOXTROT (-22, 18)
      }
    }

    // Keep within sector boundaries
    if (ac.x > 45) ac.x = -45;
    else if (ac.x < -45) ac.x = 45;
    if (ac.y > 45) ac.y = -45;
    else if (ac.y < -45) ac.y = 45;
  });
}

// 1 Hz Master Simulation Loop across all 3 sessions
setInterval(() => {
  for (const sid of ['1', '2', '3']) {
    const session = SESSIONS[sid];
    if (!session) continue;

    // Advance clock and physical state only if running
    if (!session.isPaused) {
      session.simTimeSeconds++;
      stepSessionSimulation(session);
    }

    // Broadcast synchronized 1 Hz update to all clients connected to this session
    io.to(`session_${sid}`).emit('sim_update', {
      sessionId: sid,
      aircraft: session.aircraft,
      simTimeSeconds: session.simTimeSeconds,
      isPaused: session.isPaused
    });
  }
}, 1000);

// Helper to resolve session instance
function getSession(sid) {
  const key = String(sid || '1');
  return SESSIONS[key] || SESSIONS['1'];
}

// Socket.io Connection & Event Handling
io.on('connection', (socket) => {
  let joinedSessionId = '1';
  let clientRole = 'atc';

  // Join designated Training Session (1, 2, or 3)
  socket.on('join_session', (data) => {
    const requestedId = String((data && data.sessionId) || '1');
    const role = (data && data.role) || 'atc';

    // Leave previous room if any
    socket.leave(`session_${joinedSessionId}`);
    if (SESSIONS[joinedSessionId]) {
      SESSIONS[joinedSessionId].sockets.delete(socket.id);
    }

    joinedSessionId = SESSIONS[requestedId] ? requestedId : '1';
    clientRole = role;

    socket.join(`session_${joinedSessionId}`);
    SESSIONS[joinedSessionId].sockets.set(socket.id, { role: clientRole });

    const session = SESSIONS[joinedSessionId];

    // Send complete initial state for this specific session
    socket.emit('init_state', {
      sessionId: joinedSessionId,
      name: session.name,
      waypoints: WAYPOINTS,
      dangerAreas: DANGER_AREAS,
      airways: AIRWAYS,
      aircraft: session.aircraft,
      isPaused: session.isPaused,
      simTimeSeconds: session.simTimeSeconds
    });

    // Notify lobby of updated occupancy
    io.emit('sessions_summary', getSessionsSummary());
  });

  socket.on('disconnect', () => {
    if (SESSIONS[joinedSessionId]) {
      SESSIONS[joinedSessionId].sockets.delete(socket.id);
      io.emit('sessions_summary', getSessionsSummary());
    }
  });

  // Handle Controller Assuming or Releasing Aircraft Track
  socket.on('assume_aircraft', (data) => {
    const sid = String(data.sessionId || joinedSessionId);
    const session = getSession(sid);
    const ac = session.aircraft.find((a) => a.id === data.id);
    if (ac) {
      ac.isAssumed = data.isAssumed !== undefined ? data.isAssumed : true;
      io.to(`session_${sid}`).emit('aircraft_assumed', {
        id: ac.id,
        isAssumed: ac.isAssumed,
        message: `${ac.callsign} track ${ac.isAssumed ? 'Assumed (White)' : 'Unassumed (Maroon)'}.`
      });
      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });
    }
  });

  // Handle Moving Flight Label Offset
  socket.on('update_label_offset', (data) => {
    const sid = String(data.sessionId || joinedSessionId);
    const session = getSession(sid);
    const ac = session.aircraft.find((a) => a.id === data.id);
    if (ac) {
      ac.labelOffsetX = Math.round(data.labelOffsetX);
      ac.labelOffsetY = Math.round(data.labelOffsetY);
      io.to(`session_${sid}`).emit('label_offset_updated', {
        id: ac.id,
        labelOffsetX: ac.labelOffsetX,
        labelOffsetY: ac.labelOffsetY
      });
    }
  });

  // Handle Student Keying in Cleared Altitude & Heading
  socket.on('student_set_clearance', (data) => {
    const sid = String(data.sessionId || joinedSessionId);
    const session = getSession(sid);
    const ac = session.aircraft.find((a) => a.id === data.id);

    if (ac) {
      const prevPending = ac.pendingClearance || {};
      const newPending = { ...prevPending, timestamp: Date.now() };
      const descParts = [];

      if (data.clearedHeading !== undefined && data.clearedHeading !== null && data.clearedHeading !== '') {
        let hdg = Math.round(Number(data.clearedHeading)) % 360;
        if (hdg <= 0) hdg = 360;
        newPending.heading = hdg;
        newPending.hasHeading = true;
        descParts.push(`Heading ${hdg.toString().padStart(3, '0')}°`);
      }

      if (data.clearedAltitude !== undefined && data.clearedAltitude !== null && data.clearedAltitude !== '') {
        let alt = Math.max(1000, Math.min(55000, Math.round(Number(data.clearedAltitude))));
        newPending.altitude = alt;
        newPending.hasAltitude = true;
        const altDisplay = alt <= 11000 ? `A${(alt/100).toString().padStart(3, '0')}` : `FL${Math.round(alt/100)}`;
        descParts.push(altDisplay);
      }

      if (data.clearedSpeed !== undefined && data.clearedSpeed !== null && data.clearedSpeed !== '') {
        let spd = Math.max(100, Math.min(600, Math.round(Number(data.clearedSpeed))));
        newPending.speed = spd;
        newPending.hasSpeed = true;
        descParts.push(`${spd}kt`);
      }

      ac.pendingClearance = newPending;

      const actionText = descParts.length > 0 ? descParts.join(', ') : 'no changes';
      const msg = `ATC issued to ${ac.callsign}: ${actionText} (Awaiting pilot execution).`;

      io.to(`session_${sid}`).emit('student_clearance_issued', {
        aircraft: ac,
        pendingClearance: ac.pendingClearance,
        message: msg
      });

      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });
    }
  });

  // Handle Pseudo-Pilot / Supervisor Initiating & Executing Clearance
  // Accepts pending clearance upon Wilco/Exec OR follows through manual values
  socket.on('pilot_execute_clearance', (data) => {
    const sid = String(data.sessionId || joinedSessionId);
    const session = getSession(sid);
    const ac = session.aircraft.find((a) => a.id === data.id);

    if (ac) {
      const actions = [];
      const pc = ac.pendingClearance;

      // Determine Heading: provided directly OR accepted from pending clearance
      let targetHdg = null;
      if (data.assignedHeading !== undefined && data.assignedHeading !== null && data.assignedHeading !== '') {
        targetHdg = Number(data.assignedHeading);
      } else if (pc && pc.heading !== undefined) {
        targetHdg = Number(pc.heading);
      }

      if (targetHdg !== null && !isNaN(targetHdg)) {
        let hdg = Math.round(targetHdg) % 360;
        if (hdg <= 0) hdg = 360;
        ac.assignedHeading = hdg;
        ac.isManualHeading = true; // Mark as pilot-directed manual vectoring
        actions.push(`turning heading ${ac.assignedHeading.toString().padStart(3, '0')}°`);
      }

      // Determine Altitude: provided directly OR accepted from pending clearance
      let targetAlt = null;
      if (data.assignedAltitude !== undefined && data.assignedAltitude !== null && data.assignedAltitude !== '') {
        targetAlt = Number(data.assignedAltitude);
      } else if (pc && pc.altitude !== undefined) {
        targetAlt = Number(pc.altitude);
      }

      if (targetAlt !== null && !isNaN(targetAlt)) {
        const alt = Math.max(1000, Math.min(55000, Math.round(targetAlt)));
        const clbDes = alt > ac.altitude ? 'climbing' : (alt < ac.altitude ? 'descending' : 'maintaining');
        ac.assignedAltitude = alt;
        const altDisplay = ac.assignedAltitude <= 11000
          ? `A${(ac.assignedAltitude/100).toString().padStart(3, '0')}`
          : `FL${Math.round(ac.assignedAltitude/100)}`;
        actions.push(`${clbDes} ${altDisplay}`);
      }

      // Determine Speed: provided directly OR accepted from pending clearance
      let targetSpd = null;
      if (data.assignedSpeed !== undefined && data.assignedSpeed !== null && data.assignedSpeed !== '') {
        targetSpd = Number(data.assignedSpeed);
      } else if (pc && pc.speed !== undefined && pc.hasSpeed) {
        targetSpd = Number(pc.speed);
      }

      if (targetSpd !== null && !isNaN(targetSpd)) {
        ac.assignedSpeed = Math.max(100, Math.min(600, Math.round(targetSpd)));
        actions.push(`speed ${ac.assignedSpeed}kt`);
      }

      ac.pendingClearance = null; // Executed!

      const actionText = actions.length > 0 ? actions.join(', ') : 'maintaining flight parameters';
      const msg = `${ac.callsign} Wilco: ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}.`;

      io.to(`session_${sid}`).emit('aircraft_clearance_changed', {
        aircraft: ac,
        message: msg
      });

      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });
    }
  });

  // Handle Spawn Aircraft: Uses corridor routings transiting GOLF to exit waypoint
  // Inputs: altitude and speed only (heading computed along entry corridor)
  socket.on('spawn_aircraft', (customData) => {
    const sid = String((customData && customData.sessionId) || joinedSessionId);
    const session = getSession(sid);

    const callsignList = ['MAS', 'SIA', 'AXM', 'GIA', 'CAL', 'LNI', 'BAH', 'TCW', 'JST', 'QFA', 'KLM', 'SLK', 'CPA', 'UAE', 'QTR'];
    const aircraftTypes = ['B738', 'A320', 'B77W', 'A359', 'B789', 'A333'];
    const destList = ['WMKK', 'WSSS', 'WBKK', 'WIII', 'VHHH', 'VIDN', 'WBSB'];

    const randomPrefix = callsignList[Math.floor(Math.random() * callsignList.length)];
    const randomCallsign = `${randomPrefix}${Math.floor(Math.random() * 890 + 100)}`;
    const randomType = aircraftTypes[Math.floor(Math.random() * aircraftTypes.length)];
    const randomDest = destList[Math.floor(Math.random() * destList.length)];

    // Resolve Corridor Routing (ensuring every entry transits GOLF and exits via another waypoint)
    const CORRIDOR_SHORT_MAP = {
      'NW': 'NW_SE',
      'NE': 'NE_SW',
      'E': 'E_W',
      'SE': 'SE_NW',
      'SW': 'SW_NE',
      'W': 'W_E'
    };
    const reqCorridor = (customData && (customData.corridorId || customData.entryCorridor)) || 'NW_SE';
    const resolvedCorridorId = CORRIDOR_SHORT_MAP[reqCorridor] || reqCorridor;
    const corridor = CORRIDOR_ROUTINGS[resolvedCorridorId] || CORRIDOR_ROUTINGS['NW_SE'];

    const id = 'AC_' + Date.now();
    const callsign = (customData && customData.callsign) ? customData.callsign.toUpperCase().trim() : randomCallsign;
    const type = (customData && customData.type) ? customData.type : randomType;
    const dest = (customData && customData.dest) ? customData.dest.toUpperCase().trim() : randomDest;

    // Position aircraft at entry corridor spawn point (or custom position if injected)
    const x = (customData && customData.x !== undefined) ? Number(customData.x) : corridor.spawnPoint.x;
    const y = (customData && customData.y !== undefined) ? Number(customData.y) : corridor.spawnPoint.y;

    // Target the first waypoint (Entry Fix)
    const entryTarget = WAYPOINTS.find(w => w.name === corridor.entryFix) || SCENARIO_WAYPOINTS[corridor.entryFix];
    const initialHeading = (customData && customData.heading !== undefined)
      ? Number(customData.heading)
      : (entryTarget ? calculateBearing(corridor.spawnPoint, entryTarget) : 180);

    // Inputs: Altitude and Speed only
    const altitude = (customData && customData.altitude !== undefined)
      ? Math.max(1000, Math.min(55000, Number(customData.altitude)))
      : 33000;
    const speed = (customData && customData.speed !== undefined)
      ? Math.max(140, Math.min(550, Number(customData.speed)))
      : 420;

    // Determine exit flight level (XFL): keyed in by supervisor or randomly assigned (mix of climb/descent)
    let exitLevel = null;
    if (customData && (customData.exitLevel !== undefined || customData.exitFL !== undefined)) {
      if (customData.exitLevel !== undefined && customData.exitLevel !== null && customData.exitLevel !== '') {
        if (typeof customData.exitLevel === 'string') {
          const raw = customData.exitLevel.trim().toUpperCase().replace(/^FL\s*/, '');
          if (raw.startsWith('A')) {
            const h = parseInt(raw.slice(1), 10);
            if (!isNaN(h)) exitLevel = h * 100;
          } else {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) {
              if (n < 100) exitLevel = n * 1000;
              else if (n <= 600) exitLevel = n * 100;
              else exitLevel = n;
            }
          }
        } else {
          const n = Number(customData.exitLevel);
          if (!isNaN(n)) {
            if (n <= 600) exitLevel = n * 100;
            else exitLevel = n;
          }
        }
      } else if (customData.exitFL) {
        exitLevel = Number(customData.exitFL) * 100;
      }
    }

    if (!exitLevel || isNaN(exitLevel)) {
      exitLevel = generateRandomXFL(altitude);
    }
    const exitFL = Math.round(exitLevel / 100);

    const newAircraft = {
      id,
      callsign,
      type,
      dest,
      route: corridor.route,
      corridorId: corridor.id,
      routeWaypoints: [...corridor.waypoints], // [entryFix, 'GOLF', exitFix]
      targetWaypointIndex: 0,
      exitOutbound: corridor.exitOutbound,
      isManualHeading: false, // Automatically navigates entry -> GOLF -> exit waypoint
      showRoute: false,
      x,
      y,
      altitude,
      assignedAltitude: altitude,
      exitLevel,
      exitFL,
      heading: initialHeading,
      assignedHeading: initialHeading,
      speed,
      assignedSpeed: speed,
      labelOffsetX: 32,
      labelOffsetY: -26,
      isAssumed: false,
      pendingClearance: null,
      history: []
    };

    session.aircraft.push(newAircraft);

    // Save newly spawned aircraft to library slot if requested
    if (customData && customData.saveToSlotId) {
      const slotNum = parseInt(customData.saveToSlotId, 10);
      if (slotNum >= 1 && slotNum <= 15) {
        scenarioManager.addAircraftToSlot(slotNum, newAircraft);
        io.emit('scenarios_list', scenarioManager.getAllSummaries());
      }
    }

    io.to(`session_${sid}`).emit('aircraft_spawned', {
      aircraft: newAircraft,
      routingName: corridor.name
    });

    io.to(`session_${sid}`).emit('sim_update', {
      sessionId: sid,
      aircraft: session.aircraft,
      simTimeSeconds: session.simTimeSeconds,
      isPaused: session.isPaused
    });
  });

  // Handle Toggle Aircraft Flight Routing (Green Highlight)
  socket.on('toggle_aircraft_route', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const session = getSession(sid);
    const ac = session.aircraft.find(a => a.id === data.id);
    if (ac) {
      ac.showRoute = data.showRoute !== undefined ? !!data.showRoute : !ac.showRoute;
      io.to(`session_${sid}`).emit('aircraft_route_toggled', {
        id: ac.id,
        showRoute: ac.showRoute
      });
      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });
    }
  });

  // Get all 15 Scenarios / Flight Plans
  socket.on('get_scenarios', (cb) => {
    const list = scenarioManager.getAllSummaries();
    if (typeof cb === 'function') cb(list);
    else socket.emit('scenarios_list', list);
  });

  // Load a scenario slot into current session (1 to 15)
  socket.on('load_scenario', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const slotId = parseInt((data && data.slotId) || 1, 10);
    const session = getSession(sid);
    const scenario = scenarioManager.getScenario(slotId);

    if (scenario) {
      // Deep clone aircraft fleet from scenario
      session.aircraft = JSON.parse(JSON.stringify(scenario.aircraft));
      session.aircraft.forEach(ac => {
        ac.history = [];
        ac.pendingClearance = null;
        ac.isAssumed = false;
      });

      const msg = `Loaded Flight Plan Scenario Slot ${slotId}: "${scenario.title}" (${session.aircraft.length} aircraft).`;

      io.to(`session_${sid}`).emit('scenario_loaded', {
        slotId,
        title: scenario.title,
        description: scenario.description,
        aircraftCount: session.aircraft.length,
        message: msg
      });

      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });

      io.emit('sessions_summary', getSessionsSummary());
    }
  });

  // Save current sector traffic to a scenario slot (1 to 15)
  socket.on('save_scenario', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const slotId = parseInt((data && data.slotId) || 1, 10);
    const title = (data && data.title) || `Scenario Slot ${slotId}`;
    const description = (data && data.description) || `Saved from Session ${sid} at ${new Date().toLocaleTimeString()}`;
    const session = getSession(sid);

    const saved = scenarioManager.saveScenario(slotId, title, description, session.aircraft);
    if (saved) {
      const msg = `Saved Session ${sid} traffic (${session.aircraft.length} aircraft) into Flight Plan Slot ${slotId}: "${saved.title}".`;

      io.to(`session_${sid}`).emit('scenario_saved', {
        slotId,
        title: saved.title,
        aircraftCount: saved.aircraft.length,
        message: msg
      });

      io.emit('scenarios_list', scenarioManager.getAllSummaries());
    }
  });

  // Handle Remove / Delete Aircraft
  socket.on('delete_aircraft', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const session = getSession(sid);
    session.aircraft = session.aircraft.filter(a => a.id !== data.id);
    io.to(`session_${sid}`).emit('sim_update', {
      sessionId: sid,
      aircraft: session.aircraft,
      simTimeSeconds: session.simTimeSeconds,
      isPaused: session.isPaused
    });
  });

  // Toggle Pause / Resume Simulation by Pilot / Supervisor
  socket.on('toggle_pause', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const session = getSession(sid);
    session.isPaused = !session.isPaused;
    io.to(`session_${sid}`).emit('pause_state_changed', { isPaused: session.isPaused });
    io.to(`session_${sid}`).emit('sim_update', {
      sessionId: sid,
      aircraft: session.aircraft,
      simTimeSeconds: session.simTimeSeconds,
      isPaused: session.isPaused
    });
    io.emit('sessions_summary', getSessionsSummary());
  });

  // Set explicit Pause state (e.g. Run = false, Pause = true)
  socket.on('set_pause', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const session = getSession(sid);
    if (data && data.isPaused !== undefined) {
      session.isPaused = Boolean(data.isPaused);
      io.to(`session_${sid}`).emit('pause_state_changed', { isPaused: session.isPaused });
      io.to(`session_${sid}`).emit('sim_update', {
        sessionId: sid,
        aircraft: session.aircraft,
        simTimeSeconds: session.simTimeSeconds,
        isPaused: session.isPaused
      });
      io.emit('sessions_summary', getSessionsSummary());
    }
  });

  // Reset Simulation to default scenario (Paused at 01:00 UTC)
  socket.on('reset_simulation', (data) => {
    const sid = String((data && data.sessionId) || joinedSessionId);
    const session = getSession(sid);
    session.aircraft = createInitialFleet();
    session.isPaused = true;
    session.simTimeSeconds = INITIAL_SIM_TIME;
    io.to(`session_${sid}`).emit('simulation_reset', {
      sessionId: sid,
      waypoints: WAYPOINTS,
      dangerAreas: DANGER_AREAS,
      airways: AIRWAYS,
      aircraft: session.aircraft,
      isPaused: session.isPaused,
      simTimeSeconds: session.simTimeSeconds
    });
    io.emit('sessions_summary', getSessionsSummary());
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Project RADAR ATC Training System Server running on http://0.0.0.0:${PORT}`);
  console.log(`- Multi-Session Portal: http://localhost:${PORT}/`);
  console.log(`- Student Radar: http://localhost:${PORT}/atc?session=1`);
  console.log(`- Pseudo-Pilot / Supervisor Console: http://localhost:${PORT}/pilot?session=1`);
});
