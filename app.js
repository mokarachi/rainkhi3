const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby7LsXeMc4o-iFMWrJ9Roa9oVH8fiz6ZGedeTYNP0wfWGqAWvOHdHdmQ6zqay3bEzmn/exec";


const ALL_SLOTS = [
    "03:00 - 06:00 UTC",
    "06:00 - 09:00 UTC",
    "09:00 - 12:00 UTC",
    "12:00 - 15:00 UTC",
    "15:00 - 18:00 UTC",
    "18:00 - 21:00 UTC",
    "21:00 - 00:00 UTC",
    "00:00 - 03:00 UTC"
];

const DISPLAY_SLOT_LABELS = [
    { pst: "11:00 PKT", utc: "(06:00 UTC)" },
    { pst: "14:00 PKT", utc: "(09:00 UTC)" },
    { pst: "17:00 PKT", utc: "(12:00 UTC)" },
    { pst: "20:00 PKT", utc: "(15:00 UTC)" },
    { pst: "23:00 PKT", utc: "(18:00 UTC)" },
    { pst: "02:00 PKT", utc: "(21:00 UTC)" },
    { pst: "05:00 PKT", utc: "(00:00 UTC)" },
    { pst: "08:00 PKT", utc: "(Next Morn 03Z)" }
];

let userRole = "WORKER";
let stationName = "";
let todayEntries = {};
let editCounts = {};
let currentSlotIdx = 0;
let currentSelectedSlot = "";
let todayRainfallDateGlobal = "";
let workerViewingDate = "";
let adminViewMode = "daily";

let isMapMode = false;
let isChartMode = false;
let leafletMap = null;
let mapMarkersLayerGroup = null;
let currentAdminDataCache = null;
let chartInstance = null;

let masterStationsList = [];
let selectedMasterTargetPhone = "";
let masterViewMode = "station_wise";
let masterAllStationsData = {};

let modalTargetPhone = "";
let modalTargetStation = "";
let modalTargetSlot = "";

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function getRecentUTCSlot() {
    const now = new Date();
    const totalMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const shiftedMins = (totalMins - 165 + 1440) % 1440;
    const block = Math.floor(shiftedMins / 180);
    const SLOT_INDEX_MAP = [7, 0, 1, 2, 3, 4, 5, 6];
    return ALL_SLOTS[SLOT_INDEX_MAP[block]];
}

window.onload = function() {
    const savedPhone = localStorage.getItem("worker_phone");
    const savedPin = localStorage.getItem("worker_pin") || "";
    if (savedPhone) {
        verifyLogin(savedPhone, savedPin);
    }
};

