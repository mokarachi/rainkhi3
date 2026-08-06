

/**
 * Enterprise Monsoon Rainfall Observation & Management System (Karachi)
 * Frontend Application Engine (app.js)
 */

// Global Application State
const state = {
  user: null,
  stations: [],
  currentSlotIdx: 0,
  currentRainfallDate: "",
  workerSelectedDate: "",
  selectedSlotIdx: 0,
  workerReadings: Array(8).fill(""),
  masterWorkerMode: "single", // "single" | "batch"
  adminActiveTab: "daily",    // "daily" | "monthly" | "audit" | "users"
  adminSelectedDate: "",
  adminSelectedMonth: "",
  isMapView: false,
  mapInstance: null,
  mapMarkers: [],
  amendContext: null
};

// Standard Slot Schedule
const SLOT_LABELS = [
  { utc: "03:00 - 06:00 UTC", pkt: "11:00 PKT" },
  { utc: "06:00 - 09:00 UTC", pkt: "14:00 PKT" },
  { utc: "09:00 - 12:00 UTC", pkt: "17:00 PKT" },
  { utc: "12:00 - 15:00 UTC", pkt: "20:00 PKT" },
  { utc: "15:00 - 18:00 UTC", pkt: "23:00 PKT" },
  { utc: "18:00 - 21:00 UTC", pkt: "02:00 PKT (Next)" },
  { utc: "21:00 - 00:00 UTC", pkt: "05:00 PKT (Next)" },
  { utc: "00:00 - 03:00 UTC", pkt: "08:00 PKT (Next)" }
];

/** Safe DOM Text Helper Function */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = text;
  }
}

/** Initializer */
window.addEventListener("DOMContentLoaded", () => {
  startClocks();
  calculateSynopticSlot();
  initDefaultDates();
});

function startClocks() {
  setInterval(() => {
    const now = new Date();
    setText("header-utc-clock", now.toISOString().substring(11, 19) + " UTC");
    
    // Convert to PKT (UTC+5)
    const pktTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
    setText("header-pkt-clock", pktTime.toISOString().substring(11, 19) + " PKT");
  }, 1000);
}

/**
 * Calculates current active slot and synoptic rainfall date
 * Formula: adjM = (M - 165 + 1440) % 1440; block = Math.floor(adjM / 180); SLOT_MAP = [7,0,1,2,3,4,5,6];
 */
function calculateSynopticSlot() {
  const now = new Date();
  const M = now.getUTCHours() * 60 + now.getUTCMinutes();
  const adjM = (M - 165 + 1440) % 1440;
  const block = Math.floor(adjM / 180);
  const SLOT_MAP = [7, 0, 1, 2, 3, 4, 5, 6];
  
  state.currentSlotIdx = SLOT_MAP[block];

  // Calculate Synoptic Rainfall Date (03:00 UTC boundary)
  let rDate = new Date(now);
  if (now.getUTCHours() < 3) {
    rDate.setUTCDate(rDate.getUTCDate() - 1);
  }
  state.currentRainfallDate = rDate.toISOString().split("T")[0];
  state.workerSelectedDate = state.currentRainfallDate;
  state.selectedSlotIdx = state.currentSlotIdx;
}

function initDefaultDates() {
  const today = state.currentRainfallDate;
  state.adminSelectedDate = today;
  state.adminSelectedMonth = today.substring(0, 7);

  const datePicker = document.getElementById("admin-date-picker");
  if (datePicker) datePicker.value = today;

  const monthPicker = document.getElementById("admin-month-picker");
  if (monthPicker) monthPicker.value = state.adminSelectedMonth;
}

