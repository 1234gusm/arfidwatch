export const avgOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export const latestOf = m => { if (!m) return null; const d = Object.keys(m).sort(); return d.length ? m[d[d.length - 1]] : null; };
export const totalOf  = m => { if (!m) return null; const v = Object.values(m); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
export const minOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? Math.min(...v) : null; };
export const maxOf    = m => { if (!m) return null; const v = Object.values(m); return v.length ? Math.max(...v) : null; };
export const countOf  = m => (m ? Object.keys(m).length : 0);
export const daysOf   = countOf;

export const fmt = (v, meta, includeUnit = true) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const dp = meta?.dp ?? 1;
  const s  = dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp);
  return (includeUnit && meta?.unit) ? `${s}\u00a0${meta.unit}` : s;
};
