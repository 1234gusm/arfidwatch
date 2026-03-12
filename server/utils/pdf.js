'use strict';
const PDFDocument = require('pdfkit');

// ── Type aliases (MacroFactor -> Apple Health canonical) ────────────────────
const TYPE_ALIASES = {
  macrofactor_energy:             'dietary_energy_kcal',
  macrofactor_calories:           'dietary_energy_kcal',
  macrofactor_calories_kcal:      'dietary_energy_kcal',
  macrofactor_protein:            'protein_g',
  macrofactor_protein_g:          'protein_g',
  macrofactor_fat:                'total_fat_g',
  macrofactor_fat_g:              'total_fat_g',
  macrofactor_carbohydrates:      'carbohydrates_g',
  macrofactor_carbs:              'carbohydrates_g',
  macrofactor_carbs_g:            'carbohydrates_g',
  macrofactor_fiber:              'fiber_g',
  macrofactor_fiber_g:            'fiber_g',
  macrofactor_sugar:              'sugar_g',
  macrofactor_sugars_g:           'sugar_g',
  macrofactor_sodium:             'sodium_mg',
  macrofactor_sodium_mg:          'sodium_mg',
  macrofactor_water:              'water_fl_oz_us',
  macrofactor_water_g:            'water_fl_oz_us',
  macrofactor_weight:             'weight_lb',
  macrofactor_weight_lb:          'weight_lb',
  macrofactor_weight_kg:          'weight_lb',
  macrofactor_body_fat:           'body_fat_percentage__',
  macrofactor_lean_mass:          'lean_body_mass_lb',
  macrofactor_steps:              'step_count_count',
  macrofactor_expenditure:        'active_energy_kcal',
  macrofactor_energy_expenditure: 'active_energy_kcal',
};
const canonical = t => {
  if (!t) return t;
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  if (String(t).startsWith('macrofactor_')) return String(t).slice('macrofactor_'.length);
  return t;
};

// ── Type formatting metadata ────────────────────────────────────────────────
const TYPE_META = {
  dietary_energy_kcal:           { label: 'Calories',      unit: 'kcal',     dp: 0 },
  protein_g:                     { label: 'Protein',       unit: 'g',        dp: 1 },
  carbohydrates_g:               { label: 'Carbs',         unit: 'g',        dp: 1 },
  total_fat_g:                   { label: 'Fat',           unit: 'g',        dp: 1 },
  fiber_g:                       { label: 'Fiber',         unit: 'g',        dp: 1 },
  sugar_g:                       { label: 'Sugar',         unit: 'g',        dp: 1 },
  sodium_mg:                     { label: 'Sodium',        unit: 'mg',       dp: 0 },
  water_fl_oz_us:                { label: 'Water',         unit: 'fl oz',    dp: 1 },
  weight_lb:                     { label: 'Weight',        unit: 'lb',       dp: 1 },
  body_fat_percentage__:         { label: 'Body Fat',      unit: '%',        dp: 1 },
  lean_body_mass_lb:             { label: 'Lean Mass',     unit: 'lb',       dp: 1 },
  body_mass_index_count:         { label: 'BMI',           unit: '',         dp: 1 },
  step_count_count:              { label: 'Steps',         unit: '',         dp: 0 },
  active_energy_kcal:            { label: 'Active Cal',    unit: 'kcal',     dp: 0 },
  resting_energy_kcal:           { label: 'Rest. Cal',     unit: 'kcal',     dp: 0 },
  apple_exercise_time_min:       { label: 'Exercise',      unit: 'min',      dp: 0 },
  walking___running_distance_mi: { label: 'Distance',      unit: 'mi',       dp: 2 },
  flights_climbed_count:         { label: 'Flights',       unit: '',         dp: 0 },
  vo2_max_mlkgmin:               { label: 'VO2 Max',       unit: 'ml/kg/min',dp: 1 },
  apple_stand_time_min:          { label: 'Stand',         unit: 'min',      dp: 0 },
  sleep_analysis_total_sleep_hr: { label: 'Total Sleep',   unit: 'hr',       dp: 1 },
  sleep_analysis_deep_hr:        { label: 'Deep',          unit: 'hr',       dp: 1 },
  sleep_analysis_rem_hr:         { label: 'REM',           unit: 'hr',       dp: 1 },
  sleep_analysis_core_hr:        { label: 'Core',          unit: 'hr',       dp: 1 },
  sleep_analysis_in_bed_hr:      { label: 'In Bed',        unit: 'hr',       dp: 1 },
  sleep_analysis_awake_hr:       { label: 'Awake',         unit: 'hr',       dp: 1 },
  resting_heart_rate_countmin:   { label: 'Resting HR',    unit: 'bpm',      dp: 0 },
  heart_rate_avg_countmin:       { label: 'Avg HR',        unit: 'bpm',      dp: 0 },
  heart_rate_max_countmin:       { label: 'Max HR',        unit: 'bpm',      dp: 0 },
  heart_rate_variability_ms:     { label: 'HRV',           unit: 'ms',       dp: 0 },
  walking_heart_rate_average_countmin: { label: 'Walk HR', unit: 'bpm',      dp: 0 },
  blood_oxygen_saturation__:     { label: 'Blood O2',      unit: '%',        dp: 1 },
  blood_glucose_mgdl:            { label: 'Glucose',       unit: 'mg/dL',    dp: 1 },
  blood_pressure_systolic_mmhg:  { label: 'BP Systolic',   unit: 'mmHg',     dp: 0 },
  blood_pressure_diastolic_mmhg: { label: 'BP Diastolic',  unit: 'mmHg',     dp: 0 },
  body_temperature_degf:         { label: 'Body Temp',     unit: 'degF',     dp: 1 },
  time_in_daylight_min:          { label: 'Daylight',      unit: 'min',      dp: 0 },
  mindful_minutes_min:           { label: 'Mindfulness',   unit: 'min',      dp: 0 },
  respiratory_rate_countmin:     { label: 'Resp. Rate',    unit: '/min',     dp: 1 },
  walking_speed_mihr:            { label: 'Walk Speed',    unit: 'mph',      dp: 2 },
};

