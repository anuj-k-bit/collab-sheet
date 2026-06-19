// src/sync.js
import { supabase, isMockMode } from './auth.js';
import { state } from './state.js';
import { cellKey, resolveValue } from './formulas.js';

let cellsSubscription = null;
let presenceChannel = null;

// Local BroadcastChannel for mock sync across tabs
const broadcastChannel = isMockMode ? new BroadcastChannel('collab_sheet_sync') : null;

// Registry for callback functions to trigger UI updates
const callbacks = {
  onCellUpdate: null,
  onCellDelete: null,
  onPresenceSync: null,
  onRemoteEditNotification: null
};

export function setupSyncCallbacks(cbMap) {
  Object.assign(callbacks, cbMap);
}

function checkSupabase() {
  if (!supabase && !isMockMode) {
    throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.');
  }
}

// ── DOCUMENTS ──

export async function fetchDocuments() {
  if (isMockMode) {
    let docs = JSON.parse(localStorage.getItem('collab_sheet_mock_docs') || '[]');
    if (docs.length === 0) {
      // Setup sample spreadsheets
      docs = [
        { 
          id: 'mock-doc-budget-2026', 
          title: "Q1 Budget 2026", 
          owner_id: 'owner-alice', 
          updated_at: new Date(Date.now() - 3600000).toISOString()
        },
        { 
          id: 'mock-doc-team-roster', 
          title: "Team Roster", 
          owner_id: 'owner-bob', 
          updated_at: new Date(Date.now() - 86400000).toISOString()
        }
      ];
      localStorage.setItem('collab_sheet_mock_docs', JSON.stringify(docs));
      
      // Setup default mock cells
      const budgetCells = {
        "A1": {value:"Item"}, "B1": {value:"Amount"}, "C1": {value:"Status"},
        "A2": {value:"Marketing"}, "B2": {value:"15000"}, "C2": {value:"Approved"},
        "A3": {value:"Engineering"}, "B3": {value:"45000"}, "C3": {value:"Pending"},
        "A4": {value:"Operations"}, "B4": {value:"12000"}, "C4": {value:"Approved"},
        "A5": {value:"Total"}, "B5": {value:"=SUM(B2:B4)"}, "C5": {value:""},
      };
      const rosterCells = {
        "A1": {value:"Name"}, "B1": {value:"Role"}, "C1": {value:"Team"},
        "A2": {value:"Alice"}, "B2": {value:"Engineer"}, "C2": {value:"Frontend"},
        "A3": {value:"Bob"}, "B3": {value:"Designer"}, "C3": {value:"UX"},
      };
      localStorage.setItem('collab_sheet_mock_cells_mock-doc-budget-2026', JSON.stringify(budgetCells));
      localStorage.setItem('collab_sheet_mock_cells_mock-doc-team-roster', JSON.stringify(rosterCells));
    }
    state.docs = docs;
    return docs;
  }

  checkSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select(`
      id,
      title,
      owner_id,
      updated_at,
      document_collaborators (
        user_id,
        role,
        profiles (display_name, color)
      )
    `)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  state.docs = data || [];
  return state.docs;
}

