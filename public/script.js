// ─── State ─────────────────────────────────────────────────────────

let riders = [];
let bikes = [];
let setups = [];
let currentRiderId = null;
let currentBikeId = null;
let currentSetupId = null;
let lastResult = null;
let onboarded = false;

// ─── API helpers ───────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Data loading ──────────────────────────────────────────────────

async function loadRiders() {
  riders = await api('/riders');
  const sel = document.getElementById('riderSelect');
  sel.innerHTML = '<option value="">Rider...</option>' +
    riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  renderRiderList();
}

async function loadBikes(riderId) {
  bikes = riderId ? await api(`/bikes?rider_id=${riderId}`) : [];
  const sel = document.getElementById('bikeSelect');
  sel.disabled = !riderId;
  sel.innerHTML = '<option value="">Bike...</option>' +
    bikes.map(b => {
      const w = b.rear_tire_width && b.rear_tire_width !== b.front_tire_width
        ? `${b.front_tire_width}/${b.rear_tire_width}${b.tire_width_unit}`
        : `${b.front_tire_width}${b.tire_width_unit}`;
      return `<option value="${b.id}">${b.name} (${w})</option>`;
    }).join('');
  document.getElementById('bikeRiderLabel').textContent =
    riderId ? `for ${riders.find(r => r.id == riderId)?.name || ''}` : '';
  renderBikeList();
}

async function loadSetups(bikeId) {
  setups = bikeId ? await api(`/setups?bike_id=${bikeId}`) : [];
  const sel = document.getElementById('setupSelect');
  sel.disabled = !bikeId;
  sel.innerHTML = '<option value="">Setup...</option>' +
    setups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('setupBikeLabel').textContent =
    bikeId ? `for ${bikes.find(b => b.id == bikeId)?.name || ''}` : '';
  renderSetupList();
}

async function loadHistory(setupId) {
  if (!setupId) {
    document.getElementById('history').style.display = 'none';
    return;
  }
  const pressures = await api(`/pressures?setup_id=${setupId}`);
  const el = document.getElementById('historyList');
  if (pressures.length === 0) {
    document.getElementById('history').style.display = 'none';
    return;
  }
  document.getElementById('history').style.display = 'block';
  el.innerHTML = pressures.map(p => `
    <div class="history-item">
      <span class="history-pressure">${p.front_psi}/${p.rear_psi} psi</span>
      <span class="history-date">${new Date(p.created_at).toLocaleDateString()}</span>
      <button class="btn-link btn-delete" onclick="deletePressure(${p.id})">×</button>
    </div>
  `).join('');
}

// ─── Select handlers ───────────────────────────────────────────────

document.getElementById('riderSelect').addEventListener('change', async (e) => {
  currentRiderId = e.target.value || null;
  currentBikeId = null;
  currentSetupId = null;
  await loadBikes(currentRiderId);
  await loadSetups(null);
  loadHistory(null);
});

document.getElementById('bikeSelect').addEventListener('change', async (e) => {
  currentBikeId = e.target.value || null;
  currentSetupId = null;
  await loadSetups(currentBikeId);
  loadHistory(null);
  if (currentBikeId) {
    const bike = bikes.find(b => b.id == currentBikeId);
    if (bike) {
      document.getElementById('frontTireWidth').value = bike.front_tire_width;
      document.getElementById('rearTireWidth').value = bike.rear_tire_width || '';
      document.getElementById('tireUnit').value = bike.tire_width_unit;
      document.getElementById('rearTireUnit').textContent = bike.tire_width_unit;
      document.getElementById('rimWidth').value = bike.rim_width_mm;
      document.getElementById('casingType').value = bike.casing_type;
      document.getElementById('isTubeless').checked = !!bike.is_tubeless;
    }
  }
});

