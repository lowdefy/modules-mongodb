// Shared helpers for the auth-testing scripts.

export const DEFAULT_URI = 'mongodb://localhost:27017/demo-auth-test';

// Parse the target database name out of a connection string. Returns null when
// the URI has no database path (so callers can fall back to an explicit default).
export function dbNameFromUri(uri) {
  try {
    // mongodb:// URLs parse fine with the WHATWG URL parser once the scheme is
    // swapped to http (the pathname is what we're after).
    const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    const name = decodeURIComponent(u.pathname.replace(/^\//, '')).split('?')[0];
    return name || null;
  } catch {
    return null;
  }
}

// Host(s) from a connection string, lowercased.
export function hostsFromUri(uri) {
  try {
    const authAndHost = uri
      .replace(/^mongodb(\+srv)?:\/\//, '')
      .split('/')[0]
      .split('@')
      .pop();
    return authAndHost.split(',').map((h) => h.split(':')[0].toLowerCase());
  } catch {
    return [];
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function isLocalUri(uri) {
  const hosts = hostsFromUri(uri);
  return hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.has(h));
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