// ── Prioritized sections ────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'nutrition', title: 'Nutrition',      emoji: '',           color: '#1a7a1a', alwaysShow: true,
    primary:   ['dietary_energy_kcal','protein_g','carbohydrates_g','total_fat_g'],
    secondary: ['fiber_g','sugar_g','sodium_mg','water_fl_oz_us'],
  },
  {
    id: 'body',      title: 'Body & Weight',  emoji: '',           color: '#0055aa', alwaysShow: true,
    primary:   ['weight_lb','body_fat_percentage__','lean_body_mass_lb'],
    secondary: ['body_mass_index_count'],
  },
  {
    id: 'activity',  title: 'Activity',       emoji: '',           color: '#b86400', alwaysShow: true,
    primary:   ['step_count_count','active_energy_kcal','apple_exercise_time_min','walking___running_distance_mi'],
    secondary: ['resting_energy_kcal','flights_climbed_count','apple_stand_time_min','vo2_max_mlkgmin'],
  },
  {
    id: 'sleep',     title: 'Sleep',          emoji: '',           color: '#5b2d8e', alwaysShow: true,
    primary:   ['sleep_analysis_total_sleep_hr','sleep_analysis_deep_hr','sleep_analysis_rem_hr','sleep_analysis_core_hr'],
    secondary: ['sleep_analysis_in_bed_hr','sleep_analysis_awake_hr'],
  },
  {
    id: 'heart',     title: 'Heart & Vitals', emoji: '',           color: '#c00000',
    primary:   ['resting_heart_rate_countmin','heart_rate_avg_countmin','heart_rate_variability_ms','blood_oxygen_saturation__'],
    secondary: ['heart_rate_max_countmin','walking_heart_rate_average_countmin','blood_glucose_mgdl','blood_pressure_systolic_mmhg','blood_pressure_diastolic_mmhg','body_temperature_degf','respiratory_rate_countmin'],
  },
];
const SECTION_COL_SET = new Set(SECTIONS.flatMap(s => [...s.primary, ...s.secondary]));

// ── Page geometry ───────────────────────────────────────────────────────────
const PAGE_H  = 792;
const L       = 50;
const T       = 60;
const BMARGIN = 60;
const usableW = doc => doc.page.width - L * 2;

// ── Page break helper ───────────────────────────────────────────────────────
function checkPage(doc, needH) {
  if (doc.y + needH > PAGE_H - BMARGIN) {
    doc.addPage();
    doc.y = T;
  }
}