document.getElementById('setupSelect').addEventListener('change', (e) => {
  currentSetupId = e.target.value || null;
  loadHistory(currentSetupId);
  if (currentSetupId) {
    const s = setups.find(x => x.id == currentSetupId);
    if (s) {
      document.getElementById('riderWeight').value = s.rider_weight;
      document.getElementById('bikeWeight').value = s.bike_weight;
      document.getElementById('frontLuggage').value = s.front_luggage_weight || 0;
      document.getElementById('rearLuggage').value = s.rear_luggage_weight || 0;
      document.getElementById('frameLoad').value = s.frame_load_weight || 0;
      document.getElementById('weightUnit').value = s.weight_unit;
      document.getElementById('bikeType').value = s.bike_type;
      document.getElementById('frameSize').value = s.frame_size;
      document.getElementById('ridingPosition').value = s.riding_position;
      document.getElementById('surfaceType').value = s.surface_type;
      document.querySelectorAll('#bikeWeightUnit, #frontLuggageUnit, #rearLuggageUnit, #frameLoadUnit').forEach(el => el.textContent = s.weight_unit);
    }
  }
  document.getElementById('saveBtn').style.display = currentSetupId ? 'block' : 'none';
});

document.getElementById('weightUnit').addEventListener('change', function() {
  document.querySelectorAll('#bikeWeightUnit, #frontLuggageUnit, #rearLuggageUnit, #frameLoadUnit').forEach(el => el.textContent = this.value);
});

document.getElementById('tireUnit').addEventListener('change', function() {
  document.getElementById('rearTireUnit').textContent = this.value;
});

// ─── Calculator ────────────────────────────────────────────────────

document.getElementById('calculateBtn').addEventListener('click', async () => {
  const frontTireWidth = parseFloat(document.getElementById('frontTireWidth').value);
  const rearTireWidth = parseFloat(document.getElementById('rearTireWidth').value) || undefined;
  const tireUnit = document.getElementById('tireUnit').value;
  const rimWidth = parseFloat(document.getElementById('rimWidth').value) || 23;
  const casingType = document.getElementById('casingType').value;
  const isTubeless = document.getElementById('isTubeless').checked;
  const riderWeight = parseFloat(document.getElementById('riderWeight').value);
  const bikeWeight = parseFloat(document.getElementById('bikeWeight').value);
  const frontLuggage = parseFloat(document.getElementById('frontLuggage').value) || 0;
  const rearLuggage = parseFloat(document.getElementById('rearLuggage').value) || 0;
  const frameLoad = parseFloat(document.getElementById('frameLoad').value) || 0;
  const weightUnit = document.getElementById('weightUnit').value;
  const bikeType = document.getElementById('bikeType').value;
  const frameSize = document.getElementById('frameSize').value;
  const ridingPosition = document.getElementById('ridingPosition').value;
  const surfaceType = document.getElementById('surfaceType').value;

  if (!frontTireWidth || !riderWeight || !bikeWeight) {
    alert('Please fill in tire width, rider weight, and bike weight');
    return;
  }

  try {
    const result = await api('/pressures/calculate', {
      method: 'POST',
      body: {
        riderWeight, bikeWeight,
        frontLuggageWeight: frontLuggage,
        rearLuggageWeight: rearLuggage,
        bikepackingLoadWeight: frameLoad,
        weightUnit,
        frontTireWidth, rearTireWidth,
        tireWidthUnit: tireUnit,
        rimWidthMm: rimWidth, rimType: 'hooked',
        frontCasing: casingType, rearCasing: casingType,
        isTubeless, bikeType,
        frameSize, ridingPosition, surfaceType,
      },
    });

    lastResult = result;
    document.getElementById('frontPsi').textContent = result.frontPsi;
    document.getElementById('frontBar').textContent = result.frontBar;
    document.getElementById('rearPsi').textContent = result.rearPsi;
    document.getElementById('rearBar').textContent = result.rearBar;
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('saveBtn').style.display = currentSetupId ? 'block' : 'none';
  } catch (err) {
    alert('Calculation error: ' + err.message);
  }
});

// ─── Save pressure ─────────────────────────────────────────────────

