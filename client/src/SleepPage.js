import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import './SleepPage.css';
import API_BASE from './apiBase';

const SLEEP_COLORS = {
  sleep_analysis_total_sleep_hr: '#1d4ed8',
  sleep_analysis_asleep_hr: '#0ea5e9',
  sleep_analysis_in_bed_hr: '#64748b',
  sleep_analysis_core_hr: '#8b5cf6',
  sleep_analysis_rem_hr: '#ec4899',
  sleep_analysis_deep_hr: '#4338ca',
  sleep_analysis_awake_hr: '#f59e0b',
};

const RANGE_OPTIONS = [30, 90, 180, 365];

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

  // Duration target around 8h, with graceful falloff.
  const durationPenalty = Math.abs(total - 8) * 8;
  const durationScore = clamp(100 - durationPenalty, 0, 100);

  // Efficiency: use AutoSleep-provided value if available, else compute from in-bed time.
  let efficiencyScore = 80;
  const apiEfficiency = Number(night.efficiency);
  if (Number.isFinite(apiEfficiency)) {
    efficiencyScore = clamp(100 * ((apiEfficiency / 100 - 0.7) / 0.25), 0, 100);
  } else {
    const inBed = Number(night.in_bed_hr);
    if (Number.isFinite(inBed) && inBed > 0) {
      const efficiency = clamp(total / inBed, 0, 1);
      efficiencyScore = clamp(100 * ((efficiency - 0.7) / 0.25), 0, 100);
    }
  }

  // Stage balance reward (REM + Deep share of total).
  const rem = Number(night.rem_hr) || 0;
  const deep = Number(night.deep_hr) || 0;
  const remPct = rem / total;
  const deepPct = deep / total;
  const remScore = clamp(100 - Math.abs(remPct - 0.22) * 600, 0, 100);
  const deepScore = clamp(100 - Math.abs(deepPct - 0.16) * 700, 0, 100);
  const stageScore = (remScore + deepScore) / 2;

  // Awake time penalty (if provided).
  let awakeScore = 85;
  const awake = Number(night.awake_hr);
  if (Number.isFinite(awake) && awake >= 0) {
    awakeScore = clamp(100 - (awake * 40), 0, 100);
  }

  const score = Math.round(
    (durationScore * 0.45) +
    (efficiencyScore * 0.25) +
    (stageScore * 0.20) +
    (awakeScore * 0.10)
  );

  return clamp(score, 0, 100);
};

const scoreBand = (score) => {
  if (!Number.isFinite(score)) return { label: 'N/A', className: 'sleep-score-badge sleep-score-badge--na' };
  if (score >= 85) return { label: 'Excellent', className: 'sleep-score-badge sleep-score-badge--excellent' };
  if (score >= 70) return { label: 'Good', className: 'sleep-score-badge sleep-score-badge--good' };
  if (score >= 55) return { label: 'Fair', className: 'sleep-score-badge sleep-score-badge--fair' };
  return { label: 'Needs Work', className: 'sleep-score-badge sleep-score-badge--low' };
};

const fmtHours = (value) => (Number.isFinite(value) ? `${value.toFixed(2)} hr` : 'N/A');

