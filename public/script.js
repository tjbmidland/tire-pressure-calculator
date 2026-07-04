// ─── State ─────────────────────────────────────────────────────────

let riders = [];
let bikes = [];
let setups = [];
let currentRiderId = null;
let currentBikeId = null;
let currentSetupId = null;
let lastResult = null;

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
    bikes.map(b => `<option value="${b.id}">${b.name} (${b.tire_width}${b.tire_width_unit})</option>`).join('');
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
      document.getElementById('tireWidth').value = bike.tire_width;
      document.getElementById('tireUnit').value = bike.tire_width_unit;
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
    const setup = setups.find(s => s.id == currentSetupId);
    if (setup) {
      document.getElementById('riderWeight').value = setup.rider_weight;
      document.getElementById('bikeWeight').value = setup.bike_weight;
      document.getElementById('gearWeight').value = setup.additional_weight;
      document.getElementById('weightUnit').value = setup.weight_unit;
      document.getElementById('bikeType').value = setup.bike_type;
      document.getElementById('surfaceType').value = setup.surface_type;
      document.getElementById('bikeWeightUnit').textContent = setup.weight_unit;
      document.getElementById('gearWeightUnit').textContent = setup.weight_unit;
    }
  }
  document.getElementById('saveBtn').style.display = currentSetupId ? 'block' : 'none';
});

document.getElementById('weightUnit').addEventListener('change', function() {
  document.getElementById('bikeWeightUnit').textContent = this.value;
  document.getElementById('gearWeightUnit').textContent = this.value;
});

// Sync weight unit selector in setup form
document.getElementById('newSetupWeightUnit').addEventListener('change', function() {
  document.getElementById('newSetupWeightUnit2').value = this.value;
});

// ─── Calculator ────────────────────────────────────────────────────

document.getElementById('calculateBtn').addEventListener('click', async () => {
  const tireWidth = parseFloat(document.getElementById('tireWidth').value);
  const tireUnit = document.getElementById('tireUnit').value;
  const rimWidth = parseFloat(document.getElementById('rimWidth').value) || 18;
  const riderWeight = parseFloat(document.getElementById('riderWeight').value);
  const bikeWeight = parseFloat(document.getElementById('bikeWeight').value);
  const gearWeight = parseFloat(document.getElementById('gearWeight').value) || 0;
  const weightUnit = document.getElementById('weightUnit').value;
  const bikeType = document.getElementById('bikeType').value;
  const surfaceType = document.getElementById('surfaceType').value;
  const casingType = document.getElementById('casingType').value;
  const isTubeless = document.getElementById('isTubeless').checked;

  if (!tireWidth || !riderWeight || !bikeWeight) {
    alert('Please fill in tire width, rider weight, and bike weight');
    return;
  }

  try {
    const result = await api('/pressures/calculate', {
      method: 'POST',
      body: {
        riderWeight,
        bikeWeight,
        additionalWeight: gearWeight,
        tireWidth,
        tireWidthUnit: tireUnit,
        weightUnit,
        rimWidthMm: rimWidth,
        casingType,
        isTubeless,
        surfaceType,
        bikeType,
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
  await api('/riders', { method: 'POST', body: { name } });
  document.getElementById('newRiderName').value = '';
  await loadRiders();
}

async function deleteRider(id) {
  if (!confirm('Delete rider and all their bikes/setups?')) return;
  await api(`/riders/${id}`, { method: 'DELETE' });
  if (currentRiderId == id) { currentRiderId = null; currentBikeId = null; currentSetupId = null; }
  await loadRiders();
  await loadBikes(null);
  await loadSetups(null);
  loadHistory(null);
}

// Bikes
function renderBikeList() {
  const el = document.getElementById('bikeList');
  el.innerHTML = bikes.map(b => `
    <div class="item-row">
      <span>${b.name} — ${b.tire_width}${b.tire_width_unit}, ${b.rim_width_mm}mm rim, ${b.casing_type}${b.is_tubeless ? ', tubeless' : ''}</span>
      <button class="btn-link btn-delete" onclick="deleteBike(${b.id})">×</button>
    </div>
  `).join('');
}

async function addBike() {
  if (!currentRiderId) { alert('Select a rider first'); return; }
  const name = document.getElementById('newBikeName').value.trim();
  const tire_width = parseFloat(document.getElementById('newBikeTireWidth').value);
  const tire_width_unit = document.getElementById('newBikeTireUnit').value;
  const rim_width_mm = parseFloat(document.getElementById('newBikeRimWidth').value) || 18;
  const casing_type = document.getElementById('newBikeCasing').value;
  const is_tubeless = document.getElementById('newBikeTubeless').checked ? 1 : 0;
  if (!name || !tire_width) { alert('Name and tire width required'); return; }
  await api('/bikes', { method: 'POST', body: { rider_id: Number(currentRiderId), name, tire_width, tire_width_unit, rim_width_mm, casing_type, is_tubeless } });
  document.getElementById('newBikeName').value = '';
  document.getElementById('newBikeTireWidth').value = '';
  document.getElementById('addBikeForm').style.display = 'none';
  await loadBikes(currentRiderId);
}

async function deleteBike(id) {
  if (!confirm('Delete bike and all its setups?')) return;
  await api(`/bikes/${id}`, { method: 'DELETE' });
  if (currentBikeId == id) { currentBikeId = null; currentSetupId = null; }
  await loadBikes(currentRiderId);
  await loadSetups(null);
  loadHistory(null);
}

// Setups
function renderSetupList() {
  const el = document.getElementById('setupList');
  el.innerHTML = setups.map(s => `
    <div class="item-row">
      <span>${s.name} — ${s.rider_weight}${s.weight_unit} rider, ${s.bike_weight}${s.weight_unit} bike${s.additional_weight ? ', +' + s.additional_weight + s.weight_unit + ' gear' : ''}</span>
      <button class="btn-link btn-delete" onclick="deleteSetup(${s.id})">×</button>
    </div>
  `).join('');
}

async function addSetup() {
  if (!currentBikeId) { alert('Select a bike first'); return; }
  const name = document.getElementById('newSetupName').value.trim();
  const rider_weight = parseFloat(document.getElementById('newSetupRiderWeight').value);
  const bike_weight = parseFloat(document.getElementById('newSetupBikeWeight').value);
  const additional_weight = parseFloat(document.getElementById('newSetupGearWeight').value) || 0;
  const weight_unit = document.getElementById('newSetupWeightUnit').value;
  const bike_type = document.getElementById('newSetupBikeType').value;
  const surface_type = document.getElementById('newSetupSurface').value;
  if (!name || !rider_weight || !bike_weight) { alert('Name, rider weight, and bike weight required'); return; }
  await api('/setups', { method: 'POST', body: { bike_id: Number(currentBikeId), name, rider_weight, bike_weight, additional_weight, weight_unit, bike_type, surface_type } });
  document.getElementById('newSetupName').value = '';
  document.getElementById('addSetupForm').style.display = 'none';
  await loadSetups(currentBikeId);
}

async function deleteSetup(id) {
  if (!confirm('Delete setup and saved pressures?')) return;
  await api(`/setups/${id}`, { method: 'DELETE' });
  if (currentSetupId == id) { currentSetupId = null; }
  await loadSetups(currentBikeId);
  loadHistory(null);
}

// ─── Init ──────────────────────────────────────────────────────────

loadRiders();