/** Authentication Handler */
function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById("login-phone").value.trim();
  const pin = document.getElementById("login-pin").value.trim();

  if (!phone || !pin) return alert("Please fill all fields.");

  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Authenticating...`;

  google.script.run
    .withSuccessHandler(res => {
      btn.disabled = false;
      btn.innerHTML = `<span>Authenticate Station</span> <i class="fa-solid fa-arrow-right text-xs"></i>`;

      if (res.status === "success") {
        state.user = res.user;
        state.stations = res.stations || [];
        document.getElementById("login-view").classList.add("hidden");
        document.getElementById("app-container").classList.remove("hidden");

        setText("header-station-name", state.user.station);
        setText("header-role-badge", state.user.role);

        routeDashboardView();
      } else {
        alert(res.message);
      }
    })
    .withFailureHandler(err => {
      btn.disabled = false;
      alert("Authentication error: " + err.toString());
    })
    .apiLogin(phone, pin);
}

function handleLogout() {
  state.user = null;
  document.getElementById("app-container").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
}

/** Route View by Role */
function routeDashboardView() {
  const role = state.user.role;
  document.getElementById("worker-dashboard").classList.add("hidden");
  document.getElementById("master-worker-dashboard").classList.add("hidden");
  document.getElementById("admin-dashboard").classList.add("hidden");

  if (role === "WORKER") {
    document.getElementById("worker-dashboard").classList.remove("hidden");
    loadWorkerData();
  } else if (role === "MASTER_WORKER") {
    document.getElementById("master-worker-dashboard").classList.remove("hidden");
    initMasterWorkerDropdowns();
    renderMasterWorkerSingle();
  } else {
    document.getElementById("admin-dashboard").classList.remove("hidden");
    fetchAdminDailyData();
  }
}

/** ================= WORKER DASHBOARD LOGIC ================= */
function loadWorkerData() {
  setText("worker-date-display", state.workerSelectedDate);
  
  // Disable next date button if date >= current date
  const nextBtn = document.getElementById("worker-next-date-btn");
  if (nextBtn) nextBtn.disabled = (state.workerSelectedDate >= state.currentRainfallDate);

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        const myData = res.report.find(r => r.station === state.user.station);
        state.workerReadings = myData ? myData.slots : Array(8).fill("");
        renderWorkerGrid();
        updateWorkerInputCard();
      }
    })
    .apiGetDailyReport(state.workerSelectedDate, state.user.role, state.user.phone);
}

function renderWorkerGrid() {
  const grid = document.getElementById("worker-slot-grid");
  if (!grid) return;
  grid.innerHTML = "";

  let completedCount = 0;
  let totalRain = 0;

  for (let i = 0; i < 8; i++) {
    const val = state.workerReadings[i];
    const isCurrent = (i === state.currentSlotIdx && state.workerSelectedDate === state.currentRainfallDate);
    const isSelected = (i === state.selectedSlotIdx);

    let statusClass = "border-slate-800 bg-slate-950";
    let displayVal = "---";

    if (val === "SEE_NEXT") {
      statusClass = "merged";
      displayVal = "→ Next";
      completedCount++;
    } else if (val !== "" && val !== null) {
      statusClass = "recorded";
      displayVal = (val === "0.01") ? "T" : `${val}mm`;
      completedCount++;
      totalRain += parseFloat(val) || 0;
    } else if (isCurrent) {
      statusClass = "active";
    }

    if (isSelected) statusClass += " ring-2 ring-cyan-400";

    const card = document.createElement("div");
    card.className = `slot-card ${statusClass} rounded-xl p-2 text-center cursor-pointer flex flex-col justify-between h-20`;
    card.onclick = () => selectWorkerSlot(i);
    card.innerHTML = `
      <div class="text-[9px] font-bold text-slate-400 leading-tight">${SLOT_LABELS[i].pkt}</div>
      <div class="text-xs font-black text-white my-1">${displayVal}</div>
      <div class="text-[8px] text-slate-500">${SLOT_LABELS[i].utc.split(' ')[0]}</div>
    `;
    grid.appendChild(card);
  }

  setText("worker-progress-count", `${completedCount} / 8 Slots`);
  setText("worker-daily-total", `${Math.round(totalRain * 100) / 100} mm`);
}

function selectWorkerSlot(idx) {
  state.selectedSlotIdx = idx;
  renderWorkerGrid();
  updateWorkerInputCard();
}

function navigateSlot(direction) {
  const newIdx = state.selectedSlotIdx + direction;
  if (newIdx >= 0 && newIdx < 8) {
    selectWorkerSlot(newIdx);
  }
}

function updateWorkerInputCard() {
  const idx = state.selectedSlotIdx;
  setText("selected-slot-pkt", SLOT_LABELS[idx].pkt);
  setText("selected-slot-utc", `(${SLOT_LABELS[idx].utc})`);

  const nextBtn = document.getElementById("slot-next-btn");
  if (nextBtn) {
    nextBtn.disabled = (state.workerSelectedDate === state.currentRainfallDate && idx >= state.currentSlotIdx);
  }

  // Populate input value
  const val = state.workerReadings[idx];
  const input = document.getElementById("rainfall-input");
  if (input) {
    input.value = (val && val !== "SEE_NEXT") ? val : "";
  }

  // Update accumulate slot choices
  const startSelect = document.getElementById("accumulate-start-slot");
  if (startSelect) {
    startSelect.innerHTML = "";
    for (let i = 0; i < idx; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.innerText = `${SLOT_LABELS[i].pkt} (${SLOT_LABELS[i].utc.split(' ')[0]})`;
      startSelect.appendChild(opt);
    }
  }
}

function changeWorkerDate(dir) {
  const d = new Date(state.workerSelectedDate);
  d.setDate(d.getDate() + dir);
  state.workerSelectedDate = d.toISOString().split("T")[0];
  loadWorkerData();
}

function setTraceValue() {
  const input = document.getElementById("rainfall-input");
  if (input) input.value = "0.01";
}

function toggleAccumulateMode() {
  const check = document.getElementById("accumulate-check");
  const box = document.getElementById("accumulate-selector");
  if (check && box) {
    if (check.checked) box.classList.remove("hidden");
    else box.classList.add("hidden");
  }
}

function submitWorkerReading() {
  const input = document.getElementById("rainfall-input");
  const val = input ? input.value.trim() : "";
  if (!val) return alert("Please enter a valid rainfall value or select Trace.");

  const isAccumulate = document.getElementById("accumulate-check")?.checked;
  const startSlot = isAccumulate ? parseInt(document.getElementById("accumulate-start-slot").value, 10) : state.selectedSlotIdx;

  const payload = {
    phone: state.user.phone,
    station: state.user.station,
    rainfallDate: state.workerSelectedDate,
    startSlot: startSlot,
    endSlot: state.selectedSlotIdx,
    value: val
  };

  const btn = document.getElementById("save-reading-btn");
  if (btn) btn.disabled = true;

  google.script.run
    .withSuccessHandler(res => {
      if (btn) btn.disabled = false;
      if (res.status === "success") {
        loadWorkerData();
        if (document.getElementById("accumulate-check")) {
          document.getElementById("accumulate-check").checked = false;
          toggleAccumulateMode();
        }
      } else {
        alert(res.message);
      }
    })
    .apiSubmitReading(payload);
}

/** ================= MASTER WORKER LOGIC ================= */
function initMasterWorkerDropdowns() {
  const stSelect = document.getElementById("mw-station-dropdown");
  if (stSelect) {
    stSelect.innerHTML = "";
    state.stations.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.name;
      opt.innerText = s.name;
      stSelect.appendChild(opt);
    });
  }

  const slotSelect = document.getElementById("mw-slot-dropdown");
  if (slotSelect) {
    slotSelect.innerHTML = "";
    SLOT_LABELS.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.innerText = `${s.pkt} (${s.utc})`;
      slotSelect.appendChild(opt);
    });
  }
}

function setMasterWorkerMode(mode) {
  state.masterWorkerMode = mode;
  if (mode === "single") {
    document.getElementById("mw-mode-single").className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 text-white";
    document.getElementById("mw-mode-batch").className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400";
    document.getElementById("mw-station-select-container").classList.remove("hidden");
    document.getElementById("mw-slot-select-container").classList.add("hidden");
    document.getElementById("mw-single-container").classList.remove("hidden");
    document.getElementById("mw-batch-container").classList.add("hidden");
  } else {
    document.getElementById("mw-mode-single").className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400";
    document.getElementById("mw-mode-batch").className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 text-white";
    document.getElementById("mw-station-select-container").classList.add("hidden");
    document.getElementById("mw-slot-select-container").classList.remove("hidden");
    document.getElementById("mw-single-container").classList.add("hidden");
    document.getElementById("mw-batch-container").classList.remove("hidden");
    renderMasterWorkerBatch();
  }
}

function renderMasterWorkerSingle() {
  const selectedStation = document.getElementById("mw-station-dropdown").value;
  const container = document.getElementById("mw-single-container");
  container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Loading station data...</div>`;

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        const stData = res.report.find(r => r.station === selectedStation);
        const slots = stData ? stData.slots : Array(8).fill("");
        
        let html = `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 class="text-xs font-bold text-cyan-400 border-b border-slate-800 pb-2">${selectedStation}</h4>
          <div class="grid grid-cols-2 gap-2">`;
        
        slots.forEach((v, i) => {
          html += `
            <div class="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col justify-between">
              <span class="text-[9px] font-bold text-slate-400">${SLOT_LABELS[i].pkt}</span>
              <div class="flex items-center space-x-1 mt-1">
                <input type="number" step="0.1" id="mw-input-${i}" value="${(v && v!=='SEE_NEXT') ? v : ''}" class="w-full bg-slate-900 border border-slate-700 text-xs text-white p-1 rounded font-bold">
                <button onclick="document.getElementById('mw-input-${i}').value='0.01'" class="px-1.5 py-1 bg-amber-500/20 text-amber-400 rounded text-[9px] font-bold">T</button>
              </div>
              <button onclick="saveSingleMasterSlot('${selectedStation}', ${i})" class="mt-1 w-full py-1 bg-cyan-600/30 text-cyan-400 hover:bg-cyan-600 hover:text-white rounded text-[9px] font-bold">Save</button>
            </div>
          `;
        });

        html += `</div></div>`;
        container.innerHTML = html;
      }
    })
    .apiGetDailyReport(state.currentRainfallDate, state.user.role, state.user.phone);
}

