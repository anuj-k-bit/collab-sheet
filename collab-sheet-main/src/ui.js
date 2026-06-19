// src/ui.js
import { state } from './state.js';
import { colLetter, cellKey, parseCellKey, resolveValue } from './formulas.js';
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  updateDocumentTitle,
  fetchCells,
  upsertCell,
  deleteCell,
  fetchCollaborators,
  addCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
  updatePresenceCursor,
  leavePresence,
  joinPresence,
  subscribeToCells
} from './sync.js';
import { signOut, supabase, isMockMode } from './auth.js';

// ── NAVIGATION & SCREEN SWITCHING ──

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(name);
  if (target) {
    target.classList.add('active');
  }
}

export async function goToDashboard() {
  leavePresence();
  window.location.hash = '';
  showScreen('dashboard');
  await refreshDashboard();
}

export async function refreshDashboard() {
  const loadingDiv = document.getElementById('emptyMsg');
  if (loadingDiv) {
    loadingDiv.textContent = 'Loading spreadsheets...';
    loadingDiv.style.display = 'block';
  }
  
  try {
    const docs = await fetchDocuments();
    renderDashboard(docs);
  } catch (error) {
    showToast('Failed to load spreadsheets: ' + error.message);
  }
}

function relTime(ts) {
  const date = new Date(ts);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export function renderDashboard(docs) {
  const list = document.getElementById('docList');
  const empty = document.getElementById('emptyMsg');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!docs || docs.length === 0) {
    empty.textContent = 'No spreadsheets yet. Create one above!';
    empty.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  
  empty.style.display = 'none';
  list.style.display = 'block';

  const colors = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

  docs.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'doc-item';
    
    const isOwner = doc.owner_id === state.user.id;
    const ownerLabel = isOwner ? 'Me' : 'Collaborated';

    // Get deterministic color for rows
    const hash = doc.id.split('-').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const docColor = colors[hash % colors.length];

    // Load collaborators list for avatar stacks
    let collabs = [];
    if (isMockMode) {
      const mockProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
      const listLocal = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + doc.id) || '[]');
      collabs = listLocal.map(c => ({
        profiles: mockProfiles[c.user_id] || { display_name: `User ${c.user_id.slice(0, 4)}`, color: '#cbd5e1' }
      }));
    } else {
      collabs = doc.document_collaborators || [];
    }

    // Render avatar stacks
    let avatarStackHtml = '<div style="display:flex;align-items:center;margin-left:auto;margin-right:16px;gap:-6px;flex-shrink:0;">';
    collabs.slice(0, 3).forEach((collab, idx) => {
      const prof = collab.profiles || {};
      const name = prof.display_name || 'Guest';
      const color = prof.color || '#cbd5e1';
      avatarStackHtml += `
        <div class="user-avatar" 
             style="background:${color};width:22px;height:22px;font-size:9px;border:2px solid white;margin-left:${idx > 0 ? '-6px' : '0'};" 
             title="${name}">
          ${name[0].toUpperCase()}
        </div>
      `;
    });
    if (collabs.length > 3) {
      avatarStackHtml += `
        <div class="user-avatar" 
             style="background:var(--slate-200);color:var(--slate-600);width:22px;height:22px;font-size:9px;border:2px solid white;margin-left:-6px;" 
             title="${collabs.length - 3} more">
          +${collabs.length - 3}
        </div>
      `;
    }
    avatarStackHtml += '</div>';

    div.innerHTML = `
      <div class="doc-thumbnail" style="background: ${docColor}15; border: 1px solid ${docColor}30;">
        <div class="doc-thumbnail-cell" style="background: ${docColor}40;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}20;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}20;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}15;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}50;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}15;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}15;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}20;"></div>
        <div class="doc-thumbnail-cell" style="background: ${docColor}30;"></div>
      </div>
      <div class="doc-info">
        <div class="doc-name">${escapeHtml(doc.title)}</div>
        <div class="doc-meta">${ownerLabel} · ${relTime(doc.updated_at)}</div>
      </div>
      ${avatarStackHtml}
      ${isOwner ? `
        <button class="doc-delete" title="Delete Spreadsheet">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916"/>
          </svg>
        </button>
      ` : ''}
    `;

    // Bind delete button
    const deleteBtn = div.querySelector('.doc-delete');
    if (deleteBtn) {
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this spreadsheet?')) {
          try {
            await deleteDocument(doc.id);
            showToast('Document deleted.');
            refreshDashboard();
          } catch (err) {
            showToast('Failed to delete: ' + err.message);
          }
        }
      };
    }

    div.onclick = () => openDoc(doc.id);
    list.appendChild(div);
  });
}

