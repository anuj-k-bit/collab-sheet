// src/state.js

export const state = {
  user: null,      // { id, name, color, isAnonymous }
  docs: [],        // list of documents fetched from Supabase
  currentDoc: null,// current active document object { id, title, owner_id }
  cells: {},       // cell data { "A1": { value, bold, italic, align } }
  selected: { r: 0, c: 0 },
  editing: null,   // { r, c } if a cell is being edited
  peers: [],       // list of active collaborators from Presence { id, name, color, cell }
  ROWS: 50,
  COLS: 26
};