// ── Format a single value ───────────────────────────────────────────────────
function fmtVal(v, meta) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '\u2014';
  const dp  = meta?.dp ?? 1;
  const num = dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp);
  return meta?.unit ? `${num} ${meta.unit}` : num;
}

// ── Build per-day value maps ────────────────────────────────────────────────
function buildDailyMaps(rows) {
  const maps = {};
  rows.forEach(h => {
    const ct  = canonical(h.type);
    const v   = parseFloat(h.value);
    if (!Number.isFinite(v)) return;
    const day = String(h.timestamp || '').slice(0, 10);
    if (!day) return;
    if (!maps[ct]) maps[ct] = {};
    if (maps[ct][day] === undefined || v > maps[ct][day]) maps[ct][day] = v;
  });
  return maps;
}

// ── Date label: "Mon, Jan 6" ────────────────────────────────────────────────
function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Pretty-print raw column type names ─────────────────────────────────────
function prettyLabel(ct) {
  return ct
    .replace(/^macrofactor_/, '')
    .replace(/^apple_/, '')
    .replace(/__+/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── Hero stats row at top of PDF ────────────────────────────────────────────
function drawHeroRow(doc, maps, journalCount, includeJournal) {
  const W = usableW(doc);
  const defs = [
    { ct: 'dietary_energy_kcal',           label: 'Avg Calories',  color: '#1a7a1a', mode: 'avg'    },
    { ct: 'step_count_count',              label: 'Avg Steps',     color: '#b86400', mode: 'avg'    },
    { ct: 'weight_lb',                     label: 'Weight (last)', color: '#0055aa', mode: 'latest' },
    { ct: 'sleep_analysis_total_sleep_hr', label: 'Avg Sleep',     color: '#5b2d8e', mode: 'avg'    },
    { ct: null,                            label: 'Journal',       color: '#336699', mode: 'journal'},
  ].filter(d => {
    if (d.ct === null) return includeJournal;
    const vals = maps[d.ct] ? Object.values(maps[d.ct]) : [];
    return vals.length > 0;
  });

  const N   = defs.length;
  const GAP = 8;
  const BW  = Math.floor((W - GAP * (N - 1)) / N);
  const BH  = 52;
  let   x   = L;
  const y   = doc.y;

  defs.forEach(d => {
    let valStr;
    if (d.ct === null) {
      valStr = String(journalCount);
    } else {
      const rawVals = Object.values(maps[d.ct] || {});
      if (!rawVals.length) { x += BW + GAP; return; }
      const v = d.mode === 'latest'
        ? maps[d.ct][Object.keys(maps[d.ct]).sort().pop()]
        : rawVals.reduce((a,b)=>a+b,0) / rawVals.length;
      const meta = TYPE_META[d.ct];
      const dp   = meta?.dp ?? 1;
      const num  = dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp);
      valStr = meta?.unit ? `${num} ${meta.unit}` : num;
    }

    doc.rect(x, y, BW, BH).fill('#f7fafd').stroke('#d0dde8');
    doc.rect(x, y, BW, 3).fill(d.color);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a2a3a')
      .text(valStr, x, y + 8, { width: BW, align: 'center', lineBreak: false });
    doc.fontSize(7.5).font('Helvetica').fillColor('#5577aa')
      .text(d.label.toUpperCase(), x, y + 24, { width: BW, align: 'center', lineBreak: false });
    x += BW + GAP;
  });
  doc.y = y + BH + 14;
}

// ── Section header: colored stripe + emoji + title ─────────────────────────
function sectionHeader(doc, sec) {
  const W = usableW(doc);
  checkPage(doc, 90);
  if (doc.y > T + 10) doc.moveDown(0.6);
  const y = doc.y;
  const H = 26;
  doc.rect(L, y, W, H).fill('#f0f4f8');
  doc.rect(L, y, 5, H).fill(sec.color);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(sec.color)
    .text(sec.title, L + 12, y + 7, { width: W - 20, lineBreak: false });
  doc.y = y + H + 10;
}

// ── Summary chips: one per primary column, wrapped into rows of MAX_PER_ROW ─
function drawSummaryChips(doc, ctList, maps, sec) {
  const W = usableW(doc);
  const N = ctList.length;
  if (!N) return;
  const GAP         = 6;
  const CH          = 46;
  const MAX_PER_ROW = 6;

  for (let rowStart = 0; rowStart < N; rowStart += MAX_PER_ROW) {
    const rowItems = ctList.slice(rowStart, rowStart + MAX_PER_ROW);
    const nCols    = rowItems.length;
    const CW       = Math.floor((W - GAP * (nCols - 1)) / nCols);
    checkPage(doc, CH + 12);

    let x = L;
    const y = doc.y;
    rowItems.forEach(ct => {
      const m     = maps[ct] || {};
      const vals  = Object.values(m);
      const meta  = TYPE_META[ct] || {};
      const label = meta.label || prettyLabel(ct);

      if (!vals.length) {
        doc.rect(x, y, CW, CH).fill('#f0f2f4').stroke('#dde0e5');
        doc.rect(x, y, CW, 3).fill('#c0c8d0');
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#b0b8c4')
          .text('\u2014', x, y + 6, { width: CW, align: 'center', lineBreak: false });
        doc.fontSize(7).font('Helvetica').fillColor('#b0b8c4')
          .text(label.toUpperCase() + ' AVG', x, y + 19, { width: CW, align: 'center', lineBreak: false });
        doc.fontSize(6.5).fillColor('#c8cfd8')
          .text('no data in range', x, y + 30, { width: CW, align: 'center', lineBreak: false });
        x += CW + GAP;
        return;
      }

      const dp    = meta.dp ?? 1;
      const avg   = vals.reduce((a,b)=>a+b,0) / vals.length;
      const mn    = Math.min(...vals);
      const mx    = Math.max(...vals);
      const days  = vals.length;
      const isWt  = ct === 'weight_lb';
      const dispV = isWt ? m[Object.keys(m).sort().pop()] : avg;
      const fmtN  = v => dp === 0 ? Math.round(v).toLocaleString() : v.toFixed(dp);

      doc.rect(x, y, CW, CH).fill('#f5f8fc').stroke('#dce4ef');
      doc.rect(x, y, CW, 3).fill(sec.color);

      const vStr = `${fmtN(dispV)}${meta.unit ? ' ' + meta.unit : ''}`;
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1a2a3a')
        .text(vStr, x, y + 6, { width: CW, align: 'center', lineBreak: false });

      const lStr = label.toUpperCase() + (isWt ? ' (LAST)' : ' AVG');
      doc.fontSize(7).font('Helvetica').fillColor(sec.color)
        .text(lStr, x, y + 19, { width: CW, align: 'center', lineBreak: false });

      doc.fontSize(6.5).fillColor('#7a8a9a')
        .text(`${fmtN(mn)}\u2013${fmtN(mx)}  \u00b7  ${days}d`, x, y + 30,
              { width: CW, align: 'center', lineBreak: false });

      x += CW + GAP;
    });
    doc.y = y + CH + (rowStart + MAX_PER_ROW < N ? 8 : 12);
  }
}

// ── Daily data table ────────────────────────────────────────────────────────
function drawDailyTable(doc, ctList, maps, subLabel) {
  const active = ctList.filter(ct => maps[ct] && Object.keys(maps[ct]).length);
  if (!active.length) return;

  const allDays = [...new Set(active.flatMap(ct => Object.keys(maps[ct])))].sort();
  if (!allDays.length) return;

  const W        = usableW(doc);
  const DATE_W   = 90;
  const ROW_H    = 15;
  const HDR_H    = 18;
  const MIN_COL  = 55;
  const MAX_COLS = Math.max(1, Math.floor((W - DATE_W) / MIN_COL));

  if (subLabel) {
    checkPage(doc, HDR_H + 20);
    doc.moveDown(0.3);
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#6a7a8a')
      .text(subLabel, L, doc.y, { width: W });
    doc.moveDown(0.3);
  }

  // Split into column chunks so headers never get squished to zero width
  for (let chunkStart = 0; chunkStart < active.length; chunkStart += MAX_COLS) {
    const chunk = active.slice(chunkStart, chunkStart + MAX_COLS);
    const colW  = Math.floor((W - DATE_W) / chunk.length);
    const fSz   = chunk.length > 5 ? 7 : 7.5;

    const drawHeader = () => {
      checkPage(doc, HDR_H + ROW_H);
      const y = doc.y;
      doc.rect(L, y, W, HDR_H).fill('#edf1f7');
      doc.fontSize(fSz).font('Helvetica-Bold').fillColor('#334455')
        .text('Date', L + 2, y + 5, { width: DATE_W - 4, lineBreak: false });
      chunk.forEach((ct, i) => {
        const meta = TYPE_META[ct] || {};
        const hdr  = (meta.label || prettyLabel(ct)) + (meta.unit ? ` (${meta.unit})` : '');
        doc.fontSize(fSz).font('Helvetica-Bold').fillColor('#334455')
          .text(hdr, L + DATE_W + i * colW + 2, y + 5,
                { width: colW - 4, align: 'right', lineBreak: false });
      });
      doc.y = y + HDR_H;
    };

    drawHeader();
    allDays.forEach((day, ri) => {
      if (doc.y + ROW_H > PAGE_H - BMARGIN) {
        doc.addPage(); doc.y = T;
        drawHeader();
      }
      const y  = doc.y;
      const bg = ri % 2 === 1 ? '#f9fbff' : '#ffffff';
      doc.rect(L, y, W, ROW_H).fill(bg);
      doc.fontSize(fSz).font('Helvetica').fillColor('#334455')
        .text(fmtDay(day), L + 2, y + 4, { width: DATE_W - 4, lineBreak: false });
      chunk.forEach((ct, i) => {
        const v = maps[ct]?.[day];
        doc.fontSize(fSz).fillColor(v !== undefined ? '#1a2a3a' : '#bbbbbb')
          .text(fmtVal(v !== undefined ? v : null, TYPE_META[ct]),
                L + DATE_W + i * colW + 2, y + 4,
                { width: colW - 4, align: 'right', lineBreak: false });
      });
      doc.y = y + ROW_H;
    });

    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#d0dde8').lineWidth(0.5).stroke();
    doc.y += 10;
  }
}

// ── Journal section ─────────────────────────────────────────────────────────
function drawJournalSection(doc, entries) {
  if (!entries.length) return;
  const W = usableW(doc);
  doc.addPage(); doc.y = T;

  const HH = 26;
  const hy = doc.y;
  doc.rect(L, hy, W, HH).fill('#f0f4f8');
  doc.rect(L, hy, 5, HH).fill('#336699');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#336699')
    .text('Journal', L + 12, hy + 7, { width: W - 20, lineBreak: false });
  doc.y = hy + HH + 12;

  const MOOD_LABEL = { 1: 'Very Bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };

  entries.forEach(entry => {
    const lineEst = Math.ceil((entry.text || '').length / 80) * 12 + (entry.title ? 62 : 50);
    checkPage(doc, lineEst);

    const ey = doc.y;
    const [jy, jm, jd] = String(entry.date).slice(0, 10).split('-').map(Number);
    const dateStr = new Date(jy, jm - 1, jd).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    doc.rect(L, ey, W, 1).fill('#d0dde8');
    doc.y = ey + 6;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334455').text(dateStr, L, doc.y);
    if (entry.mood) {
      doc.fontSize(8).font('Helvetica').fillColor('#7a8a9a')
        .text(`Mood: ${MOOD_LABEL[entry.mood] || entry.mood}`, L + 180, ey + 6,
              { lineBreak: false });
    }
    doc.moveDown(0.2);
    if (entry.title) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a2a3a')
        .text(entry.title, L, doc.y, { width: W });
      doc.moveDown(0.2);
    }
    if (entry.text) {
      doc.fontSize(9).font('Helvetica').fillColor('#1a2a3a')
        .text(entry.text, L, doc.y, { width: W, align: 'left' });
    }
    doc.moveDown(0.8);
  });
}

// ── Page footers ─────────────────────────────────────────────────────────────
function addFooters(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    const W = usableW(doc);
    doc.fontSize(7).font('Helvetica').fillColor('#9aabbb')
      .text(
        `ArfidWatch Health Report  \u00b7  Page ${i + 1} of ${pages.count}`,
        L, PAGE_H - 38, { width: W, align: 'center' }
      );
    doc.moveTo(L, PAGE_H - 44).lineTo(L + W, PAGE_H - 44)
      .strokeColor('#d0dde8').lineWidth(0.5).stroke();
  }
}