export async function handleCreateDoc() {
  try {
    const doc = await createDocument();
    if (doc) {
      openDoc(doc.id);
    }
  } catch (err) {
    showToast('Failed to create document: ' + err.message);
  }
}

// Cache to track evaluated cell values for flashing on sync/recalculations
const lastEvaluatedValues = {};
let initialLoadComplete = false;

// Undo/Redo Stacks
const undoStack = [];
const redoStack = [];

// Helper to push to undo stack
function recordHistory(key, before, after) {
  if (hasStateChanged(before, after)) {
    undoStack.push({ key, before, after });
    if (undoStack.length > 50) {
      undoStack.shift();
    }
    redoStack.length = 0; // Clear redo
  }
}

function hasStateChanged(before, after) {
  if (!before && !after) return false;
  if (!before || !after) return true;
  return before.value !== after.value ||
         before.bold !== after.bold ||
         before.italic !== after.italic ||
         before.align !== after.align ||
         before.font_size !== after.font_size ||
         before.bg_color !== after.bg_color ||
         before.no_borders !== after.no_borders;
}

function cloneCellState(key) {
  const cell = state.cells[key];
  if (!cell) return null;
  return {
    value: cell.value ?? '',
    bold: cell.bold ?? false,
    italic: cell.italic ?? false,
    align: cell.align ?? 'left',
    font_size: cell.font_size ?? 12,
    bg_color: cell.bg_color ?? null,
    no_borders: cell.no_borders ?? false
  };
}

export async function handleUndo() {
  if (undoStack.length === 0) {
    showToast('Nothing to undo.');
    return;
  }
  const action = undoStack.pop();
  const current = cloneCellState(action.key);
  redoStack.push({ key: action.key, before: current, after: action.before });
  await applyCellState(action.key, action.before);
}

export async function handleRedo() {
  if (redoStack.length === 0) {
    showToast('Nothing to redo.');
    return;
  }
  const action = redoStack.pop();
  const current = cloneCellState(action.key);
  undoStack.push({ key: action.key, before: current, after: action.before });
  await applyCellState(action.key, action.before);
}

async function applyCellState(key, cellState) {
  try {
    showSavingIndicator(true);
    if (!cellState || cellState.value === '') {
      delete state.cells[key];
      await deleteCell(state.currentDoc.id, key);
    } else {
      state.cells[key] = { ...cellState };
      await upsertCell(state.currentDoc.id, key, cellState.value, cellState);
    }
    showSavingIndicator(false);
    renderAllCells();
    
    // Parse key to select the cell
    const { r, c } = parseCellKey(key);
    selectCell(r, c);
  } catch (err) {
    showSavingIndicator(false, true);
    showToast('Failed to apply undo/redo: ' + err.message);
  }
}

export async function clearCell(r, c) {
  const key = cellKey(r, c);
  if (!state.cells[key]) return;
  const before = cloneCellState(key);
  try {
    showSavingIndicator(true);
    delete state.cells[key];
    await deleteCell(state.currentDoc.id, key);
    showSavingIndicator(false);
    recordHistory(key, before, null);
  } catch (err) {
    showSavingIndicator(false, true);
    showToast('Failed to delete cell: ' + err.message);
  }
  renderAllCells();
}

export async function openDoc(id) {
  showToast('Opening spreadsheet...');
  try {
    let doc = state.docs.find(d => d.id === id);
    if (!doc) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      doc = data;
    }
    
    state.currentDoc = doc;
    window.location.hash = `#/doc/${id}`;

    // Reset history stacks and values cache on opening new document
    undoStack.length = 0;
    redoStack.length = 0;
    for (const k in lastEvaluatedValues) {
      delete lastEvaluatedValues[k];
    }
    initialLoadComplete = false;

    await fetchCells(id);
    
    const titleInput = document.getElementById('titleInput');
    if (titleInput) titleInput.value = doc.title;

    buildGrid();
    showScreen('editor');
    selectCell(0, 0);

    // Initial load completed, safe to start flashing changes now
    initialLoadComplete = true;

    subscribeToCells(id);
    joinPresence(id);
  } catch (err) {
    showToast('Permission Denied or Spreadsheet not found.');
    goToDashboard();
  }
}

