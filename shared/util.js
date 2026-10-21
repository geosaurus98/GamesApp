// Small helpers shared by game pages.

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just won't resume.
  }
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

let toastTimer = 0;
export function toast(message, ms = 2400) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

// Fill a <dl> with [label, value] rows.
export function fillStats(dl, rows) {
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    return [dt, dd];
  }));
}

export function registerServiceWorker(path = '../../sw.js') {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(path).catch(() => {});
}

// Whole days since 1 Jan 2026 in the player's time zone; picks daily puzzles.
export function dayNumber(date = new Date()) {
  const start = Date.UTC(2026, 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - start) / 86400000);
}

// Share text with the system share sheet, falling back to the clipboard.
export async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
