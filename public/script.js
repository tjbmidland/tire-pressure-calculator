// ─── State ─────────────────────────────────────────────────────────

let riders = [];
let bikes = [];
let setups = [];
let currentRiderId = null;
let currentBikeId = null;
let currentSetupId = null;
let lastResult = null;
let onboarded = false;

// Toast state
let toastIdCounter = 0;
const toastTimeouts = {};

// Undo state
let undoEntry = null;

// Edit state
let editingRiderId = null;
let editingBikeId = null;
let editingSetupId = null;

// History state
let historyPressures = [];
let pendingPressureDeletes = new Set();

// localStorage keys
const QUICKCALC_KEY = 'tpc_quickcalc';
const PRESSURE_INPUTS_PREFIX = 'tpc_pressure_inputs_';

// Context / dirty / global-saved state (calculator-first UX)
let loadedBikeSnapshot = null;   // calculator bike-field snapshot when a bike is loaded
let loadedSetupSnapshot = null;  // calculator setup-field snapshot when a setup is loaded
let historyExpanded = false;      // saved-pressures section expand state
let lastHistoryHadSetup = null;   // tracks setup-selection level for auto expand/collapse
let promptCallback = null;       // pending name-prompt callback

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

// ─── Toast system ──────────────────────────────────────────────────