export async function handleTitleChange() {
  if (!state.currentDoc) return;
  const title = document.getElementById('titleInput').value.trim() || 'Untitled spreadsheet';
  try {
    await updateDocumentTitle(state.currentDoc.id, title);
    state.currentDoc.title = title;
    showSavingIndicator(true);
    showSavingIndicator(false);
  } catch (err) {
    showToast('Failed to update title: ' + err.message);
  }
}

// ── GRID BUILD & RENDER ──

export function buildGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const cornerTh = document.createElement('th');
  cornerTh.className = 'corner-th';
  headRow.appendChild(cornerTh);
  
  for (let c = 0; c < state.COLS; c++) {
    const th = document.createElement('th');
    th.className = 'col-th';
    th.id = `ch-${c}`;
    th.style.width = th.style.minWidth = '100px';
    th.textContent = colLetter(c);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  grid.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < state.ROWS; r++) {
    const tr = document.createElement('tr');
    
    const rowTh = document.createElement('td');
    rowTh.className = 'row-th';
    rowTh.id = `rh-${r}`;
    rowTh.textContent = r + 1;
    tr.appendChild(rowTh);
    
    for (let c = 0; c < state.COLS; c++) {
      const td = document.createElement('td');
      td.className = 'cell';
      td.id = `cell-${r}-${c}`;
      td.dataset.r = r;
      td.dataset.c = c;
      
      td.onmousedown = (e) => {
        e.preventDefault();
        selectCell(r, c);
      };
      td.ondblclick = () => startEdit(r, c);
      
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  grid.appendChild(tbody);
  
  renderAllCells();
}

export function renderCell(r, c) {
  const td = document.getElementById(`cell-${r}-${c}`);
  if (!td) return;
  const key = cellKey(r, c);
  const cell = state.cells[key];
  const val = cell ? resolveValue(cell.value) : '';
  const isError = typeof val === 'string' && val.startsWith('#');

  // Trigger flash on value change
  if (initialLoadComplete) {
    const prevVal = lastEvaluatedValues[key];
    if (prevVal !== undefined && prevVal !== val) {
      flashCell(r, c);
    }
  }
  lastEvaluatedValues[key] = val;

  td.innerHTML = '';
  
  // Custom background color
  td.style.backgroundColor = cell?.bg_color || '';
  
  // Custom borders
  td.classList.toggle('no-borders', !!cell?.no_borders);

  const span = document.createElement('span');
  span.style.cssText = `
    display:block; line-height:26px;
    font-size:${cell?.font_size || 12}px;
    font-weight:${cell?.bold ? 700 : 400};
    font-style:${cell?.italic ? 'italic' : 'normal'};
    text-align:${cell?.align || 'left'};
    color:${isError ? '#ef4444' : '#1e293b'};
  `;
  span.textContent = String(val ?? '');
  td.appendChild(span);

  const peer = state.peers.find(p => p.cell === key);
  if (peer) {
    const corner = document.createElement('div');
    corner.className = 'peer-corner';
    corner.style.borderTopColor = peer.color;
    corner.title = peer.name;
    td.appendChild(corner);
    td.style.outline = `2px solid ${peer.color}`;
    td.style.outlineOffset = '-2px';
  } else {
    td.style.outline = '';
    td.style.outlineOffset = '';
  }
}

export function renderAllCells() {
  for (let r = 0; r < state.ROWS; r++) {
    for (let c = 0; c < state.COLS; c++) {
      renderCell(r, c);
    }
  }
  
  const { r, c } = state.selected;
  const td = document.getElementById(`cell-${r}-${c}`);
  if (td) {
    td.classList.add('selected');
    updateSelectionIndicator(td);
  }
}

export function flashCell(r, c) {
  const td = document.getElementById(`cell-${r}-${c}`);
  if (td) {
    td.classList.add('cell-flash');
    setTimeout(() => td.classList.remove('cell-flash'), 800);
  }
}

// ── SELECTION & EDITING ──

export function updateSelectionIndicator(td) {
  const indicator = document.getElementById('selectionIndicator');
  if (td && indicator) {
    indicator.style.opacity = '1';
    indicator.style.left = `${td.offsetLeft}px`;
    indicator.style.top = `${td.offsetTop}px`;
    indicator.style.width = `${td.offsetWidth}px`;
    indicator.style.height = `${td.offsetHeight}px`;
  }
}

export function selectCell(r, c) {
  const prev = state.selected;

  const prevTd = document.getElementById(`cell-${prev.r}-${prev.c}`);
  if (prevTd) {
    prevTd.classList.remove('selected');
    renderCell(prev.r, prev.c);
  }
  document.getElementById(`ch-${prev.c}`)?.classList.remove('selected');
  document.getElementById(`rh-${prev.r}`)?.classList.remove('selected');

  state.selected = { r, c };
  const key = cellKey(r, c);

  const td = document.getElementById(`cell-${r}-${c}`);
  if (td) {
    td.classList.add('selected');
    updateSelectionIndicator(td);
  }
  document.getElementById(`ch-${c}`)?.classList.add('selected');
  document.getElementById(`rh-${r}`)?.classList.add('selected');

  const formulaInput = document.getElementById('formulaInput');
  if (formulaInput) {
    formulaInput.value = state.cells[key]?.value ?? '';
  }
  
  const cellLabel = document.getElementById('cellLabel');
  if (cellLabel) {
    cellLabel.textContent = key;
  }

  const cell = state.cells[key];
  document.getElementById('btnBold')?.classList.toggle('active', !!cell?.bold);
  document.getElementById('btnItalic')?.classList.toggle('active', !!cell?.italic);
  
  // Font Size selector updates
  const fsSelect = document.getElementById('selectFontSize');
  if (fsSelect) {
    fsSelect.value = String(cell?.font_size || 12);
  }

  // Bg Color swatch updates
  const colorSwatch = document.getElementById('bgColorSwatch');
  if (colorSwatch) {
    colorSwatch.style.backgroundColor = cell?.bg_color || '#ffffff';
  }

  updatePresenceCursor(r, c);
}

export function startEdit(r, c) {
  if (state.editing) commitEdit();
  state.editing = { r, c };
  
  const td = document.getElementById(`cell-${r}-${c}`);
  if (!td) return;
  
  const key = cellKey(r, c);
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.value = state.cells[key]?.value ?? '';
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      selectCell(Math.min(state.ROWS - 1, r + 1), c);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      selectCell(r, Math.min(state.COLS - 1, c + 1));
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };
  
  input.onblur = () => {
    if (state.editing) commitEdit();
  };

  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  
  const formulaInput = document.getElementById('formulaInput');
  if (formulaInput) {
    formulaInput.value = input.value;
  }
}