function saveSingleMasterSlot(station, slotIdx) {
  const val = document.getElementById(`mw-input-${slotIdx}`).value.trim();
  if (!val) return alert("Enter value.");

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") renderMasterWorkerSingle();
    })
    .apiSubmitReading({
      phone: state.user.phone,
      station: station,
      rainfallDate: state.currentRainfallDate,
      startSlot: slotIdx,
      endSlot: slotIdx,
      value: val
    });
}

function renderMasterWorkerBatch() {
  const slotIdx = parseInt(document.getElementById("mw-slot-dropdown").value, 10);
  const container = document.getElementById("mw-batch-grid");
  container.innerHTML = `<div class="col-span-3 text-center text-xs text-slate-400 py-4">Loading 21 stations...</div>`;

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        container.innerHTML = "";
        state.stations.forEach((st, i) => {
          const stData = res.report.find(r => r.station === st.name);
          const currentVal = stData ? stData.slots[slotIdx] : "";

          const card = document.createElement("div");
          card.className = "bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between";
          card.innerHTML = `
            <div class="truncate mr-2">
              <div class="text-xs font-bold text-slate-200 truncate">${st.name}</div>
              <div class="text-[9px] text-slate-500">Slot ${slotIdx}</div>
            </div>
            <div class="flex items-center space-x-1">
              <input type="number" step="0.1" id="mw-batch-val-${i}" data-station="${st.name}" value="${(currentVal && currentVal!=='SEE_NEXT') ? currentVal : ''}" placeholder="0.0" class="w-16 bg-slate-900 border border-slate-700 text-xs font-bold text-white p-1 rounded text-center">
              <button type="button" onclick="document.getElementById('mw-batch-val-${i}').value='0.01'" class="px-1.5 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded">T</button>
            </div>
          `;
          container.appendChild(card);
        });
      }
    })
    .apiGetDailyReport(state.currentRainfallDate, state.user.role, state.user.phone);
}

