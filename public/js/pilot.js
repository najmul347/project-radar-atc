// Pseudo-Pilot & Supervisor Position Controller
(function () {
  const radar = new ATCRadarView({ role: 'pilot' });

  // Drawer Elements
  const pilotDrawer = document.getElementById('pilotDrawer');
  const btnToggleDrawer = document.getElementById('btnToggleDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');

  // Pending Clearance Alert in Drawer
  const pendingAlertBox = document.getElementById('pendingAlertBox');
  const pendingDetailsText = document.getElementById('pendingDetailsText');
  const btnWilcoExecute = document.getElementById('btnWilcoExecute');

  // Aircraft Selector & Info Strip
  const drawerTrafficCount = document.getElementById('drawerTrafficCount');
  const pilotAircraftSelect = document.getElementById('pilotAircraftSelect');
  const drawerCallsign = document.getElementById('drawerCallsign');
  const drawerType = document.getElementById('drawerType');
  const drawerCurAlt = document.getElementById('drawerCurAlt');
  const drawerCurHdg = document.getElementById('drawerCurHdg');
  const drawerCurSpd = document.getElementById('drawerCurSpd');
  const drawerDest = document.getElementById('drawerDest');
  const drawerXFL = document.getElementById('drawerXFL');
  const activeHdgVal = document.getElementById('activeHdgVal');
  const activeAltVal = document.getElementById('activeAltVal');
  const activeSpdVal = document.getElementById('activeSpdVal');

  // Inputs & Execute
  const drawerSelectHdg = document.getElementById('drawerSelectHdg');
  const drawerSelectAlt = document.getElementById('drawerSelectAlt');
  const drawerInputSpd = document.getElementById('drawerInputSpd');
  const btnManualExecute = document.getElementById('btnManualExecute');

  // Instructor / Supervisor Tools
  const btnPauseResume = document.getElementById('btnPauseResume');
  const pauseBtnIcon = document.getElementById('pauseBtnIcon');
  const pauseBtnText = document.getElementById('pauseBtnText');
  const btnResetSim = document.getElementById('btnResetSim');
  const btnSpawnModal = document.getElementById('btnSpawnModal');
  const btnLoadGameModal = document.getElementById('btnLoadGameModal');
  const spawnModal = document.getElementById('spawnModal');
  const closeSpawnModal = document.getElementById('closeSpawnModal');
  const cancelSpawn = document.getElementById('cancelSpawn');
  const confirmSpawn = document.getElementById('confirmSpawn');
  const spawnCallsign = document.getElementById('spawnCallsign');
  const spawnType = document.getElementById('spawnType');
  const spawnEntryPreset = document.getElementById('spawnEntryPreset');
  const spawnAltitudeSelect = document.getElementById('spawnAltitudeSelect');
  const spawnXFLInput = document.getElementById('spawnXFLInput');
  const spawnSpeed = document.getElementById('spawnSpeed');
  const spawnSaveToSlotCheck = document.getElementById('spawnSaveToSlotCheck');
  const spawnSlotSelectWrap = document.getElementById('spawnSlotSelectWrap');
  const spawnSaveSlotId = document.getElementById('spawnSaveSlotId');

  // Load Game Modal Elements
  const loadGameModal = document.getElementById('loadGameModal');
  const closeLoadGameModal = document.getElementById('closeLoadGameModal');
  const btnCloseLoadGameFooter = document.getElementById('btnCloseLoadGameFooter');
  const btnRefreshScenarios = document.getElementById('btnRefreshScenarios');
  const scenariosListContainer = document.getElementById('scenariosListContainer');
  const loadGameCurrentSession = document.getElementById('loadGameCurrentSession');

  let selectedId = null;
  let pendingAircraftId = null;

  // Populate Spawn Altitude Dropdown (A020 to A110, FL130 to FL550)
  if (spawnAltitudeSelect && window.ALTITUDE_OPTIONS) {
    spawnAltitudeSelect.innerHTML = '';
    window.ALTITUDE_OPTIONS.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.feet;
      el.textContent = `${opt.code} (${(opt.feet).toLocaleString()} ft)`;
      if (opt.code === 'FL330') el.selected = true;
      spawnAltitudeSelect.appendChild(el);
    });
  }

  // Toggle Save to Library Slot dropdown
  if (spawnSaveToSlotCheck && spawnSlotSelectWrap) {
    spawnSaveToSlotCheck.addEventListener('change', () => {
      spawnSlotSelectWrap.style.display = spawnSaveToSlotCheck.checked ? 'block' : 'none';
    });
  }

  // Populate Heading Dropdown (360 to 355 in 5° steps) with Blank option
  if (drawerSelectHdg && window.HEADING_OPTIONS) {
    drawerSelectHdg.innerHTML = '';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '-- Blank (Maintain Heading) --';
    blankOpt.selected = true;
    drawerSelectHdg.appendChild(blankOpt);

    window.HEADING_OPTIONS.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.deg;
      el.textContent = opt.label;
      drawerSelectHdg.appendChild(el);
    });
  }

  // Populate Altitude Dropdown (A020 to A110, FL130 to FL550) with Blank option
  if (drawerSelectAlt && window.ALTITUDE_OPTIONS) {
    drawerSelectAlt.innerHTML = '';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '-- Blank (Maintain Altitude) --';
    blankOpt.selected = true;
    drawerSelectAlt.appendChild(blankOpt);

    window.ALTITUDE_OPTIONS.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.feet;
      el.textContent = opt.label;
      drawerSelectAlt.appendChild(el);
    });
  }

  // Toggle Drawer
  if (btnToggleDrawer) {
    btnToggleDrawer.addEventListener('click', () => {
      pilotDrawer.classList.toggle('collapsed');
      btnToggleDrawer.classList.toggle('active', !pilotDrawer.classList.contains('collapsed'));
    });
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => {
      pilotDrawer.classList.add('collapsed');
      btnToggleDrawer.classList.remove('active');
    });
  }

  // When aircraft is clicked on radar canvas (or blip/label clicked)
  radar.onAircraftClicked = function (ac) {
    selectAircraft(ac.id);

    // If this aircraft has a pending clearance from student, prompt immediate execution!
    if (ac.pendingClearance) {
      pilotDrawer.classList.remove('collapsed');
      btnToggleDrawer.classList.add('active');
    }
  };

  radar.onClearanceIssued = function (data) {
    // Student just issued a clearance! Highlight it in the pilot console
    pendingAircraftId = data.aircraft.id;
    selectAircraft(pendingAircraftId);
    pilotDrawer.classList.remove('collapsed');
    btnToggleDrawer.classList.add('active');
  };

  radar.onStateUpdated = function () {
    drawerTrafficCount.textContent = `${radar.aircraft.length} ACTIVE`;

    // Populate dropdown
    const currentSelected = pilotAircraftSelect.value;
    pilotAircraftSelect.innerHTML = '';
    radar.aircraft.forEach((ac) => {
      const opt = document.createElement('option');
      opt.value = ac.id;
      const pendMark = ac.pendingClearance ? ' ★ [PENDING ATC CLEARANCE]' : '';
      const altCode = radar.formatAltCode(ac.altitude);
      opt.textContent = `${ac.callsign} (${ac.type}) - ${altCode} / ${radar.formatHdg(ac.heading)}°${pendMark}`;
      pilotAircraftSelect.appendChild(opt);
    });

    if (selectedId && radar.aircraft.some(a => a.id === selectedId)) {
      pilotAircraftSelect.value = selectedId;
    } else if (radar.aircraft.length > 0) {
      selectAircraft(radar.aircraft[0].id);
    }

    updateSelectedInfo();
    updatePendingClearanceAlert();
    updatePauseButton();
  };

  function updatePauseButton() {
    if (radar.isPaused) {
      if (pauseBtnIcon) pauseBtnIcon.textContent = '▶';
      if (pauseBtnText) pauseBtnText.textContent = 'Run Session';
    } else {
      if (pauseBtnIcon) pauseBtnIcon.textContent = '⏸';
      if (pauseBtnText) pauseBtnText.textContent = 'Pause Session';
    }
  }

  function selectAircraft(id) {
    selectedId = id;
    radar.selectedAircraftId = id;
    pilotAircraftSelect.value = id;

    const ac = radar.aircraft.find(a => a.id === id);
    if (!ac) return;

    // Blank out maneuver options so that only explicitly filled options will be executed
    if (drawerSelectHdg) {
      drawerSelectHdg.value = '';
    }

    if (drawerSelectAlt) {
      drawerSelectAlt.value = '';
    }

    if (drawerInputSpd) {
      drawerInputSpd.value = '';
    }

    updateSelectedInfo();
    updatePendingClearanceAlert();
  }

  pilotAircraftSelect.addEventListener('change', () => {
    selectAircraft(pilotAircraftSelect.value);
  });

  function updateSelectedInfo() {
    const ac = radar.aircraft.find(a => a.id === selectedId);
    if (!ac) return;

    drawerCallsign.textContent = ac.callsign;
    drawerType.textContent = ac.type;
    drawerCurAlt.textContent = radar.formatAltCode(ac.altitude);
    drawerCurHdg.textContent = `${radar.formatHdg(ac.heading)}°`;
    drawerCurSpd.textContent = Math.round(ac.speed).toString().padStart(4, '0');
    if (drawerDest) drawerDest.textContent = ac.dest || 'WMKK';

    if (drawerXFL) {
      if (ac.exitLevel) {
        const xflCode = ac.exitLevel <= 11000
          ? `A${(Math.round(ac.exitLevel / 100)).toString().padStart(3, '0')}`
          : `FL${Math.round(ac.exitLevel / 100)}`;
        const dir = ac.exitLevel > ac.altitude ? '▲CLB' : (ac.exitLevel < ac.altitude ? '▼DES' : '—LVL');
        drawerXFL.textContent = `${xflCode} (${dir})`;
        drawerXFL.style.color = ac.exitLevel > ac.altitude ? '#38bdf8' : (ac.exitLevel < ac.altitude ? '#f59e0b' : '#22c55e');
      } else {
        drawerXFL.textContent = 'None';
        drawerXFL.style.color = '#94a3b8';
      }
    }

    activeHdgVal.textContent = `${radar.formatHdg(ac.assignedHeading)}°`;
    activeAltVal.textContent = radar.formatAltCode(ac.assignedAltitude);
    activeSpdVal.textContent = Math.round(ac.assignedSpeed).toString().padStart(4, '0');

    const btnToggleAssume = document.getElementById('btnToggleAssume');
    if (btnToggleAssume) {
      btnToggleAssume.textContent = ac.isAssumed
        ? '✓ Release Control (Turn Maroon)'
        : '✓ Assume Control (Turn White)';
      btnToggleAssume.style.borderColor = ac.isAssumed ? '#22c55e' : '#38bdf8';
      btnToggleAssume.style.color = ac.isAssumed ? '#22c55e' : '#38bdf8';
    }
  }

  const btnToggleAssume = document.getElementById('btnToggleAssume');
  if (btnToggleAssume) {
    btnToggleAssume.addEventListener('click', () => {
      const ac = radar.aircraft.find(a => a.id === selectedId);
      if (!ac) return;
      const newState = !ac.isAssumed;
      ac.isAssumed = newState;
      radar.socket.emit('assume_aircraft', {
        sessionId: radar.sessionId,
        id: ac.id,
        isAssumed: newState
      });
      if (window.atcAudio) window.atcAudio.playTransmitChirp();
      updateSelectedInfo();
    });
  }

  function updatePendingClearanceAlert() {
    let targetPendingAc = radar.aircraft.find(a => a.id === selectedId && a.pendingClearance);
    if (!targetPendingAc) {
      targetPendingAc = radar.aircraft.find(a => a.pendingClearance);
    }

    if (targetPendingAc && targetPendingAc.pendingClearance) {
      pendingAircraftId = targetPendingAc.id;
      const pc = targetPendingAc.pendingClearance;
      const parts = [];
      if (pc.hasHeading && pc.heading !== undefined) {
        parts.push(`Turn Heading <b>${radar.formatHdg(pc.heading)}°</b>`);
      }
      if (pc.hasAltitude && pc.altitude !== undefined) {
        const altStr = radar.formatAltCode(pc.altitude);
        parts.push(`Climb/Descend <b>${altStr}</b>`);
      }
      if (pc.hasSpeed && pc.speed !== undefined) {
        parts.push(`Speed <b>${pc.speed}kt</b>`);
      }
      if (parts.length === 0) {
        if (pc.heading !== undefined) parts.push(`Heading <b>${radar.formatHdg(pc.heading)}°</b>`);
        if (pc.altitude !== undefined) parts.push(`Alt <b>${radar.formatAltCode(pc.altitude)}</b>`);
        if (pc.speed !== undefined) parts.push(`Speed <b>${pc.speed}kt</b>`);
      }
      pendingDetailsText.innerHTML = `<b>${targetPendingAc.callsign}</b>: ATC instructed ${parts.join(', ')}.`;
      pendingAlertBox.classList.add('active');
    } else {
      pendingAircraftId = null;
      pendingAlertBox.classList.remove('active');
    }
  }

  // Wilco & Execute Button (Accepts and initiates the student's keyed-in clearance)
  // Follows through with the keyed-in heading, FL, and/or speed
  btnWilcoExecute.addEventListener('click', () => {
    let ac = radar.aircraft.find(a => a.id === pendingAircraftId);
    if (!ac || !ac.pendingClearance) {
      ac = radar.aircraft.find(a => a.pendingClearance);
    }
    if (!ac || !ac.pendingClearance) return;

    const pc = ac.pendingClearance;
    const payload = {
      sessionId: radar.sessionId,
      id: ac.id,
      assignedHeading: pc.heading,
      assignedAltitude: pc.altitude,
      assignedSpeed: pc.speed
    };

    radar.socket.emit('pilot_execute_clearance', payload);

    if (window.atcAudio) window.atcAudio.playTransmitChirp();
    pendingAlertBox.classList.remove('active');
  });

  // Manual Execute Button: Options are blank by default;
  // If only one maneuver is filled, ONLY that maneuver will be followed through!
  btnManualExecute.addEventListener('click', () => {
    const ac = radar.aircraft.find(a => a.id === selectedId);
    if (!ac) return;

    const hdgRaw = drawerSelectHdg ? drawerSelectHdg.value.trim() : '';
    const altRaw = drawerSelectAlt ? drawerSelectAlt.value.trim() : '';
    const spdRaw = drawerInputSpd ? drawerInputSpd.value.trim() : '';

    const hasHdg = hdgRaw !== '';
    const hasAlt = altRaw !== '';
    const hasSpd = spdRaw !== '';

    if (!hasHdg && !hasAlt && !hasSpd) {
      radar.showToast('No maneuver specified. Please select a Heading, Altitude, or Speed.', 'warning');
      return;
    }

    const payload = {
      sessionId: radar.sessionId,
      id: ac.id
    };
    const summaries = [];

    if (hasHdg) {
      const parsedHdg = parseInt(hdgRaw, 10);
      if (!isNaN(parsedHdg) && parsedHdg >= 1 && parsedHdg <= 360) {
        payload.assignedHeading = parsedHdg;
        summaries.push(`Heading ${parsedHdg.toString().padStart(3, '0')}°`);
      }
    }

    if (hasAlt) {
      const parsedAlt = parseInt(altRaw, 10);
      if (!isNaN(parsedAlt) && parsedAlt >= 1000 && parsedAlt <= 55000) {
        payload.assignedAltitude = parsedAlt;
        summaries.push(radar.formatAltCode(parsedAlt));
      }
    }

    if (hasSpd) {
      const parsedSpd = parseInt(spdRaw, 10);
      if (!isNaN(parsedSpd) && parsedSpd >= 100 && parsedSpd <= 600) {
        payload.assignedSpeed = parsedSpd;
        summaries.push(`${parsedSpd}kt`);
      }
    }

    // Initiate aircraft maneuver from pilot console
    radar.socket.emit('pilot_execute_clearance', payload);

    if (window.atcAudio) window.atcAudio.playTransmitChirp();
    radar.showToast(`Maneuver initiated for ${ac.callsign}: ${summaries.join(', ')}.`);

    // Reset controls back to blank ready for next command
    if (drawerSelectHdg) drawerSelectHdg.value = '';
    if (drawerSelectAlt) drawerSelectAlt.value = '';
    if (drawerInputSpd) drawerInputSpd.value = '';
  });

  // Quick Action Functions for Pilot Drawer
  window.drawerDirectWp = function (wpName) {
    const ac = radar.aircraft.find(a => a.id === selectedId);
    const wp = radar.waypoints.find(w => w.name === wpName);
    if (!ac || !wp) return;

    const dx = wp.x - ac.x;
    const dy = wp.y - ac.y;
    let rad = Math.atan2(dx, dy);
    let deg = Math.round((rad * 180 / Math.PI + 360) % 360);
    if (deg === 0) deg = 360;

    const roundedHdg = Math.round(deg / 5) * 5;
    if (drawerSelectHdg) drawerSelectHdg.value = (roundedHdg === 0 ? 360 : roundedHdg);
  };

  window.drawerAdjHdg = function (delta) {
    const ac = radar.aircraft.find(a => a.id === selectedId);
    if (!ac) return;
    const baseHdg = (drawerSelectHdg && drawerSelectHdg.value) ? parseInt(drawerSelectHdg.value, 10) : ac.assignedHeading;
    let newHdg = ((baseHdg + delta - 1) % 360 + 360) % 360 + 1;
    let roundedHdg = Math.round(newHdg / 5) * 5;
    if (roundedHdg <= 0) roundedHdg = 360;
    if (drawerSelectHdg) drawerSelectHdg.value = roundedHdg;
  };

  window.drawerSetAltCode = function (code) {
    if (!window.ALTITUDE_OPTIONS) return;
    const found = window.ALTITUDE_OPTIONS.find(o => o.code === code);
    if (found && drawerSelectAlt) {
      drawerSelectAlt.value = found.feet;
    }
  };

  window.drawerSetSpd = function (spd) {
    if (drawerInputSpd) drawerInputSpd.value = spd;
  };

  window.drawerClearAll = function () {
    if (drawerSelectHdg) drawerSelectHdg.value = '';
    if (drawerSelectAlt) drawerSelectAlt.value = '';
    if (drawerInputSpd) drawerInputSpd.value = '';
    radar.showToast('Maneuver options cleared to blank.');
  };

  // Instructor / Supervisor Tools
  btnPauseResume.addEventListener('click', () => {
    radar.socket.emit('toggle_pause', { sessionId: radar.sessionId });
  });

  btnResetSim.addEventListener('click', () => {
    if (confirm(`Reset Session ${radar.sessionId} to initial scenario (01:00 UTC)?`)) {
      radar.socket.emit('reset_simulation', { sessionId: radar.sessionId });
    }
  });

  // Spawn Modal Controls: Altitude & Speed only (Heading automated along entry corridor)
  btnSpawnModal.addEventListener('click', () => {
    spawnModal.classList.add('active');
  });

  closeSpawnModal.addEventListener('click', () => {
    spawnModal.classList.remove('active');
  });

  cancelSpawn.addEventListener('click', () => {
    spawnModal.classList.remove('active');
  });

  confirmSpawn.addEventListener('click', () => {
    const callsign = spawnCallsign.value.trim().toUpperCase() || 'MAS' + Math.floor(Math.random() * 800 + 100);
    const type = spawnType.value || 'B738';
    const corridorId = spawnEntryPreset ? spawnEntryPreset.value : 'NW_SE';
    const alt = spawnAltitudeSelect ? (parseInt(spawnAltitudeSelect.value, 10) || 33000) : 33000;
    const spd = spawnSpeed ? (parseInt(spawnSpeed.value, 10) || 420) : 420;
    const xflRaw = spawnXFLInput ? spawnXFLInput.value.trim().toUpperCase() : '';
    const saveToSlotId = (spawnSaveToSlotCheck && spawnSaveToSlotCheck.checked && spawnSaveSlotId)
      ? parseInt(spawnSaveSlotId.value, 10)
      : null;

    // Parse supervisor XFL key-in (e.g. "FL250", "250", "310", "A080")
    let exitLevel = null;
    let exitFL = null;
    if (xflRaw) {
      const matchA = xflRaw.match(/^A\s*(\d{2,3})$/);
      if (matchA) {
        exitLevel = parseInt(matchA[1], 10) * 100;
        exitFL = Math.round(exitLevel / 100);
      } else {
        const clean = xflRaw.replace(/^FL\s*/, '');
        const n = parseInt(clean, 10);
        if (!isNaN(n) && n > 0) {
          if (n < 100) exitLevel = n * 1000;
          else if (n <= 600) exitLevel = n * 100;
          else exitLevel = n;
          exitFL = Math.round(exitLevel / 100);
        }
      }
    }

    radar.socket.emit('spawn_aircraft', {
      sessionId: radar.sessionId,
      corridorId,
      altitude: alt,
      speed: spd,
      exitLevel,
      exitFL,
      callsign,
      type,
      saveToSlotId
    });

    if (spawnXFLInput) spawnXFLInput.value = '';
    spawnModal.classList.remove('active');
    const corridorText = spawnEntryPreset ? spawnEntryPreset.options[spawnEntryPreset.selectedIndex].text : corridorId;
    const xflInfo = exitLevel ? ` [XFL: ${exitLevel <= 11000 ? 'A' + exitFL : 'FL' + exitFL}]` : '';
    radar.showToast(`Spawned ${callsign} (${type}): ${corridorText}${xflInfo}`);
  });

  // ==========================================================================
  // Load Game & Stored Flight Plans Modal (15 Persistent Slots)
  // ==========================================================================
  function openLoadGameModal() {
    if (loadGameCurrentSession) {
      loadGameCurrentSession.textContent = String(radar.sessionId).padStart(2, '0');
    }
    loadGameModal.classList.add('active');
    loadGameModal.style.display = 'flex';
    fetchAndRenderScenarios();
  }

  function closeLoadGameModalFn() {
    loadGameModal.classList.remove('active');
    loadGameModal.style.display = 'none';
  }

  if (btnLoadGameModal) {
    btnLoadGameModal.addEventListener('click', openLoadGameModal);
  }

  if (closeLoadGameModal) {
    closeLoadGameModal.addEventListener('click', closeLoadGameModalFn);
  }

  if (btnCloseLoadGameFooter) {
    btnCloseLoadGameFooter.addEventListener('click', closeLoadGameModalFn);
  }

  if (btnRefreshScenarios) {
    btnRefreshScenarios.addEventListener('click', fetchAndRenderScenarios);
  }

  async function fetchAndRenderScenarios() {
    if (!scenariosListContainer) return;
    scenariosListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--atm-text-muted);">Loading 15 flight plan scenarios...</div>';

    try {
      const res = await fetch('/api/scenarios');
      if (!res.ok) throw new Error('Failed to fetch scenarios');
      const summaries = await res.json();
      renderScenariosCards(summaries);
    } catch (err) {
      console.warn('REST fetch failed, requesting scenarios via socket:', err);
      radar.socket.emit('get_scenarios', (summaries) => {
        if (summaries) renderScenariosCards(summaries);
      });
    }
  }

  function renderScenariosCards(scenarios) {
    if (!scenariosListContainer) return;
    scenariosListContainer.innerHTML = '';

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      scenariosListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--atm-text-muted);">No scenarios available.</div>';
      return;
    }

    scenarios.forEach((s) => {
      const card = document.createElement('div');
      card.className = `scenario-slot-card ${s.aircraftCount > 0 ? 'has-traffic' : ''}`;

      const routesHtml = (s.routes && s.routes.length > 0)
        ? s.routes.map(r => {
            const parts = r.split(' ');
            const cs = parts[0] || '';
            const route = parts.slice(1).join(' ').replace(/[()]/g, '');
            return `<span class="traffic-chip"><span class="chip-cs">${cs}</span><span class="chip-route">✈ ${route}</span></span>`;
          }).join('')
        : '<span style="font-size: 10px; color: var(--atm-text-muted); font-style: italic;">No active traffic in this slot</span>';

      card.innerHTML = `
        <div class="scenario-card-top">
          <span class="scenario-slot-badge">SLOT ${String(s.id).padStart(2, '0')}</span>
          <span class="scenario-slot-title">${s.title}</span>
          <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">
            ${s.aircraftCount} AIRCRAFT
          </span>
        </div>
        <div class="scenario-slot-desc">${s.description || 'Custom ATC scenario'}</div>
        <div class="scenario-traffic-routes">${routesHtml}</div>
        <div class="scenario-actions-bar">
          <button type="button" class="btn-save-slot" title="Save current Sector 04 traffic into Slot ${s.id}">
            💾 Save Current Sector Traffic
          </button>
          <button type="button" class="btn-load-slot" title="Load Scenario ${s.id} into Session ${radar.sessionId}">
            ▶ Load Game (Slot ${s.id})
          </button>
        </div>
      `;

      // Wire Load Button
      const btnLoad = card.querySelector('.btn-load-slot');
      btnLoad.addEventListener('click', () => {
        if (confirm(`Load "${s.title}" (Slot ${s.id}) into Session ${radar.sessionId}? Current traffic will be replaced.`)) {
          radar.socket.emit('load_scenario', {
            sessionId: radar.sessionId,
            slotId: s.id
          });
          closeLoadGameModalFn();
        }
      });

      // Wire Save Button
      const btnSave = card.querySelector('.btn-save-slot');
      btnSave.addEventListener('click', () => {
        const customTitle = prompt(`Enter title for Scenario Slot ${s.id}:`, s.title);
        if (customTitle !== null) {
          radar.socket.emit('save_scenario', {
            sessionId: radar.sessionId,
            slotId: s.id,
            title: customTitle.trim() || `Scenario Slot ${s.id}`,
            description: `Saved from Session ${radar.sessionId} with ${radar.aircraft.length} aircraft`
          });
        }
      });

      scenariosListContainer.appendChild(card);
    });
  }

  // Socket Event Listeners for Load Game & Scenarios
  radar.socket.on('scenario_loaded', (data) => {
    radar.showToast(`Loaded Game: ${data.title} (${data.aircraftCount} aircraft).`);
    if (window.atcAudio) window.atcAudio.playTransmitChirp();
    closeLoadGameModalFn();
  });

  radar.socket.on('scenario_saved', (data) => {
    radar.showToast(`Saved to Slot ${data.slotId}: "${data.title}".`);
    if (loadGameModal.classList.contains('active')) {
      fetchAndRenderScenarios();
    }
  });

  radar.socket.on('scenarios_list', (summaries) => {
    if (loadGameModal.classList.contains('active')) {
      renderScenariosCards(summaries);
    }
  });
})();