async function savePressure() {
  if (!currentSetupId || !lastResult) return;
  try {
    await api('/pressures', {
      method: 'POST',
      body: {
        setup_id: Number(currentSetupId),
        front_psi: lastResult.frontPsi,
        rear_psi: lastResult.rearPsi,
        front_bar: lastResult.frontBar,
        rear_bar: lastResult.rearBar,
      },
    });
    await loadHistory(currentSetupId);
  } catch (err) {
    alert('Save error: ' + err.message);
  }
}

async function deletePressure(id) {
  await api(`/pressures/${id}`, { method: 'DELETE' });
  await loadHistory(currentSetupId);
}

// ─── Management panel ──────────────────────────────────────────────

function toggleManage() {
  const panel = document.getElementById('managePanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function toggleAddBike() {
  const form = document.getElementById('addBikeForm');
  form.style.display = form.style.display === 'none' ? 'flex' : 'none';
}

function toggleAddSetup() {
  const form = document.getElementById('addSetupForm');
  form.style.display = form.style.display === 'none' ? 'flex' : 'none';
}

// Riders
function renderRiderList() {
  const el = document.getElementById('riderList');
  el.innerHTML = riders.map(r => `
    <div class="item-row">
      <span>${r.name}</span>
      <button class="btn-link btn-delete" onclick="deleteRider(${r.id})">×</button>
    </div>
  `).join('');
}

async function addRider() {
  const name = document.getElementById('newRiderName').value.trim();
  if (!name) return;
  const result = await api('/riders', { method: 'POST', body: { name } });
  document.getElementById('newRiderName').value = '';
  await loadRiders();
  document.getElementById('riderSelect').value = result.id;
  currentRiderId = result.id;
  await loadBikes(currentRiderId);
}

async function deleteRider(id) {
  if (!confirm('Delete rider and all their bikes/setups?')) return;
  await api(`/riders/${id}`, { method: 'DELETE' });
  if (currentRiderId == id) { currentRiderId = null; currentBikeId = null; currentSetupId = null; }
  await loadRiders(); await loadBikes(null); await loadSetups(null); loadHistory(null);
}

// Bikes
function renderBikeList() {
  const el = document.getElementById('bikeList');
  el.innerHTML = bikes.map(b => {
    const w = b.rear_tire_width && b.rear_tire_width !== b.front_tire_width
      ? `${b.front_tire_width}/${b.rear_tire_width}${b.tire_width_unit}`
      : `${b.front_tire_width}${b.tire_width_unit}`;
    return `<div class="item-row"><span>${b.name} — ${w}, ${b.rim_width_mm}mm rim, ${b.casing_type}${b.is_tubeless ? ', tubeless' : ''}</span><button class="btn-link btn-delete" onclick="deleteBike(${b.id})">×</button></div>`;
  }).join('');
}

async function addBike() {
  if (!currentRiderId) { alert('Select a rider first'); return; }
  const name = document.getElementById('newBikeName').value.trim();
  const front_tire_width = parseFloat(document.getElementById('newBikeFrontTireWidth').value);
  const rear_tire_width = parseFloat(document.getElementById('newBikeRearTireWidth').value) || null;
  const tire_width_unit = document.getElementById('newBikeTireUnit').value;
  const rim_width_mm = parseFloat(document.getElementById('newBikeRimWidth').value) || 23;
  const casing_type = document.getElementById('newBikeCasing').value;
  const is_tubeless = document.getElementById('newBikeTubeless').checked ? 1 : 0;
  if (!name || !front_tire_width) { alert('Name and front tire width required'); return; }
  const result = await api('/bikes', { method: 'POST', body: { rider_id: Number(currentRiderId), name, front_tire_width, rear_tire_width, tire_width_unit, rim_width_mm, casing_type, is_tubeless } });
  document.getElementById('newBikeName').value = '';
  document.getElementById('newBikeFrontTireWidth').value = '';
  document.getElementById('newBikeRearTireWidth').value = '';
  document.getElementById('addBikeForm').style.display = 'none';
  await loadBikes(currentRiderId);
  document.getElementById('bikeSelect').value = result.id;
  currentBikeId = result.id;
  document.getElementById('bikeSelect').dispatchEvent(new Event('change'));
  await loadSetups(currentBikeId);
}

async function deleteBike(id) {
  if (!confirm('Delete bike and all its setups?')) return;
  await api(`/bikes/${id}`, { method: 'DELETE' });
  if (currentBikeId == id) { currentBikeId = null; currentSetupId = null; }
  await loadBikes(currentRiderId); await loadSetups(null); loadHistory(null);
}

// Setups
function renderSetupList() {
  const el = document.getElementById('setupList');
  el.innerHTML = setups.map(s => {
    const w = s.weight_unit;
    let desc = `${s.rider_weight}${w} rider, ${s.bike_weight}${w} bike`;
    if (s.front_luggage_weight) desc += `, +${s.front_luggage_weight}${w} front`;
    if (s.rear_luggage_weight) desc += `, +${s.rear_luggage_weight}${w} rear`;
    if (s.frame_load_weight) desc += `, +${s.frame_load_weight}${w} frame`;
    return `<div class="item-row"><span>${s.name} — ${desc}</span><button class="btn-link btn-delete" onclick="deleteSetup(${s.id})">×</button></div>`;
  }).join('');
}

async function addSetup() {
  if (!currentBikeId) { alert('Select a bike first'); return; }
  const name = document.getElementById('newSetupName').value.trim();
  const rider_weight = parseFloat(document.getElementById('newSetupRiderWeight').value);
  const bike_weight = parseFloat(document.getElementById('newSetupBikeWeight').value);
  const front_luggage_weight = parseFloat(document.getElementById('newSetupFrontLuggage').value) || 0;
  const rear_luggage_weight = parseFloat(document.getElementById('newSetupRearLuggage').value) || 0;
  const frame_load_weight = parseFloat(document.getElementById('newSetupFrameLoad').value) || 0;
  const weight_unit = document.getElementById('newSetupWeightUnit').value;
  const bike_type = document.getElementById('newSetupBikeType').value;
  const frame_size = document.getElementById('newSetupFrameSize').value;
  const riding_position = document.getElementById('newSetupRidingPosition').value;
  const surface_type = document.getElementById('newSetupSurface').value;
  if (!name || !rider_weight || !bike_weight) { alert('Name, rider weight, and bike weight required'); return; }
  const result = await api('/setups', { method: 'POST', body: { bike_id: Number(currentBikeId), name, rider_weight, bike_weight, front_luggage_weight, rear_luggage_weight, frame_load_weight, weight_unit, bike_type, frame_size, riding_position, surface_type } });
  document.getElementById('newSetupName').value = '';
  document.getElementById('addSetupForm').style.display = 'none';
  await loadSetups(currentBikeId);
  document.getElementById('setupSelect').value = result.id;
  currentSetupId = result.id;
  document.getElementById('setupSelect').dispatchEvent(new Event('change'));
  loadHistory(currentSetupId);
}

async function deleteSetup(id) {
  if (!confirm('Delete setup and saved pressures?')) return;
  await api(`/setups/${id}`, { method: 'DELETE' });
  if (currentSetupId == id) { currentSetupId = null; }
  await loadSetups(currentBikeId); loadHistory(null);
}

// ─── Init ──────────────────────────────────────────────────────────

function showManage(section) {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('profileBar').style.display = 'flex';
  document.getElementById('calculator').style.display = 'block';
  onboarded = true;
  loadRiders().then(() => toggleManage());
}

function skipOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('profileBar').style.display = 'flex';
  document.getElementById('calculator').style.display = 'block';
  onboarded = true;
  loadRiders();
}

// Check if user has existing data
api('/riders').then(r => {
  if (r.length > 0) {
    // Existing user — skip onboarding
    skipOnboarding();
  }
  // Otherwise show onboarding
});