function submitMasterBatch() {
  const slotIdx = parseInt(document.getElementById("mw-slot-dropdown").value, 10);
  const entries = [];
  
  state.stations.forEach((st, i) => {
    const input = document.getElementById(`mw-batch-val-${i}`);
    if (input && input.value !== "") {
      entries.push({ station: st.name, value: input.value });
    }
  });

  google.script.run
    .withSuccessHandler(res => {
      alert(res.message);
      renderMasterWorkerBatch();
    })
    .apiBatchSubmit({
      phone: state.user.phone,
      slotIdx: slotIdx,
      rainfallDate: state.currentRainfallDate,
      entries: entries
    });
}

/** ================= ADMIN DASHBOARD & MATRIX LOGIC ================= */
function switchAdminTab(tab) {
  state.adminActiveTab = tab;
  
  // Highlight buttons
  ['daily', 'monthly', 'audit', 'users'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) {
      if (t === tab) btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 text-white";
      else btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white";
    }
  });

  // Toggle Visibility
  document.getElementById("admin-daily-view").classList.add("hidden");
  document.getElementById("admin-monthly-view").classList.add("hidden");
  document.getElementById("admin-map-view").classList.add("hidden");
  document.getElementById("admin-audit-view").classList.add("hidden");
  document.getElementById("admin-users-view").classList.add("hidden");

  document.getElementById("admin-daily-controls").classList.add("hidden");
  document.getElementById("admin-monthly-controls").classList.add("hidden");

  if (tab === "daily") {
    document.getElementById("admin-daily-controls").classList.remove("hidden");
    if (state.isMapView) document.getElementById("admin-map-view").classList.remove("hidden");
    else document.getElementById("admin-daily-view").classList.remove("hidden");
    fetchAdminDailyData();
  } else if (tab === "monthly") {
    document.getElementById("admin-monthly-controls").classList.remove("hidden");
    if (state.isMapView) document.getElementById("admin-map-view").classList.remove("hidden");
    else document.getElementById("admin-monthly-view").classList.remove("hidden");
    fetchAdminMonthlyData();
  } else if (tab === "audit") {
    document.getElementById("admin-audit-view").classList.remove("hidden");
    fetchAuditLogs();
  } else if (tab === "users") {
    document.getElementById("admin-users-view").classList.remove("hidden");
    fetchUsersStatus();
  }
}