async function handleLogin() {
    const phone = document.getElementById("phoneNumberInput").value.trim();
    const pin = document.getElementById("pinInput").value.trim();
    const errorEl = document.getElementById("loginError");
    const loginBtn = document.getElementById("loginBtn");

    if (!phone) {
        if (errorEl) {
            errorEl.innerText = "Please enter Mobile Number.";
            errorEl.classList.remove("hidden");
        }
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerText = "Authenticating...";

    await verifyLogin(phone, pin);
    loginBtn.disabled = false;
    loginBtn.innerText = "Sign In to Station";
}

async function verifyLogin(phone, pin = "") {
    const errorEl = document.getElementById("loginError");

    try {
        const response = await fetch(`${SCRIPT_URL}?action=login&phone=${encodeURIComponent(phone)}&pin=${encodeURIComponent(pin)}`);
        const data = await response.json();

        if (data.status === "success") {
            localStorage.setItem("worker_phone", phone);
            localStorage.setItem("worker_pin", pin);
            userRole = data.role;
            stationName = data.station;
            if (errorEl) errorEl.classList.add("hidden");
            showDashboard();
        } else {
            localStorage.removeItem("worker_phone");
            localStorage.removeItem("worker_pin");
            if (errorEl) {
                errorEl.innerText = "❌ " + data.message;
                errorEl.classList.remove("hidden");
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = "❌ Connection Error. Check internet or URL.";
            errorEl.classList.remove("hidden");
        }
    }
}

function openResetPinModal() {
    document.getElementById("otpStep1").classList.remove("hidden");
    document.getElementById("otpStep2").classList.add("hidden");
    document.getElementById("otpMsg").classList.add("hidden");
    document.getElementById("resetPinModal").classList.remove("hidden");
}

function closeResetPinModal() {
    document.getElementById("resetPinModal").classList.add("hidden");
}

async function requestWhatsAppOTP() {
    const phone = document.getElementById("resetPhoneInput").value.trim();
    const otpMsg = document.getElementById("otpMsg");
    const sendBtn = document.getElementById("sendOtpBtn");

    if (!phone) {
        otpMsg.className = "text-xs font-bold text-center text-red-600 block p-2 bg-red-50 rounded-xl";
        setText("otpMsg", "Please enter your mobile number.");
        return;
    }

    sendBtn.disabled = true;
    sendBtn.innerText = "Sending WhatsApp OTP...";

    try {
        const response = await fetch(`${SCRIPT_URL}?action=send_otp&phone=${encodeURIComponent(phone)}`);
        const data = await response.json();

        if (data.status === "success") {
            document.getElementById("otpStep1").classList.add("hidden");
            document.getElementById("otpStep2").classList.remove("hidden");
            otpMsg.className = "text-xs font-bold text-center text-purple-700 bg-purple-50 block p-2 rounded-xl";
            setText("otpMsg", "OTP sent! Check your WhatsApp.");
        } else {
            otpMsg.className = "text-xs font-bold text-center text-red-600 bg-red-50 block p-2 rounded-xl";
            setText("otpMsg", "❌ " + data.message);
        }
    } catch (err) {
        otpMsg.className = "text-xs font-bold text-center text-red-600 bg-red-50 block p-2 rounded-xl";
        setText("otpMsg", "Error sending OTP.");
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = "Send OTP to WhatsApp";
    }
}

async function submitPinReset() {
    const phone = document.getElementById("resetPhoneInput").value.trim();
    const otp = document.getElementById("otpInput").value.trim();
    const newPin = document.getElementById("newPinInput").value.trim();
    const otpMsg = document.getElementById("otpMsg");
    const resetBtn = document.getElementById("resetPinBtn");

    if (!otp || !newPin || newPin.length !== 4) {
        otpMsg.className = "text-xs font-bold text-center text-red-600 block p-2 bg-red-50 rounded-xl";
        setText("otpMsg", "Please enter 4-digit OTP and 4-Digit New PIN.");
        return;
    }

    resetBtn.disabled = true;
    resetBtn.innerText = "Updating PIN...";

    try {
        const response = await fetch(`${SCRIPT_URL}?action=reset_pin&phone=${encodeURIComponent(phone)}&otp=${encodeURIComponent(otp)}&new_pin=${encodeURIComponent(newPin)}`);
        const data = await response.json();

        if (data.status === "success") {
            otpMsg.className = "text-xs font-bold text-center text-emerald-700 bg-emerald-50 block p-2 rounded-xl";
            setText("otpMsg", "✅ PIN reset success! Logging in...");

            setTimeout(() => {
                closeResetPinModal();
                verifyLogin(phone, newPin);
            }, 1500);
        } else {
            otpMsg.className = "text-xs font-bold text-center text-red-600 bg-red-50 block p-2 rounded-xl";
            setText("otpMsg", "❌ " + data.message);
        }
    } catch (err) {
        otpMsg.className = "text-xs font-bold text-center text-red-600 bg-red-50 block p-2 rounded-xl";
        setText("otpMsg", "Error updating PIN.");
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerText = "Update PIN & Log In";
    }
}

function showDashboard() {
    document.getElementById("loginScreen").classList.add("hidden");

    const toggleBar = document.getElementById("admin4WayToggleBar");

    if (userRole === "ADMIN" || userRole === "SILENT_ADMIN" || userRole === "OPERATIONAL_ADMIN") {
        document.getElementById("adminDashboard").classList.remove("hidden");
        document.getElementById("dataForm").classList.add("hidden");
        document.getElementById("appMainHeader").classList.remove("hidden");

        const logsBtn = document.getElementById("adminModeLogsBtn");
        const monthlyBtn = document.getElementById("adminModeMonthlyBtn");
        const usersBtn = document.getElementById("adminModeUsersBtn");

        if (userRole === "SILENT_ADMIN") {
            // SILENT ADMIN: HIDE TOGGLE BAR COMPLETELY! STRICTLY DAILY VIEW ONLY!
            if (toggleBar) toggleBar.classList.add("hidden");
            setText("adminSubHeading", "Silent Observer Admin (View-Only Mode)");
        } else {
            if (toggleBar) toggleBar.classList.remove("hidden");
            if (logsBtn) {
                if (userRole === "ADMIN") logsBtn.classList.remove("hidden");
                else logsBtn.classList.add("hidden");
            }
            if (userRole === "OPERATIONAL_ADMIN") {
                setText("adminSubHeading", "Duty Operational Admin (Can Amend Today & Yesterday)");
            } else {
                setText("adminSubHeading", "Tap Any Cell in Table to Amend Reading");
            }
        }

        setAdminViewMode("daily");

    } else {
        document.getElementById("dataForm").classList.remove("hidden");
        document.getElementById("adminDashboard").classList.add("hidden");
        document.getElementById("appMainHeader").classList.add("hidden");
        document.getElementById("mainContainer").classList.replace("max-w-4xl", "max-w-md");
        document.getElementById("mainContainer").classList.replace("max-w-7xl", "max-w-md");

        if (userRole === "FIELD_SUPERVISOR") {
            document.getElementById("masterWorkerSection").classList.add("hidden");
            setText("displayStation", "Field Supervisor (" + stationName + ")");
            populateAccumulativeSelects();
            selectSlot(getRecentUTCSlot());
            refreshTodayHistory();
        } else if (userRole === "MASTER_WORKER") {
            document.getElementById("masterWorkerSection").classList.remove("hidden");
            setText("displayStation", "Master Worker");
            loadMasterStationsDropdown();
        } else {
            document.getElementById("masterWorkerSection").classList.add("hidden");
            setText("displayStation", stationName);
            
            populateAccumulativeSelects();
            selectSlot(getRecentUTCSlot());
            refreshTodayHistory();
        }
    }
}

function logout() {
    localStorage.removeItem("worker_phone");
    localStorage.removeItem("worker_pin");
    document.getElementById("dataForm").classList.add("hidden");
    document.getElementById("adminDashboard").classList.add("hidden");
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("appMainHeader").classList.remove("hidden");
    document.getElementById("mainContainer").className = "bg-white p-5 sm:p-6 rounded-3xl shadow-xl w-full max-w-md border border-slate-200";
}

function setAdminViewMode(mode) {
    if (userRole === "SILENT_ADMIN" && mode !== "daily") return; // SILENT ADMIN LOCKED TO DAILY

    adminViewMode = mode;
    isMapMode = false;
    isChartMode = false;
    
    const dailyCtrl = document.getElementById("adminDailyControls");
    const monthlyCtrl = document.getElementById("adminMonthlyControls");
    const logsCtrl = document.getElementById("adminLogsControls");
    const usersCtrl = document.getElementById("adminUsersControls");
    
    const dailyTable = document.getElementById("adminDailyTableContainer");
    const monthlyTable = document.getElementById("adminMonthlyTableContainer");
    const logsTable = document.getElementById("adminLogsTableContainer");
    const usersTable = document.getElementById("adminUsersTableContainer");
    const mapContainer = document.getElementById("adminMapContainer");
    const chartContainer = document.getElementById("adminChartContainer");

    dailyCtrl.classList.add("hidden");
    monthlyCtrl.classList.add("hidden");
    logsCtrl.classList.add("hidden");
    usersCtrl.classList.add("hidden");
    
    dailyTable.classList.add("hidden");
    monthlyTable.classList.add("hidden");
    logsTable.classList.add("hidden");
    usersTable.classList.add("hidden");
    mapContainer.classList.add("hidden");
    chartContainer.classList.add("hidden");

    updateDisplayToggleButtons();

    const dailyBtn = document.getElementById("adminModeDailyBtn");
    const monthlyBtn = document.getElementById("adminModeMonthlyBtn");
    const logsBtn = document.getElementById("adminModeLogsBtn");
    const usersBtn = document.getElementById("adminModeUsersBtn");

    if (dailyBtn) dailyBtn.className = "w-1/4 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";
    if (monthlyBtn) monthlyBtn.className = "w-1/4 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";
    if (logsBtn) logsBtn.className = "w-1/4 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";
    if (usersBtn) usersBtn.className = "w-1/4 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";

    if (mode === 'daily') {
        dailyCtrl.classList.remove("hidden");
        dailyTable.classList.remove("hidden");
        if (dailyBtn) dailyBtn.className = "w-1/4 py-1.5 rounded-lg bg-white shadow-sm text-blue-600 font-bold";
        document.getElementById("mainContainer").className = "bg-white p-4 sm:p-6 rounded-3xl shadow-xl w-full max-w-4xl border border-slate-200";
        loadAdminMasterSummary();
    } else if (mode === 'monthly') {
        monthlyCtrl.classList.remove("hidden");
        monthlyTable.classList.remove("hidden");
        if (monthlyBtn) monthlyBtn.className = "w-1/4 py-1.5 rounded-lg bg-white shadow-sm text-purple-600 font-bold";
        document.getElementById("mainContainer").className = "bg-white p-4 sm:p-6 rounded-3xl shadow-xl w-full max-w-7xl border border-slate-200";

        const monthInput = document.getElementById("adminMonthPicker");
        if (monthInput && !monthInput.value) {
            const now = new Date();
            monthInput.value = now.toISOString().substring(0, 7);
        }
        loadAdminMonthlySummary();
    } else if (mode === 'logs' && userRole === 'ADMIN') {
        logsCtrl.classList.remove("hidden");
        logsTable.classList.remove("hidden");
        if (logsBtn) logsBtn.className = "w-1/4 py-1.5 rounded-lg bg-white shadow-sm text-amber-700 font-bold";
        document.getElementById("mainContainer").className = "bg-white p-4 sm:p-6 rounded-3xl shadow-xl w-full max-w-5xl border border-slate-200";
        loadAdminActivityLogs();
    } else if (mode === 'users') {
        usersCtrl.classList.remove("hidden");
        usersTable.classList.remove("hidden");
        if (usersBtn) usersBtn.className = "w-1/4 py-1.5 rounded-lg bg-white shadow-sm text-emerald-700 font-bold";
        document.getElementById("mainContainer").className = "bg-white p-4 sm:p-6 rounded-3xl shadow-xl w-full max-w-4xl border border-slate-200";
        loadAdminSystemUsers();
    }
}

// 3-WAY DISPLAY TOGGLE: TABLE vs MAP 🌐 vs CHART 📈
function setDisplayMode(mode) {
    const mapContainer = document.getElementById("adminMapContainer");
    const chartContainer = document.getElementById("adminChartContainer");
    const dailyTable = document.getElementById("adminDailyTableContainer");
    const monthlyTable = document.getElementById("adminMonthlyTableContainer");

    isMapMode = (mode === 'map');
    isChartMode = (mode === 'chart');

    mapContainer.classList.add("hidden");
    chartContainer.classList.add("hidden");
    dailyTable.classList.add("hidden");
    monthlyTable.classList.add("hidden");

    if (mode === 'map') {
        mapContainer.classList.remove("hidden");
        initOrUpdateLeafletMap();
    } else if (mode === 'chart') {
        chartContainer.classList.remove("hidden");
        renderBarChart();
    } else {
        if (adminViewMode === "daily") dailyTable.classList.remove("hidden");
        else if (adminViewMode === "monthly") monthlyTable.classList.remove("hidden");
    }

    updateDisplayToggleButtons();
}

function updateDisplayToggleButtons() {
    const dailyButtons = ["dailyTableBtn", "dailyMapBtn", "dailyChartBtn"];
    const monthlyButtons = ["monthlyTableBtn", "monthlyMapBtn", "monthlyChartBtn"];

    let activeType = "table";
    if (isMapMode) activeType = "map";
    if (isChartMode) activeType = "chart";

    const updateSet = (btnIds) => {
        btnIds.forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (id.toLowerCase().includes(activeType)) {
                btn.className = "bg-blue-600 text-white font-bold px-2.5 py-1 rounded-xl text-xs shadow transition";
            } else {
                btn.className = "bg-white border border-blue-200 text-blue-800 hover:bg-blue-100 font-bold px-2.5 py-1 rounded-xl text-xs transition";
            }
        });
    };

    updateSet(dailyButtons);
    updateSet(monthlyButtons);
}

