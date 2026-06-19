// src/auth.js
import { createClient } from '@supabase/supabase-js';
import { state } from './state.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = !!(supabaseUrl && supabaseAnonKey);

export const isMockMode = !isConfigured;

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// Store callback to trigger it manually in mock mode
let authChangeCallback = null;

if (isMockMode) {
  console.log('Running in Local Mock Collaboration Mode (Supabase environment variables missing).');
  setTimeout(() => {
    import('./ui.js').then(m => {
      m.showToast('ℹ️ running in Local Mock Collaboration Mode. Open two tabs to test!');
    }).catch(() => {});
  }, 1000);
}

// Generate a deterministic color based on User ID
export function getColorFromUserId(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#4f46e5', // Indigo
    '#0891b2', // Cyan
    '#059669', // Emerald
    '#d97706', // Amber
    '#dc2626', // Red
    '#db2777', // Pink
    '#7c3aed', // Violet
    '#ea580c'  // Orange
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Set up a user profile in public.profiles table
async function syncProfile(user, name, color) {
  if (isMockMode) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: name,
      color: color,
      updated_at: new Date().toISOString()
    });
  if (error) {
    console.error('Error syncing profile:', error);
  }
}

export async function signInWithGoogle() {
  if (isMockMode) {
    // Simulated Google Login Popup
    const name = prompt('Simulated Google OAuth Sign-In:\nEnter your name to log in via Google:', 'Google User');
    if (!name) return null;
    
    const id = 'mock-google-user-' + Math.random().toString(36).substring(2, 11);
    const color = getColorFromUserId(id);
    const email = name.toLowerCase().replace(/\s+/g, '') + '@gmail.com';
    
    state.user = {
      id,
      name,
      color,
      isAnonymous: false,
      email
    };
    sessionStorage.setItem('collab_sheet_mock_user', JSON.stringify(state.user));
    
    // Save to mock profiles
    const mockProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
    mockProfiles[id] = { display_name: name, color };
    localStorage.setItem('collab_sheet_mock_profiles', JSON.stringify(mockProfiles));

    // Force UI refresh
    if (authChangeCallback) {
      authChangeCallback(state.user);
    }
    return state.user;
  }
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) {
    throw error;
  }
}

export async function signInAsGuest(enteredName) {
  const name = enteredName.trim() || `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  
  if (isMockMode) {
    // Mock user login
    const id = 'mock-user-' + Math.random().toString(36).substring(2, 11);
    const color = getColorFromUserId(id);
    state.user = {
      id,
      name,
      color,
      isAnonymous: true
    };
    sessionStorage.setItem('collab_sheet_mock_user', JSON.stringify(state.user));
    
    // Save to mock profiles
    const mockProfiles = JSON.parse(localStorage.getItem('collab_sheet_mock_profiles') || '{}');
    mockProfiles[id] = { display_name: name, color };
    localStorage.setItem('collab_sheet_mock_profiles', JSON.stringify(mockProfiles));

    // Force auth callback update
    if (authChangeCallback) {
      authChangeCallback(state.user);
    }
    return state.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        display_name: name
      }
    }
  });
  if (error) {
    throw error;
  }
  return data.user;
}

export async function signOut() {
  if (isMockMode) {
    sessionStorage.removeItem('collab_sheet_mock_user');
    state.user = null;
    if (authChangeCallback) {
      authChangeCallback(null);
    }
    return;
  }
  
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
  state.user = null;
}

export async function initAuth(onAuthChangeCallback) {
  authChangeCallback = onAuthChangeCallback;

  if (isMockMode) {
    const saved = sessionStorage.getItem('collab_sheet_mock_user');
    if (saved) {
      state.user = JSON.parse(saved);
      if (onAuthChangeCallback) {
        onAuthChangeCallback(state.user);
      }
    } else {
      if (onAuthChangeCallback) {
        onAuthChangeCallback(null);
      }
    }
    return;
  }

  // Check for active session on load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const user = session.user;
    const name = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || `User ${user.id.slice(0, 4)}`;
    const color = getColorFromUserId(user.id);
    state.user = {
      id: user.id,
      name,
      color,
      isAnonymous: user.is_anonymous || false
    };
    await syncProfile(user, name, color);
  }

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      const user = session.user;
      const name = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || `User ${user.id.slice(0, 4)}`;
      const color = getColorFromUserId(user.id);
      state.user = {
        id: user.id,
        name,
        color,
        isAnonymous: user.is_anonymous || false
      };
      await syncProfile(user, name, color);
    } else {
      state.user = null;
    }
    if (onAuthChangeCallback) {
      onAuthChangeCallback(state.user);
    }
  });
}