function fetchAdminDailyData() {
  const dateVal = document.getElementById("admin-date-picker").value;
  state.adminSelectedDate = dateVal;

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        renderDailyMatrix(res.report);
        if (state.isMapView) renderGisMap(res.report, "daily");
      }
    })
    .apiGetDailyReport(dateVal, state.user.role, state.user.phone);
}

function renderDailyMatrix(data) {
  const tbody = document.getElementById("daily-matrix-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-800/40 transition";
    
    let cellsHtml = `<td class="p-2.5 font-bold text-slate-200">${row.station}</td>`;
    
    row.slots.forEach((v, idx) => {
      let display = "---";
      let colorClass = "text-slate-500";

      if (v === "SEE_NEXT") {
        display = "→ Next";
        colorClass = "text-purple-400 font-bold";
      } else if (v !== "" && v !== null) {
        display = (v === "0.01") ? "T" : v;
        colorClass = "text-cyan-300 font-bold";
      }

      const isEditable = (state.user.role === "ADMIN" || state.user.role === "OPERATIONAL_ADMIN" || state.user.role === "FIELD_SUPERVISOR");
      const clickAttr = isEditable ? `onclick="openAmendModal('${row.station}', '${state.adminSelectedDate}', ${idx}, '${v}')"` : '';

      cellsHtml += `<td class="p-2.5 text-center cursor-pointer hover:bg-slate-800 ${colorClass}" ${clickAttr}>${display}</td>`;
    });

    cellsHtml += `<td class="p-2.5 text-right font-black text-cyan-400">${row.total}</td>`;
    tr.innerHTML = cellsHtml;
    tbody.appendChild(tr);
  });
}

function fetchAdminMonthlyData() {
  const monthVal = document.getElementById("admin-month-picker").value;
  state.adminSelectedMonth = monthVal;

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        renderMonthlyMatrix(res);
        if (state.isMapView) renderGisMap(res.report, "monthly");
      }
    })
    .apiGetMonthlyReport(monthVal, state.user.role, state.user.phone);
}

function renderMonthlyMatrix(res) {
  const header = document.getElementById("monthly-table-header");
  const tbody = document.getElementById("monthly-matrix-body");
  if (!header || !tbody) return;

  let headerHtml = `<th class="p-2.5 font-bold sticky left-0 bg-slate-950 z-10">Station</th>`;
  for (let d = 1; d <= res.daysInMonth; d++) {
    headerHtml += `<th class="p-2 text-center text-[10px]">${d}</th>`;
  }
  headerHtml += `<th class="p-2.5 text-right font-black text-cyan-400">Total</th>`;
  header.innerHTML = headerHtml;

  tbody.innerHTML = "";
  res.report.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-800/40 transition";

    let rowHtml = `<td class="p-2.5 font-bold text-slate-200 sticky left-0 bg-slate-900 truncate max-w-[140px]">${row.station}</td>`;
    for (let d = 1; d <= res.daysInMonth; d++) {
      const val = row.days[d];
      const display = val === 0 ? "·" : (val === 0.01 ? "T" : val);
      const dayStr = `${res.yearMonth}-${String(d).padStart(2, '0')}`;
      
      rowHtml += `<td onclick="jumpToDailyDate('${dayStr}')" class="p-2 text-center text-[11px] cursor-pointer hover:bg-cyan-500/20 ${val > 0 ? 'text-cyan-300 font-bold' : 'text-slate-600'}">${display}</td>`;
    }
    rowHtml += `<td class="p-2.5 text-right font-black text-cyan-400">${row.monthlyTotal}</td>`;
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
}