function showToast(type, message, opts = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const id = ++toastIdCounter;
  const duration = opts.duration || (type === 'undo' ? 5000 : 3000);

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.id = `toast-${id}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  if (opts.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action';
    actionBtn.setAttribute('aria-label', opts.action.label);
    const labelSpan = document.createElement('span');
    labelSpan.className = 'toast-action-label';
    labelSpan.textContent = opts.action.label;
    actionBtn.appendChild(labelSpan);
    actionBtn.addEventListener('click', () => {
      opts.action.callback();
      dismissToast(id);
    });
    toast.appendChild(actionBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'toast-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss notification');
  dismissBtn.textContent = '×';
  dismissBtn.addEventListener('click', () => dismissToast(id));
  toast.appendChild(dismissBtn);

  container.appendChild(toast);

  if (duration > 0) {
    toastTimeouts[id] = setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

function dismissToast(id) {
  const toast = document.getElementById(`toast-${id}`);
  if (!toast) return;
  if (toastTimeouts[id]) {
    clearTimeout(toastTimeouts[id]);
    delete toastTimeouts[id];
  }
  toast.classList.add('toast--dismissed');
  setTimeout(() => toast.remove(), 100);
}

function dismissAllToasts() {
  Object.keys(toastTimeouts).forEach(id => dismissToast(Number(id)));
}

// ─── Loading state helpers ─────────────────────────────────────────

function setLoading(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (el.tagName === 'BUTTON') {
    if (!el.dataset.originalContent) {
      el.dataset.originalContent = el.innerHTML;
    }
    el.classList.add('btn-loading');
    el.innerHTML = '<span class="loading-spinner"></span>';
    el.disabled = true;
  } else {
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
  }
}

function clearLoading(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (el.tagName === 'BUTTON') {
    el.classList.remove('btn-loading');
    if (el.dataset.originalContent) {
      el.innerHTML = el.dataset.originalContent;
      delete el.dataset.originalContent;
    }
    el.disabled = false;
  } else {
    el.style.opacity = '';
    el.style.pointerEvents = '';
  }
}

// ─── Inline validation ─────────────────────────────────────────────

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  field.style.borderColor = 'var(--red)';
  field.style.boxShadow = '0 0 12px var(--red-glow)';

  const group = field.closest('.input-group');
  if (group) group.classList.add('has-error');

  clearFieldError(fieldId);

  const error = document.createElement('div');
  error.className = 'field-error';
  error.id = `error-${fieldId}`;
  error.textContent = message;

  const insertAfter = field.closest('.calc-input-row') || field;
  insertAfter.parentNode.insertBefore(error, insertAfter.nextSibling);
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  field.style.borderColor = '';
  field.style.boxShadow = '';

  const group = field.closest('.input-group');
  if (group) group.classList.remove('has-error');

  const error = document.getElementById(`error-${fieldId}`);
  if (error) error.remove();
}

function validateCalculator() {
  let valid = true;

  const frontTireWidth = parseFloat(document.getElementById('frontTireWidth').value);
  const riderWeight = parseFloat(document.getElementById('riderWeight').value);
  const bikeWeight = parseFloat(document.getElementById('bikeWeight').value);

  if (!frontTireWidth || frontTireWidth <= 0) {
    showFieldError('frontTireWidth', 'Front tire width required');
    valid = false;
  } else {
    clearFieldError('frontTireWidth');
  }

  if (!riderWeight || riderWeight <= 0) {
    showFieldError('riderWeight', 'Rider weight required');
    valid = false;
  } else {
    clearFieldError('riderWeight');
  }

  if (!bikeWeight || bikeWeight <= 0) {
    showFieldError('bikeWeight', 'Bike weight required');
    valid = false;
  } else {
    clearFieldError('bikeWeight');
  }

  return valid;
}

// ─── Undo system ───────────────────────────────────────────────────

function scheduleUndo(type, data, restoreFn, commitFn) {
  if (undoEntry) {
    commitDelete();
  }

  undoEntry = { type, data, restoreFn, commitFn, timeoutId: null };

  showToast('undo', `${type} deleted`, {
    action: { label: 'Undo', callback: performUndo },
    duration: 5000,
  });

  undoEntry.timeoutId = setTimeout(() => commitDelete(), 5000);
}

function performUndo() {
  if (!undoEntry) return;
  const entry = undoEntry;
  if (entry.timeoutId) clearTimeout(entry.timeoutId);
  undoEntry = null;
  if (entry.restoreFn) {
    Promise.resolve(entry.restoreFn()).then(() => {
      showToast('info', `${entry.type} restored`);
    });
  } else {
    showToast('info', `${entry.type} restored`);
  }
}

function commitDelete() {
  if (!undoEntry) return;
  const entry = undoEntry;
  undoEntry = null;
  if (entry.commitFn) {
    entry.commitFn().catch(err => {
      showToast('error', `Delete failed: ${err.message}`);
      if (entry.restoreFn) entry.restoreFn();
    });
  }
}

function clearUndo() {
  if (undoEntry && undoEntry.timeoutId) {
    clearTimeout(undoEntry.timeoutId);
  }
  undoEntry = null;
}

// ─── Accessibility helpers ─────────────────────────────────────────

function announceResult(message) {
  let announcer = document.getElementById('srAnnouncer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'srAnnouncer';
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
  }
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = message; }, 50);
}

// ─── Collapsible sections ──────────────────────────────────────────

function toggleCollapsible(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const isCollapsed = section.classList.toggle('collapsible-section--collapsed');
  const trigger = section.querySelector('.collapsible-trigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(!isCollapsed));
  }
}

// ─── Input persistence ─────────────────────────────────────────────

function getCalculatorInputs() {
  return {
    frontTireWidth: document.getElementById('frontTireWidth').value,
    rearTireWidth: document.getElementById('rearTireWidth').value,
    tireUnit: document.getElementById('tireUnit').value,
    rimWidth: document.getElementById('rimWidth').value,
    casingType: document.getElementById('casingType').value,
    isTubeless: document.getElementById('isTubeless').checked,
    riderWeight: document.getElementById('riderWeight').value,
    bikeWeight: document.getElementById('bikeWeight').value,
    weightUnit: document.getElementById('weightUnit').value,
    bikeType: document.getElementById('bikeType').value,
    frontLuggage: document.getElementById('frontLuggage').value,
    rearLuggage: document.getElementById('rearLuggage').value,
    frameLoad: document.getElementById('frameLoad').value,
    frameSize: document.getElementById('frameSize').value,
    ridingPosition: document.getElementById('ridingPosition').value,
    surfaceType: document.getElementById('surfaceType').value,
  };
}

function setCalculatorInputs(inputs) {
  if (inputs.frontTireWidth !== undefined) document.getElementById('frontTireWidth').value = inputs.frontTireWidth;
  if (inputs.rearTireWidth !== undefined) document.getElementById('rearTireWidth').value = inputs.rearTireWidth;
  if (inputs.tireUnit !== undefined) {
    document.getElementById('tireUnit').value = inputs.tireUnit;
    document.getElementById('rearTireUnit').textContent = inputs.tireUnit;
  }
  if (inputs.rimWidth !== undefined) document.getElementById('rimWidth').value = inputs.rimWidth;
  if (inputs.casingType !== undefined) document.getElementById('casingType').value = inputs.casingType;
  if (inputs.isTubeless !== undefined) document.getElementById('isTubeless').checked = inputs.isTubeless;
  if (inputs.riderWeight !== undefined) document.getElementById('riderWeight').value = inputs.riderWeight;
  if (inputs.bikeWeight !== undefined) document.getElementById('bikeWeight').value = inputs.bikeWeight;
  if (inputs.weightUnit !== undefined) {
    document.getElementById('weightUnit').value = inputs.weightUnit;
    document.querySelectorAll('#bikeWeightUnit, #frontLuggageUnit, #rearLuggageUnit, #frameLoadUnit').forEach(el => el.textContent = inputs.weightUnit);
  }
  if (inputs.bikeType !== undefined) document.getElementById('bikeType').value = inputs.bikeType;
  if (inputs.frontLuggage !== undefined) document.getElementById('frontLuggage').value = inputs.frontLuggage;
  if (inputs.rearLuggage !== undefined) document.getElementById('rearLuggage').value = inputs.rearLuggage;
  if (inputs.frameLoad !== undefined) document.getElementById('frameLoad').value = inputs.frameLoad;
  if (inputs.frameSize !== undefined) document.getElementById('frameSize').value = inputs.frameSize;
  if (inputs.ridingPosition !== undefined) document.getElementById('ridingPosition').value = inputs.ridingPosition;
  if (inputs.surfaceType !== undefined) document.getElementById('surfaceType').value = inputs.surfaceType;
}

function saveQuickCalc() {
  try {
    localStorage.setItem(QUICKCALC_KEY, JSON.stringify(getCalculatorInputs()));
  } catch (e) { /* ignore quota errors */ }
}

function loadQuickCalc() {
  try {
    const json = localStorage.getItem(QUICKCALC_KEY);
    if (!json) return;
    setCalculatorInputs(JSON.parse(json));
  } catch (e) { /* ignore parse errors */ }
}

// ─── Context & dirty state (calculator-first UX) ───────────────────

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shallowEqual(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function getBikeInputs() {
  return {
    frontTireWidth: document.getElementById('frontTireWidth').value,
    rearTireWidth: document.getElementById('rearTireWidth').value,
    tireUnit: document.getElementById('tireUnit').value,
    rimWidth: document.getElementById('rimWidth').value,
    casingType: document.getElementById('casingType').value,
    isTubeless: document.getElementById('isTubeless').checked,
  };
}

function getSetupInputs() {
  return {
    riderWeight: document.getElementById('riderWeight').value,
    bikeWeight: document.getElementById('bikeWeight').value,
    weightUnit: document.getElementById('weightUnit').value,
    bikeType: document.getElementById('bikeType').value,
    frontLuggage: document.getElementById('frontLuggage').value,
    rearLuggage: document.getElementById('rearLuggage').value,
    frameLoad: document.getElementById('frameLoad').value,
    frameSize: document.getElementById('frameSize').value,
    ridingPosition: document.getElementById('ridingPosition').value,
    surfaceType: document.getElementById('surfaceType').value,
  };
}

function applyBikeToCalculator(bike) {
  if (!bike) return;
  document.getElementById('frontTireWidth').value = bike.front_tire_width;
  document.getElementById('rearTireWidth').value = bike.rear_tire_width || '';
  document.getElementById('tireUnit').value = bike.tire_width_unit;
  document.getElementById('rearTireUnit').textContent = bike.tire_width_unit;
  document.getElementById('rimWidth').value = bike.rim_width_mm;
  document.getElementById('casingType').value = bike.casing_type;
  document.getElementById('isTubeless').checked = !!bike.is_tubeless;
}

function applySetupToCalculator(s) {
  if (!s) return;
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

function snapshotBike() { loadedBikeSnapshot = currentBikeId ? getBikeInputs() : null; }
function snapshotSetup() { loadedSetupSnapshot = currentSetupId ? getSetupInputs() : null; }

function bikeDirty() {
  if (!currentBikeId || !loadedBikeSnapshot) return false;
  return !shallowEqual(getBikeInputs(), loadedBikeSnapshot);
}
function setupDirty() {
  if (!currentSetupId || !loadedSetupSnapshot) return false;
  return !shallowEqual(getSetupInputs(), loadedSetupSnapshot);
}

// ─── Context chip & save actions ───────────────────────────────────

function updateContextChip() {
  const chip = document.getElementById('contextChip');
  if (!chip) return;
  const rider = riders.find(r => r.id == currentRiderId);
  const bike = bikes.find(b => b.id == currentBikeId);
  const setup = setups.find(s => s.id == currentSetupId);
  const sep = ' <span class="ctx-sep">›</span> ';
  if (setup && bike && rider) {
    chip.innerHTML = `<span class="ctx-name">${escapeHtml(rider.name)}</span>${sep}<span class="ctx-name">${escapeHtml(bike.name)}</span>${sep}<span class="ctx-name ctx-name--active">${escapeHtml(setup.name)}</span>`;
  } else if (bike && rider) {
    chip.innerHTML = `<span class="ctx-name">${escapeHtml(rider.name)}</span>${sep}<span class="ctx-name ctx-name--active">${escapeHtml(bike.name)}</span>`;
  } else if (rider) {
    chip.innerHTML = `<span class="ctx-name ctx-name--active">${escapeHtml(rider.name)}</span> <span class="ctx-hint">— select a bike</span>`;
  } else {
    chip.textContent = 'Quick calculate (unsaved)';
  }
}

function updateSaveActions() {
  const bar = document.getElementById('saveActions');
  if (!bar) return;
  const hasResult = !!lastResult;
  bar.style.display = hasResult ? 'flex' : 'none';
  const badge = document.getElementById('dirtyBadge');
  if (badge) badge.style.display = (bikeDirty() || setupDirty()) ? 'inline-block' : 'none';
  if (!hasResult) return;
  const bDirty = bikeDirty(), sDirty = setupDirty();
  const set = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? 'inline-flex' : 'none'; };
  const sp = document.getElementById('savePressureBtn');
  if (sp) { sp.style.display = 'inline-flex'; sp.textContent = currentSetupId ? 'Save pressure' : 'Save pressure to new setup'; }
  set('saveAsNewSetupBtn', true);
  set('updateSetupBtn', currentSetupId && sDirty);
  set('saveAsNewBikeBtn', !currentBikeId || bDirty);
  set('updateBikeBtn', currentBikeId && bDirty);
}

function checkDirty() { updateContextChip(); updateSaveActions(); }

function scrollToCalculator() {
  const calc = document.getElementById('calculator');
  if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideSavedResultBanner() {
  const b = document.getElementById('savedResultBanner');
  if (b) b.style.display = 'none';
}
function showSavedResultBanner(p) {
  const b = document.getElementById('savedResultBanner');
  if (!b) return;
  const raw = String(p.created_at);
  const d = new Date(raw.endsWith('Z') ? raw : raw + 'Z');
  b.textContent = `Saved result from ${isNaN(d.getTime()) ? new Date(raw).toLocaleString() : d.toLocaleString()} — inputs restored below`;
  b.style.display = 'block';
}

// ─── Name prompt modal ─────────────────────────────────────────────

function promptName(title, defaultValue, confirmLabel, callback) {
  const modal = document.getElementById('namePrompt');
  if (!modal) { const n = window.prompt(title, defaultValue || ''); if (callback) callback(n || ''); return; }
  document.getElementById('promptTitle').textContent = title;
  const input = document.getElementById('promptInput');
  input.value = defaultValue || '';
  const cb = document.getElementById('promptConfirm');
  if (cb) cb.textContent = confirmLabel || 'Save';
  promptCallback = callback;
  modal.style.display = 'flex';
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function confirmPrompt() {
  const val = document.getElementById('promptInput').value.trim();
  if (!val) { showToast('error', 'Name required'); return; }
  const cb = promptCallback;
  closePrompt();
  if (cb) cb(val);
}

function closePrompt() {
  const modal = document.getElementById('namePrompt');
  if (modal) modal.style.display = 'none';
  promptCallback = null;
}

// ─── Copy to clipboard ─────────────────────────────────────────────

function copyPressure(which) {
  const psiEl = document.getElementById(which === 'front' ? 'frontPsi' : 'rearPsi');
  const barEl = document.getElementById(which === 'front' ? 'frontBar' : 'rearBar');
  const cardEl = document.getElementById(which === 'front' ? 'frontCard' : 'rearCard');

  const psi = psiEl.textContent;
  const bar = barEl.textContent;
  if (psi === '--') return;

  const text = `${which}: ${psi} psi (${bar} bar)`;

  const onSuccess = () => {
    flashCopied(cardEl);
    showToast('success', `Copied: ${text}`);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      fallbackCopy(text);
      onSuccess();
    });
  } else {
    fallbackCopy(text);
    onSuccess();
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function flashCopied(el) {
  if (!el) return;
  el.classList.remove('copied-flash');
  void el.offsetWidth;
  el.classList.add('copied-flash');
}

// ─── Empty states ──────────────────────────────────────────────────

function showEmptyState(listType) {
  const el = document.getElementById(listType === 'bike' ? 'bikeEmpty' : 'setupEmpty');
  if (el) el.style.display = 'block';
}

function hideEmptyState(listType) {
  const el = document.getElementById(listType === 'bike' ? 'bikeEmpty' : 'setupEmpty');
  if (el) el.style.display = 'none';
}

function updateBikeEmptyState() {
  const el = document.getElementById('bikeEmpty');
  if (el) el.style.display = (bikes.length === 0 && currentRiderId) ? 'block' : 'none';
}

function updateSetupEmptyState() {
  const el = document.getElementById('setupEmpty');
  if (el) el.style.display = (setups.length === 0 && currentBikeId) ? 'block' : 'none';
}

// ─── Data loading ──────────────────────────────────────────────────

function renderRiderSelect() {
  const sel = document.getElementById('riderSelect');
  sel.innerHTML = '<option value="">Rider...</option>' +
    riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

function renderBikeSelect() {
  const sel = document.getElementById('bikeSelect');
  sel.disabled = !currentRiderId;
  sel.innerHTML = '<option value="">Bike...</option>' +
    bikes.map(b => {
      const w = b.rear_tire_width && b.rear_tire_width !== b.front_tire_width
        ? `${b.front_tire_width}/${b.rear_tire_width}${b.tire_width_unit}`
        : `${b.front_tire_width}${b.tire_width_unit}`;
      return `<option value="${b.id}">${b.name} (${w})</option>`;
    }).join('');
}

function renderSetupSelect() {
  const sel = document.getElementById('setupSelect');
  sel.disabled = !currentBikeId;
  sel.innerHTML = '<option value="">Setup...</option>' +
    setups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function loadRiders() {
  riders = await api('/riders');
  renderRiderSelect();
  renderRiderList();
}

async function loadBikes(riderId) {
  bikes = riderId ? await api(`/bikes?rider_id=${riderId}`) : [];
  renderBikeSelect();
  document.getElementById('bikeRiderLabel').textContent =
    riderId ? `for ${riders.find(r => r.id == riderId)?.name || ''}` : '';
  renderBikeList();
  // Toggle guidance text and add button
  const bikeGuidance = document.getElementById('bikeGuidance');
  const addBikeToggle = document.getElementById('addBikeToggle');
  if (bikeGuidance) bikeGuidance.style.display = riderId ? 'none' : 'block';
  if (addBikeToggle) addBikeToggle.classList.toggle('btn-link--disabled', !riderId);
}

async function loadSetups(bikeId) {
  setups = bikeId ? await api(`/setups?bike_id=${bikeId}`) : [];
  renderSetupSelect();
  document.getElementById('setupBikeLabel').textContent =
    bikeId ? `for ${bikes.find(b => b.id == bikeId)?.name || ''}` : '';
  renderSetupList();
  // Toggle guidance text and add button
  const setupGuidance = document.getElementById('setupGuidance');
  const addSetupToggle = document.getElementById('addSetupToggle');
  if (setupGuidance) setupGuidance.style.display = bikeId ? 'none' : 'block';
  if (addSetupToggle) addSetupToggle.classList.toggle('btn-link--disabled', !bikeId);
}

// ─── History ───────────────────────────────────────────────────────

// Saved pressures data — one progressively-filtered list (see renderSavedList).
// Filter narrows with the current selection: setup → bike → rider → all.
async function loadSavedPressures() {
  let url = '/pressures';
  const params = [];
  if (currentSetupId) params.push(`setup_id=${currentSetupId}`);
  else if (currentBikeId) params.push(`bike_id=${currentBikeId}`);
  else if (currentRiderId) params.push(`rider_id=${currentRiderId}`);
  if (params.length) url += '?' + params.join('&');
  try {
    historyPressures = await api(url);
    renderSavedList();
  } catch (err) {
    showToast('error', 'Failed to load saved pressures: ' + err.message);
  }
}

function refreshHistory() {
  loadSavedPressures();
}

function parsePressureInputs(p) {
  if (p.inputs) {
    try { return typeof p.inputs === 'string' ? JSON.parse(p.inputs) : p.inputs; } catch (e) { /* ignore */ }
  }
  const json = localStorage.getItem(`${PRESSURE_INPUTS_PREFIX}${p.id}`);
  if (json) { try { return JSON.parse(json); } catch (e) { /* ignore */ } }
  return null;
}

function findPressureById(id) {
  return historyPressures.find(p => p.id == id) || null;
}

const SURFACE_LABELS = {
  smooth_asphalt: 'Smooth asphalt',
  rough_asphalt: 'Rough asphalt',
  smooth_gravel: 'Smooth gravel',
  coarse_gravel: 'Coarse gravel',
  rough_gravel: 'Rough gravel',
  mixed_paved_gravel: 'Mixed paved/gravel',
  singletrack: 'Singletrack',
};

// Detail chips for a saved-pressure row: tire width, load, terrain (and luggage
// when present). Lets you identify a row's parameters without filtering.
function pressureDetail(inputs) {
  if (!inputs) return [];
  const chips = [];
  const unit = inputs.tireUnit || 'mm';
  const ftw = inputs.frontTireWidth;
  const rtw = inputs.rearTireWidth;
  if (ftw) chips.push(rtw && rtw !== ftw ? `${ftw}/${rtw}${unit}` : `${ftw}${unit}`);
  const wUnit = inputs.weightUnit || 'lbs';
  const riderW = parseFloat(inputs.riderWeight) || 0;
  const bikeW = parseFloat(inputs.bikeWeight) || 0;
  const lug = (parseFloat(inputs.frontLuggage) || 0) + (parseFloat(inputs.rearLuggage) || 0) + (parseFloat(inputs.frameLoad) || 0);
  if (riderW || bikeW) {
    let load = `${riderW}+${bikeW}${wUnit}`;
    if (lug) load += ` · +${lug}${wUnit} load`;
    chips.push(load);
  }
  if (inputs.surfaceType) chips.push(SURFACE_LABELS[inputs.surfaceType] || inputs.surfaceType);
  return chips;
}

// Saved-pressures view — one progressively-filtered, collapsible list that lives
// where the old per-setup history sat. The header shows the current scope and
// the list auto-filters: setup selected → that setup · bike → that bike ·
// rider → that rider · else all.
function historyScopeLabel() {
  const rider = riders.find(r => r.id == currentRiderId);
  const bike = bikes.find(b => b.id == currentBikeId);
  const setup = setups.find(s => s.id == currentSetupId);
  if (setup && bike && rider) return `${escapeHtml(rider.name)} <span class="ctx-sep">›</span> ${escapeHtml(bike.name)} <span class="ctx-sep">›</span> ${escapeHtml(setup.name)}`;
  if (bike && rider) return `${escapeHtml(rider.name)} <span class="ctx-sep">›</span> ${escapeHtml(bike.name)}`;
  if (rider) return escapeHtml(rider.name);
  return 'All';
}

// Auto expand when entering a setup-focused view; collapse for broad views.
// User toggles persist while the setup-selection level stays the same.
function applyHistoryExpanded() {
  const section = document.getElementById('history');
  const trigger = document.getElementById('historyTrigger');
  if (!section) return;
  const hasSetup = !!currentSetupId;
  if (lastHistoryHadSetup !== hasSetup) {
    historyExpanded = hasSetup;
    lastHistoryHadSetup = hasSetup;
  }
  section.classList.toggle('history--collapsed', !historyExpanded);
  if (trigger) trigger.setAttribute('aria-expanded', String(historyExpanded));
}

function toggleHistory() {
  const section = document.getElementById('history');
  const trigger = document.getElementById('historyTrigger');
  if (!section) return;
  const nowCollapsed = section.classList.toggle('history--collapsed');
  historyExpanded = !nowCollapsed;
  if (trigger) trigger.setAttribute('aria-expanded', String(historyExpanded));
}

function renderSavedList() {
  const section = document.getElementById('history');
  const el = document.getElementById('historyList');
  const scope = document.getElementById('historyScope');
  const count = document.getElementById('historyCount');
  if (!section || !el) return;
  const visible = historyPressures.filter(p => !pendingPressureDeletes.has(p.id));

  if (scope) scope.innerHTML = historyScopeLabel();
  if (count) count.textContent = visible.length > 0 ? `${visible.length} saved` : '';

  if (visible.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  applyHistoryExpanded();

  el.innerHTML = visible.map(p => {
    // Always show rider›bike›setup as the primary identifier so a row is
    // self-describing regardless of the current filter scope.
    const ctx = (p.rider_name && p.bike_name && p.setup_name)
      ? `<span class="saved-context">${escapeHtml(p.rider_name)} <span class="ctx-sep">›</span> ${escapeHtml(p.bike_name)} <span class="ctx-sep">›</span> ${escapeHtml(p.setup_name)}</span>`
      : '';
    const chips = pressureDetail(parsePressureInputs(p))
      .map(c => `<span class="history-chip">${escapeHtml(c)}</span>`).join('');
    const dateStr = new Date(p.created_at + (String(p.created_at).endsWith('Z') ? '' : 'Z')).toLocaleDateString();
    return `
      <div class="history-item" onclick="recallPressure(${p.id})" role="button" tabindex="0" aria-label="Recall ${p.front_psi}/${p.rear_psi} psi for ${escapeHtml(p.setup_name || '')}">
        <div class="history-item-main">
          <span class="history-pressure">${p.front_psi}/${p.rear_psi} psi</span>
          ${ctx}
          <span class="history-date">${dateStr}</span>
          <button class="btn-link btn-delete" onclick="event.stopPropagation();deletePressure(${p.id})" aria-label="Delete saved pressure">×</button>
        </div>
        ${chips ? `<div class="history-item-meta">${chips}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Load a full rider → bike → setup context (used when recalling from the global list).
async function loadContext(riderId, bikeId, setupId) {
  currentRiderId = riderId || null;
  await loadBikes(currentRiderId);
  currentBikeId = bikeId || null;
  await loadSetups(currentBikeId);
  currentSetupId = setupId || null;
  document.getElementById('riderSelect').value = currentRiderId ?? '';
  document.getElementById('bikeSelect').value = currentBikeId ?? '';
  document.getElementById('setupSelect').value = currentSetupId ?? '';
  if (currentBikeId) applyBikeToCalculator(bikes.find(b => b.id == currentBikeId));
  if (currentSetupId) applySetupToCalculator(setups.find(s => s.id == currentSetupId));
  snapshotBike();
  snapshotSetup();
  saveQuickCalc();
  updateContextChip();
  updateSaveActions();
  loadSavedPressures();
}

// Recall a saved pressure: show the saved result, restore its inputs, and (if it
// belongs to a different setup) load that setup's full context. Server-side
// `inputs` make this robust across devices / after clearing storage.
async function recallPressure(id) {
  const p = findPressureById(id);
  if (!p) { showToast('error', 'Pressure not found'); return; }

  if (p.setup_id && p.setup_id != currentSetupId && (p.rider_id || p.bike_id)) {
    await loadContext(p.rider_id, p.bike_id, p.setup_id);
  }

  lastResult = { frontPsi: p.front_psi, rearPsi: p.rear_psi, frontBar: p.front_bar, rearBar: p.rear_bar };
  document.getElementById('frontPsi').textContent = p.front_psi;
  document.getElementById('frontBar').textContent = p.front_bar;
  document.getElementById('rearPsi').textContent = p.rear_psi;
  document.getElementById('rearBar').textContent = p.rear_bar;
  document.getElementById('results').style.display = 'block';

  const inputs = parsePressureInputs(p);
  if (inputs) {
    setCalculatorInputs(inputs);
    saveQuickCalc();
    snapshotBike();
    snapshotSetup();
  }
  showSavedResultBanner(p);
  updateContextChip();
  updateSaveActions();
  showToast('info', 'Saved result restored' + (inputs ? ' — inputs loaded, tweak & recalc to compare' : ''));
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Select handlers ───────────────────────────────────────────────

document.getElementById('riderSelect').addEventListener('change', async (e) => {
  currentRiderId = e.target.value || null;
  currentBikeId = null;
  currentSetupId = null;
  loadedBikeSnapshot = null;
  loadedSetupSnapshot = null;
  await loadBikes(currentRiderId);
  await loadSetups(null);
  hideSavedResultBanner();
  refreshHistory();
  updateContextChip();
  updateSaveActions();
});

document.getElementById('bikeSelect').addEventListener('change', async (e) => {
  currentBikeId = e.target.value || null;
  currentSetupId = null;
  loadedSetupSnapshot = null;
  await loadSetups(currentBikeId);
  if (currentBikeId) {
    applyBikeToCalculator(bikes.find(b => b.id == currentBikeId));
    saveQuickCalc();
  }
  snapshotBike();
  hideSavedResultBanner();
  refreshHistory();
  updateContextChip();
  updateSaveActions();
});

document.getElementById('setupSelect').addEventListener('change', (e) => {
  currentSetupId = e.target.value || null;
  if (currentSetupId) {
    applySetupToCalculator(setups.find(x => x.id == currentSetupId));
    saveQuickCalc();
  }
  snapshotSetup();
  hideSavedResultBanner();
  refreshHistory();
  updateContextChip();
  updateSaveActions();
});

document.getElementById('weightUnit').addEventListener('change', function() {
  document.querySelectorAll('#bikeWeightUnit, #frontLuggageUnit, #rearLuggageUnit, #frameLoadUnit').forEach(el => el.textContent = this.value);
  saveQuickCalc();
});

document.getElementById('tireUnit').addEventListener('change', function() {
  document.getElementById('rearTireUnit').textContent = this.value;
  saveQuickCalc();
});

// ─── Calculator ────────────────────────────────────────────────────

async function handleCalculate(event) {
  event.preventDefault();

  if (!validateCalculator()) {
    showToast('error', 'Please fix the highlighted fields');
    return;
  }

  setLoading('calculateBtn');

  try {
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
    hideSavedResultBanner();
    updateSaveActions();

    saveQuickCalc();
    announceResult(`Front ${result.frontPsi} PSI, Rear ${result.rearPsi} PSI`);
  } catch (err) {
    showToast('error', 'Calculation error: ' + err.message);
  } finally {
    clearLoading('calculateBtn');
  }
}

// ─── Save / Delete pressure ────────────────────────────────────────

async function savePressure() {
  if (!lastResult) return;
  // No setup selected yet → create one first, then save the pressure into it.
  if (!currentSetupId) {
    return saveAsNewSetup(true);
  }
  setLoading('savePressureBtn');
  try {
    await api('/pressures', {
      method: 'POST',
      body: {
        setup_id: Number(currentSetupId),
        front_psi: lastResult.frontPsi,
        rear_psi: lastResult.rearPsi,
        front_bar: lastResult.frontBar,
        rear_bar: lastResult.rearBar,
        inputs: getCalculatorInputs(),
      },
    });
    await loadSavedPressures();
    showToast('success', 'Pressure saved');
  } catch (err) {
    showToast('error', 'Save error: ' + err.message);
  } finally {
    clearLoading('savePressureBtn');
  }
}

function deletePressure(id) {
  pendingPressureDeletes.add(id);
  renderSavedList();

  scheduleUndo(
    'Pressure',
    { id },
    () => {
      pendingPressureDeletes.delete(id);
      renderSavedList();
    },
    async () => {
      await api(`/pressures/${id}`, { method: 'DELETE' });
      pendingPressureDeletes.delete(id);
      try { localStorage.removeItem(`${PRESSURE_INPUTS_PREFIX}${id}`); } catch (e) {}
    }
  );
}

// ─── Management panel ──────────────────────────────────────────────

function toggleManage() {
  const panel = document.getElementById('managePanel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ─── Riders ────────────────────────────────────────────────────────

function renderRiderList() {
  const el = document.getElementById('riderList');
  const emptyEl = document.getElementById('riderEmpty');
  if (emptyEl) emptyEl.style.display = riders.length === 0 ? 'block' : 'none';
  el.innerHTML = riders.map(r => {
    if (r.id == editingRiderId) {
      return `
        <div class="item-row-edit">
          <input type="text" id="editRiderName-${r.id}" value="${r.name}" aria-label="Edit rider name"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();saveRiderEdit(${r.id});}">
          <div class="edit-actions">
            <button class="btn-cancel-edit" onclick="cancelRiderEdit(${r.id})">Cancel</button>
            <button class="btn-save-edit" onclick="saveRiderEdit(${r.id})">Save</button>
          </div>
        </div>
      `;
    }
    const activeClass = r.id == currentRiderId ? ' item-row--active' : '';
    return `
      <div class="item-row${activeClass}" onclick="selectRider(${r.id})">
        <span class="item-row-text">${r.name}</span>
        <div class="item-row-actions">
          <button class="btn-edit" onclick="event.stopPropagation();editRider(${r.id})" aria-label="Edit rider ${r.name}">✎</button>
          <button class="btn-link btn-delete" onclick="event.stopPropagation();deleteRider(${r.id})" aria-label="Delete rider ${r.name}">×</button>
        </div>
      </div>
    `;
  }).join('');
}

function selectRider(id) {
  document.getElementById('riderSelect').value = id;
  document.getElementById('riderSelect').dispatchEvent(new Event('change'));
}

function editRider(id) {
  editingRiderId = id;
  renderRiderList();
  setTimeout(() => {
    const input = document.getElementById(`editRiderName-${id}`);
    if (input) { input.focus(); input.select(); }
  }, 0);
}

async function saveRiderEdit(id) {
  const name = document.getElementById(`editRiderName-${id}`).value.trim();
  if (!name) {
    showToast('error', 'Name required');
    return;
  }
  try {
    await api(`/riders/${id}`, { method: 'PUT', body: { name } });
    editingRiderId = null;
    await loadRiders();
    document.getElementById('riderSelect').value = id;
    showToast('success', 'Rider updated');
  } catch (err) {
    showToast('error', 'Update failed: ' + err.message);
  }
}

function cancelRiderEdit(id) {
  editingRiderId = null;
  renderRiderList();
}

async function addRider() {
  const name = document.getElementById('newRiderName').value.trim();
  if (!name) {
    showFieldError('newRiderName', 'Name required');
    return;
  }
  clearFieldError('newRiderName');

  try {
    const result = await api('/riders', { method: 'POST', body: { name } });
    document.getElementById('newRiderName').value = '';
    await loadRiders();
    document.getElementById('riderSelect').value = result.id;
    currentRiderId = result.id;
    await loadBikes(currentRiderId);
    showToast('success', 'Rider added');
  } catch (err) {
    showToast('error', 'Failed to add rider: ' + err.message);
  }
}

async function deleteRider(id) {
  const rider = riders.find(r => r.id == id);
  if (!rider) return;

  const wasCurrent = currentRiderId == id;
  const savedBikeId = currentBikeId;
  const savedSetupId = currentSetupId;

  riders = riders.filter(r => r.id != id);
  renderRiderSelect();
  renderRiderList();

  if (wasCurrent) {
    currentRiderId = null;
    currentBikeId = null;
    currentSetupId = null;
    await loadBikes(null);
    await loadSetups(null);
    loadSavedPressures();
  }

  scheduleUndo(
    'Rider',
    rider,
    async () => {
      await loadRiders();
      if (wasCurrent) {
        currentRiderId = id;
        document.getElementById('riderSelect').value = id;
        await loadBikes(id);
        if (savedBikeId) {
          currentBikeId = savedBikeId;
          document.getElementById('bikeSelect').value = savedBikeId;
          await loadSetups(savedBikeId);
          if (savedSetupId) {
            currentSetupId = savedSetupId;
            document.getElementById('setupSelect').value = savedSetupId;
            loadSavedPressures();
          }
        }
      }
    },
    async () => {
      await api(`/riders/${id}`, { method: 'DELETE' });
    }
  );
}

// ─── Bikes ─────────────────────────────────────────────────────────

function renderBikeList() {
  const el = document.getElementById('bikeList');
  el.innerHTML = bikes.map(b => {
    const w = b.rear_tire_width && b.rear_tire_width !== b.front_tire_width
      ? `${b.front_tire_width}/${b.rear_tire_width}${b.tire_width_unit}`
      : `${b.front_tire_width}${b.tire_width_unit}`;
    const desc = `${b.name} — ${w}, ${b.rim_width_mm}mm rim, ${b.casing_type}${b.is_tubeless ? ', tubeless' : ''}`;

    if (b.id == editingBikeId) {
      return `
        <div class="item-row-edit">
          <input type="text" id="editBikeName-${b.id}" value="${b.name}" placeholder="Bike name" aria-label="Edit bike name">
          <div class="input-row-pair">
            <input type="number" id="editBikeFrontTireWidth-${b.id}" value="${b.front_tire_width}" placeholder="Front" step="0.5" aria-label="Front tire width">
            <input type="number" id="editBikeRearTireWidth-${b.id}" value="${b.rear_tire_width || ''}" placeholder="Rear (blank=same)" step="0.5" aria-label="Rear tire width">
          </div>
          <div class="input-row-pair">
            <select id="editBikeTireUnit-${b.id}" aria-label="Tire width unit">
              <option value="mm"${b.tire_width_unit === 'mm' ? ' selected' : ''}>mm</option>
              <option value="in"${b.tire_width_unit === 'in' ? ' selected' : ''}>inches</option>
            </select>
            <input type="number" id="editBikeRimWidth-${b.id}" value="${b.rim_width_mm}" placeholder="Rim width" step="0.5" aria-label="Rim internal width">
          </div>
          <select id="editBikeCasing-${b.id}" aria-label="Casing type">
            <option value="endurance"${b.casing_type === 'endurance' ? ' selected' : ''}>Endurance</option>
            <option value="endurance_plus"${b.casing_type === 'endurance_plus' ? ' selected' : ''}>Endurance+</option>
            <option value="standard"${b.casing_type === 'standard' ? ' selected' : ''}>Standard</option>
            <option value="extralight"${b.casing_type === 'extralight' ? ' selected' : ''}>Extralight/Race</option>
          </select>
          <label class="toggle-label">
            <input type="checkbox" id="editBikeTubeless-${b.id}"${b.is_tubeless ? ' checked' : ''}>
            <span>Tubeless</span>
          </label>
          <div class="edit-actions">
            <button class="btn-cancel-edit" onclick="cancelBikeEdit(${b.id})">Cancel</button>
            <button class="btn-save-edit" onclick="saveBikeEdit(${b.id})">Save</button>
          </div>
        </div>
      `;
    }
    const activeClass = b.id == currentBikeId ? ' item-row--active' : '';
    return `
      <div class="item-row${activeClass}" onclick="selectBike(${b.id})">
        <span class="item-row-text">${desc}</span>
        <div class="item-row-actions">
          <button class="btn-edit" onclick="event.stopPropagation();editBike(${b.id})" aria-label="Edit bike ${b.name}">✎</button>
          <button class="btn-link btn-delete" onclick="event.stopPropagation();deleteBike(${b.id})" aria-label="Delete bike ${b.name}">×</button>
        </div>
      </div>
    `;
  }).join('');
  updateBikeEmptyState();
}

function selectBike(id) {
  document.getElementById('bikeSelect').value = id;
  document.getElementById('bikeSelect').dispatchEvent(new Event('change'));
}

function editBike(id) {
  editingBikeId = id;
  renderBikeList();
  setTimeout(() => {
    const input = document.getElementById(`editBikeName-${id}`);
    if (input) { input.focus(); input.select(); }
  }, 0);
}

async function saveBikeEdit(id) {
  const name = document.getElementById(`editBikeName-${id}`).value.trim();
  const front_tire_width = parseFloat(document.getElementById(`editBikeFrontTireWidth-${id}`).value);
  const rear_tire_width = parseFloat(document.getElementById(`editBikeRearTireWidth-${id}`).value) || null;
  const tire_width_unit = document.getElementById(`editBikeTireUnit-${id}`).value;
  const rim_width_mm = parseFloat(document.getElementById(`editBikeRimWidth-${id}`).value) || 23;
  const casing_type = document.getElementById(`editBikeCasing-${id}`).value;
  const is_tubeless = document.getElementById(`editBikeTubeless-${id}`).checked ? 1 : 0;

  if (!name || !front_tire_width) {
    showToast('error', 'Name and front tire width required');
    return;
  }

  try {
    await api(`/bikes/${id}`, {
      method: 'PUT',
      body: { name, front_tire_width, rear_tire_width, tire_width_unit, rim_width_mm, casing_type, is_tubeless },
    });
    editingBikeId = null;
    await loadBikes(currentRiderId);
    showToast('success', 'Bike updated');
  } catch (err) {
    showToast('error', 'Update failed: ' + err.message);
  }
}

function cancelBikeEdit(id) {
  editingBikeId = null;
  renderBikeList();
}

// Save current calculator tire/rim/casing fields as a new bike under the active
// rider (creating the rider first if none is selected). Calculator-first creation.
function saveAsNewBike(onSaved) {
  if (!currentRiderId) {
    promptName('New rider name', '', 'Create rider', async (riderName) => {
      if (!riderName) return;
      try {
        const r = await api('/riders', { method: 'POST', body: { name: riderName } });
        await loadRiders();
        currentRiderId = r.id;
        document.getElementById('riderSelect').value = r.id;
        await loadBikes(currentRiderId);
        updateContextChip();
        saveAsNewBike(onSaved);
      } catch (err) {
        showToast('error', 'Failed to create rider: ' + err.message);
      }
    });
    return;
  }

  const bi = getBikeInputs();
  const front_tire_width = parseFloat(bi.frontTireWidth);
  if (!front_tire_width) {
    showToast('error', 'Enter a front tire width in the calculator first');
    return;
  }

  promptName('Save as new bike', '', 'Save bike', async (name) => {
    if (!name) return;
    try {
      const result = await api('/bikes', {
        method: 'POST',
        body: {
          rider_id: Number(currentRiderId),
          name,
          front_tire_width,
          rear_tire_width: parseFloat(bi.rearTireWidth) || null,
          tire_width_unit: bi.tireUnit,
          rim_width_mm: parseFloat(bi.rimWidth) || 23,
          casing_type: bi.casingType,
          is_tubeless: bi.isTubeless ? 1 : 0,
        },
      });
      await loadBikes(currentRiderId);
      currentBikeId = result.id;
      document.getElementById('bikeSelect').value = result.id;
      snapshotBike();
      updateContextChip();
      updateSaveActions();
      showToast('success', 'Bike saved');
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      showToast('error', 'Failed to save bike: ' + err.message);
    }
  });
}

// Update the currently-selected bike with the calculator's tire/rim/casing fields.
async function updateBike() {
  if (!currentBikeId) return;
  const bi = getBikeInputs();
  const front_tire_width = parseFloat(bi.frontTireWidth);
  if (!front_tire_width) { showToast('error', 'Front tire width required'); return; }
  const bike = bikes.find(b => b.id == currentBikeId);
  try {
    await api(`/bikes/${currentBikeId}`, {
      method: 'PUT',
      body: {
        name: bike.name,
        front_tire_width,
        rear_tire_width: parseFloat(bi.rearTireWidth) || null,
        tire_width_unit: bi.tireUnit,
        rim_width_mm: parseFloat(bi.rimWidth) || 23,
        casing_type: bi.casingType,
        is_tubeless: bi.isTubeless ? 1 : 0,
      },
    });
    await loadBikes(currentRiderId);
    document.getElementById('bikeSelect').value = currentBikeId;
    snapshotBike();
    updateSaveActions();
    showToast('success', 'Bike updated');
  } catch (err) {
    showToast('error', 'Update failed: ' + err.message);
  }
}

async function deleteBike(id) {
  const bike = bikes.find(b => b.id == id);
  if (!bike) return;

  const wasCurrent = currentBikeId == id;
  const savedSetupId = currentSetupId;

  bikes = bikes.filter(b => b.id != id);
  renderBikeSelect();
  renderBikeList();

  if (wasCurrent) {
    currentBikeId = null;
    currentSetupId = null;
    await loadSetups(null);
    loadSavedPressures();
  }

  scheduleUndo(
    'Bike',
    bike,
    async () => {
      await loadBikes(currentRiderId);
      if (wasCurrent) {
        currentBikeId = id;
        document.getElementById('bikeSelect').value = id;
        await loadSetups(id);
        if (savedSetupId) {
          currentSetupId = savedSetupId;
          document.getElementById('setupSelect').value = savedSetupId;
          loadSavedPressures();
        }
      }
    },
    async () => {
      await api(`/bikes/${id}`, { method: 'DELETE' });
    }
  );
}

// ─── Setups ────────────────────────────────────────────────────────

function renderSetupList() {
  const el = document.getElementById('setupList');
  el.innerHTML = setups.map(s => {
    const w = s.weight_unit;
    let desc = `${s.rider_weight}${w} rider, ${s.bike_weight}${w} bike`;
    if (s.front_luggage_weight) desc += `, +${s.front_luggage_weight}${w} front`;
    if (s.rear_luggage_weight) desc += `, +${s.rear_luggage_weight}${w} rear`;
    if (s.frame_load_weight) desc += `, +${s.frame_load_weight}${w} frame`;

    if (s.id == editingSetupId) {
      return `
        <div class="item-row-edit">
          <input type="text" id="editSetupName-${s.id}" value="${s.name}" placeholder="Setup name" aria-label="Edit setup name">
          <div class="input-row-pair">
            <input type="number" id="editSetupRiderWeight-${s.id}" value="${s.rider_weight}" placeholder="Rider weight" step="0.5" aria-label="Rider weight">
            <input type="number" id="editSetupBikeWeight-${s.id}" value="${s.bike_weight}" placeholder="Bike weight" step="0.1" aria-label="Bike weight">
          </div>
          <div class="input-row-pair">
            <input type="number" id="editSetupFrontLuggage-${s.id}" value="${s.front_luggage_weight || 0}" placeholder="Front luggage" step="0.1" aria-label="Front luggage weight">
            <input type="number" id="editSetupRearLuggage-${s.id}" value="${s.rear_luggage_weight || 0}" placeholder="Rear luggage" step="0.1" aria-label="Rear luggage weight">
          </div>
          <div class="input-row-pair">
            <input type="number" id="editSetupFrameLoad-${s.id}" value="${s.frame_load_weight || 0}" placeholder="Frame load" step="0.1" aria-label="Frame load weight">
            <select id="editSetupWeightUnit-${s.id}" aria-label="Weight unit">
              <option value="lbs"${s.weight_unit === 'lbs' ? ' selected' : ''}>lbs</option>
              <option value="kg"${s.weight_unit === 'kg' ? ' selected' : ''}>kg</option>
            </select>
          </div>
          <select id="editSetupBikeType-${s.id}" aria-label="Bike type">
            <option value="gravel"${s.bike_type === 'gravel' ? ' selected' : ''}>Gravel / Hardtail XC</option>
            <option value="road"${s.bike_type === 'road' ? ' selected' : ''}>Road</option>
            <option value="mountain"${s.bike_type === 'mountain' ? ' selected' : ''}>Mountain (Full Sus / Slack Geo)</option>
          </select>
          <div class="input-row-pair">
            <select id="editSetupFrameSize-${s.id}" aria-label="Frame size">
              <option value="medium"${s.frame_size === 'medium' ? ' selected' : ''}>Medium</option>
              <option value="small"${s.frame_size === 'small' ? ' selected' : ''}>Small</option>
              <option value="tall"${s.frame_size === 'tall' ? ' selected' : ''}>Tall</option>
            </select>
            <select id="editSetupRidingPosition-${s.id}" aria-label="Riding position">
              <option value="intermediate"${s.riding_position === 'intermediate' ? ' selected' : ''}>Intermediate</option>
              <option value="upright"${s.riding_position === 'upright' ? ' selected' : ''}>Upright</option>
              <option value="low"${s.riding_position === 'low' ? ' selected' : ''}>Low / Stretched</option>
              <option value="aero"${s.riding_position === 'aero' ? ' selected' : ''}>Aero / Flat back</option>
            </select>
          </div>
          <select id="editSetupSurface-${s.id}" aria-label="Terrain">
            <option value="smooth_gravel"${s.surface_type === 'smooth_gravel' ? ' selected' : ''}>Smooth gravel</option>
            <option value="smooth_asphalt"${s.surface_type === 'smooth_asphalt' ? ' selected' : ''}>Smooth asphalt</option>
            <option value="rough_asphalt"${s.surface_type === 'rough_asphalt' ? ' selected' : ''}>Rough asphalt</option>
            <option value="coarse_gravel"${s.surface_type === 'coarse_gravel' ? ' selected' : ''}>Coarse gravel</option>
            <option value="rough_gravel"${s.surface_type === 'rough_gravel' ? ' selected' : ''}>Rough gravel / Large rocks</option>
            <option value="mixed_paved_gravel"${s.surface_type === 'mixed_paved_gravel' ? ' selected' : ''}>Mixed paved/gravel</option>
            <option value="singletrack"${s.surface_type === 'singletrack' ? ' selected' : ''}>Singletrack / Mountain</option>
          </select>
          <div class="edit-actions">
            <button class="btn-cancel-edit" onclick="cancelSetupEdit(${s.id})">Cancel</button>
            <button class="btn-save-edit" onclick="saveSetupEdit(${s.id})">Save</button>
          </div>
        </div>
      `;
    }
    const activeClass = s.id == currentSetupId ? ' item-row--active' : '';
    return `
      <div class="item-row${activeClass}" onclick="selectSetup(${s.id})">
        <span class="item-row-text">${s.name} — ${desc}</span>
        <div class="item-row-actions">
          <button class="btn-edit" onclick="event.stopPropagation();editSetup(${s.id})" aria-label="Edit setup ${s.name}">✎</button>
          <button class="btn-link btn-delete" onclick="event.stopPropagation();deleteSetup(${s.id})" aria-label="Delete setup ${s.name}">×</button>
        </div>
      </div>
    `;
  }).join('');
  updateSetupEmptyState();
}

function selectSetup(id) {
  document.getElementById('setupSelect').value = id;
  document.getElementById('setupSelect').dispatchEvent(new Event('change'));
}

function editSetup(id) {
  editingSetupId = id;
  renderSetupList();
  setTimeout(() => {
    const input = document.getElementById(`editSetupName-${id}`);
    if (input) { input.focus(); input.select(); }
  }, 0);
}

async function saveSetupEdit(id) {
  const name = document.getElementById(`editSetupName-${id}`).value.trim();
  const rider_weight = parseFloat(document.getElementById(`editSetupRiderWeight-${id}`).value);
  const bike_weight = parseFloat(document.getElementById(`editSetupBikeWeight-${id}`).value);
  const front_luggage_weight = parseFloat(document.getElementById(`editSetupFrontLuggage-${id}`).value) || 0;
  const rear_luggage_weight = parseFloat(document.getElementById(`editSetupRearLuggage-${id}`).value) || 0;
  const frame_load_weight = parseFloat(document.getElementById(`editSetupFrameLoad-${id}`).value) || 0;
  const weight_unit = document.getElementById(`editSetupWeightUnit-${id}`).value;
  const bike_type = document.getElementById(`editSetupBikeType-${id}`).value;
  const frame_size = document.getElementById(`editSetupFrameSize-${id}`).value;
  const riding_position = document.getElementById(`editSetupRidingPosition-${id}`).value;
  const surface_type = document.getElementById(`editSetupSurface-${id}`).value;

  if (!name || !rider_weight || !bike_weight) {
    showToast('error', 'Name, rider weight, and bike weight required');
    return;
  }

  try {
    await api(`/setups/${id}`, {
      method: 'PUT',
      body: { name, rider_weight, bike_weight, front_luggage_weight, rear_luggage_weight, frame_load_weight, weight_unit, bike_type, frame_size, riding_position, surface_type },
    });
    editingSetupId = null;
    await loadSetups(currentBikeId);
    showToast('success', 'Setup updated');
  } catch (err) {
    showToast('error', 'Update failed: ' + err.message);
  }
}

function cancelSetupEdit(id) {
  editingSetupId = null;
  renderSetupList();
}

// Save current calculator weights/terrain/position as a new setup under the
// active bike (creating a bike — and rider — first if needed). Calculator-first.
function saveAsNewSetup(andSavePressure) {
  if (!currentBikeId) {
    showToast('info', 'Save a bike first');
    return saveAsNewBike(() => saveAsNewSetup(andSavePressure));
  }
  const si = getSetupInputs();
  const rider_weight = parseFloat(si.riderWeight);
  const bike_weight = parseFloat(si.bikeWeight);
  if (!rider_weight || !bike_weight) {
    showToast('error', 'Enter rider and bike weight in the calculator first');
    return;
  }

  promptName('Save as new setup', '', 'Save setup', async (name) => {
    if (!name) return;
    try {
      const result = await api('/setups', {
        method: 'POST',
        body: {
          bike_id: Number(currentBikeId),
          name,
          rider_weight,
          bike_weight,
          front_luggage_weight: parseFloat(si.frontLuggage) || 0,
          rear_luggage_weight: parseFloat(si.rearLuggage) || 0,
          frame_load_weight: parseFloat(si.frameLoad) || 0,
          weight_unit: si.weightUnit,
          bike_type: si.bikeType,
          frame_size: si.frameSize,
          riding_position: si.ridingPosition,
          surface_type: si.surfaceType,
        },
      });
      await loadSetups(currentBikeId);
      currentSetupId = result.id;
      document.getElementById('setupSelect').value = result.id;
      snapshotSetup();
      updateContextChip();
      updateSaveActions();
      showToast('success', 'Setup saved');
      if (andSavePressure && lastResult) {
        await savePressure();
      }
    } catch (err) {
      showToast('error', 'Failed to save setup: ' + err.message);
    }
  });
}

// Update the currently-selected setup with the calculator's weights/terrain/position.
async function updateSetup() {
  if (!currentSetupId) return;
  const si = getSetupInputs();
  const rider_weight = parseFloat(si.riderWeight);
  const bike_weight = parseFloat(si.bikeWeight);
  if (!rider_weight || !bike_weight) { showToast('error', 'Rider and bike weight required'); return; }
  const s = setups.find(x => x.id == currentSetupId);
  try {
    await api(`/setups/${currentSetupId}`, {
      method: 'PUT',
      body: {
        name: s.name,
        rider_weight,
        bike_weight,
        front_luggage_weight: parseFloat(si.frontLuggage) || 0,
        rear_luggage_weight: parseFloat(si.rearLuggage) || 0,
        frame_load_weight: parseFloat(si.frameLoad) || 0,
        weight_unit: si.weightUnit,
        bike_type: si.bikeType,
        frame_size: si.frameSize,
        riding_position: si.ridingPosition,
        surface_type: si.surfaceType,
      },
    });
    await loadSetups(currentBikeId);
    document.getElementById('setupSelect').value = currentSetupId;
    snapshotSetup();
    updateSaveActions();
    showToast('success', 'Setup updated');
  } catch (err) {
    showToast('error', 'Update failed: ' + err.message);
  }
}

async function deleteSetup(id) {
  const setup = setups.find(s => s.id == id);
  if (!setup) return;

  const wasCurrent = currentSetupId == id;

  setups = setups.filter(s => s.id != id);
  renderSetupSelect();
  renderSetupList();

  if (wasCurrent) {
    currentSetupId = null;
    loadedSetupSnapshot = null;
    refreshHistory();
    updateSaveActions();
  }

  scheduleUndo(
    'Setup',
    setup,
    async () => {
      await loadSetups(currentBikeId);
      if (wasCurrent) {
        currentSetupId = id;
        document.getElementById('setupSelect').value = id;
        loadSavedPressures();
        snapshotSetup();
        updateSaveActions();
      }
    },
    async () => {
      await api(`/setups/${id}`, { method: 'DELETE' });
    }
  );
}

// ─── Keyboard support ──────────────────────────────────────────────

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    const panel = document.getElementById('managePanel');
    if (panel && panel.style.display !== 'none') {
      panel.style.display = 'none';
      const btn = document.getElementById('manageBtn');
      if (btn) btn.focus();
    }
  }
}

document.addEventListener('keydown', handleKeyDown);

// Pressure card keyboard support (Enter/Space to copy)
document.getElementById('frontCard').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyPressure('front'); }
});
document.getElementById('rearCard').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyPressure('rear'); }
});

// Save calculator inputs + track dirty state on change
document.getElementById('calcForm').addEventListener('input', () => { saveQuickCalc(); checkDirty(); });
document.getElementById('calcForm').addEventListener('change', () => { saveQuickCalc(); checkDirty(); });

// ─── Init ──────────────────────────────────────────────────────────

function showManage(section) {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('profileBar').style.display = 'flex';
  document.getElementById('calculator').style.display = 'block';
  onboarded = true;
  loadRiders().then(() => {
    updateContextChip();
    checkDirty();
    loadSavedPressures();
    const panel = document.getElementById('managePanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (section === 'rider') {
      setTimeout(() => document.getElementById('newRiderName')?.focus(), 100);
    }
  });
}

function skipOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('profileBar').style.display = 'flex';
  document.getElementById('calculator').style.display = 'block';
  onboarded = true;
  loadRiders().then(() => { checkDirty(); loadSavedPressures(); });
  loadQuickCalc();
  checkDirty();
}

// Check if user has existing data
api('/riders').then(r => {
  if (r.length > 0) {
    skipOnboarding();
  }
}).catch(() => {
  // API unavailable — show onboarding
});