const fmtDate = (dayKey) => {
  if (!dayKey) return '-';
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

function SleepPage({ token }) {
  const [rows, setRows] = useState([]);
  const [rangeDays, setRangeDays] = useState(90);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showDeep, setShowDeep] = useState(true);
  const [showRem, setShowRem] = useState(true);
  const [showCore, setShowCore] = useState(true);
  const [showAwake, setShowAwake] = useState(false);
  const [tableVisible, setTableVisible] = useState(true);
  const [expandedSleepRow, setExpandedSleepRow] = useState(null);

  const tzOffsetMinutes = new Date().getTimezoneOffset();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await fetch(
          `${API_BASE}/api/health/sleep/daily?days=${rangeDays}&tzOffsetMinutes=${tzOffsetMinutes}`,
          {
          headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) {
          setRows([]);
          setFetchError('Failed to load sleep data.');
          return;
        }
        const json = await res.json();
        setRows(Array.isArray(json.data) ? json.data : []);
      } catch (_) {
        setRows([]);
        setFetchError('Failed to load sleep data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, rangeDays, refreshTick, tzOffsetMinutes]);

  const { dailyRows, latestNight, avgTotal, consistency, latestScore, averageScore } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => String(a.day).localeCompare(String(b.day)));
    const totals = sorted.map((d) => d.total_sleep_hr).filter((v) => Number.isFinite(v));
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    const scores = sorted.map(scoreNight).filter((v) => Number.isFinite(v));
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    const latest = sorted.length ? sorted[sorted.length - 1] : null;
    return {
      dailyRows: sorted,
      latestNight: latest,
      avgTotal: avg,
      consistency: stdDev(totals),
      latestScore: scoreNight(latest),
      averageScore: avgScore,
    };
  }, [rows]);

  const latestScoreBand = scoreBand(latestScore);
  const averageScoreBand = scoreBand(averageScore);

  const { goalHitRate, bestNight, worstNight, recentAvg7 } = useMemo(() => {
    const validNights = dailyRows.filter((n) => Number.isFinite(n.total_sleep_hr));
    const hits = validNights.filter((n) => n.total_sleep_hr >= 7 && n.total_sleep_hr <= 9).length;
    const rate = validNights.length ? Math.round((hits / validNights.length) * 100) : null;

    let best = null;
    let worst = null;
    for (const n of validNights) {
      if (!best || n.total_sleep_hr > best.total_sleep_hr) best = n;
      if (!worst || n.total_sleep_hr < worst.total_sleep_hr) worst = n;
    }

    const last7 = [...validNights].slice(-7).map((n) => n.total_sleep_hr);
    const avg7 = last7.length ? (last7.reduce((a, b) => a + b, 0) / last7.length) : null;

    return {
      goalHitRate: rate,
      bestNight: best,
      worstNight: worst,
      recentAvg7: avg7,
    };
  }, [dailyRows]);

  if (!token) return <div className="sleep-page"><p>Please log in.</p></div>;

  return (
    <div className="sleep-page">
      <div className="sleep-header">
        <div>
          <h2>Sleep</h2>
          <p className="sleep-subtitle">Nightly trends with normalized sleep stages and quality scoring.</p>
        </div>
        <p className="sleep-note">Night date reflects the sleep period ending that morning.</p>
      </div>

      <div className="sleep-toolbar">
        <div className="sleep-range-buttons">
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={d === rangeDays ? 'sleep-range-btn sleep-range-btn--active' : 'sleep-range-btn'}
            >
              {d}d
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setRefreshTick((n) => n + 1)}>Refresh</button>
      </div>

      {loading ? <p>Loading sleep data...</p> : null}
      {fetchError ? <p className="sleep-error">{fetchError}</p> : null}
      {!loading && dailyRows.length === 0 ? <p>No sleep data found yet.</p> : null}

      {latestNight ? (
        <div className="sleep-cards">
          <div className="sleep-card sleep-card--primary">
            <small>Latest Night</small>
            <strong>{fmtDate(latestNight.day)}</strong>
            <span>{fmtHours(latestNight.total_sleep_hr)}</span>
          </div>
          <div className="sleep-card">
            <small>Range Average</small>
            <strong>{fmtHours(avgTotal)}</strong>
          </div>
          <div className="sleep-card">
            <small>Consistency (Std Dev)</small>
            <strong>{fmtHours(consistency)}</strong>
          </div>
          <div className="sleep-card">
            <small>7-9h Goal Hit Rate</small>
            <strong>{goalHitRate != null ? `${goalHitRate}%` : 'N/A'}</strong>
          </div>
          <div className="sleep-card">
            <small>Last 7 Nights Avg</small>
            <strong>{fmtHours(recentAvg7)}</strong>
          </div>
          <div className="sleep-card">
            <small>Latest Quality Score</small>
            <strong>{latestScore != null ? `${latestScore}/100` : 'N/A'}</strong>
            <span className={latestScoreBand.className}>{latestScoreBand.label}</span>
          </div>
          <div className="sleep-card">
            <small>Average Quality Score</small>
            <strong>{averageScore != null ? `${averageScore}/100` : 'N/A'}</strong>
            <span className={averageScoreBand.className}>{averageScoreBand.label}</span>
          </div>
          <div className="sleep-card">
            <small>Longest Night</small>
            <strong>{bestNight ? fmtDate(bestNight.day) : 'N/A'}</strong>
            <span>{bestNight ? fmtHours(bestNight.total_sleep_hr) : ''}</span>
          </div>
          <div className="sleep-card">
            <small>Shortest Night</small>
            <strong>{worstNight ? fmtDate(worstNight.day) : 'N/A'}</strong>
            <span>{worstNight ? fmtHours(worstNight.total_sleep_hr) : ''}</span>
          </div>
        </div>
      ) : null}

      {dailyRows.length > 0 ? (
        <>
          <div className="sleep-toggles" role="group" aria-label="Sleep chart metrics">
            <label className="sleep-toggle-item">
              <input type="checkbox" checked={showDeep} onChange={(e) => setShowDeep(e.target.checked)} />
              <span className="sleep-dot" style={{ background: SLEEP_COLORS.sleep_analysis_deep_hr }} />
              Deep
            </label>
            <label className="sleep-toggle-item">
              <input type="checkbox" checked={showRem} onChange={(e) => setShowRem(e.target.checked)} />
              <span className="sleep-dot" style={{ background: SLEEP_COLORS.sleep_analysis_rem_hr }} />
              REM
            </label>
            <label className="sleep-toggle-item">
              <input type="checkbox" checked={showCore} onChange={(e) => setShowCore(e.target.checked)} />
              <span className="sleep-dot" style={{ background: SLEEP_COLORS.sleep_analysis_core_hr }} />
              Core
            </label>
            <label className="sleep-toggle-item">
              <input type="checkbox" checked={showAwake} onChange={(e) => setShowAwake(e.target.checked)} />
              <span className="sleep-dot" style={{ background: SLEEP_COLORS.sleep_analysis_awake_hr }} />
              Awake
            </label>
          </div>
        <div className="sleep-chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={dailyRows} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis unit=" hr" />
              <Tooltip formatter={(v) => (v == null ? 'N/A' : `${Number(v).toFixed(2)} hr`)} />
              <Line type="monotone" dataKey="total_sleep_hr" name="Total Sleep" stroke={SLEEP_COLORS.sleep_analysis_total_sleep_hr} strokeWidth={2.5} dot={false} />
              {showDeep ? <Line type="monotone" dataKey="deep_hr" name="Deep" stroke={SLEEP_COLORS.sleep_analysis_deep_hr} dot={false} /> : null}
              {showRem ? <Line type="monotone" dataKey="rem_hr" name="REM" stroke={SLEEP_COLORS.sleep_analysis_rem_hr} dot={false} /> : null}
              {showCore ? <Line type="monotone" dataKey="core_hr" name="Core" stroke={SLEEP_COLORS.sleep_analysis_core_hr} dot={false} /> : null}
              {showAwake ? <Line type="monotone" dataKey="awake_hr" name="Awake" stroke={SLEEP_COLORS.sleep_analysis_awake_hr} dot={false} /> : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        </>
      ) : null}

      {dailyRows.length > 0 ? (
        <div className="sleep-table-wrap">
          <div className="sleep-table-title-row">
            <span className="sleep-table-title">Last 30 Nights</span>
            <button
              type="button"
              className="sleep-table-toggle"
              onClick={() => setTableVisible(v => !v)}
            >
              {tableVisible ? 'Hide ▴' : 'Show ▾'}
            </button>
          </div>
          {tableVisible && (
            <table className="sleep-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Quality</th>
                  <th>Deep</th>
                  <th>REM</th>
                  <th>Core</th>
                  <th>Awake</th>
                  <th className="sleep-th-expand" />
                </tr>
              </thead>
              <tbody>
                {[...dailyRows].reverse().slice(0, 30).map((r) => {
                  const score = scoreNight(r);
                  const band = scoreBand(score);
                  const isExpanded = expandedSleepRow === r.day;
                  return (
                    <React.Fragment key={r.day}>
                      <tr
                        className={`sleep-tr${isExpanded ? ' sleep-tr--open' : ''}`}
                        onClick={() => setExpandedSleepRow(isExpanded ? null : r.day)}
                      >
                        <td className="sleep-td-sticky">{fmtDate(r.day)}</td>
                        <td>{r.total_sleep_hr != null ? r.total_sleep_hr.toFixed(2) : '–'}</td>
                        <td>
                          <span className={band.className.replace('sleep-score-badge', 'sleep-quality-chip')}>
                            {score != null ? score : '–'}
                            {score != null && <span className="sleep-quality-label"> {band.label}</span>}
                          </span>
                        </td>
                        <td>{r.deep_hr != null ? r.deep_hr.toFixed(2) : '–'}</td>
                        <td>{r.rem_hr != null ? r.rem_hr.toFixed(2) : '–'}</td>
                        <td>{r.core_hr != null ? r.core_hr.toFixed(2) : '–'}</td>
                        <td>{r.awake_hr != null ? r.awake_hr.toFixed(2) : '–'}</td>
                        <td className="sleep-td-chevron">{isExpanded ? '▾' : '›'}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="sleep-tr-detail">
                          <td colSpan="8">
                            <div className="sleep-detail-grid">
                              <div className="sleep-detail-item"><small>Score</small><strong>{score != null ? `${score}/100` : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>Asleep</small><strong>{r.asleep_hr != null ? r.asleep_hr.toFixed(2) + ' hr' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>In Bed</small><strong>{r.in_bed_hr != null ? r.in_bed_hr.toFixed(2) + ' hr' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>Efficiency</small><strong>{r.efficiency != null ? r.efficiency.toFixed(1) + '%' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>Sleep HR</small><strong>{r.sleep_bpm != null ? Math.round(r.sleep_bpm) + ' bpm' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>HRV</small><strong>{r.hrv != null ? Math.round(r.hrv) + ' ms' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>SpO₂</small><strong>{r.spo2 != null ? r.spo2.toFixed(1) + '%' : '–'}</strong></div>
                              <div className="sleep-detail-item"><small>Resp Rate</small><strong>{r.resp_rate != null ? r.resp_rate.toFixed(1) + ' /min' : '–'}</strong></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default SleepPage;