// ── Main export function ──────────────────────────────────────────────────────
function generatePDF(healthData, journalEntries, startDate, endDate, includeJournal = true, quickMode = false) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'LETTER', bufferPages: true, margin: 0 });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end',   () => resolve(Buffer.concat(chunks)));

    const W = usableW(doc);
    doc.y = T;

    // Cover header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a2a3a')
      .text('ArfidWatch Health Report', L, doc.y, { width: W });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#4a6080')
      .text(`${String(startDate).slice(0, 10)}  \u2013  ${String(endDate).slice(0, 10)}`, L, doc.y, { width: W });
    if (quickMode) {
      doc.moveDown(0.15);
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#7a8a9a')
        .text('Quick summary \u2014 primary metrics only', L, doc.y, { width: W });
    }
    doc.moveDown(0.4);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#c0ccd8').lineWidth(1).stroke();
    doc.moveDown(0.6);

    const dailyMaps = buildDailyMaps(healthData);

    // Hero row
    drawHeroRow(doc, dailyMaps, journalEntries.length, includeJournal);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#d0dde8').lineWidth(0.5).stroke();
    doc.moveDown(0.6);

    // Sections
    SECTIONS.forEach(sec => {
      const activePrimary   = sec.primary.filter(ct =>
        dailyMaps[ct] && Object.keys(dailyMaps[ct]).length > 0);
      const activeSecondary = sec.secondary.filter(ct =>
        dailyMaps[ct] && Object.keys(dailyMaps[ct]).length > 0);
      if (!activePrimary.length && !activeSecondary.length && !sec.alwaysShow) return;

      sectionHeader(doc, sec);

      // alwaysShow sections pass full primary list so missing metrics get no-data chips
      const chipsCtList = sec.alwaysShow ? sec.primary : activePrimary;
      if (chipsCtList.length) {
        drawSummaryChips(doc, chipsCtList, dailyMaps, sec);
      }

      // Macro split % for Nutrition
      if (sec.id === 'nutrition') {
        const avgOf = ct => {
          const vals = dailyMaps[ct] ? Object.values(dailyMaps[ct]) : [];
          return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
        };
        const ap  = avgOf('protein_g');
        const ac  = avgOf('carbohydrates_g');
        const af  = avgOf('total_fat_g');
        const tot = ap * 4 + ac * 4 + af * 9;
        if (tot > 0) {
          checkPage(doc, 18);
          doc.fontSize(8).font('Helvetica-Oblique').fillColor('#5577aa')
            .text(
              `Avg macro split:  Protein ${Math.round(ap*4/tot*100)}%  \u00b7  ` +
              `Carbs ${Math.round(ac*4/tot*100)}%  \u00b7  Fat ${Math.round(af*9/tot*100)}%`,
              L, doc.y, { width: W }
            );
          doc.moveDown(0.4);
        }
      }

      // Daily tables only render rows that actually have data
      if (!quickMode) {
        drawDailyTable(doc, activePrimary, dailyMaps, null);

        if (activeSecondary.length) {
          drawDailyTable(doc, activeSecondary, dailyMaps,
            `Additional detail \u2014 ${sec.title}:`);
        }
      }

      // If an alwaysShow section has zero real data, show a brief note
      if (sec.alwaysShow && !activePrimary.length && !activeSecondary.length) {
        checkPage(doc, 20);
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#8a9aaa')
          .text('No data recorded in this date range.', L, doc.y, { width: W });
        doc.moveDown(0.5);
      }
    });

    // Other / uncategorised metrics — omitted in quick mode
    if (!quickMode) {
      const otherCts = Object.keys(dailyMaps).filter(ct =>
        !SECTION_COL_SET.has(ct) && Object.keys(dailyMaps[ct]).length > 0
      );
      if (otherCts.length) {
        const otherSec = {
          title: 'Other Metrics', emoji: '',           color: '#555577',
          primary: otherCts, secondary: [],
        };
        sectionHeader(doc, otherSec);
        drawSummaryChips(doc, otherCts, dailyMaps, otherSec);
        drawDailyTable(doc, otherCts, dailyMaps, null);
      }
    }

    if (includeJournal && journalEntries.length) {
      drawJournalSection(doc, journalEntries);
    }

    addFooters(doc);
    doc.end();
  });
}

module.exports = { generatePDF };