export async function createDocument() {
  if (!state.user) return null;
  
  if (isMockMode) {
    const id = 'mock-doc-' + Math.random().toString(36).substring(2, 11);
    const newDoc = {
      id,
      title: 'Untitled spreadsheet',
      owner_id: state.user.id,
      updated_at: new Date().toISOString()
    };
    const docs = JSON.parse(localStorage.getItem('collab_sheet_mock_docs') || '[]');
    docs.unshift(newDoc);
    localStorage.setItem('collab_sheet_mock_docs', JSON.stringify(docs));
    state.docs = docs;
    return newDoc;
  }

  checkSupabase();
  const { data, error } = await supabase
    .from('documents')
    .insert({
      title: 'Untitled spreadsheet',
      owner_id: state.user.id
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(docId) {
  if (isMockMode) {
    let docs = JSON.parse(localStorage.getItem('collab_sheet_mock_docs') || '[]');
    docs = docs.filter(d => d.id !== docId);
    localStorage.setItem('collab_sheet_mock_docs', JSON.stringify(docs));
    localStorage.removeItem('collab_sheet_mock_cells_' + docId);
    localStorage.removeItem('collab_sheet_mock_collabs_' + docId);
    state.docs = docs;
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', docId);
  if (error) throw error;
}

export async function updateDocumentTitle(docId, title) {
  if (isMockMode) {
    const docs = JSON.parse(localStorage.getItem('collab_sheet_mock_docs') || '[]');
    const doc = docs.find(d => d.id === docId);
    if (doc) {
      doc.title = title;
      doc.updated_at = new Date().toISOString();
      localStorage.setItem('collab_sheet_mock_docs', JSON.stringify(docs));
    }
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('documents')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) throw error;
}

// ── CELLS ──

export async function fetchCells(docId) {
  if (isMockMode) {
    const cells = JSON.parse(localStorage.getItem('collab_sheet_mock_cells_' + docId) || '{}');
    state.cells = cells;
    return cells;
  }

  checkSupabase();
  const { data, error } = await supabase
    .from('cells')
    .select('*')
    .eq('doc_id', docId);
  if (error) throw error;
  
  state.cells = {};
  if (data) {
    data.forEach(cell => {
      state.cells[cell.cell_key] = {
        value: cell.formula || cell.value || '',
        bold: cell.bold,
        italic: cell.italic,
        align: cell.align,
        font_size: cell.font_size || 12,
        bg_color: cell.bg_color || null,
        no_borders: cell.border === 'none',
        updated_by: cell.updated_by
      };
    });
  }
  return state.cells;
}

export async function upsertCell(docId, cellKeyStr, val, formatting = {}) {
  if (!state.user) return;

  if (isMockMode) {
    // RLS Role Simulation: check if user is a viewer
    const collaborators = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    const doc = state.docs.find(d => d.id === docId);
    const isOwner = doc && doc.owner_id === state.user.id;
    const userCollab = collaborators.find(c => c.user_id === state.user.id);
    
    if (!isOwner && userCollab && userCollab.role === 'viewer') {
      throw new Error('Database RLS Policy Violation: Viewer role cannot insert/update cells.');
    }

    const formula = String(val).startsWith('=') ? val : null;
    const evaluatedVal = formula ? String(resolveValue(val)) : val;

    const cellData = {
      value: evaluatedVal,
      formula: formula,
      bold: formatting.bold || false,
      italic: formatting.italic || false,
      align: formatting.align || 'left',
      font_size: formatting.font_size || 12,
      bg_color: formatting.bg_color || null,
      no_borders: formatting.no_borders || false,
      updated_by: state.user.id
    };

    const cells = JSON.parse(localStorage.getItem('collab_sheet_mock_cells_' + docId) || '{}');
    cells[cellKeyStr] = cellData;
    localStorage.setItem('collab_sheet_mock_cells_' + docId, JSON.stringify(cells));
    state.cells = cells;

    // Broadcast change
    broadcastChannel.postMessage({
      type: 'cell_update',
      docId,
      cellKey: cellKeyStr,
      cellData
    });
    return;
  }

  checkSupabase();
  const formula = String(val).startsWith('=') ? val : null;
  const evaluatedVal = formula ? String(resolveValue(val)) : val;

  const cellPayload = {
    doc_id: docId,
    cell_key: cellKeyStr,
    value: evaluatedVal,
    formula: formula,
    bold: formatting.bold || false,
    italic: formatting.italic || false,
    align: formatting.align || 'left',
    font_size: formatting.font_size || 12,
    bg_color: formatting.bg_color || null,
    border: formatting.no_borders ? 'none' : null,
    updated_by: state.user.id,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('cells')
    .upsert(cellPayload, { onConflict: 'doc_id,cell_key' });
  if (error) throw error;
}

export async function deleteCell(docId, cellKeyStr) {
  if (isMockMode) {
    const collaborators = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    const doc = state.docs.find(d => d.id === docId);
    const isOwner = doc && doc.owner_id === state.user.id;
    const userCollab = collaborators.find(c => c.user_id === state.user.id);
    
    if (!isOwner && userCollab && userCollab.role === 'viewer') {
      throw new Error('Database RLS Policy Violation: Viewer role cannot delete cells.');
    }

    const cells = JSON.parse(localStorage.getItem('collab_sheet_mock_cells_' + docId) || '{}');
    delete cells[cellKeyStr];
    localStorage.setItem('collab_sheet_mock_cells_' + docId, JSON.stringify(cells));
    state.cells = cells;

    // Broadcast change
    broadcastChannel.postMessage({
      type: 'cell_delete',
      docId,
      cellKey: cellKeyStr
    });
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('cells')
    .delete()
    .eq('doc_id', docId)
    .eq('cell_key', cellKeyStr);
  if (error) throw error;
}

// ── COLLABORATORS ──

export async function fetchCollaborators(docId) {
  if (isMockMode) {
    const list = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    const mockProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
    
    // Join profiles
    return list.map(c => ({
      user_id: c.user_id,
      role: c.role,
      profiles: mockProfiles[c.user_id] || { display_name: `User ${c.user_id.slice(0, 4)}`, color: '#cbd5e1' }
    }));
  }

  checkSupabase();
  const { data, error } = await supabase
    .from('document_collaborators')
    .select(`
      user_id,
      role,
      profiles (display_name, color)
    `)
    .eq('doc_id', docId);
  if (error) throw error;
  return data;
}

export async function addCollaborator(docId, userId, role) {
  if (isMockMode) {
    const list = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    if (list.find(c => c.user_id === userId)) {
      throw new Error('User is already a collaborator.');
    }
    list.push({ user_id: userId, role });
    localStorage.setItem('collab_sheet_mock_collabs_' + docId, JSON.stringify(list));
    
    // Broadcast notification to force re-fetch role checks
    broadcastChannel.postMessage({
      type: 'collab_update',
      docId,
      userId,
      role
    });
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('document_collaborators')
    .insert({
      doc_id: docId,
      user_id: userId,
      role: role
    });
  if (error) throw error;
}

export async function removeCollaborator(docId, userId) {
  if (isMockMode) {
    let list = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    list = list.filter(c => c.user_id !== userId);
    localStorage.setItem('collab_sheet_mock_collabs_' + docId, JSON.stringify(list));
    
    broadcastChannel.postMessage({
      type: 'collab_update',
      docId,
      userId,
      role: null
    });
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('document_collaborators')
    .delete()
    .eq('doc_id', docId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateCollaboratorRole(docId, userId, role) {
  if (isMockMode) {
    const list = JSON.parse(localStorage.getItem('collab_sheet_mock_collabs_' + docId) || '[]');
    const collab = list.find(c => c.user_id === userId);
    if (collab) {
      collab.role = role;
      localStorage.setItem('collab_sheet_mock_collabs_' + docId, JSON.stringify(list));
    }
    
    broadcastChannel.postMessage({
      type: 'collab_update',
      docId,
      userId,
      role
    });
    return;
  }

  checkSupabase();
  const { error } = await supabase
    .from('document_collaborators')
    .update({ role })
    .eq('doc_id', docId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── REALTIME CELL & PRESENCE SYNC ──

// Store heartbeat interval in mock mode
let mockHeartbeatInterval = null;
const peerLastSeen = {};

export function subscribeToCells(docId) {
  if (isMockMode) {
    // Remove existing listener if any
    broadcastChannel.onmessage = null;
    
    broadcastChannel.onmessage = (event) => {
      const msg = event.data;
      if (msg.docId !== docId) return;

      if (msg.type === 'cell_update') {
        state.cells[msg.cellKey] = msg.cellData;
        if (callbacks.onCellUpdate) callbacks.onCellUpdate(msg.cellKey, msg.cellData);
        
        const peerProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
        const peerName = peerProfiles[msg.cellData.updated_by]?.display_name || 'Someone';
        
        if (callbacks.onRemoteEditNotification) {
          callbacks.onRemoteEditNotification(`Cell ${msg.cellKey} updated by ${peerName}`);
        }
      } else if (msg.type === 'cell_delete') {
        delete state.cells[msg.cellKey];
        if (callbacks.onCellDelete) callbacks.onCellDelete(msg.cellKey);
      } else if (msg.type === 'presence_ping') {
        peerLastSeen[msg.userId] = Date.now();
        const existingPeerIdx = state.peers.findIndex(p => p.id === msg.userId);
        const newPeer = {
          id: msg.userId,
          name: msg.name,
          color: msg.color,
          cell: msg.cell
        };

        if (existingPeerIdx > -1) {
          state.peers[existingPeerIdx] = newPeer;
        } else {
          state.peers.push(newPeer);
        }

        if (callbacks.onPresenceSync) callbacks.onPresenceSync();
      } else if (msg.type === 'presence_leave') {
        state.peers = state.peers.filter(p => p.id !== msg.userId);
        if (callbacks.onPresenceSync) callbacks.onPresenceSync();
      } else if (msg.type === 'collab_update') {
        // If our own role changed, we must be informed or trigger RLS refresh
        if (msg.userId === state.user.id) {
          if (callbacks.onRemoteEditNotification) {
            callbacks.onRemoteEditNotification(`Your role was updated to: ${msg.role || 'removed'}`);
          }
        }
      }
    };
    return;
  }

  checkSupabase();
  if (cellsSubscription) {
    supabase.removeChannel(cellsSubscription);
  }

  cellsSubscription = supabase
    .channel(`public:cells:doc_id=eq.${docId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'cells',
      filter: `doc_id=eq.${docId}`
    }, async (payload) => {
      const isMyEdit = payload.new && payload.new.updated_by === state.user.id;

      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const row = payload.new;
        if (!isMyEdit) {
          state.cells[row.cell_key] = {
            value: row.formula || row.value || '',
            bold: row.bold,
            italic: row.italic,
            align: row.align,
            updated_by: row.updated_by
          };
          
          if (callbacks.onCellUpdate) {
            callbacks.onCellUpdate(row.cell_key, state.cells[row.cell_key]);
          }

          const peer = state.peers.find(p => p.id === row.updated_by);
          const peerName = peer ? peer.name : 'Someone';
          if (callbacks.onRemoteEditNotification) {
            callbacks.onRemoteEditNotification(`Cell ${row.cell_key} updated by ${peerName}`);
          }
        }
      } else if (payload.eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow && oldRow.cell_key) {
          const key = oldRow.cell_key;
          const wasPresent = !!state.cells[key];
          delete state.cells[key];
          if (wasPresent && callbacks.onCellDelete) {
            callbacks.onCellDelete(key);
          }
        } else {
          await fetchCells(docId);
          if (callbacks.onCellUpdate) {
            callbacks.onCellUpdate();
          }
        }
      }
    })
    .subscribe();
}

// ── PRESENCE SYNC ──

export function joinPresence(docId) {
  if (isMockMode) {
    if (mockHeartbeatInterval) clearInterval(mockHeartbeatInterval);
    
    // Helper to send our presence details to other tabs
    const sendPing = () => {
      broadcastChannel.postMessage({
        type: 'presence_ping',
        docId,
        userId: state.user.id,
        name: state.user.name,
        color: state.user.color,
        cell: cellKey(state.selected.r, state.selected.c)
      });
    };

    // Heartbeat every 2 seconds
    sendPing();
    mockHeartbeatInterval = setInterval(() => {
      sendPing();

      // Prune inactive peers (no ping for 6 seconds)
      const now = Date.now();
      let hasPruned = false;
      state.peers = state.peers.filter(p => {
        const lastSeen = peerLastSeen[p.id] || 0;
        if (now - lastSeen > 6000) {
          hasPruned = true;
          return false;
        }
        return true;
      });

      if (hasPruned && callbacks.onPresenceSync) {
        callbacks.onPresenceSync();
      }
    }, 2000);
    return;
  }

  checkSupabase();
  if (presenceChannel) {
    supabase.removeChannel(presenceChannel);
  }

  presenceChannel = supabase.channel(`presence:doc_${docId}`, {
    config: {
      presence: {
        key: state.user.id
      }
    }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = presenceChannel.presenceState();
      
      const updatedPeers = [];
      Object.keys(presenceState).forEach(userId => {
        if (userId === state.user.id) return;
        const userPresences = presenceState[userId];
        if (userPresences && userPresences.length > 0) {
          const lastPresence = userPresences[userPresences.length - 1];
          updatedPeers.push({
            id: userId,
            name: lastPresence.name,
            color: lastPresence.color,
            cell: lastPresence.cell
          });
        }
      });
      state.peers = updatedPeers;

      if (callbacks.onPresenceSync) {
        callbacks.onPresenceSync();
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          name: state.user.name,
          color: state.user.color,
          cell: cellKey(state.selected.r, state.selected.c),
          userId: state.user.id
        });
      }
    });
}

export async function updatePresenceCursor(r, c) {
  if (isMockMode && state.user && state.currentDoc) {
    broadcastChannel.postMessage({
      type: 'presence_ping',
      docId: state.currentDoc.id,
      userId: state.user.id,
      name: state.user.name,
      color: state.user.color,
      cell: cellKey(r, c)
    });
    return;
  }

  if (presenceChannel && state.user && supabase) {
    await presenceChannel.track({
      name: state.user.name,
      color: state.user.color,
      cell: cellKey(r, c),
      userId: state.user.id
    });
  }
}

export function leavePresence() {
  if (isMockMode) {
    if (mockHeartbeatInterval) {
      clearInterval(mockHeartbeatInterval);
      mockHeartbeatInterval = null;
    }
    if (state.user && state.currentDoc) {
      broadcastChannel.postMessage({
        type: 'presence_leave',
        docId: state.currentDoc.id,
        userId: state.user.id
      });
    }
    return;
  }

  if (presenceChannel && supabase) {
    supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  if (cellsSubscription && supabase) {
    supabase.removeChannel(cellsSubscription);
    cellsSubscription = null;
  }
}