export async function commitEdit() {
  if (!state.editing) return;
  const { r, c } = state.editing;
  const td = document.getElementById(`cell-${r}-${c}`);
  const input = td?.querySelector('input');
  
  if (input) {
    const key = cellKey(r, c);
    const val = input.value;
    const before = cloneCellState(key);
    
    try {
      showSavingIndicator(true);
      if (val === '') {
        delete state.cells[key];
        await deleteCell(state.currentDoc.id, key);
      } else {
        const currentStyle = state.cells[key] || {};
        state.cells[key] = {
          ...currentStyle,
          value: val
        };
        await upsertCell(state.currentDoc.id, key, val, currentStyle);
      }
      showSavingIndicator(false);
      const after = cloneCellState(key);
      recordHistory(key, before, after);
    } catch (err) {
      showSavingIndicator(false, true);
      showToast('Save failed: ' + err.message);
    }
  }
  state.editing = null;
  renderAllCells();
}

export function cancelEdit() {
  state.editing = null;
  renderAllCells();
}

// ── FORMULA BAR COMMIT ──

export async function commitFromFormula() {
  const { r, c } = state.selected;
  const key = cellKey(r, c);
  const val = document.getElementById('formulaInput').value;
  const before = cloneCellState(key);
  
  try {
    showSavingIndicator(true);
    if (val === '') {
      delete state.cells[key];
      await deleteCell(state.currentDoc.id, key);
    } else {
      const currentStyle = state.cells[key] || {};
      state.cells[key] = {
        ...currentStyle,
        value: val
      };
      await upsertCell(state.currentDoc.id, key, val, currentStyle);
    }
    showSavingIndicator(false);
    const after = cloneCellState(key);
    recordHistory(key, before, after);
  } catch (err) {
    showSavingIndicator(false, true);
    showToast('Save failed: ' + err.message);
  }
  renderAllCells();
}

