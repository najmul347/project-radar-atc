// Student ATC Radar Position Controller
(function () {
  const radar = new ATCRadarView({ role: 'atc' });

  // Clearance Popover DOM
  const clearancePopover = document.getElementById('clearancePopover');
  const popCallsign = document.getElementById('popCallsign');
  const popType = document.getElementById('popType');
  const closePopover = document.getElementById('closePopover');
  const popCurAlt = document.getElementById('popCurAlt');
  const popCurHdg = document.getElementById('popCurHdg');
  const popCurSpd = document.getElementById('popCurSpd');

  const popSelectAltFL = document.getElementById('popSelectAltFL');
  const popSelectHeading = document.getElementById('popSelectHeading');
  const popInputSpeed = document.getElementById('popInputSpeed');
  const btnSendClearance = document.getElementById('btnSendClearance');

  let activeTargetAc = null;

  // Populate Dropdown Options: Altitudes (A020 to A110, FL130 to FL550)
  if (popSelectAltFL && window.ALTITUDE_OPTIONS) {
    popSelectAltFL.innerHTML = '';
    window.ALTITUDE_OPTIONS.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt.feet;
      el.textContent = opt.label;
      popSelectAltFL.appendChild(el);
    });
  }

  // Populate Dropdown Options: Headings (360 to 355 in 5° steps)
  if (popSelectHeading && window.HEADING_OPTIONS) {
    popSelectHeading.innerHTML = '';
    window.HEADING_OPTIONS.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt.deg;
      el.textContent = opt.label;
      popSelectHeading.appendChild(el);
    });
  }

  // Open clearance popover when student clicks on an aircraft or its flight label
  radar.onAircraftClicked = function (ac) {
    activeTargetAc = ac;
    popCallsign.textContent = ac.callsign;
    popType.textContent = ac.type;
    popCurAlt.textContent = radar.formatAltCode(ac.altitude);
    popCurHdg.textContent = `${radar.formatHdg(ac.heading)}°`;
    popCurSpd.textContent = `${Math.round(ac.speed)} kt`;

    // Populate with pending or current assigned values
    const targetAlt = ac.pendingClearance ? ac.pendingClearance.altitude : ac.assignedAltitude;
    const targetHdg = ac.pendingClearance ? ac.pendingClearance.heading : ac.assignedHeading;
    const spd = ac.pendingClearance ? ac.pendingClearance.speed : Math.round(ac.assignedSpeed);

    if (popSelectAltFL) {
      popSelectAltFL.value = targetAlt;
      if (!popSelectAltFL.value) {
        // Find closest
        let minDiff = Infinity, best = 28000;
        window.ALTITUDE_OPTIONS.forEach(o => {
          const diff = Math.abs(o.feet - targetAlt);
          if (diff < minDiff) { minDiff = diff; best = o.feet; }
        });
        popSelectAltFL.value = best;
      }
    }

    if (popSelectHeading) {
      popSelectHeading.value = targetHdg;
      if (!popSelectHeading.value) {
        // Round to nearest 5°
        let rounded = Math.round(targetHdg / 5) * 5;
        if (rounded === 0) rounded = 360;
        popSelectHeading.value = rounded;
      }
    }

    if (popInputSpeed) {
      popInputSpeed.value = spd;
    }

    clearancePopover.classList.add('active');
  };

  radar.onStateUpdated = function () {
    if (activeTargetAc) {
      const liveAc = radar.aircraft.find(a => a.id === activeTargetAc.id);
      if (liveAc) {
        activeTargetAc = liveAc;
        popCurAlt.textContent = radar.formatAltCode(liveAc.altitude);
        popCurHdg.textContent = `${radar.formatHdg(liveAc.heading)}°`;
        popCurSpd.textContent = `${Math.round(liveAc.speed)} kt`;
      } else {
        clearancePopover.classList.remove('active');
        activeTargetAc = null;
      }
    }
  };

  closePopover.addEventListener('click', () => {
    clearancePopover.classList.remove('active');
    activeTargetAc = null;
  });

  // Issue clearance to pseudo-pilot
  function issueClearance() {
    if (!activeTargetAc) return;

    let altFeet = parseInt(popSelectAltFL.value, 10);
    let hdg = parseInt(popSelectHeading.value, 10);
    let spd = parseInt(popInputSpeed.value, 10);

    if (isNaN(altFeet) || altFeet < 2000 || altFeet > 60000) {
      altFeet = activeTargetAc.assignedAltitude || 28000;
    }
    if (isNaN(hdg) || hdg < 1 || hdg > 360) {
      hdg = activeTargetAc.assignedHeading || 360;
    }
    if (isNaN(spd) || spd < 100 || spd > 550) {
      spd = Math.round(activeTargetAc.speed);
    }

    const altCode = radar.formatAltCode(altFeet);

    // Emit student clearance to server (Pending pilot execution)
    radar.socket.emit('student_set_clearance', {
      sessionId: radar.sessionId,
      id: activeTargetAc.id,
      clearedHeading: hdg,
      clearedAltitude: altFeet,
      clearedSpeed: spd
    });

    if (window.atcAudio) {
      window.atcAudio.playTransmitChirp();
    }

    clearancePopover.classList.remove('active');
    radar.showToast(`Clearance issued to ${activeTargetAc.callsign}: Heading ${radar.formatHdg(hdg)}°, ${altCode}. Awaiting pilot execution.`);
  }

  btnSendClearance.addEventListener('click', issueClearance);

  // Quick Action Shortcuts for Clearance Popover
  window.setPopAlt = function (feet) {
    if (popSelectAltFL) {
      popSelectAltFL.value = feet;
    }
  };

  window.adjPopAlt = function (deltaFeet) {
    if (!popSelectAltFL) return;
    let cur = parseInt(popSelectAltFL.value, 10) || 28000;
    let next = cur + deltaFeet;
    // Find closest in ALTITUDE_OPTIONS
    let minDiff = Infinity, best = cur;
    window.ALTITUDE_OPTIONS.forEach(o => {
      const diff = Math.abs(o.feet - next);
      if (diff < minDiff) { minDiff = diff; best = o.feet; }
    });
    popSelectAltFL.value = best;
  };

  window.setPopHdg = function (hdg) {
    if (popSelectHeading) {
      popSelectHeading.value = hdg;
    }
  };

  window.adjPopHdg = function (delta) {
    if (!popSelectHeading) return;
    let cur = parseInt(popSelectHeading.value, 10) || 360;
    let next = (cur + delta + 360) % 360;
    if (next === 0) next = 360;
    let rounded = Math.round(next / 5) * 5;
    if (rounded === 0) rounded = 360;
    popSelectHeading.value = rounded;
  };

  window.directPopWp = function (wpName) {
    if (!activeTargetAc || !popSelectHeading) return;
    const wp = radar.waypoints.find(w => w.name === wpName);
    if (!wp) return;

    const dx = wp.x - activeTargetAc.x;
    const dy = wp.y - activeTargetAc.y;
    let rad = Math.atan2(dx, dy);
    let deg = Math.round((rad * 180 / Math.PI + 360) % 360);
    if (deg === 0) deg = 360;

    let rounded = Math.round(deg / 5) * 5;
    if (rounded === 0) rounded = 360;
    popSelectHeading.value = rounded;
  };

})();