function jumpToDailyDate(dateStr) {
  document.getElementById("admin-date-picker").value = dateStr;
  switchAdminTab("daily");
}

function changeAdminDate(dir) {
  const d = new Date(state.adminSelectedDate);
  d.setDate(d.getDate() + dir);
  state.adminSelectedDate = d.toISOString().split("T")[0];
  document.getElementById("admin-date-picker").value = state.adminSelectedDate;
  fetchAdminDailyData();
}

/** ================= GIS LEAFLET MAP LOGIC ================= */
function toggleMapView() {
  state.isMapView = !state.isMapView;
  const btn = document.getElementById("toggle-map-btn");
  
  if (state.isMapView) {
    btn.innerHTML = `<i class="fa-solid fa-table-cells mr-1"></i> 📊 Table View`;
    if (state.adminActiveTab === "daily") {
      document.getElementById("admin-daily-view").classList.add("hidden");
      document.getElementById("admin-map-view").classList.remove("hidden");
      fetchAdminDailyData();
    } else if (state.adminActiveTab === "monthly") {
      document.getElementById("admin-monthly-view").classList.add("hidden");
      document.getElementById("admin-map-view").classList.remove("hidden");
      fetchAdminMonthlyData();
    }
  } else {
    btn.innerHTML = `<i class="fa-solid fa-map-location-dot mr-1"></i> 🌐 Map View`;
    document.getElementById("admin-map-view").classList.add("hidden");
    if (state.adminActiveTab === "daily") document.getElementById("admin-daily-view").classList.remove("hidden");
    else if (state.adminActiveTab === "monthly") document.getElementById("admin-monthly-view").classList.remove("hidden");
  }
}

function renderGisMap(data, mode) {
  if (!state.mapInstance) {
    state.mapInstance = L.map('leaflet-map').setView([24.93, 67.11], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: 'OSM / CartoDB'
    }).addTo(state.mapInstance);
  }

  // Clear existing markers
  state.mapMarkers.forEach(m => state.mapInstance.removeLayer(m));
  state.mapMarkers = [];

  data.forEach(st => {
    if (!st.lat || !st.lon) return;

    const val = (mode === "daily") ? st.total : st.monthlyTotal;
    let color = "#9ca3af"; // Gray 0mm
    let radius = 6;

    if (val === 0.01) { color = "#8b5cf6"; radius = 8; }       // Trace Purple
    else if (val > 0 && val <= 10) { color = "#22c55e"; radius = 10; } // Light Green
    else if (val > 10 && val <= 50) { color = "#3b82f6"; radius = 14; } // Moderate Blue
    else if (val > 50) { color = "#ef4444"; radius = 18; }            // Heavy Red

    const marker = L.circleMarker([st.lat, st.lon], {
      color: color,
      fillColor: color,
      fillOpacity: 0.7,
      radius: radius
    }).addTo(state.mapInstance);

    const tooltipVal = (val === 0.01) ? "Trace (T)" : `${val} mm`;
    marker.bindPopup(`
      <div class="font-bold text-white">${st.station}</div>
      <div class="text-[10px] text-slate-400">Lat: ${st.lat}, Lon: ${st.lon}</div>
      <div class="mt-1 font-bold text-cyan-400">${mode.toUpperCase()} Rain: ${tooltipVal}</div>
    `);

    state.mapMarkers.push(marker);
  });
}