function initOrUpdateLeafletMap() {
    const mapContainer = document.getElementById("leafletMapDiv");
    if (!mapContainer) return;

    if (!leafletMap) {
        leafletMap = L.map('leafletMapDiv').setView([24.93, 67.11], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap'
        }).addTo(leafletMap);

        mapMarkersLayerGroup = L.layerGroup().addTo(leafletMap);
    }

    setTimeout(() => {
        leafletMap.invalidateSize();
    }, 200);

    renderMapMarkers();
}

function renderMapMarkers() {
    if (!leafletMap || !mapMarkersLayerGroup || !currentAdminDataCache) return;

    mapMarkersLayerGroup.clearLayers();
    const stationMap = currentAdminDataCache.stations || {};

    for (let st in stationMap) {
        const stData = stationMap[st] || {};
        const lat = parseFloat(stData.lat) || 24.93;
        const lon = parseFloat(stData.lon) || 67.11;

        let rainfallAmount = 0;
        let popupDetails = "";

        if (adminViewMode === "daily") {
            rainfallAmount = parseFloat(stData.total) || 0;
            popupDetails = `<b>Station:</b> ${st}<br><b>Daily Total:</b> ${rainfallAmount.toFixed(1)} mm<br><hr class="my-1"><span style="font-size: 10px;">Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}</span>`;
        } else {
            rainfallAmount = parseFloat(stData.monthly_total) || 0;
            popupDetails = `<b>Station:</b> ${st}<br><b>Monthly Total:</b> ${rainfallAmount.toFixed(1)} mm<br><hr class="my-1"><span style="font-size: 10px;">Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}</span>`;
        }

        let color = "#94a3b8";
        let radius = 8;

        if (rainfallAmount === 0.01) {
            color = "#a855f7";
            radius = 9;
        } else if (rainfallAmount > 0 && rainfallAmount <= 10) {
            color = "#10b981";
            radius = 11;
        } else if (rainfallAmount > 10 && rainfallAmount <= 50) {
            color = "#2563eb";
            radius = 16;
        } else if (rainfallAmount > 50) {
            color = "#dc2626";
            radius = 22;
        }

        const circleMarker = L.circleMarker([lat, lon], {
            radius: radius,
            fillColor: color,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        circleMarker.bindPopup(popupDetails);
        mapMarkersLayerGroup.addLayer(circleMarker);
    }
}

// RENDER INTERACTIVE CHART.JS BAR CHART 📈
function renderBarChart() {
    if (!currentAdminDataCache) return;

    const ctx = document.getElementById("adminBarChartCanvas");
    if (!ctx) return;

    const stationMap = currentAdminDataCache.stations || {};
    const labels = [];
    const rainfallValues = [];
    const barColors = [];

    for (let st in stationMap) {
        labels.push(st.replace('L_', 'Station '));
        const stData = stationMap[st] || {};
        let val = (adminViewMode === "daily") ? (parseFloat(stData.total) || 0) : (parseFloat(stData.monthly_total) || 0);
        rainfallValues.push(val);

        if (val === 0.01) barColors.push('#a855f7');
        else if (val > 0 && val <= 10) barColors.push('#10b981');
        else if (val > 10 && val <= 50) barColors.push('#2563eb');
        else if (val > 50) barColors.push('#dc2626');
        else barColors.push('#cbd5e1');
    }

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: adminViewMode === 'daily' ? 'Daily Rain (mm)' : 'Monthly Total Rain (mm)',
                data: rainfallValues,
                backgroundColor: barColors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: adminViewMode === 'daily' ? `Daily Rainfall Comparison (${currentAdminDataCache.rainfall_date})` : `Monthly Rainfall Comparison (${currentAdminDataCache.year_month})`,
                    font: { size: 12, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Rainfall (mm)' }
                },
                x: {
                    ticks: { font: { size: 9 }, autoSkip: false, maxRotation: 45, minRotation: 45 }
                }
            }
        }
    });
}

function shiftSelectedSlot(offset) {
    let currentIdx = ALL_SLOTS.indexOf(currentSelectedSlot);
    if (currentIdx === -1) currentIdx = currentSlotIdx;

    let targetIdx = currentIdx + offset;

    if (targetIdx < 0 || targetIdx > currentSlotIdx) return;

    selectSlot(ALL_SLOTS[targetIdx]);
}

function updateSlotArrowButtons() {
    const currentIdx = ALL_SLOTS.indexOf(currentSelectedSlot);
    const nextBtn = document.getElementById("nextSlotBtn");

    if (nextBtn) {
        if (currentIdx >= currentSlotIdx) {
            nextBtn.disabled = true;
            nextBtn.className = "bg-slate-100 text-slate-300 font-bold px-2 py-0.5 rounded-md text-xs cursor-not-allowed";
        } else {
            nextBtn.disabled = false;
            nextBtn.className = "bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded-md text-xs transition cursor-pointer";
        }
    }
}

