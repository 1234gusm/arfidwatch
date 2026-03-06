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

  // Efficiency from in-bed time when available.
  let efficiencyScore = 80;
  const inBed = Number(night.in_bed_hr);
  if (Number.isFinite(inBed) && inBed > 0) {
    const efficiency = clamp(total / inBed, 0, 1);
    efficiencyScore = clamp(100 * ((efficiency - 0.7) / 0.25), 0, 100);
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

  return (
    <div className="sleep-page">
      <h2>Sleep</h2>
      <p className="sleep-subtitle">Fast daily sleep view with server-side normalization and aggregation.</p>

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
            <strong>{latestNight.day}</strong>
            <span>{latestNight.total_sleep_hr != null ? `${latestNight.total_sleep_hr.toFixed(2)} hr total` : 'No total yet'}</span>
          </div>
          <div className="sleep-card">
            <small>Range Average</small>
            <strong>
              {avgTotal != null ? `${avgTotal.toFixed(2)} hr` : 'N/A'}
            </strong>
          </div>
          <div className="sleep-card">
            <small>Consistency (Std Dev)</small>
            <strong>
              {consistency != null ? `${consistency.toFixed(2)} hr` : 'N/A'}
            </strong>
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
        </div>
      ) : null}

      {dailyRows.length > 0 ? (
        <>
          <div className="sleep-toggles" role="group" aria-label="Sleep chart metrics">
            <label><input type="checkbox" checked={showDeep} onChange={(e) => setShowDeep(e.target.checked)} /> Deep</label>
            <label><input type="checkbox" checked={showRem} onChange={(e) => setShowRem(e.target.checked)} /> REM</label>
            <label><input type="checkbox" checked={showCore} onChange={(e) => setShowCore(e.target.checked)} /> Core</label>
            <label><input type="checkbox" checked={showAwake} onChange={(e) => setShowAwake(e.target.checked)} /> Awake</label>
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
          <table className="sleep-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Total</th>
                <th>Deep</th>
                <th>REM</th>
                <th>Core</th>
                <th>Asleep</th>
                <th>In Bed</th>
                <th>Awake</th>
              </tr>
            </thead>
            <tbody>
              {[...dailyRows].reverse().slice(0, 30).map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.total_sleep_hr != null ? r.total_sleep_hr.toFixed(2) : '-'}</td>
                  <td>{r.deep_hr != null ? r.deep_hr.toFixed(2) : '-'}</td>
                  <td>{r.rem_hr != null ? r.rem_hr.toFixed(2) : '-'}</td>
                  <td>{r.core_hr != null ? r.core_hr.toFixed(2) : '-'}</td>
                  <td>{r.asleep_hr != null ? r.asleep_hr.toFixed(2) : '-'}</td>
                  <td>{r.in_bed_hr != null ? r.in_bed_hr.toFixed(2) : '-'}</td>
                  <td>{r.awake_hr != null ? r.awake_hr.toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default SleepPage;