/** ================= AUDIT & USERS LOGIC ================= */
function fetchAuditLogs() {
  google.script.run
    .withSuccessHandler(res => {
      const tbody = document.getElementById("audit-logs-body");
      if (!tbody) return;
      tbody.innerHTML = "";
      res.logs.forEach(l => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-800/40 text-[11px]";
        tr.innerHTML = `
          <td class="p-2 text-slate-400 font-mono">${l.timestamp.substring(0, 19)}</td>
          <td class="p-2 text-slate-300">${l.phone}</td>
          <td class="p-2 text-white font-semibold">${l.userName}</td>
          <td class="p-2 text-cyan-400 font-bold">${l.action}</td>
          <td class="p-2 text-slate-300">${l.details}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .apiGetAuditLogs();
}

function fetchUsersStatus() {
  google.script.run
    .withSuccessHandler(res => {
      const tbody = document.getElementById("users-status-body");
      if (!tbody) return;
      tbody.innerHTML = "";
      res.users.forEach(u => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-800/40 text-[11px]";
        tr.innerHTML = `
          <td class="p-2 font-bold text-slate-200">${u.name}</td>
          <td class="p-2 text-cyan-400">${u.role}</td>
          <td class="p-2">${u.status}</td>
          <td class="p-2 text-slate-400 font-mono">${u.lastLogin ? u.lastLogin.substring(0, 19) : "N/A"}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .apiGetUsersStatus();
}

/** ================= ADMIN AMENDMENT MODAL LOGIC ================= */
function openAmendModal(station, targetDate, slotIdx, currentVal) {
  state.amendContext = { station, targetDate, slotIdx };
  setText("amend-station-name", station);
  setText("amend-target-date", targetDate);
  setText("amend-slot-label", SLOT_LABELS[slotIdx].pkt);

  const input = document.getElementById("amend-value-input");
  if (input) input.value = (currentVal && currentVal !== "SEE_NEXT") ? currentVal : "";

  document.getElementById("amend-modal").classList.remove("hidden");
}

function closeAmendModal() {
  document.getElementById("amend-modal").classList.add("hidden");
}

function setAmendTrace() {
  const input = document.getElementById("amend-value-input");
  if (input) input.value = "0.01";
}

function saveAdminAmendment() {
  const val = document.getElementById("amend-value-input").value.trim();
  if (!val) return alert("Enter value.");

  google.script.run
    .withSuccessHandler(res => {
      if (res.status === "success") {
        closeAmendModal();
        fetchAdminDailyData();
      } else {
        alert(res.message);
      }
    })
    .apiAdminAmend({
      adminPhone: state.user.phone,
      station: state.amendContext.station,
      targetDate: state.amendContext.targetDate,
      slotIdx: state.amendContext.slotIdx,
      value: val
    });
}

/** ================= WHATSAPP OTP MODAL ================= */
function openOtpModal() {
  document.getElementById("otp-modal").classList.remove("hidden");
}
function closeOtpModal() {
  document.getElementById("otp-modal").classList.add("hidden");
}

function requestOtp() {
  const phone = document.getElementById("otp-phone").value.trim();
  if (!phone) return alert("Enter phone number.");

  google.script.run
    .withSuccessHandler(res => {
      alert(res.message);
      if (res.status === "success") {
        document.getElementById("otp-step-1").classList.add("hidden");
        document.getElementById("otp-step-2").classList.remove("hidden");
      }
    })
    .apiSendOtp(phone);
}

function verifyAndResetPin() {
  const phone = document.getElementById("otp-phone").value.trim();
  const otp = document.getElementById("otp-code").value.trim();
  const newPin = document.getElementById("otp-new-pin").value.trim();

  google.script.run
    .withSuccessHandler(res => {
      alert(res.message);
      if (res.status === "success") {
        closeOtpModal();
      }
    })
    .apiResetPin(phone, otp, newPin);
}

/** ================= PDF REPORT EXPORT ================= */
function exportReportPDF() {
  const element = document.getElementById('printable-area');
  const isMonthly = (state.adminActiveTab === "monthly");
  const orientation = isMonthly ? 'landscape' : 'portrait';
  
  const now = new Date();
  const utcStr = now.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
  setText('print-timestamp', `Report generated on ${utcStr}`);
  setText('print-subtitle', isMonthly ? `Monthly Summary for ${state.adminSelectedMonth}` : `Daily Report dated ${state.adminSelectedDate}`);

  const opt = {
    margin:       0.3,
    filename:     `Rainfall_Report_${state.adminSelectedDate}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, logging: false },
    jsPDF:        { unit: 'in', format: 'a4', orientation: orientation }
  };

  html2pdf().set(opt).from(element).save();
}