export function handleFormulaKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitFromFormula();
  } else if (e.key === 'Escape') {
    const key = cellKey(state.selected.r, state.selected.c);
    document.getElementById('formulaInput').value = state.cells[key]?.value ?? '';
  }
}

// ── FORMATTING ──

export async function toggleFormat(type) {
  const { r, c } = state.selected;
  const key = cellKey(r, c);
  const before = cloneCellState(key);
  
  state.cells[key] = state.cells[key] || { value: '' };
  state.cells[key][type] = !state.cells[key][type];
  
  document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`)?.classList.toggle('active', !!state.cells[key][type]);
  
  try {
    showSavingIndicator(true);
    await upsertCell(state.currentDoc.id, key, state.cells[key].value, state.cells[key]);
    showSavingIndicator(false);
    const after = cloneCellState(key);
    recordHistory(key, before, after);
  } catch (err) {
    showSavingIndicator(false, true);
    showToast('Save failed: ' + err.message);
  }
  renderAllCells();
}

export async function setAlign(align) {
  const { r, c } = state.selected;
  const key = cellKey(r, c);
  const before = cloneCellState(key);
  
  state.cells[key] = state.cells[key] || { value: '' };
  state.cells[key].align = align;
  
  try {
    showSavingIndicator(true);
    await upsertCell(state.currentDoc.id, key, state.cells[key].value, state.cells[key]);
    showSavingIndicator(false);
    const after = cloneCellState(key);
    recordHistory(key, before, after);
  } catch (err) {
    showSavingIndicator(false, true);
    showToast('Save failed: ' + err.message);
  }
  renderAllCells();
}

// ── TOASTS & INDICATORS ──

export function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

export function showSavingIndicator(isSaving, hasError = false) {
  const el = document.getElementById('writeStatus');
  if (!el) return;
  if (isSaving) {
    el.innerHTML = '<div class="status-dot" style="background:#f59e0b"></div><span>Saving…</span>';
  } else if (hasError) {
    el.innerHTML = '<div class="status-dot" style="background:#ef4444"></div><span>Error saving</span>';
  } else {
    el.innerHTML = '<div class="status-dot" style="background:#22c55e"></div><span>Saved</span>';
  }
}

export function renderPresenceBar() {
  const bar = document.getElementById('presenceBar');
  if (!bar) return;
  bar.innerHTML = '';
  
  state.peers.forEach((peer, idx) => {
    const div = document.createElement('div');
    div.className = 'peer-avatar';
    div.style.background = peer.color;
    if (idx === 0) div.style.marginLeft = '0';
    div.title = `${peer.name} (collaborator)`;
    div.textContent = peer.name ? peer.name[0].toUpperCase() : '?';
    bar.appendChild(div);
  });
}

// ── SHARE MODAL UI ──

export async function openShareModal() {
  if (!state.currentDoc) return;
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'shareModal';
  
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3 style="font-weight:600;font-size:18px;">Share Spreadsheet</h3>
        <button class="icon-btn" id="closeShare" style="font-size:18px;">&times;</button>
      </div>
      <div class="modal-body">
        <div>
          <label class="section-label" style="margin-bottom:6px;">Your User ID</label>
          <div style="display:flex;gap:8px;">
            <input type="text" class="guest-input" style="margin-bottom:0;flex:1;font-family:monospace;font-size:12px;" readonly value="${state.user.id}" />
            <button class="btn-primary" id="copyUserId" style="width:auto;padding:8px 12px;font-size:12px;">Copy ID</button>
          </div>
        </div>
        
        <div>
          <label class="section-label" style="margin-bottom:6px;">Shareable Link</label>
          <div style="display:flex;gap:8px;">
            <input type="text" class="guest-input" style="margin-bottom:0;flex:1;font-size:12px;" readonly value="${window.location.origin}/#/doc/${state.currentDoc.id}" />
            <button class="btn-primary" id="copyShareLink" style="width:auto;padding:8px 12px;font-size:12px;">Copy Link</button>
          </div>
        </div>
        
        <div>
          <label class="section-label" style="margin-bottom:6px;">Add Collaborator</label>
          <div style="display:flex;gap:6px;flex-direction:column;">
            <div style="display:flex;gap:8px;">
              <input type="text" id="shareUserIdInput" class="guest-input" style="margin-bottom:0;flex:1;font-size:12px;" placeholder="Paste Collaborator's User ID" />
              <select id="shareRoleInput" class="guest-input" style="margin-bottom:0;width:90px;font-size:12px;padding:6px;">
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button class="btn-primary" id="addCollabBtn" style="width:auto;padding:8px 16px;font-size:12px;">Add</button>
            </div>
            <span style="font-size:11px;color:var(--slate-500);margin-top:2px;">
              ℹ️ Note: This is a simplified MVP sharing mechanism using raw User IDs. In a production app, this would use email invitations and server-side lookup.
            </span>
          </div>
        </div>

        <div>
          <label class="section-label" style="margin-bottom:6px;">Collaborators</label>
          <div id="collaboratorList" style="display:flex;flex-direction:column;gap:8px;max-height:150px;overflow-y:auto;">
            Loading collaborators...
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  document.getElementById('closeShare').onclick = () => overlay.remove();
  document.getElementById('copyUserId').onclick = () => {
    navigator.clipboard.writeText(state.user.id);
    showToast('User ID copied to clipboard!');
  };
  document.getElementById('copyShareLink').onclick = () => {
    navigator.clipboard.writeText(`${window.location.origin}/#/doc/${state.currentDoc.id}`);
    showToast('Share link copied to clipboard!');
  };
  
  const isOwner = state.currentDoc.owner_id === state.user.id;
  
  document.getElementById('addCollabBtn').onclick = async () => {
    if (!isOwner) {
      showToast('Only the document owner can add collaborators.');
      return;
    }
    const inputId = document.getElementById('shareUserIdInput').value.trim();
    const role = document.getElementById('shareRoleInput').value;
    
    if (!inputId) {
      showToast('Please enter a User ID.');
      return;
    }
    
    try {
      await addCollaborator(state.currentDoc.id, inputId, role);
      showToast('Collaborator added!');
      document.getElementById('shareUserIdInput').value = '';
      loadAndRenderCollaborators(state.currentDoc.id, isOwner);
    } catch (err) {
      showToast('Failed to add: ' + err.message);
    }
  };
  
  loadAndRenderCollaborators(state.currentDoc.id, isOwner);
}

