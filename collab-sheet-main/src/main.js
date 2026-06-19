// src/main.js
import { state } from './state.js';
import { initAuth, signInWithGoogle, signInAsGuest, signOut } from './auth.js';
import { setupSyncCallbacks, updatePresenceCursor } from './sync.js';
import {
  showScreen,
  refreshDashboard,
  openDoc,
  goToDashboard,
  buildGrid,
  selectCell,
  startEdit,
  commitEdit,
  renderAllCells,
  renderPresenceBar,
  showToast,
  bindToolbarEvents,
  openShareModal,
  handleCreateDoc,
  bindUserDropdown,
  clearCell
} from './ui.js';
import { cellKey } from './formulas.js';

// ── ROUTING INITIALIZATION ──

let pendingDocId = null;

function checkUrlHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#\/doc\/([a-f0-9-]{36})$/i);
  if (match) {
    return match[1];
  }
  return null;
}

// ── AUTH STATE CHANGE CALLBACK ──

async function handleAuthStateChange(user) {
  if (user) {
    // Authenticated successfully
    document.getElementById('dashAvatar').textContent = user.name[0].toUpperCase();
    document.getElementById('dashAvatar').style.background = user.color;
    
    // Update user dropdown menu fields
    const dropdownName = document.getElementById('dropdownName');
    const dropdownEmail = document.getElementById('dropdownEmail');
    if (dropdownName) dropdownName.textContent = user.name;
    if (dropdownEmail) dropdownEmail.textContent = user.email || (user.isAnonymous ? 'Guest session' : 'Google account');
    
    // Check if there was a shared document link clicked
    const docIdFromUrl = checkUrlHash() || pendingDocId;
    pendingDocId = null;
    
    if (docIdFromUrl) {
      await openDoc(docIdFromUrl);
    } else {
      goToDashboard();
    }
  } else {
    // Signed out, clear the URL hash and show signin screen
    window.location.hash = '';
    showScreen('signin');
  }
}

// ── INITIAL BOOT ──

window.addEventListener('DOMContentLoaded', () => {
  // 0. Build decorative signin grid background
  const signinScreen = document.getElementById('signin');
  if (signinScreen) {
    const bg = document.createElement('div');
    bg.className = 'signin-bg-preview';
    
    // First row is col headers
    for (let c = 0; c < 11; c++) {
      const cell = document.createElement('div');
      cell.className = 'signin-bg-cell header';
      bg.appendChild(cell);
    }
    
    // subsequent rows
    for (let r = 0; r < 18; r++) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'signin-bg-cell header';
      bg.appendChild(rowHeader);
      
      for (let c = 0; c < 10; c++) {
        const cell = document.createElement('div');
        cell.className = 'signin-bg-cell';
        if ((r === 1 || r === 4 || r === 9 || r === 12) && (c === 1 || c === 3 || c === 5)) {
          cell.className = 'signin-bg-cell accent';
        }
        bg.appendChild(cell);
      }
    }
    signinScreen.insertBefore(bg, signinScreen.firstChild);
  }

  // Bind avatar dropdown menu
  bindUserDropdown();

  // Capture shared document ID on load before any auth redirects
  pendingDocId = checkUrlHash();

  // 1. Hook up the Realtime/Presence synchronization callbacks
  setupSyncCallbacks({
    onCellUpdate: (cellKeyStr, cellData) => {
      // Re-evaluate and re-render all cells to ensure dependent formulas update
      renderAllCells();
    },
    onCellDelete: (cellKeyStr) => {
      renderAllCells();
    },
    onPresenceSync: () => {
      renderAllCells();
      renderPresenceBar();
    },
    onRemoteEditNotification: (msg) => {
      showToast(msg);
    }
  });

  // 2. Bind Auth UI Events
  const btnGoogle = document.querySelector('.btn-google');
  if (btnGoogle) {
    btnGoogle.onclick = async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        showToast('Google login failed: ' + err.message);
      }
    };
  }

  window.signInAsGuest = async () => {
    const nameInput = document.getElementById('guestName');
    const name = nameInput ? nameInput.value.trim() : '';
    try {
      await signInAsGuest(name);
    } catch (err) {
      showToast('Guest sign-in failed: ' + err.message);
    }
  };

  const guestInput = document.getElementById('guestName');
  if (guestInput) {
    guestInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        window.signInAsGuest();
      }
    };
  }

  // Bind Dashboard Events
  const newCard = document.querySelector('.new-card');
  if (newCard) {
    newCard.onclick = handleCreateDoc;
  }

  window.signOut = async () => {
    try {
      await signOut();
    } catch (err) {
      showToast('Sign out failed: ' + err.message);
    }
  };

  // Bind Editor Toolbar Back Button
  const backBtn = document.querySelector('.editor-topbar .icon-btn');
  if (backBtn) {
    backBtn.onclick = goToDashboard;
  }

  // Bind Share button in Toolbar
  const shareBtn = document.createElement('button');
  shareBtn.className = 'tb-btn';
  shareBtn.id = 'btnShare';
  shareBtn.title = 'Share Spreadsheet';
  shareBtn.style.marginLeft = 'auto'; // push it to the right
  shareBtn.innerHTML = `
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"/>
    </svg>
    Share
  `;
  shareBtn.onclick = openShareModal;
  
  // Find toolbar and insert Share button
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) {
    toolbar.appendChild(shareBtn);
  }

  // 3. Initialize toolbar actions and formula inputs
  bindToolbarEvents();

  // 4. Keyboard navigation in Grid (Arrow keys, Enter, Backspace)
  document.addEventListener('keydown', (e) => {
    const editorScreen = document.getElementById('editor');
    if (editorScreen && editorScreen.classList.contains('active') && !state.editing) {
      const { r, c } = state.selected;
      
      const formulaFocused = document.activeElement === document.getElementById('formulaInput');
      const titleFocused = document.activeElement === document.getElementById('titleInput');
      if (formulaFocused || titleFocused) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectCell(Math.max(0, r - 1), c);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectCell(Math.min(state.ROWS - 1, r + 1), c);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectCell(r, Math.max(0, c - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectCell(r, Math.min(state.COLS - 1, c + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startEdit(r, c);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        clearCell(r, c);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Direct typing triggers edit
        startEdit(r, c);
      }
    }
  });

  // 5. Initialize Auth listener
  initAuth(handleAuthStateChange);
});

// Watch for hash changes (e.g. paste URL in same session)
window.addEventListener('hashchange', async () => {
  const docId = checkUrlHash();
  if (docId && state.user && (!state.currentDoc || state.currentDoc.id !== docId)) {
    await openDoc(docId);
  }
});