function shiftWorkerDate(offsetDays) {
    if (userRole === "FIELD_SUPERVISOR") return; // FIELD SUPERVISOR IS RESTRICTED TO TODAY!

    if (!workerViewingDate) workerViewingDate = todayRainfallDateGlobal;

    let d = new Date(workerViewingDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offsetDays);
    let newDateStr = d.toISOString().split("T")[0];

    if (todayRainfallDateGlobal && newDateStr > todayRainfallDateGlobal) return;

    workerViewingDate = newDateStr;
    refreshTodayHistory(workerViewingDate);
}

function updateWorkerDateNextButton() {
    const nextBtn = document.getElementById("workerNextDateBtn");
    if (nextBtn) {
        if (!workerViewingDate || workerViewingDate >= todayRainfallDateGlobal || userRole === "FIELD_SUPERVISOR") {
            nextBtn.disabled = true;
            nextBtn.className = "text-blue-200 text-xs px-1 cursor-not-allowed opacity-50";
        } else {
            nextBtn.disabled = false;
            nextBtn.className = "text-blue-200 hover:text-white text-xs px-1 cursor-pointer";
        }
    }
}

function setMasterViewMode(mode) {
    masterViewMode = mode;
    if (mode === 'station_wise') {
        document.getElementById("workerStationWiseContainer").classList.remove("hidden");
        document.getElementById("masterSlotWiseContainer").classList.add("hidden");
        document.getElementById("masterStationSelectorBox").classList.remove("hidden");
        document.getElementById("masterModeStationBtn").className = "w-1/2 py-1 rounded-md bg-white text-purple-900 shadow-sm font-bold";
        document.getElementById("masterModeSlotBtn").className = "w-1/2 py-1 rounded-md text-purple-600 font-bold hover:text-purple-900";
        document.getElementById("mainContainer").className = "bg-white p-3.5 sm:p-5 rounded-3xl shadow-xl w-full max-w-md border border-slate-200";
    } else {
        document.getElementById("workerStationWiseContainer").classList.add("hidden");
        document.getElementById("masterSlotWiseContainer").classList.remove("hidden");
        document.getElementById("masterStationSelectorBox").classList.add("hidden");
        document.getElementById("masterModeSlotBtn").className = "w-1/2 py-1 rounded-md bg-white text-purple-900 shadow-sm font-bold";
        document.getElementById("masterModeStationBtn").className = "w-1/2 py-1 rounded-md text-purple-600 font-bold hover:text-purple-900";
        document.getElementById("mainContainer").className = "bg-white p-3.5 sm:p-5 rounded-3xl shadow-xl w-full max-w-2xl border border-slate-200";

        populateMasterBatchSlotSelect();
        loadMasterSlotWiseGrid();
    }
}

async function loadMasterStationsDropdown() {
    const masterPhone = localStorage.getItem("worker_phone");
    const selectEl = document.getElementById("masterStationSelect");

    try {
        const response = await fetch(`${SCRIPT_URL}?action=get_stations_list&phone=${encodeURIComponent(masterPhone)}`);
        const data = await response.json();

        if (data.status === "success" && data.stations.length > 0) {
            masterStationsList = data.stations;
            selectEl.innerHTML = "";
            
            masterStationsList.forEach(st => {
                selectEl.innerHTML += `<option value="${st.phone}">${st.name}</option>`;
            });

            selectedMasterTargetPhone = masterStationsList[0].phone;
            populateAccumulativeSelects();
            selectSlot(getRecentUTCSlot());
            refreshTodayHistory();
        }
    } catch (err) {
        console.error("Master Worker Dropdown Error:", err);
    }
}

function onMasterStationChange() {
    selectedMasterTargetPhone = document.getElementById("masterStationSelect").value;
    selectSlot(getRecentUTCSlot());
    refreshTodayHistory();
}

function populateMasterBatchSlotSelect() {
    const selectEl = document.getElementById("masterBatchSlotSelect");
    if (!selectEl) return;
    selectEl.innerHTML = "";

    ALL_SLOTS.forEach((slot, idx) => {
        if (idx <= currentSlotIdx) {
            selectEl.innerHTML += `<option value="${slot}" ${idx === currentSlotIdx ? 'selected' : ''}>${slot.replace(' UTC', '')}</option>`;
        }
    });
}

