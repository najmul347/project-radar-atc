// Pre-computed Altitude Options: A020 to A110 (1000 ft steps), and FL130 to FL550 (1000 ft steps)
const ALTITUDE_OPTIONS = [];
// A020 to A110 (2,000 ft to 11,000 ft in increments of 1000 ft)
for (let alt = 2000; alt <= 11000; alt += 1000) {
  const code = `A${(alt / 100).toString().padStart(3, '0')}`;
  ALTITUDE_OPTIONS.push({ code, feet: alt, label: `${code} • ${(alt).toLocaleString()} ft` });
}
// FL130 to FL550 (13,000 ft to 55,000 ft in increments of 1000 ft / 10 FL)
for (let fl = 130; fl <= 550; fl += 10) {
  const code = `FL${fl}`;
  const feet = fl * 100;
  ALTITUDE_OPTIONS.push({ code, feet, label: `${code} • ${(feet).toLocaleString()} ft` });
}

// Pre-computed Heading Options: 360 to 355 in increments of 5 degrees
const HEADING_OPTIONS = [];
HEADING_OPTIONS.push({ deg: 360, label: '360° (North)' });
for (let h = 5; h <= 355; h += 5) {
  const degStr = h.toString().padStart(3, '0');
  let cardinal = '';
  if (h === 90) cardinal = ' (East)';
  else if (h === 180) cardinal = ' (South)';
  else if (h === 270) cardinal = ' (West)';
  HEADING_OPTIONS.push({ deg: h, label: `${degStr}°${cardinal}` });
}