async function loadAndRenderCollaborators(docId, isOwner) {
  const listContainer = document.getElementById('collaboratorList');
  if (!listContainer) return;
  
  try {
    const list = await fetchCollaborators(docId);
    listContainer.innerHTML = '';
    
    const ownerProfile = await fetchOwnerProfile(state.currentDoc.owner_id);
    const ownerDiv = document.createElement('div');
    ownerDiv.style.cssText = 'display:flex;align-items:center;justify-content:between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--slate-100);';
    ownerDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <div class="user-avatar" style="width:20px;height:20px;font-size:10px;background:${ownerProfile?.color || '#cbd5e1'}">
          ${ownerProfile?.display_name ? ownerProfile.display_name[0].toUpperCase() : 'O'}
        </div>
        <span>${escapeHtml(ownerProfile?.display_name || 'Owner')} (Owner)</span>
      </div>
    `;
    listContainer.appendChild(ownerDiv);
    
    if (!list || list.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:var(--slate-400);padding:6px 0;';
      empty.textContent = 'No other collaborators added yet.';
      listContainer.appendChild(empty);
      return;
    }
    
    list.forEach(collab => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;align-items:center;justify-content:between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--slate-100);';
      
      const displayName = collab.profiles?.display_name || `User ${collab.user_id.slice(0, 4)}`;
      const color = collab.profiles?.color || '#cbd5e1';
      
      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <div class="user-avatar" style="width:20px;height:20px;font-size:10px;background:${color}">
            ${displayName[0].toUpperCase()}
          </div>
          <span title="${collab.user_id}">${escapeHtml(displayName)} (${collab.role})</span>
        </div>
        ${isOwner ? `
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="guest-input" style="width:80px;padding:2px 4px;margin-bottom:0;font-size:11px;" id="role-${collab.user_id}">
              <option value="editor" ${collab.role === 'editor' ? 'selected' : ''}>Editor</option>
              <option value="viewer" ${collab.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>
            <button class="doc-delete" style="opacity:1;" id="remove-${collab.user_id}" title="Remove Collaborator">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        ` : ''}
      `;
      
      listContainer.appendChild(div);
      
      if (isOwner) {
        const select = div.querySelector(`#role-${collab.user_id}`);
        if (select) {
          select.onchange = async () => {
            try {
              await updateCollaboratorRole(docId, collab.user_id, select.value);
              showToast('Role updated.');
            } catch (err) {
              showToast('Role update failed: ' + err.message);
              loadAndRenderCollaborators(docId, isOwner);
            }
          };
        }
        
        const deleteBtn = div.querySelector(`#remove-${collab.user_id}`);
        if (deleteBtn) {
          deleteBtn.onclick = async () => {
            if (confirm(`Remove collaborator ${displayName}?`)) {
              try {
                await removeCollaborator(docId, collab.user_id);
                showToast('Collaborator removed.');
                loadAndRenderCollaborators(docId, isOwner);
              } catch (err) {
                showToast('Remove failed: ' + err.message);
              }
            }
          };
        }
      }
    });
  } catch (err) {
    listContainer.textContent = 'Error loading: ' + err.message;
  }
}

