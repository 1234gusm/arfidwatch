import React, { useEffect, useMemo, useState } from 'react';
import './SleepPage.css';
import API_BASE from './apiBase';
import { authFetch } from './auth';

/* ── Constants ── */
const RANGE_OPTS = [
  { days: 7,   label: '1 Week'   },
  { days: 14,  label: '2 Weeks'  },
  { days: 30,  label: '1 Month'   },
  { days: 90,  label: '3 Months' },
  { days: 360, label: 'Year'     },
  { days: 0,   label: 'All'      },
];
const SCORE_COLORS  = { excellent: '#22c55e', good: '#3b82f6', fair: '#f59e0b', low: '#ef4444', na: '#475569' };

/* ── Stage colours (shared) ── */
const STAGE_COLORS = {
  deep: '#8b5cf6', rem: '#a78bfa', core: '#38bdf8', awake: '#fb923c',
};

/* ── Helpers ── */
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const stdDev = (nums) => {
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, n) => sum + ((n - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
};

const scoreNight = (night) => {
  if (!night) return null;
  const total = Number(night.total_sleep_hr);
  if (!Number.isFinite(total) || total <= 0) return null;
  const durationScore = clamp(100 - Math.abs(total - 8) * 8, 0, 100);
  let efficiencyScore = 80;
  const apiEfficiency = Number(night.efficiency);
  if (Number.isFinite(apiEfficiency)) {
    efficiencyScore = clamp(100 * ((apiEfficiency / 100 - 0.7) / 0.25), 0, 100);
  } else {
    const inBed = Number(night.in_bed_hr);
    if (Number.isFinite(inBed) && inBed > 0)
      efficiencyScore = clamp(100 * ((clamp(total / inBed, 0, 1) - 0.7) / 0.25), 0, 100);
  }
  const rem   = Number(night.rem_hr)  || 0;
  const deep  = Number(night.deep_hr) || 0;
  const stageScore = (
    clamp(100 - Math.abs(rem  / total - 0.22) * 600, 0, 100) +
    clamp(100 - Math.abs(deep / total - 0.16) * 700, 0, 100)
  ) / 2;
  const awake = Number(night.awake_hr);
  const awakeScore = Number.isFinite(awake) ? clamp(100 - awake * 40, 0, 100) : 85;
  return clamp(Math.round(durationScore * 0.45 + efficiencyScore * 0.25 + stageScore * 0.20 + awakeScore * 0.10), 0, 100);
};

const scoreBand = (score) => {
  if (!Number.isFinite(score)) return { label: 'N/A',       key: 'na' };
  if (score >= 85)              return { label: 'Excellent', key: 'excellent' };
  if (score >= 70)              return { label: 'Good',      key: 'good' };
  if (score >= 55)              return { label: 'Fair',      key: 'fair' };
  return                               { label: 'Poor',      key: 'low' };
};

const fmtHr = (v) => {
  if (!Number.isFinite(v)) return '–';
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const fmtDate = (dayKey) => {
  if (!dayKey) return '–';
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

/* ── ScoreRing ── */
const ScoreRing = ({ score }) => {
  const { key } = scoreBand(score);
  const color = SCORE_COLORS[key];
  const deg   = score != null ? Math.round((score / 100) * 360) : 0;
  return (
    <div
      className="sp-ring"
      style={{ background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.07) ${deg}deg)` }}
    >
      <div className="sp-ring-inner">
        <span className="sp-ring-num">{score != null ? score : '–'}</span>
        <span className="sp-ring-sub">/ 100</span>
      </div>
    </div>
  );
};

/* ── StageBar ── */
const StageBar = ({ d }) => {
  const core  = d.core_hr  || 0;
  const rem   = d.rem_hr   || 0;
  const deep  = d.deep_hr  || 0;
  const awake = d.awake_hr || 0;
  const tot   = core + rem + deep + awake;
  if (!tot) return null;
  return (
    <div className="sp-stage-bar">
      <div className="sp-seg sp-seg--deep"  style={{ width: `${(deep  / tot) * 100}%` }} />
      <div className="sp-seg sp-seg--rem"   style={{ width: `${(rem   / tot) * 100}%` }} />
      <div className="sp-seg sp-seg--core"  style={{ width: `${(core  / tot) * 100}%` }} />
      <div className="sp-seg sp-seg--awake" style={{ width: `${(awake / tot) * 100}%` }} />
    </div>
  );
};

/* ── SleepStageGraph (AutoSleep-style) ── */
const SleepStageGraph = ({ r }) => {
  const stages = [
    { key: 'deep',  label: 'Deep Sleep',  hr: r.deep_hr  || 0, color: STAGE_COLORS.deep  },
    { key: 'rem',   label: 'REM Sleep',   hr: r.rem_hr   || 0, color: STAGE_COLORS.rem   },
    { key: 'core',  label: 'Core Sleep',  hr: r.core_hr  || 0, color: STAGE_COLORS.core  },
    { key: 'awake', label: 'Awake',       hr: r.awake_hr || 0, color: STAGE_COLORS.awake },
  ];
  const tot = stages.reduce((s, st) => s + st.hr, 0);
  if (tot <= 0) return null;

  /* conic-gradient stops for donut */
  let cumDeg = 0;
  const stops = stages.map(s => {
    const start = cumDeg;
    cumDeg += (s.hr / tot) * 360;
    return `${s.color} ${start.toFixed(1)}deg ${cumDeg.toFixed(1)}deg`;
  }).join(', ');

  return (
    <div className="sp-sgraph">
      <div className="sp-sgraph-top">
        {/* donut ring */}
        <div className="sp-donut" style={{ background: `conic-gradient(${stops})` }}>
          <div className="sp-donut-inner">
            <span className="sp-donut-total">{fmtHr(r.total_sleep_hr)}</span>
            <span className="sp-donut-sub">Total</span>
          </div>
        </div>

        {/* per-stage bars */}
        <div className="sp-sgraph-bars">
          {stages.map(s => {
            const pct = (s.hr / tot) * 100;
            return (
              <div key={s.key} className="sp-sbar-row">
                <div className="sp-sbar-head">
                  <span className="sp-sbar-dot" style={{ background: s.color }} />
                  <span className="sp-sbar-name">{s.label}</span>
                  <span className="sp-sbar-pct">{pct.toFixed(0)}%</span>
                </div>
                <div className="sp-sbar-track">
                  <div className="sp-sbar-fill" style={{ width: `${pct}%`, background: s.color }} />
                </div>
                <span className="sp-sbar-time">{fmtHr(s.hr)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* health metrics grid */}
      <div className="sp-sgraph-metrics">
        {r.efficiency      != null && <div className="sp-sgraph-metric"><small>Efficiency</small><strong>{r.efficiency.toFixed(1)}%</strong></div>}
        {r.quality_hr      != null && <div className="sp-sgraph-metric"><small>Quality Sleep</small><strong>{fmtHr(r.quality_hr)}</strong></div>}
        {r.fell_asleep_in  != null && <div className="sp-sgraph-metric"><small>Fell Asleep In</small><strong>{fmtHr(r.fell_asleep_in)}</strong></div>}
        {r.sleep_bpm       != null && <div className="sp-sgraph-metric"><small>Sleep HR</small><strong>{Math.round(r.sleep_bpm)} bpm</strong></div>}
        {r.waking_bpm      != null && <div className="sp-sgraph-metric"><small>Waking HR</small><strong>{Math.round(r.waking_bpm)} bpm</strong></div>}
        {r.hrv             != null && <div className="sp-sgraph-metric"><small>HRV</small><strong>{Math.round(r.hrv)} ms</strong></div>}
        {r.sleep_hrv       != null && <div className="sp-sgraph-metric"><small>Sleep HRV</small><strong>{Math.round(r.sleep_hrv)} ms</strong></div>}
        {r.spo2            != null && <div className="sp-sgraph-metric"><small>SpO₂</small><strong>{r.spo2.toFixed(1)}%</strong></div>}
        {r.resp_rate       != null && <div className="sp-sgraph-metric"><small>Resp. Rate</small><strong>{r.resp_rate.toFixed(1)}/min</strong></div>}
        {r.breath_dist     != null && <div className="sp-sgraph-metric"><small>Disturbances</small><strong>{r.breath_dist}</strong></div>}
      </div>
    </div>
  );
};

/* ── NightCard ── */
const NightCard = ({ r, selected, onSelect, forceOpen }) => {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forceOpen != null ? forceOpen : localOpen;
  const score = scoreNight(r);
  const { label, key } = scoreBand(score);
  const hasStages = r.deep_hr != null || r.rem_hr != null || r.core_hr != null;
  const handleClick = () => { onSelect(); setLocalOpen(v => !v); };
  return (
    <div
      className={`sp-night-card${open ? ' sp-night-card--open' : ''}${selected ? ' sp-night-card--selected' : ''}`}
      onClick={handleClick}
    >
      <div className="sp-night-main">
        <div className="sp-night-left">
          <span className="sp-night-date">{fmtDate(r.day)}</span>
          <span className="sp-night-total">{fmtHr(r.total_sleep_hr)}</span>
          {r.in_bed_hr != null && <span className="sp-night-inbed">In bed {fmtHr(r.in_bed_hr)}</span>}
        </div>
        <div className="sp-night-right">
          {score != null && (
            <div className={`sp-score-badge sp-score-badge--${key}`}>
              <span className="sp-score-num">{score}</span>
              <span className="sp-score-label">{label}</span>
            </div>
          )}
          {selected && <span className="sp-viewing-badge">VIEWING ▲</span>}
          <span className="sp-night-chevron">{open ? '▾' : '›'}</span>
        </div>
      </div>
      {!open && hasStages && <StageBar d={r} />}
      {!open && hasStages && (
        <div className="sp-stage-chips">
          {r.deep_hr  != null && <span className="sp-chip sp-chip--deep"><span  className="sp-chip-dot" />Deep {fmtHr(r.deep_hr)}</span>}
          {r.rem_hr   != null && <span className="sp-chip sp-chip--rem"><span   className="sp-chip-dot" />REM {fmtHr(r.rem_hr)}</span>}
          {r.core_hr  != null && <span className="sp-chip sp-chip--core"><span  className="sp-chip-dot" />Core {fmtHr(r.core_hr)}</span>}
          {r.awake_hr != null && <span className="sp-chip sp-chip--awake"><span className="sp-chip-dot" />Awake {fmtHr(r.awake_hr)}</span>}
        </div>
      )}
      {open && <SleepStageGraph r={r} />}
    </div>
  );
};

function SleepPage({ token }) {
  const [rows,        setRows]        = useState([]);
  const [rangeDays,   setRangeDays]   = useState(90);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [heroOffset,   setHeroOffset]  = useState(0);
  const [allCardsOpen, setAllCardsOpen] = useState(null); // null = individual, true/false = forced

  const tzOffsetMinutes = new Date().getTimezoneOffset();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await authFetch(
          `${API_BASE}/api/health/sleep/daily?days=${rangeDays || 3650}&tzOffsetMinutes=${tzOffsetMinutes}`
        );
        if (!res.ok) { setRows([]); setFetchError('Failed to load sleep data.'); return; }
        const json = await res.json();
        setRows(Array.isArray(json.data) ? json.data : []);
        setHeroOffset(0);
      } catch (_) {
        setRows([]); setFetchError('Failed to load sleep data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, rangeDays, refreshTick, tzOffsetMinutes]);

  const { dailyRows, avgTotal, consistency, latestScore, averageScore, goalHitRate, recentAvg7, bestNight } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => String(a.day).localeCompare(String(b.day)));
    const totals = sorted.map(d => d.total_sleep_hr).filter(v => Number.isFinite(v));
    const avg    = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    const scores = sorted.map(scoreNight).filter(v => Number.isFinite(v));
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const latest = sorted.length ? sorted[sorted.length - 1] : null;
    const valid  = sorted.filter(n => Number.isFinite(n.total_sleep_hr));
    const hits   = valid.filter(n => n.total_sleep_hr >= 7 && n.total_sleep_hr <= 9).length;
    const rate   = valid.length ? Math.round(hits / valid.length * 100) : null;
    let best = null;
    for (const n of valid) { if (!best || n.total_sleep_hr > best.total_sleep_hr) best = n; }
    const last7 = [...valid].slice(-7).map(n => n.total_sleep_hr);
    const avg7  = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : null;
    return { dailyRows: sorted, avgTotal: avg, consistency: stdDev(totals),
      latestScore: scoreNight(latest), averageScore: avgScore, goalHitRate: rate, recentAvg7: avg7, bestNight: best };
  }, [rows]);

  const { label: avgLabel,    key: avgKey    }  = scoreBand(averageScore);

  const handleSelectNight = (day) => {
    const idx = dailyRows.findIndex(r => r.day === day);
    if (idx !== -1) setHeroOffset(dailyRows.length - 1 - idx);
  };

  const viewedNight = dailyRows.length > 0
    ? dailyRows[dailyRows.length - 1 - heroOffset]
    : null;
  const viewedScore = scoreNight(viewedNight);
  const { label: viewedLabel, key: viewedKey } = scoreBand(viewedScore);

  if (!token) return <div className="sp-page"><p>Please log in.</p></div>;

  return (
    <div className="sp-page">
      {/* ── Header ── */}
      <div className="sp-header">
        <div className="sp-header-left">
          <h2 className="sp-title">Sleep</h2>
          <p className="sp-subtitle">Nightly trends · stages · quality score</p>
        </div>
        <div className="sp-range-row">
          {RANGE_OPTS.map(o => (
            <button
              key={o.days}
              type="button"
              className={`sp-range-btn${o.days === rangeDays ? ' sp-range-btn--active' : ''}`}
              onClick={() => setRangeDays(o.days)}
            >{o.label}</button>
          ))}
          <button type="button" className="sp-refresh-btn" title="Refresh"
            onClick={() => setRefreshTick(n => n + 1)}>↻</button>
        </div>
      </div>

      {loading && <div className="sp-loading"><div className="sp-spinner" /><span>Loading…</span></div>}
      {fetchError && <p className="sp-error">{fetchError}</p>}
      {!loading && !fetchError && dailyRows.length === 0 && (
        <p className="sp-empty">No sleep data found. Sync some data to get started.</p>
      )}

      {!loading && dailyRows.length > 0 && (
        <>
          {/* ── Averages bar ── */}
          <div className="sp-avg-bar">
            <div className="sp-avg-bar-label">Averages · {rangeDays ? `${rangeDays}d` : 'All time'}</div>
            <div className="sp-avg-bar-grid">
              <div className="sp-stat-card">
                <span className="sp-stat-label">Period Avg</span>
                <span className="sp-stat-val">{fmtHr(avgTotal)}</span>
              </div>
              <div className="sp-stat-card">
                <span className="sp-stat-label">7-Night Avg</span>
                <span className="sp-stat-val">{fmtHr(recentAvg7)}</span>
              </div>
              <div className="sp-stat-card">
                <span className="sp-stat-label">Avg Score</span>
                <span className="sp-stat-val">{averageScore != null ? averageScore : '–'}<span className="sp-stat-small"> /100</span></span>
                <span className={`sp-band-chip sp-band-chip--${avgKey} sp-band-chip--sm`}>{avgLabel}</span>
              </div>
              <div className="sp-stat-card">
                <span className="sp-stat-label">7–9h Goal</span>
                <span className="sp-stat-val">{goalHitRate != null ? `${goalHitRate}%` : '–'}</span>
              </div>
              <div className="sp-stat-card">
                <span className="sp-stat-label">Consistency</span>
                <span className="sp-stat-val">{consistency != null ? fmtHr(consistency) : '–'}</span>
                <span className="sp-stat-hint">std dev</span>
              </div>
              <div className="sp-stat-card">
                <span className="sp-stat-label">Best Night</span>
                <span className="sp-stat-val sp-stat-val--sm">{bestNight ? fmtDate(bestNight.day) : '–'}</span>
                {bestNight && <span className="sp-stat-hint">{fmtHr(bestNight.total_sleep_hr)}</span>}
              </div>
            </div>
          </div>

          <hr className="sp-section-divider" />

          {/* ── Night Spotlight ── */}
          <div className={`sp-spotlight${heroOffset !== 0 ? ' sp-spotlight--selected' : ''}`}>
            <div className="sp-spotlight-header">
              <button
                type="button"
                className="sp-ring-nav-btn"
                title="Previous night"
                disabled={heroOffset >= dailyRows.length - 1}
                onClick={() => setHeroOffset(o => Math.min(o + 1, dailyRows.length - 1))}
              >‹</button>
              <div className="sp-spotlight-title">
                {heroOffset !== 0
                  ? <span className="sp-spotlight-badge sp-spotlight-badge--selected">Selected Night</span>
                  : <span className="sp-spotlight-badge">Latest Night</span>
                }
                <span className="sp-spotlight-date">{fmtDate(viewedNight?.day)}</span>
              </div>
              <span className="sp-ring-nav-pos">{dailyRows.length - heroOffset} / {dailyRows.length}</span>
              <button
                type="button"
                className="sp-ring-nav-btn"
                title="Next night"
                disabled={heroOffset === 0}
                onClick={() => setHeroOffset(o => Math.max(o - 1, 0))}
              >›</button>
            </div>
            <div className="sp-spotlight-body">
              <div className="sp-spotlight-ring-col">
                <ScoreRing score={viewedScore} />
                <div className={`sp-band-chip sp-band-chip--${viewedKey}`}>{viewedLabel}</div>
                <div className="sp-spotlight-hrs">{fmtHr(viewedNight?.total_sleep_hr)}</div>
                {viewedNight?.in_bed_hr != null && <div className="sp-spotlight-inbed">In bed {fmtHr(viewedNight.in_bed_hr)}</div>}
              </div>
              <div className="sp-spotlight-detail">
                {viewedNight && (viewedNight.deep_hr != null || viewedNight.rem_hr != null || viewedNight.core_hr != null) && (
                  <>
                    <StageBar d={viewedNight} />
                    <div className="sp-stage-chips">
                      {viewedNight.deep_hr  != null && <span className="sp-chip sp-chip--deep"><span  className="sp-chip-dot" />Deep {fmtHr(viewedNight.deep_hr)}</span>}
                      {viewedNight.rem_hr   != null && <span className="sp-chip sp-chip--rem"><span   className="sp-chip-dot" />REM {fmtHr(viewedNight.rem_hr)}</span>}
                      {viewedNight.core_hr  != null && <span className="sp-chip sp-chip--core"><span  className="sp-chip-dot" />Core {fmtHr(viewedNight.core_hr)}</span>}
                      {viewedNight.awake_hr != null && <span className="sp-chip sp-chip--awake"><span className="sp-chip-dot" />Awake {fmtHr(viewedNight.awake_hr)}</span>}
                    </div>
                  </>
                )}
                {viewedNight && (
                  viewedNight.efficiency != null || viewedNight.quality_hr != null ||
                  viewedNight.sleep_bpm != null || viewedNight.waking_bpm != null ||
                  viewedNight.hrv != null || viewedNight.sleep_hrv != null ||
                  viewedNight.spo2 != null || viewedNight.resp_rate != null ||
                  viewedNight.fell_asleep_in != null || viewedNight.breath_dist != null
                ) && (
                  <div className="sp-spotlight-extras">
                    {viewedNight.efficiency     != null && <div className="sp-extra-item"><small>Efficiency</small><strong>{viewedNight.efficiency.toFixed(1)}%</strong></div>}
                    {viewedNight.quality_hr     != null && <div className="sp-extra-item"><small>Quality Sleep</small><strong>{fmtHr(viewedNight.quality_hr)}</strong></div>}
                    {viewedNight.fell_asleep_in != null && <div className="sp-extra-item"><small>Fell Asleep In</small><strong>{fmtHr(viewedNight.fell_asleep_in)}</strong></div>}
                    {viewedNight.sleep_bpm      != null && <div className="sp-extra-item"><small>Sleep HR</small><strong>{Math.round(viewedNight.sleep_bpm)} bpm</strong></div>}
                    {viewedNight.waking_bpm     != null && <div className="sp-extra-item"><small>Waking HR</small><strong>{Math.round(viewedNight.waking_bpm)} bpm</strong></div>}
                    {viewedNight.hrv            != null && <div className="sp-extra-item"><small>HRV</small><strong>{Math.round(viewedNight.hrv)} ms</strong></div>}
                    {viewedNight.sleep_hrv      != null && <div className="sp-extra-item"><small>Sleep HRV</small><strong>{Math.round(viewedNight.sleep_hrv)} ms</strong></div>}
                    {viewedNight.spo2           != null && <div className="sp-extra-item"><small>SpO₂</small><strong>{viewedNight.spo2.toFixed(1)}%</strong></div>}
                    {viewedNight.resp_rate      != null && <div className="sp-extra-item"><small>Resp. Rate</small><strong>{viewedNight.resp_rate.toFixed(1)}/min</strong></div>}
                    {viewedNight.breath_dist    != null && <div className="sp-extra-item"><small>Disturbances</small><strong>{viewedNight.breath_dist}</strong></div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent nights ── */}
          <div className="sp-nights-section">
            <div className="sp-nights-header">
              <div className="sp-section-title">
                Nightly Detail <span className="sp-section-count">{Math.min(dailyRows.length, 30)}</span>
              </div>
              <div className="sp-collapse-btns">
                <button className="sp-collapse-btn" onClick={() => setAllCardsOpen(true)}>Expand All</button>
                <button className="sp-collapse-btn" onClick={() => setAllCardsOpen(false)}>Collapse All</button>
              </div>
            </div>
            <div className="sp-nights-list">
              {[...dailyRows].reverse().slice(0, 30).map(r => (
                <NightCard
                  key={r.day}
                  r={r}
                  selected={viewedNight?.day === r.day}
                  onSelect={() => { handleSelectNight(r.day); setAllCardsOpen(null); }}
                  forceOpen={allCardsOpen}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SleepPage;