// Shared TopSky/Eurocat Radar Engine matching IMG_6687.jpg and image001.png
class ATCRadarView {
  constructor(options = {}) {
    this.role = options.role || 'atc'; // 'atc' or 'pilot'
    this.socket = options.socket || io();

    // Session ID from URL query (?session=1, 2, or 3)
    const urlParams = new URLSearchParams(window.location.search);
    this.sessionId = String(options.sessionId || urlParams.get('session') || '1');

    this.canvas = document.getElementById('radarCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('canvasContainer');

    // Context Menu for "Assume" Control
    this.contextMenu = document.getElementById('atmContextMenu');
    this.ctxHeader = document.getElementById('ctxHeader');
    this.ctxAssume = document.getElementById('ctxAssume');
    this.ctxAssumeText = document.getElementById('ctxAssumeText');
    this.ctxClearance = document.getElementById('ctxClearance');
    this.contextTargetAc = null;
    this.dropdownTargetAc = null;

    // UI elements
    this.simStatusBadge = document.getElementById('simStatusBadge');
    this.conflictAlert = document.getElementById('conflictAlert');
    this.aircraftCountEl = document.getElementById('aircraftCount');
    this.utcClockEl = document.getElementById('utcClock');
    this.simTickCountEl = document.getElementById('simTickCount');
    this.transmissionToast = document.getElementById('transmissionToast');
    this.toastText = document.getElementById('toastText');

    // Session Switcher & Supervisor Controls
    this.sessionLabel = document.getElementById('sessionLabel');
    this.sessionSelectDropdown = document.getElementById('sessionSelectDropdown');
    this.btnSupervisorRunPause = document.getElementById('btnSupervisorRunPause');
    this.superBtnIcon = document.getElementById('superBtnIcon');
    this.superBtnText = document.getElementById('superBtnText');

    // Controls
    this.btnZoomIn = document.getElementById('btnZoomIn');
    this.btnZoomOut = document.getElementById('btnZoomOut');
    this.btnResetView = document.getElementById('btnResetView');
    this.btnVectorLen = document.getElementById('btnVectorLen');
    this.btnToggleAudio = document.getElementById('btnToggleAudio');

    // State
    this.waypoints = [];
    this.dangerAreas = [];
    this.airways = [];
    this.aircraft = [];
    this.isPaused = true;
    this.simTimeSeconds = 3600; // 01:00:00 UTC initial
    this.selectedAircraftId = null;

    // Viewport
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
    this.zoomLevel = 1.0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Dragging Flight Label
    this.isDraggingLabel = false;
    this.draggedAircraft = null;
    this.dragStartMouseX = 0;
    this.dragStartMouseY = 0;
    this.dragInitialOffsetX = 0;
    this.dragInitialOffsetY = 0;
    this.hasMovedSignificantly = false;

    // Vector Options: 0, 1 min, 2 min
    this.vectorMinutes = 2;

    // Toggled Flight Routing Displays (Green Highlight)
    this.displayedRoutes = new Set();

    this.init();
  }

  init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupDropdowns();
    this.setupSocketEvents();
    this.setupInteractions();
    this.setupButtons();
    this.setupSessionControls();
    this.updateStatusUI();

    requestAnimationFrame(() => this.render());
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.container.clientWidth || window.innerWidth || 800;
    const height = this.container.clientHeight || window.innerHeight || 800;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    if (this.ctx.resetTransform) {
      this.ctx.resetTransform();
    } else {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.ctx.scale(dpr, dpr);
  }

  nmToScreen(xNM, yNM) {
    const width = this.container.clientWidth || window.innerWidth || 800;
    const height = this.container.clientHeight || window.innerHeight || 800;
    const centerScreenX = width / 2 + this.viewOffsetX;
    const centerScreenY = height / 2 + this.viewOffsetY;

    // Scale so that sector (approx 80 NM across) fits comfortably
    const baseScale = (Math.min(width, height) / 2 * 0.82) / 40.0;
    const scale = baseScale * this.zoomLevel;

    return {
      x: centerScreenX + xNM * scale,
      y: centerScreenY - yNM * scale, // North is up (-Y in canvas)
      scale: scale
    };
  }

  showToast(msg) {
    if (!this.transmissionToast) return;
    this.toastText.textContent = msg;
    this.transmissionToast.style.display = 'flex';
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.transmissionToast.style.display = 'none';
    }, 4500);
  }

  setupSessionControls() {
    if (this.sessionLabel) {
      this.sessionLabel.textContent = `SESSION 0${this.sessionId}`;
    }
    if (this.sessionSelectDropdown) {
      this.sessionSelectDropdown.value = this.sessionId;
      this.sessionSelectDropdown.addEventListener('change', () => {
        const target = this.sessionSelectDropdown.value;
        window.location.search = `?session=${target}`;
      });
    }

    const linkOpenPilot = document.getElementById('linkOpenPilot');
    if (linkOpenPilot) {
      linkOpenPilot.href = `/pilot?session=${this.sessionId}`;
    }

    if (this.btnSupervisorRunPause) {
      this.btnSupervisorRunPause.addEventListener('click', () => {
        this.socket.emit('toggle_pause', { sessionId: this.sessionId });
      });
    }
  }

  setupDropdowns() {
    // 1. In-label Heading Dropdown (360 to 355 in 5° steps)
    if (!document.getElementById('atmHeadingDropdown')) {
      const hdgMenu = document.createElement('div');
      hdgMenu.id = 'atmHeadingDropdown';
      hdgMenu.className = 'atm-quick-dropdown';
      hdgMenu.innerHTML = `
        <div class="atm-dropdown-header">
          <span id="hdgDropdownTitle">SELECT HEADING</span>
          <span class="close-dropdown-btn" id="closeHdgDropdown">&times;</span>
        </div>
        <div class="atm-dropdown-search">
          <input type="text" id="hdgSearchInput" placeholder="Quick filter (e.g. 090)..." autocomplete="off">
        </div>
        <div class="atm-dropdown-list" id="hdgDropdownList"></div>
      `;
      this.container.appendChild(hdgMenu);

      document.getElementById('closeHdgDropdown').addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideAllDropdowns();
      });
      hdgMenu.addEventListener('mousedown', (e) => e.stopPropagation());
      hdgMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    // 2. In-label Altitude Dropdown (A020 to A110, FL130 to FL550)
    if (!document.getElementById('atmAltitudeDropdown')) {
      const altMenu = document.createElement('div');
      altMenu.id = 'atmAltitudeDropdown';
      altMenu.className = 'atm-quick-dropdown';
      altMenu.innerHTML = `
        <div class="atm-dropdown-header">
          <span id="altDropdownTitle">SELECT ALTITUDE / FL</span>
          <span class="close-dropdown-btn" id="closeAltDropdown">&times;</span>
        </div>
        <div class="atm-dropdown-search">
          <input type="text" id="altSearchInput" placeholder="Quick filter (e.g. 280, A050)..." autocomplete="off">
        </div>
        <div class="atm-dropdown-list" id="altDropdownList"></div>
      `;
      this.container.appendChild(altMenu);

      document.getElementById('closeAltDropdown').addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideAllDropdowns();
      });
      altMenu.addEventListener('mousedown', (e) => e.stopPropagation());
      altMenu.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  hideAllDropdowns() {
    const hdgMenu = document.getElementById('atmHeadingDropdown');
    const altMenu = document.getElementById('atmAltitudeDropdown');
    if (hdgMenu) hdgMenu.classList.remove('active');
    if (altMenu) altMenu.classList.remove('active');
    this.dropdownTargetAc = null;
  }

  openHeadingDropdown(ac, clickScreenX, clickScreenY) {
    this.hideAllDropdowns();
    this.hideContextMenu();
    this.dropdownTargetAc = ac;
    const hdgMenu = document.getElementById('atmHeadingDropdown');
    const title = document.getElementById('hdgDropdownTitle');
    const search = document.getElementById('hdgSearchInput');
    const list = document.getElementById('hdgDropdownList');

    title.innerHTML = `<span>${ac.callsign}</span> • <span>SET HEADING (5° STEPS)</span>`;
    search.value = '';

    const currentHdg = ac.pendingClearance ? ac.pendingClearance.heading : ac.assignedHeading;
    let activeIdx = HEADING_OPTIONS.findIndex(opt => opt.deg === currentHdg);
    if (activeIdx === -1) {
      let minDiff = Infinity;
      HEADING_OPTIONS.forEach((opt, i) => {
        let diff = Math.abs(opt.deg - currentHdg);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff) {
          minDiff = diff;
          activeIdx = i;
        }
      });
    }

    const renderList = (filter = '') => {
      list.innerHTML = '';
      const f = filter.trim().toLowerCase();

      HEADING_OPTIONS.forEach((opt) => {
        if (f && !opt.label.toLowerCase().includes(f) && !opt.deg.toString().includes(f)) return;

        const item = document.createElement('div');
        const isActive = opt.deg === currentHdg;
        item.className = 'atm-dropdown-item' + (isActive ? ' active' : '');
        item.innerHTML = `
          <span><b>${opt.label}</b></span>
          ${isActive ? '<span class="item-tag">CURRENT</span>' : ''}
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyHeadingSelection(ac, opt.deg);
          this.hideAllDropdowns();
        });
        list.appendChild(item);
      });

      // If unfiltered, scroll so current heading has 2 steps below & 2 steps above visible (5 options in view)
      if (!f && activeIdx !== -1) {
        const itemH = 32;
        const targetScroll = Math.max(0, (activeIdx - 2) * itemH);
        requestAnimationFrame(() => {
          list.scrollTop = targetScroll;
        });
      }
    };

    renderList();
    search.oninput = () => renderList(search.value);

    const menuW = 210;
    const menuH = 240;
    let posX = Math.max(10, Math.min(window.innerWidth - menuW - 10, clickScreenX + 6));
    let posY = Math.max(45, Math.min(window.innerHeight - menuH - 10, clickScreenY));

    hdgMenu.style.left = `${posX}px`;
    hdgMenu.style.top = `${posY}px`;
    hdgMenu.classList.add('active');
    this.dropdownOpenedAt = Date.now();

    // Ensure initial 5-option view centered on current heading
    const itemH = 32;
    const targetScroll = Math.max(0, (activeIdx - 2) * itemH);
    setTimeout(() => {
      list.scrollTop = targetScroll;
      search.focus();
    }, 40);
  }

  openAltitudeDropdown(ac, clickScreenX, clickScreenY) {
    this.hideAllDropdowns();
    this.hideContextMenu();
    this.dropdownTargetAc = ac;
    const altMenu = document.getElementById('atmAltitudeDropdown');
    const title = document.getElementById('altDropdownTitle');
    const search = document.getElementById('altSearchInput');
    const list = document.getElementById('altDropdownList');

    title.innerHTML = `<span>${ac.callsign}</span> • <span>SET ALTITUDE / FL</span>`;
    search.value = '';

    const currentAlt = ac.pendingClearance ? ac.pendingClearance.altitude : ac.assignedAltitude;
    let activeIdx = ALTITUDE_OPTIONS.findIndex(opt => opt.feet === currentAlt);
    if (activeIdx === -1) {
      let minDiff = Infinity;
      ALTITUDE_OPTIONS.forEach((opt, i) => {
        const diff = Math.abs(opt.feet - currentAlt);
        if (diff < minDiff) {
          minDiff = diff;
          activeIdx = i;
        }
      });
    }

    const renderList = (filter = '') => {
      list.innerHTML = '';
      const f = filter.trim().toLowerCase();

      ALTITUDE_OPTIONS.forEach((opt) => {
        if (f && !opt.label.toLowerCase().includes(f) && !opt.code.toLowerCase().includes(f) && !opt.feet.toString().includes(f)) return;

        const item = document.createElement('div');
        const isActive = opt.feet === currentAlt;
        item.className = 'atm-dropdown-item' + (isActive ? ' active' : '');
        item.innerHTML = `
          <span><b>${opt.code}</b> <small style="color:#94a3b8; margin-left:6px;">${opt.feet.toLocaleString()} ft</small></span>
          ${isActive ? '<span class="item-tag">CURRENT</span>' : ''}
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyAltitudeSelection(ac, opt.feet, opt.code);
          this.hideAllDropdowns();
        });
        list.appendChild(item);
      });

      // If unfiltered, scroll so current altitude has 2000ft below & 2000ft above visible (5 options in view)
      if (!f && activeIdx !== -1) {
        const itemH = 32;
        const targetScroll = Math.max(0, (activeIdx - 2) * itemH);
        requestAnimationFrame(() => {
          list.scrollTop = targetScroll;
        });
      }
    };

    renderList();
    search.oninput = () => renderList(search.value);

    const menuW = 220;
    const menuH = 240;
    let posX = Math.max(10, Math.min(window.innerWidth - menuW - 10, clickScreenX + 6));
    let posY = Math.max(45, Math.min(window.innerHeight - menuH - 10, clickScreenY));

    altMenu.style.left = `${posX}px`;
    altMenu.style.top = `${posY}px`;
    altMenu.classList.add('active');
    this.dropdownOpenedAt = Date.now();

    // Ensure initial 5-option view centered on current altitude (2000ft below and 2000ft above)
    const itemH = 32;
    const targetScroll = Math.max(0, (activeIdx - 2) * itemH);
    setTimeout(() => {
      list.scrollTop = targetScroll;
      search.focus();
    }, 40);
  }

  applyHeadingSelection(ac, deg) {
    if (this.role === 'pilot') {
      ac.assignedHeading = deg;
      ac.pendingClearance = null;
      this.socket.emit('pilot_execute_clearance', {
        sessionId: this.sessionId,
        id: ac.id,
        assignedHeading: deg
      });
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      this.showToast(`${ac.callsign}: Pilot initiated turn to heading ${deg.toString().padStart(3, '0')}°.`);
    } else {
      ac.pendingClearance = {
        ...(ac.pendingClearance || {}),
        heading: deg,
        hasHeading: true,
        timestamp: Date.now()
      };
      this.socket.emit('student_set_clearance', {
        sessionId: this.sessionId,
        id: ac.id,
        clearedHeading: deg
      });
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      this.showToast(`Clearance keyed for ${ac.callsign}: Turn Heading ${deg.toString().padStart(3, '0')}° (Awaiting Pilot Exec).`);
    }
  }

  applyAltitudeSelection(ac, feet, code) {
    if (this.role === 'pilot') {
      ac.assignedAltitude = feet;
      ac.pendingClearance = null;
      this.socket.emit('pilot_execute_clearance', {
        sessionId: this.sessionId,
        id: ac.id,
        assignedAltitude: feet
      });
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      this.showToast(`${ac.callsign}: Pilot initiated climb/descent to ${code}.`);
    } else {
      ac.pendingClearance = {
        ...(ac.pendingClearance || {}),
        altitude: feet,
        hasAltitude: true,
        timestamp: Date.now()
      };
      this.socket.emit('student_set_clearance', {
        sessionId: this.sessionId,
        id: ac.id,
        clearedAltitude: feet
      });
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      this.showToast(`Clearance keyed for ${ac.callsign}: Cleared ${code} (Awaiting Pilot Exec).`);
    }
  }

  setupSocketEvents() {
    // Join this session room
    this.socket.emit('join_session', {
      sessionId: this.sessionId,
      role: this.role
    });

    this.socket.on('init_state', (data) => {
      if (data.sessionId && String(data.sessionId) !== String(this.sessionId)) return;
      this.waypoints = data.waypoints || [];
      this.dangerAreas = data.dangerAreas || [];
      this.airways = data.airways || [];
      this.aircraft = data.aircraft || [];
      this.isPaused = data.isPaused;
      this.simTimeSeconds = data.simTimeSeconds !== undefined ? data.simTimeSeconds : 3600;
      this.updateStatusUI();
      if (this.onStateUpdated) this.onStateUpdated();
    });

    this.socket.on('sim_update', (data) => {
      if (data.sessionId && String(data.sessionId) !== String(this.sessionId)) return;
      this.aircraft = data.aircraft || [];
      if (this.isDraggingLabel && this.draggedAircraft) {
        const liveAc = this.aircraft.find(a => a.id === this.draggedAircraft.id);
        if (liveAc) {
          liveAc.labelOffsetX = this.draggedAircraft.labelOffsetX;
          liveAc.labelOffsetY = this.draggedAircraft.labelOffsetY;
        }
      }

      this.isPaused = data.isPaused;
      this.simTimeSeconds = data.simTimeSeconds;

      const hasConflict = this.aircraft.some(a => a.hasConflict);
      if (hasConflict && window.atcAudio) {
        window.atcAudio.playConflictWarning();
      }

      this.updateStatusUI();
      if (this.onStateUpdated) this.onStateUpdated();
    });

    this.socket.on('pause_state_changed', (data) => {
      this.isPaused = data.isPaused;
      this.updateStatusUI();
      if (this.onPauseChanged) this.onPauseChanged(this.isPaused);
    });

    this.socket.on('student_clearance_issued', (data) => {
      const match = this.aircraft.find(a => a.id === data.aircraft.id);
      if (match) {
        match.pendingClearance = data.pendingClearance;
      }
      this.showToast(data.message);
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      if (this.onClearanceIssued) this.onClearanceIssued(data);
    });

    this.socket.on('aircraft_clearance_changed', (data) => {
      const match = this.aircraft.find(a => a.id === data.aircraft.id);
      if (match) {
        match.assignedHeading = data.aircraft.assignedHeading;
        match.assignedAltitude = data.aircraft.assignedAltitude;
        match.assignedSpeed = data.aircraft.assignedSpeed;
        match.isManualHeading = data.aircraft.isManualHeading;
        match.pendingClearance = null;
      }
      this.showToast(data.message);
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      if (this.onClearanceExecuted) this.onClearanceExecuted(data);
    });

    this.socket.on('aircraft_assumed', (data) => {
      const ac = this.aircraft.find(a => a.id === data.id);
      if (ac) {
        ac.isAssumed = data.isAssumed;
      }
      this.showToast(data.message);
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      if (this.onStateUpdated) this.onStateUpdated();
    });

    this.socket.on('label_offset_updated', (data) => {
      const ac = this.aircraft.find(a => a.id === data.id);
      if (ac && (!this.isDraggingLabel || this.draggedAircraft.id !== ac.id)) {
        ac.labelOffsetX = data.labelOffsetX;
        ac.labelOffsetY = data.labelOffsetY;
      }
    });

    this.socket.on('aircraft_route_toggled', (data) => {
      const ac = this.aircraft.find(a => a.id === data.id);
      if (ac) ac.showRoute = data.showRoute;
      if (data.showRoute) this.displayedRoutes.add(data.id);
      else this.displayedRoutes.delete(data.id);
    });

    this.socket.on('simulation_reset', (data) => {
      if (data.sessionId && String(data.sessionId) !== String(this.sessionId)) return;
      this.waypoints = data.waypoints;
      this.dangerAreas = data.dangerAreas || [];
      this.airways = data.airways || [];
      this.aircraft = data.aircraft;
      this.isPaused = data.isPaused;
      this.simTimeSeconds = data.simTimeSeconds !== undefined ? data.simTimeSeconds : 3600;
      this.selectedAircraftId = null;
      this.showToast(`Session ${this.sessionId} reset to 01:00 UTC baseline.`);
      this.updateStatusUI();
      if (this.onStateUpdated) this.onStateUpdated();
    });
  }

  formatUtcTime(totalSeconds) {
    const sec = totalSeconds !== undefined ? totalSeconds : 3600;
    const h = String(Math.floor((sec / 3600) % 24)).padStart(2, '0');
    const m = String(Math.floor((sec / 60) % 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${h}:${m}:${s}Z`;
  }

  updateStatusUI() {
    if (this.aircraftCountEl) this.aircraftCountEl.textContent = this.aircraft.length;
    if (this.simTickCountEl) this.simTickCountEl.textContent = this.simTimeSeconds + 's';

    const clockFormatted = this.formatUtcTime(this.simTimeSeconds);
    if (this.utcClockEl) {
      this.utcClockEl.textContent = clockFormatted;
    }
    const topUtcClock = document.getElementById('topUtcClock');
    if (topUtcClock) {
      topUtcClock.textContent = `${clockFormatted.replace('Z', '')} UTC`;
    }

    if (this.simStatusBadge) {
      if (this.isPaused) {
        this.simStatusBadge.textContent = `PAUSED [${clockFormatted}]`;
        this.simStatusBadge.className = 'badge badge-amber';
      } else {
        this.simStatusBadge.textContent = 'RUNNING 1 Hz';
        this.simStatusBadge.className = 'badge badge-green';
      }
    }

    // Supervisor Run/Pause button in pilot header
    if (this.btnSupervisorRunPause) {
      if (this.isPaused) {
        this.btnSupervisorRunPause.classList.add('paused');
        if (this.superBtnIcon) this.superBtnIcon.textContent = '▶';
        if (this.superBtnText) this.superBtnText.textContent = `RUN SESSION (${clockFormatted})`;
      } else {
        this.btnSupervisorRunPause.classList.remove('paused');
        if (this.superBtnIcon) this.superBtnIcon.textContent = '⏸';
        if (this.superBtnText) this.superBtnText.textContent = 'PAUSE SESSION';
      }
    }

    if (this.conflictAlert) {
      const hasConflict = this.aircraft.some(a => a.hasConflict);
      if (hasConflict) this.conflictAlert.classList.add('active');
      else this.conflictAlert.classList.remove('active');
    }
  }

  // Calculate bounding box for Flight Label (Data Block matching IMG_6687.jpg)
  getDataBlockBounds(ac) {
    const pos = this.nmToScreen(ac.x, ac.y);
    const offX = ac.labelOffsetX !== undefined ? ac.labelOffsetX : 32;
    const offY = ac.labelOffsetY !== undefined ? ac.labelOffsetY : -26;
    const blockX = pos.x + offX;
    const blockY = pos.y + offY;
    const hasPending = !!ac.pendingClearance;
    const width = 126;
    const height = hasPending ? 94 : 74;
    return {
      x: blockX,
      y: blockY,
      width: width,
      height: height,
      center: pos
    };
  }

  isRouteDisplayed(id) {
    const ac = this.aircraft.find(a => a.id === id);
    return (ac && !!ac.showRoute) || this.displayedRoutes.has(id);
  }

  toggleRouteDisplay(id) {
    const isShowing = this.isRouteDisplayed(id);
    const newState = !isShowing;
    const ac = this.aircraft.find(a => a.id === id);
    if (ac) ac.showRoute = newState;
    if (newState) this.displayedRoutes.add(id);
    else this.displayedRoutes.delete(id);

    this.socket.emit('toggle_aircraft_route', {
      sessionId: this.sessionId,
      id: id,
      showRoute: newState
    });
    if (window.atcAudio) window.atcAudio.playTransmitChirp();
    if (ac) {
      this.showToast(`${ac.callsign}: Route highlight ${newState ? 'ON (Green)' : 'OFF'}.`);
    }
  }

  showContextMenu(clientX, clientY, ac) {
    if (!this.contextMenu) return;
    this.hideAllDropdowns();
    this.contextTargetAc = ac;
    if (this.ctxHeader) {
      this.ctxHeader.textContent = `${ac.callsign} • ${ac.type} • FL${Math.round(ac.altitude/100)}`;
    }
    if (this.ctxAssumeText) {
      this.ctxAssumeText.textContent = ac.isAssumed ? 'Release' : 'Assume';
    }
    const ctxRouteText = document.getElementById('ctxRouteText');
    if (ctxRouteText) {
      ctxRouteText.textContent = this.isRouteDisplayed(ac.id) ? 'Hide Route (Green)' : 'Toggle Route (Green)';
    }

    const menuW = 205;
    const menuH = 195;
    const posX = Math.max(10, Math.min(clientX, window.innerWidth - menuW - 10));
    const posY = Math.max(10, Math.min(clientY, window.innerHeight - menuH - 10));
    this.contextMenu.style.left = `${posX}px`;
    this.contextMenu.style.top = `${posY}px`;
    this.contextMenu.classList.add('active');
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.classList.remove('active');
    }
    this.contextTargetAc = null;
  }

  setupInteractions() {
    // Prevent context menu events from bubbling to canvas
    if (this.contextMenu) {
      ['mousedown', 'mouseup', 'click', 'contextmenu'].forEach(evt => {
        this.contextMenu.addEventListener(evt, (e) => {
          e.stopPropagation();
        });
      });
    }

    // Right-Click Context Menu on Flight Label / Blip
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let hitAc = null;
      for (let i = this.aircraft.length - 1; i >= 0; i--) {
        const ac = this.aircraft[i];
        const box = this.getDataBlockBounds(ac);
        if (mouseX >= box.x && mouseX <= box.x + box.width && mouseY >= box.y && mouseY <= box.y + box.height) {
          hitAc = ac;
          break;
        }
      }
      if (!hitAc) {
        for (let i = this.aircraft.length - 1; i >= 0; i--) {
          const ac = this.aircraft[i];
          const pos = this.nmToScreen(ac.x, ac.y);
          if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 16) {
            hitAc = ac;
            break;
          }
        }
      }

      if (hitAc) {
        this.selectedAircraftId = hitAc.id;
        this.showContextMenu(e.clientX, e.clientY, hitAc);
      } else {
        this.hideContextMenu();
      }
    });

    if (this.ctxAssume) {
      const handleAssumeClick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const target = this.contextTargetAc;
        if (!target) return;
        const newAssumedState = !target.isAssumed;

        target.isAssumed = newAssumedState;
        const liveAc = this.aircraft.find(a => a.id === target.id);
        if (liveAc) liveAc.isAssumed = newAssumedState;

        this.socket.emit('assume_aircraft', {
          sessionId: this.sessionId,
          id: target.id,
          isAssumed: newAssumedState
        });

        if (window.atcAudio) window.atcAudio.playTransmitChirp();
        this.showToast(`${target.callsign} track ${newAssumedState ? 'Assumed (White)' : 'Unassumed (Maroon)'}.`);
        this.hideContextMenu();
      };

      this.ctxAssume.addEventListener('click', handleAssumeClick);
    }

    const ctxToggleRoute = document.getElementById('ctxToggleRoute');
    if (ctxToggleRoute) {
      ctxToggleRoute.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const target = this.contextTargetAc;
        this.hideContextMenu();
        if (target) {
          this.toggleRouteDisplay(target.id);
        }
      });
    }

    if (this.ctxClearance) {
      this.ctxClearance.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const target = this.contextTargetAc;
        this.hideContextMenu();
        if (target && this.onAircraftClicked) {
          this.onAircraftClicked(target);
        }
      });
    }

    const ctxAlt = document.getElementById('ctxAltDropdown');
    if (ctxAlt) {
      ctxAlt.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const target = this.contextTargetAc;
        this.hideContextMenu();
        if (target) {
          const pos = this.nmToScreen(target.x, target.y);
          const boxX = pos.x + (target.labelOffsetX !== undefined ? target.labelOffsetX : 32);
          const boxY = pos.y + (target.labelOffsetY !== undefined ? target.labelOffsetY : -26);
          this.openAltitudeDropdown(target, boxX, boxY + 38);
        }
      });
    }

    const ctxHdg = document.getElementById('ctxHdgDropdown');
    if (ctxHdg) {
      ctxHdg.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const target = this.contextTargetAc;
        this.hideContextMenu();
        if (target) {
          const pos = this.nmToScreen(target.x, target.y);
          const boxX = pos.x + (target.labelOffsetX !== undefined ? target.labelOffsetX : 32);
          const boxY = pos.y + (target.labelOffsetY !== undefined ? target.labelOffsetY : -26);
          this.openHeadingDropdown(target, boxX + 45, boxY + 22);
        }
      });
    }

    // Double-click on flight label to toggle Assume
    this.container.addEventListener('dblclick', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      for (let i = this.aircraft.length - 1; i >= 0; i--) {
        const ac = this.aircraft[i];
        const box = this.getDataBlockBounds(ac);
        if (mouseX >= box.x && mouseX <= box.x + box.width && mouseY >= box.y && mouseY <= box.y + box.height) {
          const newAssumedState = !ac.isAssumed;
          ac.isAssumed = newAssumedState;
          this.socket.emit('assume_aircraft', {
            sessionId: this.sessionId,
            id: ac.id,
            isAssumed: newAssumedState
          });
          if (window.atcAudio) window.atcAudio.playTransmitChirp();
          this.showToast(`${ac.callsign} track ${newAssumedState ? 'Assumed (White)' : 'Unassumed (Maroon)'}.`);
          break;
        }
      }
    });

    window.addEventListener('click', (e) => {
      if (Date.now() - (this.dropdownOpenedAt || 0) < 250) {
        return;
      }
      if (this.contextMenu && !this.contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
      const hdgMenu = document.getElementById('atmHeadingDropdown');
      const altMenu = document.getElementById('atmAltitudeDropdown');
      if (hdgMenu && !hdgMenu.contains(e.target)) {
        hdgMenu.classList.remove('active');
      }
      if (altMenu && !altMenu.contains(e.target)) {
        altMenu.classList.remove('active');
      }
    });

    this.container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.contextMenu && this.contextMenu.contains(e.target)) return;
      const hdgMenu = document.getElementById('atmHeadingDropdown');
      const altMenu = document.getElementById('atmAltitudeDropdown');
      if ((hdgMenu && hdgMenu.contains(e.target)) || (altMenu && altMenu.contains(e.target))) return;

      this.hideContextMenu();
      this.hideAllDropdowns();

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let hitAc = null;
      for (let i = this.aircraft.length - 1; i >= 0; i--) {
        const ac = this.aircraft[i];
        const box = this.getDataBlockBounds(ac);
        if (mouseX >= box.x && mouseX <= box.x + box.width && mouseY >= box.y && mouseY <= box.y + box.height) {
          hitAc = ac;
          break;
        }
      }

      if (!hitAc) {
        for (let i = this.aircraft.length - 1; i >= 0; i--) {
          const ac = this.aircraft[i];
          const pos = this.nmToScreen(ac.x, ac.y);
          if (Math.hypot(mouseX - pos.x, mouseY - pos.y) <= 14) {
            hitAc = ac;
            break;
          }
        }
      }

      if (hitAc) {
        this.selectedAircraftId = hitAc.id;
        this.isDraggingLabel = true;
        this.draggedAircraft = hitAc;
        this.dragStartMouseX = mouseX;
        this.dragStartMouseY = mouseY;
        this.dragInitialOffsetX = hitAc.labelOffsetX !== undefined ? hitAc.labelOffsetX : 32;
        this.dragInitialOffsetY = hitAc.labelOffsetY !== undefined ? hitAc.labelOffsetY : -26;
        this.hasMovedSignificantly = false;
        this.container.style.cursor = 'grabbing';
      } else {
        this.isPanning = true;
        this.panStartX = e.clientX - this.viewOffsetX;
        this.panStartY = e.clientY - this.viewOffsetY;
        this.container.style.cursor = 'grab';
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.isDraggingLabel && this.draggedAircraft) {
        const dx = mouseX - this.dragStartMouseX;
        const dy = mouseY - this.dragStartMouseY;
        if (Math.hypot(dx, dy) > 8) {
          this.hasMovedSignificantly = true;
        }
        this.draggedAircraft.labelOffsetX = this.dragInitialOffsetX + dx;
        this.draggedAircraft.labelOffsetY = this.dragInitialOffsetY + dy;
      } else if (this.isPanning) {
        this.viewOffsetX = e.clientX - this.panStartX;
        this.viewOffsetY = e.clientY - this.panStartY;
      } else {
        let overInteractiveField = false;
        let overLabel = false;
        for (const ac of this.aircraft) {
          const box = this.getDataBlockBounds(ac);
          if (mouseX >= box.x && mouseX <= box.x + box.width && mouseY >= box.y && mouseY <= box.y + box.height) {
            overLabel = true;
            // Check heading or altitude interactive sub-field
            if ((mouseX >= box.x + 45 && mouseY <= box.y + 20) || (mouseY >= box.y + 20 && mouseY <= box.y + 40)) {
              overInteractiveField = true;
            }
            break;
          }
        }
        this.container.style.cursor = overInteractiveField ? 'pointer' : (overLabel ? 'grab' : 'crosshair');
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDraggingLabel && this.draggedAircraft) {
        if (this.hasMovedSignificantly) {
          this.socket.emit('update_label_offset', {
            sessionId: this.sessionId,
            id: this.draggedAircraft.id,
            labelOffsetX: this.draggedAircraft.labelOffsetX,
            labelOffsetY: this.draggedAircraft.labelOffsetY
          });
        } else {
          // Direct Click on specific fields in the Flight Label
          const ac = this.draggedAircraft;
          const pos = this.nmToScreen(ac.x, ac.y);
          const boxX = pos.x + (ac.labelOffsetX !== undefined ? ac.labelOffsetX : 32);
          const boxY = pos.y + (ac.labelOffsetY !== undefined ? ac.labelOffsetY : -26);
          const boxW = 126;
          const hasPending = !!ac.pendingClearance;

          const clickX = this.dragStartMouseX;
          const clickY = this.dragStartMouseY;

          // 1. Check pilot Wilco/Exec button click on the flight data block
          if (this.role === 'pilot' && hasPending && clickX >= boxX - 4 && clickX <= boxX + boxW + 4 && clickY >= boxY + 66 && clickY <= boxY + 96) {
            const pc = ac.pendingClearance || {};
            this.socket.emit('pilot_execute_clearance', {
              sessionId: this.sessionId,
              id: ac.id,
              assignedHeading: pc.heading,
              assignedAltitude: pc.altitude,
              assignedSpeed: pc.speed
            });
            if (window.atcAudio) window.atcAudio.playTransmitChirp();
            this.showToast(`${ac.callsign}: Pilot executed ATC clearance.`);
          }
          // 2. Click on Heading Field (Line 1 right)
          else if (clickX >= boxX + 45 && clickX <= boxX + boxW + 4 && clickY >= boxY - 4 && clickY <= boxY + 20) {
            this.openHeadingDropdown(ac, boxX + 45, boxY + 22);
          }
          // 3. Click on Altitude Field (Line 2)
          else if (clickX >= boxX - 4 && clickX <= boxX + boxW + 4 && clickY >= boxY + 20 && clickY <= boxY + 36) {
            this.openAltitudeDropdown(ac, boxX, boxY + 38);
          }
          // 4. Default: select aircraft & trigger clearance popover
          else {
            if (this.onAircraftClicked) {
              this.onAircraftClicked(ac);
            }
          }
        }
        this.isDraggingLabel = false;
        this.draggedAircraft = null;
        this.container.style.cursor = 'crosshair';
      }

      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = 'crosshair';
      }
    });

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomLevel = Math.max(0.4, Math.min(3.5, this.zoomLevel * zoomFactor));
    }, { passive: false });
  }

  setupButtons() {
    if (this.btnZoomIn) this.btnZoomIn.addEventListener('click', () => {
      this.zoomLevel = Math.min(3.5, this.zoomLevel * 1.2);
    });
    if (this.btnZoomOut) this.btnZoomOut.addEventListener('click', () => {
      this.zoomLevel = Math.max(0.4, this.zoomLevel / 1.2);
    });
    if (this.btnResetView) this.btnResetView.addEventListener('click', () => {
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
      this.zoomLevel = 1.0;
    });
    // Vector button cycles 0 -> 1 min -> 2 min
    if (this.btnVectorLen) this.btnVectorLen.addEventListener('click', () => {
      if (this.vectorMinutes === 0) {
        this.vectorMinutes = 1;
      } else if (this.vectorMinutes === 1) {
        this.vectorMinutes = 2;
      } else {
        this.vectorMinutes = 0;
      }
      this.btnVectorLen.textContent = `Vector: ${this.vectorMinutes} MIN`;
    });
    if (this.btnToggleAudio) this.btnToggleAudio.addEventListener('click', () => {
      if (window.atcAudio) {
        const isMuted = window.atcAudio.toggleMute();
        this.btnToggleAudio.textContent = isMuted ? 'Sound: OFF' : 'Sound: ON';
        this.btnToggleAudio.classList.toggle('active', !isMuted);
      }
    });
  }

  formatAltCode(feet) {
    const fl = Math.round(feet / 100);
    if (feet <= 11000) {
      return `A${fl.toString().padStart(3, '0')}`;
    }
    return `FL${fl}`;
  }

  formatAltCodeShort(feet) {
    const fl = Math.round(feet / 100);
    if (feet <= 11000) {
      return `A${fl.toString().padStart(3, '0')}`;
    }
    return `${fl}`;
  }

  formatFL(altFeet) {
    const fl = Math.round(altFeet / 100);
    return fl.toString().padStart(3, '0');
  }

  formatHdg(hdg) {
    const h = Math.round(hdg) % 360;
    return (h === 0 ? 360 : h).toString().padStart(3, '0');
  }

  // Draw Airway Structure from image001.png
  drawAirways() {
    this.ctx.save();
    this.ctx.strokeStyle = '#38577a';
    this.ctx.lineWidth = 1.3;
    this.ctx.setLineDash([5, 5]);

    const getWp = (name) => this.waypoints.find(w => w.name === name);

    // 1. Perimeter Hexagon
    const perim = ['FOXTROT', 'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'];
    for (let i = 0; i < perim.length; i++) {
      const fromWp = getWp(perim[i]);
      const toWp = getWp(perim[(i + 1) % perim.length]);
      if (fromWp && toWp) {
        const p1 = this.nmToScreen(fromWp.x, fromWp.y);
        const p2 = this.nmToScreen(toWp.x, toWp.y);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
    }

    // 2. Radials through GOLF (Center Hub)
    const radials = [
      ['FOXTROT', 'GOLF'], ['GOLF', 'CHARLIE'],
      ['ECHO', 'GOLF'], ['GOLF', 'BRAVO'],
      ['ALPHA', 'GOLF'], ['GOLF', 'DELTA']
    ];
    radials.forEach(([w1, w2]) => {
      const fromWp = getWp(w1);
      const toWp = getWp(w2);
      if (fromWp && toWp) {
        const p1 = this.nmToScreen(fromWp.x, fromWp.y);
        const p2 = this.nmToScreen(toWp.x, toWp.y);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
    });

    // 3. Extended Outward Entry/Exit Corridors
    const extensions = [
      { from: 'FOXTROT', to: { x: -48, y: 39 } },
      { from: 'ALPHA', to: { x: 34, y: 46 } },
      { from: 'BRAVO', to: { x: 50, y: 3 } },
      { from: 'CHARLIE', to: { x: 48, y: -44 } },
      { from: 'DELTA', to: { x: -48, y: -44 } },
      { from: 'ECHO', to: { x: -50, y: -4 } }
    ];
    extensions.forEach((ext) => {
      const fromWp = getWp(ext.from);
      if (fromWp) {
        const p1 = this.nmToScreen(fromWp.x, fromWp.y);
        const p2 = this.nmToScreen(ext.to.x, ext.to.y);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
    });

    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  // Draw 6 Danger Areas with buffer from airways
  drawDangerAreas() {
    this.dangerAreas.forEach((da) => {
      if (!da.points || da.points.length < 3) return;

      this.ctx.save();
      this.ctx.beginPath();
      const first = this.nmToScreen(da.points[0].x, da.points[0].y);
      this.ctx.moveTo(first.x, first.y);
      for (let i = 1; i < da.points.length; i++) {
        const pt = this.nmToScreen(da.points[i].x, da.points[i].y);
        this.ctx.lineTo(pt.x, pt.y);
      }
      this.ctx.closePath();

      this.ctx.fillStyle = 'rgba(195, 45, 45, 0.16)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      this.ctx.lineWidth = 1.3;
      this.ctx.stroke();

      let cx = 0, cy = 0;
      da.points.forEach(p => { cx += p.x; cy += p.y; });
      cx /= da.points.length;
      cy /= da.points.length;
      const labelPos = this.nmToScreen(cx, cy);

      this.ctx.fillStyle = '#f87171';
      this.ctx.font = 'bold 11px "Consolas", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(da.name, labelPos.x, labelPos.y);

      this.ctx.restore();
    });
  }

  // Sector grid lines (disabled to remove orange lines at the bottom)
  drawSectorGrid() {}

  // Draw Waypoint Fixes
  drawWaypoints() {
    this.waypoints.forEach((wp) => {
      const pos = this.nmToScreen(wp.x, wp.y);

      this.ctx.save();
      const sz = 5;
      this.ctx.strokeStyle = '#cbd5e1';
      this.ctx.lineWidth = 1.8;
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x - sz, pos.y - sz);
      this.ctx.lineTo(pos.x + sz, pos.y + sz);
      this.ctx.moveTo(pos.x + sz, pos.y - sz);
      this.ctx.lineTo(pos.x - sz, pos.y + sz);
      this.ctx.stroke();

      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.font = 'bold 11px "Consolas", monospace';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';

      let labelOffX = 9;
      let labelOffY = -4;
      if (wp.name === 'GOLF') { labelOffX = -18; labelOffY = 14; }
      else if (wp.name === 'DELTA') { labelOffX = 8; labelOffY = 10; }
      else if (wp.name === 'CHARLIE') { labelOffX = 8; labelOffY = 10; }
      else if (wp.name === 'ALPHA') { labelOffX = -46; labelOffY = -12; }
      else if (wp.name === 'FOXTROT') { labelOffX = -56; labelOffY = -10; }
      else if (wp.name === 'ECHO') { labelOffX = -42; labelOffY = -10; }

      this.ctx.fillText(wp.name, pos.x + labelOffX, pos.y + labelOffY);
      this.ctx.restore();
    });
  }

  // Geometry helper: Point in Polygon
  isPointInPoly(px, py, points) {
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

  // Geometry helper: Distance from point to segment
  distPointToSeg(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  // 90-Second Lookahead for DA (Danger Area) Approaching and TA (Traffic Conflict)
  updateAlerts90s() {
    const LOOKAHEAD_SECS = 90;
    const SAMPLE_STEPS = 10;
    const dangerAreas = this.dangerAreas || [];

    const conflictSet = new Set();
    const taSet = new Set();
    const daSet = new Set();

    // 1. TA Potential Conflict within 90 Seconds (<3 NM lateral and <1000 ft vertical)
    for (let i = 0; i < this.aircraft.length; i++) {
      for (let j = i + 1; j < this.aircraft.length; j++) {
        const a = this.aircraft[i];
        const b = this.aircraft[j];

        // Instantaneous conflict check
        const dNow = Math.hypot(a.x - b.x, a.y - b.y);
        const altDiffNow = Math.abs(a.altitude - b.altitude);
        if (dNow < 3.0 && altDiffNow < 1000) {
          conflictSet.add(a.id);
          conflictSet.add(b.id);
          taSet.add(a.id);
          taSet.add(b.id);
        }

        // Project positions over next 90 seconds
        const vA = a.speed / 3600.0;
        const radA = (a.heading * Math.PI) / 180.0;
        const vxA = vA * Math.sin(radA);
        const vyA = vA * Math.cos(radA);

        const vB = b.speed / 3600.0;
        const radB = (b.heading * Math.PI) / 180.0;
        const vxB = vB * Math.sin(radB);
        const vyB = vB * Math.cos(radB);

        let conflictIn90 = false;
        for (let s = 1; s <= SAMPLE_STEPS; s++) {
          const t = (LOOKAHEAD_SECS / SAMPLE_STEPS) * s;
          const pxA = a.x + vxA * t;
          const pyA = a.y + vyA * t;
          const pxB = b.x + vxB * t;
          const pyB = b.y + vyB * t;

          const vRateA = a.altitude < a.assignedAltitude ? 25 : (a.altitude > a.assignedAltitude ? -25 : 0);
          const altAt = a.altitude + vRateA * t;
          const vRateB = b.altitude < b.assignedAltitude ? 25 : (b.altitude > b.assignedAltitude ? -25 : 0);
          const altBt = b.altitude + vRateB * t;

          const distH = Math.hypot(pxA - pxB, pyA - pyB);
          const distV = Math.abs(altAt - altBt);

          if (distH < 3.0 && distV < 1000) {
            conflictIn90 = true;
            break;
          }
        }

        if (conflictIn90) {
          taSet.add(a.id);
          taSet.add(b.id);
        }
      }
    }

    // 2. 90-Second Danger Area Proximity Check
    this.aircraft.forEach(ac => {
      const v = ac.speed / 3600.0;
      const rad = (ac.heading * Math.PI) / 180.0;
      const vx = v * Math.sin(rad);
      const vy = v * Math.cos(rad);

      let isApproachingDA = false;

      for (const da of dangerAreas) {
        if (!da.points || da.points.length < 3) continue;

        for (let s = 0; s <= SAMPLE_STEPS; s++) {
          const t = (LOOKAHEAD_SECS / SAMPLE_STEPS) * s;
          const tx = ac.x + vx * t;
          const ty = ac.y + vy * t;

          if (this.isPointInPoly(tx, ty, da.points)) {
            isApproachingDA = true;
            break;
          }

          for (let i = 0, j = da.points.length - 1; i < da.points.length; j = i++) {
            const edgeDist = this.distPointToSeg(tx, ty, da.points[j].x, da.points[j].y, da.points[i].x, da.points[i].y);
            if (edgeDist < 1.0) {
              isApproachingDA = true;
              break;
            }
          }
          if (isApproachingDA) break;
        }
        if (isApproachingDA) break;
      }

      if (isApproachingDA) {
        daSet.add(ac.id);
      }
    });

    this.aircraft.forEach(ac => {
      ac.hasConflict = conflictSet.has(ac.id) || !!ac.hasConflict;
      ac.hasTAAlert = taSet.has(ac.id) || !!ac.hasTAAlert;
      ac.hasDAAlert = daSet.has(ac.id) || !!ac.hasDAAlert;
    });
  }

  // Draw Flight Routing Highlighted in Green when toggled on
  drawAircraftRoutes() {
    this.aircraft.forEach(ac => {
      if (!this.isRouteDisplayed(ac.id)) return;

      const pts = [];
      const curPos = this.nmToScreen(ac.x, ac.y);
      pts.push(curPos);

      // Connect along corridor waypoints
      if (ac.routeWaypoints && ac.routeWaypoints.length > 0) {
        const startIdx = ac.targetWaypointIndex !== undefined ? ac.targetWaypointIndex : 0;
        for (let i = startIdx; i < ac.routeWaypoints.length; i++) {
          const wpName = ac.routeWaypoints[i];
          const wp = this.waypoints.find(w => w.name === wpName);
          if (wp) {
            pts.push(this.nmToScreen(wp.x, wp.y));
          }
        }
        if (ac.exitOutbound) {
          pts.push(this.nmToScreen(ac.exitOutbound.x, ac.exitOutbound.y));
        }
      } else if (ac.route === 'DELTA-GOLF-FOXTROT') {
        const distToGolf = Math.hypot(ac.x - 0, ac.y - 0);
        const wG = this.waypoints.find(w => w.name === 'GOLF');
        const wF = this.waypoints.find(w => w.name === 'FOXTROT');
        if (ac.currentLeg === 'DELTA-GOLF' || distToGolf > 2.0) {
          if (wG) pts.push(this.nmToScreen(wG.x, wG.y));
        }
        if (wF) pts.push(this.nmToScreen(wF.x, wF.y));
        pts.push(this.nmToScreen(-48, 39));
      }

      if (pts.length < 2) return;

      this.ctx.save();
      // Outer neon green ambient glow
      this.ctx.strokeStyle = 'rgba(34, 197, 94, 0.40)';
      this.ctx.lineWidth = 6;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) this.ctx.moveTo(p.x, p.y);
        else this.ctx.lineTo(p.x, p.y);
      });
      this.ctx.stroke();

      // Sharp bright green core line
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 2.2;
      this.ctx.setLineDash([8, 4]);
      this.ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) this.ctx.moveTo(p.x, p.y);
        else this.ctx.lineTo(p.x, p.y);
      });
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Waypoint highlight rings
      pts.slice(1).forEach(p => {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#4ade80';
        this.ctx.lineWidth = 1.6;
        this.ctx.stroke();
      });

      this.ctx.restore();
    });
  }

  // Draw Aircraft Blip & In-Label Box matching IMG_6687.jpg
  drawAircraft() {
    this.aircraft.forEach((ac) => {
      const pos = this.nmToScreen(ac.x, ac.y);
      const isSelected = ac.id === this.selectedAircraftId;
      const isConflict = ac.hasConflict;
      const hasPending = !!ac.pendingClearance;
      const isAssumed = !!ac.isAssumed;

      this.ctx.save();

      const blipColor = isConflict ? '#ef4444' : '#f43f5e';

      // 4 historical dots
      if (ac.history && ac.history.length > 0) {
        ac.history.forEach((hist, idx) => {
          const histPos = this.nmToScreen(hist.x, hist.y);
          const alpha = ((idx + 1) / ac.history.length) * 0.55;
          this.ctx.beginPath();
          this.ctx.arc(histPos.x, histPos.y, 2, 0, Math.PI * 2);
          this.ctx.fillStyle = isConflict ? `rgba(239, 68, 68, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
          this.ctx.fill();
        });
      }

      // Conflict Ring Halo
      if (isConflict) {
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      }

      // Primary Radar Target Dot
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
      this.ctx.fillStyle = blipColor;
      this.ctx.fill();

      // Velocity Vector Line (Only drawn when vectorMinutes > 0: 1 min or 2 min)
      if (this.vectorMinutes > 0) {
        const lookaheadNM = ac.speed * (this.vectorMinutes / 60.0);
        const headingRad = (ac.heading * Math.PI) / 180.0;
        const vectorPx = lookaheadNM * pos.scale;
        const vx = pos.x + Math.sin(headingRad) * vectorPx;
        const vy = pos.y - Math.cos(headingRad) * vectorPx;

        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        this.ctx.lineTo(vx, vy);
        this.ctx.strokeStyle = blipColor;
        this.ctx.lineWidth = 1.4;
        this.ctx.stroke();

        const perpAngle = headingRad + Math.PI / 2;
        const capLen = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(vx - Math.cos(perpAngle) * capLen, vy - Math.sin(perpAngle) * capLen);
        this.ctx.lineTo(vx + Math.cos(perpAngle) * capLen, vy + Math.sin(perpAngle) * capLen);
        this.ctx.stroke();
      }

      // 2. Flight Label Box (Data Block matching IMG_6687.jpg)
      const offX = ac.labelOffsetX !== undefined ? ac.labelOffsetX : 32;
      const offY = ac.labelOffsetY !== undefined ? ac.labelOffsetY : -26;
      const boxX = pos.x + offX;
      const boxY = pos.y + offY;
      const boxWidth = 126;
      const boxHeight = hasPending ? 94 : 74;

      // Color scheme: Maroon when unassumed; 100% Crisp White when assumed
      const maroonColor = '#dc264e';
      const labelColor = isAssumed ? '#ffffff' : maroonColor;
      const leaderColor = hasPending ? '#eab308' : (isAssumed ? '#ffffff' : maroonColor);

      // Connecting Leader Line from target blip to label box
      const anchorX = offX >= 0 ? boxX : boxX + boxWidth;
      const anchorY = boxY + Math.min(boxHeight - 12, Math.max(12, pos.y - boxY));
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      const midX = pos.x + (anchorX - pos.x) * 0.45;
      const midY = pos.y + (anchorY - pos.y) * 0.45;
      this.ctx.lineTo(midX, midY);
      this.ctx.lineTo(anchorX, anchorY);
      this.ctx.strokeStyle = leaderColor;
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();

      // Semi-transparent label background strictly matching box dimensions
      this.ctx.fillStyle = 'rgba(15, 20, 27, 0.94)';
      this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      // Flashing alert cycle: 400ms period
      const flashCycle = Math.floor(Date.now() / 400) % 2 === 0;

      const isTAAlert = !!(ac.hasTAAlert || isConflict);
      const isDAAlert = !!ac.hasDAAlert;

      // Border styling:
      // Priority 1: TA Alert (red flashing border)
      // Priority 2: DA Alert (yellow flashing border)
      // Normal: solid crisp border
      if (isTAAlert) {
        this.ctx.strokeStyle = flashCycle ? '#ef4444' : 'rgba(239, 68, 68, 0.35)';
        this.ctx.lineWidth = 2.4;
      } else if (isDAAlert) {
        this.ctx.strokeStyle = flashCycle ? '#eab308' : 'rgba(234, 179, 8, 0.35)';
        this.ctx.lineWidth = 2.4;
      } else {
        this.ctx.strokeStyle = isSelected ? (isAssumed ? '#ffffff' : '#f43f5e') : labelColor;
        this.ctx.lineWidth = isSelected ? 2.0 : 1.2;
      }
      this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      if (isSelected && !isTAAlert && !isDAAlert) {
        this.ctx.strokeStyle = isAssumed ? 'rgba(255, 255, 255, 0.4)' : 'rgba(220, 38, 78, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(boxX - 3, boxY - 3, boxWidth + 6, boxHeight + 6);
      }

      // Badges on Top Left of Flight Label:
      // Red TA badge if potential traffic conflict within 90s
      // Yellow DA badge if approaching Danger Area within 90s
      let badgeXOffset = boxX;
      if (isTAAlert) {
        this.ctx.fillStyle = flashCycle ? '#dc2626' : '#991b1b';
        this.ctx.fillRect(badgeXOffset, boxY - 14, 26, 13);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 9px "Consolas", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('TA', badgeXOffset + 13, boxY - 7.5);
        badgeXOffset += 28;
      }

      if (isDAAlert) {
        this.ctx.fillStyle = flashCycle ? '#eab308' : '#ca8a04';
        this.ctx.fillRect(badgeXOffset, boxY - 14, 26, 13);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 9px "Consolas", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DA', badgeXOffset + 13, boxY - 7.5);
      }

      // Text inside box: deterministic top baseline
      this.ctx.textBaseline = 'top';

      // --- Line 1: Callsign (left) & Heading Dropdown Trigger (right) ---
      this.ctx.font = 'bold 11px "Consolas", monospace';
      this.ctx.fillStyle = isConflict ? '#ef4444' : labelColor;
      this.ctx.textAlign = 'left';
      this.ctx.fillText(ac.callsign, boxX + 8, boxY + 7);

      this.ctx.font = '10px "Consolas", monospace';
      this.ctx.textAlign = 'right';
      let hdgDisplay = `H ${this.formatHdg(ac.heading)}▾`;
      if (hasPending && ac.pendingClearance.hasHeading && ac.pendingClearance.heading !== ac.assignedHeading) {
        this.ctx.fillStyle = '#eab308';
        hdgDisplay = `H ${this.formatHdg(ac.pendingClearance.heading)}*▾`;
      } else {
        this.ctx.fillStyle = labelColor;
      }
      this.ctx.fillText(hdgDisplay, boxX + boxWidth - 8, boxY + 8);

      // --- Line 2: Mode-C Current Altitude (left) & Cleared FL Dropdown (right) ---
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = labelColor;
      const curAltStr = ac.altitude <= 11000
        ? `A${(Math.round(ac.altitude / 100)).toString().padStart(3, '0')}`
        : this.formatFL(ac.altitude);
      this.ctx.fillText(curAltStr, boxX + 8, boxY + 22);

      this.ctx.textAlign = 'right';
      if (hasPending && ac.pendingClearance.hasAltitude && ac.pendingClearance.altitude !== ac.assignedAltitude) {
        const pendStr = this.formatAltCode(ac.pendingClearance.altitude);
        this.ctx.fillStyle = '#eab308';
        this.ctx.fillText(`${pendStr}*▾`, boxX + boxWidth - 8, boxY + 22);
      } else if (ac.altitude < ac.assignedAltitude - 100) {
        const clrStr = this.formatAltCode(ac.assignedAltitude);
        this.ctx.fillStyle = isAssumed ? '#22c55e' : labelColor;
        this.ctx.fillText(`▲${clrStr}▾`, boxX + boxWidth - 8, boxY + 22);
      } else if (ac.altitude > ac.assignedAltitude + 100) {
        const clrStr = this.formatAltCode(ac.assignedAltitude);
        this.ctx.fillStyle = '#eab308';
        this.ctx.fillText(`▼${clrStr}▾`, boxX + boxWidth - 8, boxY + 22);
      } else {
        const clrStr = this.formatAltCode(ac.assignedAltitude);
        this.ctx.fillStyle = labelColor;
        this.ctx.fillText(`${clrStr}▾`, boxX + boxWidth - 8, boxY + 22);
      }

      // --- Line 3: Ground Speed (left) & Destination (right) ---
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = labelColor;
      const spdStr = `${Math.round(ac.speed).toString().padStart(4, '0')}kt`;
      this.ctx.fillText(spdStr, boxX + 8, boxY + 37);

      this.ctx.textAlign = 'right';
      const destStr = ac.dest || 'WMKK';
      this.ctx.fillStyle = labelColor;
      this.ctx.fillText(destStr, boxX + boxWidth - 8, boxY + 37);

      // --- Line 4: Exit Flight Level ("XFL FL250") & Climb/Descent Indicator ---
      this.ctx.textAlign = 'left';
      this.ctx.font = 'bold 10px "Consolas", monospace';
      const xflCode = ac.exitLevel
        ? (ac.exitLevel <= 11000 ? `A${(Math.round(ac.exitLevel / 100)).toString().padStart(3, '0')}` : `FL${Math.round(ac.exitLevel / 100)}`)
        : (ac.exitFL ? `FL${ac.exitFL}` : 'FL250');
      this.ctx.fillStyle = isAssumed ? '#38bdf8' : labelColor;
      this.ctx.fillText(`XFL ${xflCode}`, boxX + 8, boxY + 52);

      this.ctx.textAlign = 'right';
      this.ctx.font = '9px "Consolas", monospace';
      const targetExitFt = ac.exitLevel || (ac.exitFL ? ac.exitFL * 100 : 25000);
      const clbOrDes = targetExitFt > ac.altitude ? '▲CLB' : '▼DES';
      this.ctx.fillStyle = isAssumed ? '#94a3b8' : 'rgba(220, 38, 78, 0.7)';
      this.ctx.fillText(clbOrDes, boxX + boxWidth - 8, boxY + 53);

      // --- Pilot Wilco / Execution Action Button (if hasPending) ---
      if (hasPending) {
        const btnY = boxY + 70;
        const btnW = boxWidth - 12;
        const btnH = 18;
        if (this.role === 'pilot') {
          this.ctx.fillStyle = '#16a34a';
          this.ctx.fillRect(boxX + 6, btnY, btnW, btnH);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = 'bold 9px "Consolas", monospace';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('▶ WILCO / EXEC', boxX + boxWidth / 2, btnY + btnH / 2);
        } else {
          this.ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
          this.ctx.fillRect(boxX + 6, btnY, btnW, btnH);
          this.ctx.strokeStyle = '#eab308';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(boxX + 6, btnY, btnW, btnH);
          this.ctx.fillStyle = '#eab308';
          this.ctx.font = '9px "Consolas", monospace';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('⏳ AWAITING PILOT', boxX + boxWidth / 2, btnY + btnH / 2);
        }
      }

      this.ctx.restore();
    });
  }

  // Draw Background matching IMG_6687.jpg (flat dark ATM CRT background)
  drawBackground(width, height) {
    this.ctx.fillStyle = '#11161d';
    this.ctx.fillRect(0, 0, width, height);
  }

  // Main 60 FPS Render Loop
  render() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.container.clientWidth || window.innerWidth || 800;
    const height = this.container.clientHeight || window.innerHeight || 800;

    if (width > 0 && height > 0 && (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr))) {
      this.resizeCanvas();
    }

    this.ctx.clearRect(0, 0, width, height);

    this.updateAlerts90s();
    this.drawBackground(width, height);
    this.drawDangerAreas();
    this.drawAirways();
    this.drawAircraftRoutes(); // Highlighted in green when toggled on!
    this.drawWaypoints();
    this.drawAircraft();

    requestAnimationFrame(() => this.render());
  }
}

if (typeof window !== 'undefined') {
  window.ATCRadarView = ATCRadarView;
  window.ALTITUDE_OPTIONS = ALTITUDE_OPTIONS;
  window.HEADING_OPTIONS = HEADING_OPTIONS;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ATCRadarView, ALTITUDE_OPTIONS, HEADING_OPTIONS };
}