async function loadMasterSlotWiseGrid() {
    const gridEl = document.getElementById("master7x3Grid");
    if (!gridEl) return;
    gridEl.innerHTML = `<div class="col-span-3 p-4 text-center text-slate-400 font-bold">Loading Stations Batch Grid...</div>`;

    const masterPhone = localStorage.getItem("worker_phone");
    const selectedSlot = document.getElementById("masterBatchSlotSelect").value;

    try {
        const response = await fetch(`${SCRIPT_URL}?action=get_master_all_data&phone=${encodeURIComponent(masterPhone)}`);
        const data = await response.json();

        if (data.status === "success") {
            masterAllStationsData = data.stations || {};
            gridEl.innerHTML = "";

            masterStationsList.forEach(st => {
                const stData = masterAllStationsData[st.name] || {};
                const stSlots = stData.slots || {};
                const val = stSlots.hasOwnProperty(selectedSlot) ? stSlots[selectedSlot] : "";

                gridEl.innerHTML += `
                    <div class="bg-white border border-purple-200 p-2 rounded-xl flex flex-col justify-between space-y-1 shadow-sm">
                        <div class="flex justify-between items-center text-[10px]">
                            <span class="font-extrabold text-slate-800 truncate max-w-[110px]" title="${st.name}">${st.name}</span>
                            <button onclick="setBatchTrace('${st.phone}')" type="button" class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-black text-[9px]">T</button>
                        </div>
                        <div class="relative">
                            <input type="number" step="0.01" id="batch_input_${st.phone}" value="${val === 'SEE_NEXT' ? '' : val}" placeholder="0.0" 
                                   class="w-full p-1.5 border border-slate-200 rounded-lg font-black text-slate-800 text-sm outline-none focus:ring-1 focus:ring-purple-500 bg-slate-50">
                            <span class="absolute inset-y-0 right-0 flex items-center pr-2 text-[9px] font-bold text-slate-400">mm</span>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        gridEl.innerHTML = `<div class="col-span-3 p-4 text-center text-red-500 font-bold">Failed to load batch grid.</div>`;
    }
}

function setBatchTrace(phone) {
    const inputEl = document.getElementById(`batch_input_${phone}`);
    if (inputEl) inputEl.value = "0.01";
}

async function submitMasterBatchReadings() {
    const masterPhone = localStorage.getItem("worker_phone");
    const selectedSlot = document.getElementById("masterBatchSlotSelect").value;
    const statusMsg = document.getElementById("statusMsg");
    const batchSubmitBtn = document.getElementById("masterBatchSubmitBtn");

    let readingsList = [];

    masterStationsList.forEach(st => {
        const inputEl = document.getElementById(`batch_input_${st.phone}`);
        if (inputEl && inputEl.value !== "") {
            readingsList.push({
                phone: st.phone,
                station: st.name,
                rainfall: parseFloat(inputEl.value)
            });
        }
    });

    if (readingsList.length === 0) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "Please enter rain for at least one station!");
        return;
    }

    batchSubmitBtn.disabled = true;
    batchSubmitBtn.innerText = "Saving Batch Readings...";
    statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-purple-600 bg-purple-50 block";
    setText("statusMsg", "Saving batch readings to Google Sheets...");

    const payload = {
        timestamp: new Date().toISOString(),
        master_worker_phone: masterPhone,
        utc_slot: selectedSlot,
        is_batch_slot_submit: true,
        readings: readingsList
    };

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
        });

        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-purple-700 bg-purple-50 block";
        setText("statusMsg", `✅ Saved batch readings for ${readingsList.length} stations in [${selectedSlot}]!`);
        
        setTimeout(loadMasterSlotWiseGrid, 1200);

    } catch (error) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "❌ Network Error: " + error.message);
    } finally {
        batchSubmitBtn.disabled = false;
        batchSubmitBtn.innerText = "Save All Stations for Selected Slot";
    }
}

function setMode(mode) {
    if (mode === 'single') {
        document.getElementById("singleEntryCard").classList.remove("hidden");
        document.getElementById("accumulativeEntryCard").classList.add("hidden");
        document.getElementById("modeSingleBtn").className = "w-1/2 py-1.5 rounded-lg bg-white shadow-sm text-blue-600 font-bold";
        document.getElementById("modeAccBtn").className = "w-1/2 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";
    } else {
        document.getElementById("singleEntryCard").classList.add("hidden");
        document.getElementById("accumulativeEntryCard").classList.remove("hidden");
        document.getElementById("modeAccBtn").className = "w-1/2 py-1.5 rounded-lg bg-white shadow-sm text-purple-600 font-bold";
        document.getElementById("modeSingleBtn").className = "w-1/2 py-1.5 rounded-lg text-slate-500 font-bold hover:text-slate-700";
    }
}

function populateAccumulativeSelects() {
    const startSelect = document.getElementById("accStartSlot");
    const endSelect = document.getElementById("accEndSlot");
    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = "";
    endSelect.innerHTML = "";

    ALL_SLOTS.forEach((slot, idx) => {
        if (idx <= currentSlotIdx) {
            startSelect.innerHTML += `<option value="${idx}">${slot.replace(' UTC', '')}</option>`;
            endSelect.innerHTML += `<option value="${idx}" ${idx === currentSlotIdx ? 'selected' : ''}>${slot.replace(' UTC', '')}</option>`;
        }
    });
}

function setTraceValue() {
    document.getElementById("rainfallInput").value = "0.01";
}

function selectSlot(slot) {
    currentSelectedSlot = slot;
    setText("selectedSlotText", slot);

    if (todayEntries.hasOwnProperty(slot) && todayEntries[slot] !== "SEE_NEXT") {
        document.getElementById("rainfallInput").value = todayEntries[slot];
    } else {
        document.getElementById("rainfallInput").value = "";
    }

    const edits = editCounts[slot] || 0;
    const submitBtn = document.getElementById("submitBtn");
    const rainfallInput = document.getElementById("rainfallInput");

    if (edits >= 3 && (userRole === "WORKER" || userRole === "MASTER_WORKER")) {
        setText("editCountBadge", "🚫 Max Updates Reached (3/3)");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.className = "bg-slate-300 text-slate-500 font-bold py-2.5 px-6 rounded-xl cursor-not-allowed text-xs";
        }
        if (rainfallInput) rainfallInput.disabled = true;
    } else {
        setText("editCountBadge", (userRole === "FIELD_SUPERVISOR") ? "FIELD SUPERVISOR (No Edit Limit)" : `Slot Updates: ${edits}/3`);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl shadow transition text-xs cursor-pointer";
        }
        if (rainfallInput) rainfallInput.disabled = false;
    }

    updateSlotArrowButtons();
    renderSlotsGrid();
}

async function refreshTodayHistory(customDate = "") {
    const phone = localStorage.getItem("worker_phone");
    const targetPhoneParam = (userRole === "MASTER_WORKER") ? selectedMasterTargetPhone : phone;

    try {
        const response = await fetch(`${SCRIPT_URL}?action=get_worker_data&phone=${encodeURIComponent(phone)}&target_phone=${encodeURIComponent(targetPhoneParam)}&target_date=${encodeURIComponent(customDate)}`);
        const data = await response.json();

        if (data.status === "success") {
            todayEntries = data.entries || {};
            editCounts = data.edit_counts || {};
            currentSlotIdx = data.current_slot_idx;
            todayRainfallDateGlobal = data.today_rainfall_date;
            
            if (!workerViewingDate) workerViewingDate = data.rainfall_date;

            setText("summaryTotalRain", data.total_mm.toFixed(1));
            setText("displayDateText", data.rainfall_date);

            let completedCount = Object.keys(todayEntries).length;
            setText("summaryProgress", `${completedCount}/8`);

            populateAccumulativeSelects();
            updateSlotArrowButtons();
            updateWorkerDateNextButton();
            renderSlotsGrid();
        }
    } catch (err) {
        renderSlotsGrid();
    }
}

function renderSlotsGrid() {
    const gridEl = document.getElementById("slotsGrid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const isViewingPastDate = (workerViewingDate && todayRainfallDateGlobal && workerViewingDate < todayRainfallDateGlobal);

    ALL_SLOTS.forEach((slot, idx) => {
        const isFilled = todayEntries.hasOwnProperty(slot);
        const rawVal = isFilled ? todayEntries[slot] : null;
        const isSelected = (slot === currentSelectedSlot);
        
        const isFuture = !isViewingPastDate && (idx > currentSlotIdx);
        const isLockedPast = isViewingPastDate || ((userRole === "WORKER" || userRole === "MASTER_WORKER") && idx < (currentSlotIdx - 1));

        let pktLabel = DISPLAY_SLOT_LABELS[idx].pst;
        let utcSubLabel = DISPLAY_SLOT_LABELS[idx].utc;

        let displayVal = "--";
        if (isFilled) {
            if (rawVal === "SEE_NEXT") displayVal = "→ See next";
            else if (rawVal === 0.01) displayVal = "T";
            else displayVal = rawVal + "m";
        }

        let cardClass = "p-1.5 rounded-xl border transition flex flex-col justify-between h-[52px] text-center ";
        
        if (isFuture) cardClass += "bg-slate-100 border-slate-200 text-slate-300 opacity-60 cursor-not-allowed";
        else if (isLockedPast && !isSelected) cardClass += "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed";
        else if (isSelected) cardClass += "bg-blue-600 text-white border-blue-600 shadow ring-2 ring-blue-600/30 cursor-pointer";
        else if (isFilled) {
            if (rawVal === "SEE_NEXT") cardClass += "bg-purple-50 border-purple-200 text-purple-900 cursor-pointer";
            else cardClass += "bg-emerald-50 border-emerald-200 text-emerald-900 cursor-pointer hover:border-emerald-300";
        } else cardClass += "bg-slate-50 border-slate-200 text-slate-500 cursor-pointer hover:border-slate-300";

        let badgeText = "Select";
        if (isFuture) badgeText = "🔒";
        else if (isViewingPastDate) badgeText = "🔒";
        else if (isLockedPast) badgeText = "🔒";
        else if (isFilled) badgeText = (rawVal === "SEE_NEXT") ? "Merged" : "✓ Rec";
        else if (isSelected) badgeText = "Active";

        gridEl.innerHTML += `
            <div onclick="${(!isFuture && !isViewingPastDate && !isLockedPast) ? `selectSlot('${slot}')` : ''}" class="${cardClass}">
                <div class="flex justify-between items-center text-[9px]">
                    <span class="font-black ${isSelected ? 'text-white' : 'text-slate-800'}">${pktLabel}</span>
                    <span class="font-extrabold ${isFilled ? (isSelected ? 'text-white' : 'text-emerald-600') : 'text-slate-400'}">${badgeText}</span>
                </div>
                <div class="flex justify-between items-end">
                    <span class="text-[8px] font-bold opacity-75 ${isSelected ? 'text-blue-200' : 'text-slate-400'}">${utcSubLabel}</span>
                    <span class="font-black text-xs ${isSelected ? 'text-white' : (isFilled ? (rawVal === 'SEE_NEXT' ? 'text-purple-700' : 'text-emerald-700') : 'text-slate-300')}">
                        ${displayVal}
                    </span>
                </div>
            </div>
        `;
    });
}

async function submitData() {
    const phone = localStorage.getItem("worker_phone");
    const targetPhone = (userRole === "MASTER_WORKER") ? selectedMasterTargetPhone : phone;
    const rainfall = document.getElementById("rainfallInput").value;
    const statusMsg = document.getElementById("statusMsg");
    const submitBtn = document.getElementById("submitBtn");

    if (!currentSelectedSlot) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "Please tap an active slot above!");
        return;
    }

    if (rainfall === "" || rainfall < 0 || rainfall > 300) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "Please enter a valid rain amount or click 'Set Trace'.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Saving...";
    statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-blue-600 bg-blue-50 block";
    setText("statusMsg", "Saving to Google Sheets...");

    const payload = {
        timestamp: new Date().toISOString(),
        phone: targetPhone,
        master_worker_phone: (userRole === "MASTER_WORKER" || userRole === "FIELD_SUPERVISOR") ? phone : "",
        utc_slot: currentSelectedSlot,
        rainfall: parseFloat(rainfall)
    };

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
        });

        setTimeout(async () => {
            await refreshTodayHistory(workerViewingDate);
            
            const expectedVal = parseFloat(rainfall);
            const savedVal = todayEntries[currentSelectedSlot];

            if (savedVal === expectedVal || (expectedVal === 0.01 && savedVal === 0.01)) {
                statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-emerald-700 bg-emerald-50 block";
                setText("statusMsg", `✅ Saved ${rainfall === "0.01" ? "Trace (T)" : rainfall + " mm"} for [${currentSelectedSlot}]!`);
                document.getElementById("rainfallInput").value = "";
            } else {
                statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
                setText("statusMsg", "❌ Save Error: Max 3 updates reached or slot locked.");
            }
            submitBtn.disabled = false;
            submitBtn.innerText = "Save Reading";
        }, 1200);

    } catch (error) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "❌ Network Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "Save Reading";
    }
}

async function submitAccumulativeData() {
    const phone = localStorage.getItem("worker_phone");
    const targetPhone = (userRole === "MASTER_WORKER") ? selectedMasterTargetPhone : phone;
    const startIdx = parseInt(document.getElementById("accStartSlot").value);
    const endIdx = parseInt(document.getElementById("accEndSlot").value);
    const totalRain = parseFloat(document.getElementById("accRainfallInput").value);
    const statusMsg = document.getElementById("statusMsg");
    const accSubmitBtn = document.getElementById("accSubmitBtn");

    if (startIdx >= endIdx) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "Start slot must be EARLIER than End slot!");
        return;
    }

    if (isNaN(totalRain) || totalRain < 0 || totalRain > 300) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "Please enter a valid accumulated rain amount.");
        return;
    }

    accSubmitBtn.disabled = true;
    accSubmitBtn.innerText = `Merging slots...`;

    const payload = {
        timestamp: new Date().toISOString(),
        phone: targetPhone,
        master_worker_phone: (userRole === "MASTER_WORKER" || userRole === "FIELD_SUPERVISOR") ? phone : "",
        start_slot_idx: startIdx,
        end_slot_idx: endIdx,
        rainfall: totalRain,
        is_accumulative_merge: true
    };

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
        });

        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-purple-700 bg-purple-50 block";
        setText("statusMsg", `✅ Saved ${totalRain} mm accumulative reading! Merged into ending slot.`);
        
        accSubmitBtn.disabled = false;
        accSubmitBtn.innerText = "Save Accumulative Reading";
        document.getElementById("accRainfallInput").value = "";
        setTimeout(() => refreshTodayHistory(workerViewingDate), 1500);

    } catch (error) {
        statusMsg.className = "text-xs font-bold text-center p-2 rounded-xl text-red-600 bg-red-50 block";
        setText("statusMsg", "❌ Network Error: " + error.message);
        accSubmitBtn.disabled = false;
        accSubmitBtn.innerText = "Save Accumulative Reading";
    }
}


// ================= MASTER ADMIN LOGIC =================
function shiftAdminDate(offsetDays) {
    const dateInput = document.getElementById("adminDatePicker");
    let currentDateVal = dateInput ? dateInput.value : "";
    if (!currentDateVal) return;

    let d = new Date(currentDateVal + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offsetDays);
    let newDateStr = d.toISOString().split("T")[0];

    if (todayRainfallDateGlobal && newDateStr > todayRainfallDateGlobal) {
        return;
    }

    dateInput.value = newDateStr;
    loadAdminMasterSummary();
}

async function loadAdminMasterSummary() {
    const tableBody = document.getElementById("adminTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="10" class="p-4 text-slate-400 font-bold text-center">Loading Real-Time Matrix...</td></tr>`;

    const phone = localStorage.getItem("worker_phone") || "0000";
    const dateInput = document.getElementById("adminDatePicker");
    const targetDate = dateInput ? dateInput.value : "";

    try {
        const reqUrl = `${SCRIPT_URL}?action=get_admin_data&phone=${encodeURIComponent(phone)}&target_date=${encodeURIComponent(targetDate)}`;
        const response = await fetch(reqUrl);
        const data = await response.json();

        if (data.status === "success") {
            currentAdminDataCache = data;
            todayRainfallDateGlobal = data.today_rainfall_date;
            setText("adminDateText", data.rainfall_date);
            setText("adminPrintDate", data.rainfall_date);
            setText("printHeaderTitle", "MONSOON DAILY RAINFALL SUMMARY REPORT");
            setText("printHeaderSubtitle", `Meteorological Rainfall Date: ${data.rainfall_date} (03:00 UTC to 03:00 UTC Next Morning)`);
            
            if (dateInput && !dateInput.value) {
                dateInput.value = data.rainfall_date;
            }

            const nextBtn = document.getElementById("adminNextDayBtn");
            if (nextBtn) {
                if (data.rainfall_date >= data.today_rainfall_date) {
                    nextBtn.disabled = true;
                    nextBtn.className = "bg-slate-100 text-slate-300 border border-slate-200 px-2 py-0.5 rounded-lg text-xs cursor-not-allowed";
                } else {
                    nextBtn.disabled = false;
                    nextBtn.className = "bg-white border border-blue-200 text-blue-800 hover:bg-blue-100 px-2 py-0.5 rounded-lg text-xs transition cursor-pointer";
                }
            }

            const isPastDate = (data.rainfall_date < data.today_rainfall_date);
            const isFutureDate = (data.rainfall_date > data.today_rainfall_date);

            const stationMap = data.stations || {};
            tableBody.innerHTML = "";

            for (let st in stationMap) {
                const stData = stationMap[st] || {};
                const stSlots = stData.slots || {};
                const stPhone = stData.phone || "";
                const total = stData.total || 0;

                let rowHtml = `<tr class="hover:bg-slate-50 border-b"><td class="p-1.5 border text-left font-bold text-slate-800">${st}</td>`;

                ALL_SLOTS.forEach((slot, idx) => {
                    let isFuture = false;
                    if (isFutureDate) {
                        isFuture = true;
                    } else if (!isPastDate) {
                        isFuture = (idx > data.current_slot_idx);
                    }

                    const val = stSlots.hasOwnProperty(slot) ? stSlots[slot] : "--";
                    
                    let displayCell = "--";
                    if (val === "SEE_NEXT") displayCell = "→ See next";
                    else if (val === 0.01) displayCell = "T";
                    else if (val !== "--") displayCell = val;

                    if (isFuture) {
                        rowHtml += `<td class="p-1 border bg-slate-100 text-slate-300">🔒</td>`;
                    } else {
                        const isClickable = (userRole === "ADMIN" || userRole === "OPERATIONAL_ADMIN");
                        const safeSt = st.replace(/'/g, "\\'");
                        const safeVal = (val !== '--') ? String(val).replace(/'/g, "\\'") : '';

                        rowHtml += `<td ${isClickable ? `onclick="openAdminModal('${stPhone}', '${safeSt}', '${slot}', '${safeVal}')"` : ''} 
                                        class="p-1 border ${isClickable ? 'cursor-pointer hover:bg-blue-100' : ''} font-bold ${val === 'SEE_NEXT' ? 'text-purple-600 bg-purple-50' : (val !== '--' ? 'text-blue-700 bg-blue-50/50' : 'text-slate-300')}">
                                        ${displayCell}
                                    </td>`;
                    }
                });

                rowHtml += `<td class="p-1.5 border font-black bg-blue-50 text-blue-900">${total > 0 ? total + ' mm' : '0.0'}</td></tr>`;
                tableBody.innerHTML += rowHtml;
            }

            if (isMapMode) renderMapMarkers();

        } else {
            tableBody.innerHTML = `<tr><td colspan="10" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Admin Fetch Failed: ${data.message || 'Unknown Server Error'}</td></tr>`;
        }
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="10" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Network/JS Error: ${err.message}</td></tr>`;
    }
}

async function loadAdminMonthlySummary() {
    const tableHeader = document.getElementById("adminMonthlyTableHeader");
    const tableBody = document.getElementById("adminMonthlyTableBody");
    if (!tableHeader || !tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="33" class="p-4 text-slate-400 font-bold text-center">Loading Monthly Day-Wise Matrix...</td></tr>`;

    const phone = localStorage.getItem("worker_phone") || "0000";
    const monthInput = document.getElementById("adminMonthPicker");
    const targetYM = monthInput ? monthInput.value : "";

    try {
        const reqUrl = `${SCRIPT_URL}?action=get_monthly_summary&phone=${encodeURIComponent(phone)}&year_month=${encodeURIComponent(targetYM)}`;
        const response = await fetch(reqUrl);
        const data = await response.json();

        if (data.status === "success") {
            currentAdminDataCache = data;
            setText("adminPrintDate", data.year_month);
            setText("printHeaderTitle", "MONSOON MONTHLY DAY-WISE RAINFALL SUMMARY");
            setText("printHeaderSubtitle", `Month: ${data.year_month} (24-Hour Synoptic Rain Totals)`);

            const daysCount = data.days_in_month || 31;
            const stationMap = data.stations || {};

            let headerHtml = `<tr class="bg-slate-100 text-slate-700 font-bold"><th class="p-1.5 border text-left min-w-[120px]">Station</th>`;
            for (let d = 1; d <= daysCount; d++) {
                headerHtml += `<th class="p-0.5 border w-[22px]">${d}</th>`;
            }
            headerHtml += `<th class="p-1 border bg-purple-100 text-purple-900 font-black min-w-[50px]">Monthly Total</th></tr>`;
            tableHeader.innerHTML = headerHtml;

            tableBody.innerHTML = "";

            for (let st in stationMap) {
                const stData = stationMap[st] || {};
                const stDays = stData.days || {};
                const mTotal = stData.monthly_total || 0;

                let rowHtml = `<tr class="hover:bg-slate-50 border-b"><td class="p-1.5 border text-left font-bold text-slate-800 truncate max-w-[130px]">${st}</td>`;

                for (let d = 1; d <= daysCount; d++) {
                    const val = stDays.hasOwnProperty(d) ? stDays[d] : "--";
                    let cellText = "--";
                    if (val === 0.01) cellText = "T";
                    else if (val !== "--") cellText = val;

                    const formattedDay = String(d).padStart(2, '0');
                    const targetDateStr = `${data.year_month}-${formattedDay}`;

                    rowHtml += `<td onclick="jumpToDailyDate('${targetDateStr}')" 
                                    class="p-0.5 border cursor-pointer hover:bg-purple-100 font-bold ${val !== '--' ? 'text-purple-700 bg-purple-50/50' : 'text-slate-300'}">
                                    ${cellText}
                                </td>`;
                }

                rowHtml += `<td class="p-1 border font-black bg-purple-50 text-purple-900">${mTotal > 0 ? mTotal.toFixed(1) + 'm' : '0.0'}</td></tr>`;
                tableBody.innerHTML += rowHtml;
            }

            if (isMapMode) renderMapMarkers();

        } else {
            tableBody.innerHTML = `<tr><td colspan="33" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Monthly Fetch Failed: ${data.message || 'Unknown Server Error'}</td></tr>`;
        }
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="33" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Network/JS Error: ${err.message}</td></tr>`;
    }
}

async function loadAdminActivityLogs() {
    const tableBody = document.getElementById("adminLogsTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-slate-400 font-bold text-center">Loading Activity Audit Logs...</td></tr>`;

    const phone = localStorage.getItem("worker_phone") || "0000";

    try {
        const reqUrl = `${SCRIPT_URL}?action=get_activity_logs&phone=${encodeURIComponent(phone)}`;
        const response = await fetch(reqUrl);
        const data = await response.json();

        if (data.status === "success") {
            const logsList = data.logs || [];
            if (logsList.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-slate-400 font-bold text-center">No activity logs recorded yet.</td></tr>`;
                return;
            }

            tableBody.innerHTML = "";

            logsList.forEach(log => {
                let catClass = "bg-slate-100 text-slate-700";
                if (log.category === "LOGIN") catClass = "bg-blue-100 text-blue-800";
                else if (log.category === "ADMIN_AMEND") catClass = "bg-purple-100 text-purple-800";
                else if (log.category === "ACCUMULATIVE_ENTRY") catClass = "bg-amber-100 text-amber-900";
                else if (log.category === "REPORT_GENERATE") catClass = "bg-indigo-100 text-indigo-800";

                tableBody.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b">
                        <td class="p-2 border text-[9px] font-mono text-slate-500 whitespace-nowrap">${log.timestamp.substring(0, 19).replace('T', ' ')}</td>
                        <td class="p-2 border font-bold text-slate-800 whitespace-nowrap">${log.phone}</td>
                        <td class="p-2 border font-bold text-slate-600 whitespace-nowrap"><span class="px-1.5 py-0.5 rounded text-[9px] bg-slate-100">${log.role}</span></td>
                        <td class="p-2 border font-bold text-slate-700 whitespace-nowrap">${log.station}</td>
                        <td class="p-2 border whitespace-nowrap"><span class="px-2 py-0.5 rounded-full font-black text-[9px] ${catClass}">${log.category}</span></td>
                        <td class="p-2 border font-medium text-slate-600 text-[10px]">${log.details}</td>
                    </tr>
                `;
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Logs Fetch Failed: ${data.message}</td></tr>`;
        }
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Network Error: ${err.message}</td></tr>`;
    }
}

async function loadAdminSystemUsers() {
    const tableBody = document.getElementById("adminUsersTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-slate-400 font-bold text-center">Loading System Members Status...</td></tr>`;

    const phone = localStorage.getItem("worker_phone") || "0000";

    try {
        const reqUrl = `${SCRIPT_URL}?action=get_system_users&phone=${encodeURIComponent(phone)}`;
        const response = await fetch(reqUrl);
        const data = await response.json();

        if (data.status === "success") {
            const userList = data.users || [];
            tableBody.innerHTML = "";

            userList.forEach(u => {
                let roleClass = "bg-slate-100 text-slate-700";
                if (u.role === "ADMIN") roleClass = "bg-red-100 text-red-800";
                else if (u.role === "SILENT_ADMIN") roleClass = "bg-indigo-100 text-indigo-800";
                else if (u.role === "OPERATIONAL_ADMIN") roleClass = "bg-amber-100 text-amber-800";
                else if (u.role === "FIELD_SUPERVISOR") roleClass = "bg-teal-100 text-teal-800";
                else if (u.role === "MASTER_WORKER") roleClass = "bg-purple-100 text-purple-800";
                else if (u.role === "WORKER") roleClass = "bg-blue-100 text-blue-800";

                const statusBadge = u.is_logged_in 
                    ? `<span class="px-2 py-0.5 rounded-full font-extrabold text-[9px] bg-emerald-100 text-emerald-800"><i class="fa-solid fa-circle text-[7px] text-emerald-500 mr-1 animate-pulse"></i> Active / Logged In</span>`
                    : `<span class="px-2 py-0.5 rounded-full font-bold text-[9px] bg-slate-100 text-slate-400">⚪ Never Logged In</span>`;

                tableBody.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b">
                        <td class="p-2 border font-extrabold text-slate-800">${u.name}</td>
                        <td class="p-2 border font-mono font-bold text-slate-600">${u.phone}</td>
                        <td class="p-2 border text-center"><span class="px-2 py-0.5 rounded font-black text-[9px] ${roleClass}">${u.role}</span></td>
                        <td class="p-2 border text-center">${statusBadge}</td>
                        <td class="p-2 border text-[10px] font-mono text-slate-500">${u.last_login.substring(0, 19).replace('T', ' ')}</td>
                    </tr>
                `;
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Users Fetch Failed: ${data.message}</td></tr>`;
        }
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-red-500 font-bold bg-red-50">⚠️ Network Error: ${err.message}</td></tr>`;
    }
}

function jumpToDailyDate(dateStr) {
    if (dateStr > todayRainfallDateGlobal) return;
    const dateInput = document.getElementById("adminDatePicker");
    if (dateInput) dateInput.value = dateStr;
    setAdminViewMode("daily");
}

function openAdminModal(phone, station, slot, currentVal) {
    if (userRole !== "ADMIN" && userRole !== "OPERATIONAL_ADMIN") return;
    
    modalTargetPhone = phone;
    modalTargetStation = station;
    modalTargetSlot = slot;

    setText("modalStation", station);
    setText("modalSlot", slot);
    document.getElementById("modalInput").value = (currentVal === "0.01" || currentVal === "SEE_NEXT") ? "0.01" : currentVal;
    document.getElementById("modalMsg").classList.add("hidden");
    document.getElementById("adminModal").classList.remove("hidden");
}

function closeAdminModal() {
    document.getElementById("adminModal").classList.add("hidden");
}

function setModalTrace() {
    document.getElementById("modalInput").value = "0.01";
}

async function submitAdminAmend() {
    const adminPhone = localStorage.getItem("worker_phone");
    const val = document.getElementById("modalInput").value;
    const modalMsg = document.getElementById("modalMsg");
    const modalSaveBtn = document.getElementById("modalSaveBtn");
    
    const dateInput = document.getElementById("adminDatePicker");
    const viewingDate = dateInput ? dateInput.value : "";

    if (val === "" || val < 0 || val > 300) {
        modalMsg.className = "text-xs font-bold text-center text-red-600 block";
        setText("modalMsg", "Please enter a valid rain amount or set Trace.");
        return;
    }

    modalSaveBtn.disabled = true;
    modalSaveBtn.innerText = "Saving...";

    const payload = {
        timestamp: new Date().toISOString(),
        phone: modalTargetPhone,
        admin_phone: adminPhone,
        station: modalTargetStation,
        utc_slot: modalTargetSlot,
        target_date: viewingDate,
        rainfall: parseFloat(val)
    };

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
        });

        closeAdminModal();
        setTimeout(loadAdminMasterSummary, 1000);
    } catch (err) {
        modalMsg.className = "text-xs font-bold text-center text-red-600 block";
        setText("modalMsg", "Error saving amendment.");
    } finally {
        modalSaveBtn.disabled = false;
        modalSaveBtn.innerText = "Save Amendment";
    }
}

function generateSinglePagePDF() {
    const now = new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
    const utcDay = String(now.getUTCDate()).padStart(2, '0');
    const utcMonth = months[now.getUTCMonth()];
    const utcYear = now.getUTCFullYear();

    const pktDateObj = new Date(now.getTime() + (5 * 60 * 60 * 1000));
    const pktHours = String(pktDateObj.getUTCHours()).padStart(2, '0');
    const pktMins = String(pktDateObj.getUTCMinutes()).padStart(2, '0');
    const pktDay = String(pktDateObj.getUTCDate()).padStart(2, '0');
    const pktMonth = months[pktDateObj.getUTCMonth()];

    const formattedTimestamp = `${utcHours}:${utcMins} UTC ${utcDay} ${utcMonth} ${utcYear} (${pktHours}:${pktMins} PKT ${pktDay} ${pktMonth})`;
    
    setText("printGeneratedTime", formattedTimestamp);

    const element = document.getElementById("adminDashboard");
    const isMonthly = (adminViewMode === "monthly");
    const fileName = isMonthly ? `Monsoon_Monthly_Report_${document.getElementById("adminMonthPicker").value}.pdf` : `Monsoon_Daily_Report_${document.getElementById("adminDatePicker").value}.pdf`;

    const opt = {
        margin:       [5, 5, 5, 5],
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: isMonthly ? 'landscape' : 'portrait' }
    };

    if (typeof html2pdf !== 'undefined') {
        const noPrintEls = document.querySelectorAll('.no-print');
        noPrintEls.forEach(el => el.style.display = 'none');

        html2pdf().set(opt).from(element).save().then(() => {
            noPrintEls.forEach(el => el.style.display = '');
        }).catch(err => {
            noPrintEls.forEach(el => el.style.display = '');
            window.print();
        });
    } else {
        window.print();
    }
}