async function fetchOwnerProfile(ownerId) {
  if (state.user && state.user.id === ownerId) {
    return { display_name: state.user.name, color: state.user.color };
  }
  
  if (isMockMode) {
    const mockProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
    return mockProfiles[ownerId] || { display_name: `User ${ownerId.slice(0, 4)}`, color: '#cbd5e1' };
  }

  const { data } = await supabase
    .from('profiles')
    .select('display_name, color')
    .eq('id', ownerId)
    .single();
  return data;
}

// ── EXPORT CSV ──

export function exportCSV() {
  const rows = [];
  for (let r = 0; r < state.ROWS; r++) {
    const row = [];
    let hasData = false;
    for (let c = 0; c < state.COLS; c++) {
      const val = String(resolveValue(state.cells[cellKey(r, c)]?.value) ?? '');
      if (val) hasData = true;
      row.push(val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val);
    }
    if (hasData) {
      rows.push(row.join(','));
    }
  }
  
  const title = (state.currentDoc?.title || 'spreadsheet').trim();
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${title}.csv`
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('CSV exported!');
}

// ── HELPERS ──

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── DROPDOWNS BINDINGS ──

export function bindUserDropdown() {
  const avatar = document.getElementById('dashAvatar');
  const dropdown = document.getElementById('userMenuDropdown');
  if (avatar && dropdown) {
    avatar.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    };
    
    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });
  }
  
  const copyBtn = document.getElementById('btnCopyMyId');
  if (copyBtn) {
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      if (state.user) {
        navigator.clipboard.writeText(state.user.id);
        showToast('User ID copied to clipboard!');
      }
      dropdown?.classList.remove('active');
    };
  }
  
  const settingsBtn = document.getElementById('btnSettingsStub');
  if (settingsBtn) {
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      showToast('⚙️ Settings page is under construction.');
      dropdown?.classList.remove('active');
    };
  }
}

export function bindToolbarEvents() {
  document.getElementById('btnBold')?.addEventListener('click', () => toggleFormat('bold'));
  document.getElementById('btnItalic')?.addEventListener('click', () => toggleFormat('italic'));
  
  // Font Size selector
  const fsSelect = document.getElementById('selectFontSize');
  if (fsSelect) {
    fsSelect.onchange = async () => {
      const { r, c } = state.selected;
      const key = cellKey(r, c);
      const before = cloneCellState(key);
      
      state.cells[key] = state.cells[key] || { value: '' };
      state.cells[key].font_size = parseInt(fsSelect.value);
      
      try {
        showSavingIndicator(true);
        await upsertCell(state.currentDoc.id, key, state.cells[key].value, state.cells[key]);
        showSavingIndicator(false);
        const after = cloneCellState(key);
        recordHistory(key, before, after);
      } catch (err) {
        showSavingIndicator(false, true);
        showToast('Save failed: ' + err.message);
      }
      renderAllCells();
    };
  }

  // Bg Color swatches
  const colorInput = document.getElementById('inputBgColor');
  const colorSwatch = document.getElementById('bgColorSwatch');
  if (colorInput) {
    colorInput.oninput = () => {
      if (colorSwatch) colorSwatch.style.backgroundColor = colorInput.value;
    };
    colorInput.onchange = async () => {
      const { r, c } = state.selected;
      const key = cellKey(r, c);
      const before = cloneCellState(key);
      
      state.cells[key] = state.cells[key] || { value: '' };
      state.cells[key].bg_color = colorInput.value;
      
      try {
        showSavingIndicator(true);
        await upsertCell(state.currentDoc.id, key, state.cells[key].value, state.cells[key]);
        showSavingIndicator(false);
        const after = cloneCellState(key);
        recordHistory(key, before, after);
      } catch (err) {
        showSavingIndicator(false, true);
        showToast('Save failed: ' + err.message);
      }
      renderAllCells();
    };
  }

  // Borders toggle
  const bordersBtn = document.getElementById('btnBorders');
  if (bordersBtn) {
    bordersBtn.onclick = async () => {
      const { r, c } = state.selected;
      const key = cellKey(r, c);
      const before = cloneCellState(key);
      
      state.cells[key] = state.cells[key] || { value: '' };
      state.cells[key].no_borders = !state.cells[key].no_borders;
      
      try {
        showSavingIndicator(true);
        await upsertCell(state.currentDoc.id, key, state.cells[key].value, state.cells[key]);
        showSavingIndicator(false);
        const after = cloneCellState(key);
        recordHistory(key, before, after);
      } catch (err) {
        showSavingIndicator(false, true);
        showToast('Save failed: ' + err.message);
      }
      renderAllCells();
    };
  }

  // Undo/Redo Actions
  document.getElementById('btnUndo').onclick = () => {
    handleUndo();
  };
  document.getElementById('btnRedo').onclick = () => {
    handleRedo();
  };

  // Functions dropdown binding
  const btnFunc = document.getElementById('btnFunctions');
  const funcDropdown = document.getElementById('functionsDropdown');
  if (btnFunc && funcDropdown) {
    btnFunc.onclick = (e) => {
      e.stopPropagation();
      funcDropdown.classList.toggle('active');
    };
    
    document.addEventListener('click', () => {
      funcDropdown.classList.remove('active');
    });
  }

  document.querySelectorAll('.func-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      const funcName = item.dataset.func;
      const formulaInput = document.getElementById('formulaInput');
      if (formulaInput) {
        formulaInput.value = `=${funcName}(`;
        formulaInput.focus();
        formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
      }
      funcDropdown?.classList.remove('active');
    };
  });

  document.querySelectorAll('.tb-btn[title^="Align"]').forEach(btn => {
    const alignType = btn.getAttribute('title').split(' ')[1].toLowerCase();
    btn.onclick = () => setAlign(alignType);
  });
  
  document.querySelector('.tb-btn[title="Export CSV"]').onclick = exportCSV;
  
  const titleInput = document.getElementById('titleInput');
  if (titleInput) {
    titleInput.onblur = handleTitleChange;
    titleInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        titleInput.blur();
      }
    };
  }
  
  const formulaInput = document.getElementById('formulaInput');
  if (formulaInput) {
    formulaInput.onchange = commitFromFormula;
    formulaInput.onkeydown = handleFormulaKey;
  }

  // Bind mobile toolbar overflow toggle
  const btnOverflow = document.getElementById('btnToolbarOverflow');
  const tbCollapsible = document.getElementById('tbCollapsible');
  if (btnOverflow && tbCollapsible) {
    btnOverflow.onclick = (e) => {
      e.stopPropagation();
      tbCollapsible.classList.toggle('active');
    };
    document.addEventListener('click', () => {
      tbCollapsible.classList.remove('active');
    });
    tbCollapsible.onclick = (e) => {
      e.stopPropagation();
    };
  }
}
