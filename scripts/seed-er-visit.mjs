#!/usr/bin/env node
// One-time seed script to insert the April 4, 2026 ER visit.
// Usage: node scripts/seed-er-visit.mjs
// Requires: SEED_TOKEN env var (your auth token from the app)

const API_BASE = process.env.API_BASE || 'https://arfidwatch.onrender.com';
const TOKEN = process.env.SEED_TOKEN;
if (!TOKEN) { console.error('Set SEED_TOKEN env var'); process.exit(1); }

const visit = {
  date: '2026-04-04',
  visit_type: 'er',
  facility: 'Novant Health Presbyterian Medical Center (NHPMC)',
  provider: 'Jason Levi, PA-C (attending: Jerry Nix, MD)',
  specialty: 'Emergency Medicine',
  chief_complaint: 'Tachycardia / SVT — HR 120-140 for days, palpitations, found in SVT at triage (158 BPM)',
  diagnoses_json: [
    'Supraventricular tachycardia (SVT)',
    'Tachycardia',
    'Anxiety',
    'Poor appetite / ARFID'
  ],
  vitals_json: {
    'BP': '168/95 mmHg',
    'HR': '158 bpm (triage)',
    'Resp': '18 /min',
    'SpO2': '98%',
    'Temp': '98.1°F',
    'Weight': '60.1 kg (132.5 lb)',
    'BMI': '20.84'
  },
  labs_json: [
    // CBC abnormals
    { name: 'RBC', value: '4.33', range: '4.50-5.90 M/uL', flag: 'LOW' },
    { name: 'Hemoglobin', value: '12.6', range: '14.0-17.5 g/dL', flag: 'LOW' },
    { name: 'Hematocrit', value: '37.9', range: '40.0-54.0 %', flag: 'LOW' },
    { name: 'Platelets', value: '124', range: '150-400 K/uL', flag: 'LOW' },
    // CBC normals
    { name: 'WBC', value: '5.3', range: '3.8-10.8 K/uL', flag: '' },
    { name: 'MCV', value: '87.5', range: '80.0-100.0 fL', flag: '' },
    { name: 'MCH', value: '29.1', range: '27.0-33.0 pg', flag: '' },
    { name: 'MCHC', value: '33.2', range: '32.0-36.0 g/dL', flag: '' },
    { name: 'RDW', value: '12.8', range: '11.0-15.0 %', flag: '' },
    { name: 'Neutrophils %', value: '57.3', range: '40-80 %', flag: '' },
    { name: 'Lymphocytes %', value: '30.0', range: '15-45 %', flag: '' },
    { name: 'Monocytes %', value: '8.7', range: '0-12 %', flag: '' },
    { name: 'Eosinophils %', value: '3.2', range: '0-7 %', flag: '' },
    { name: 'Basophils %', value: '0.8', range: '0-2 %', flag: '' },
    // CMP
    { name: 'Glucose', value: '105', range: '74-106 mg/dL', flag: '' },
    { name: 'BUN', value: '11', range: '7-20 mg/dL', flag: '' },
    { name: 'Creatinine', value: '0.81', range: '0.70-1.30 mg/dL', flag: '' },
    { name: 'Sodium', value: '139', range: '136-145 mmol/L', flag: '' },
    { name: 'Potassium', value: '3.8', range: '3.5-5.1 mmol/L', flag: '' },
    { name: 'Chloride', value: '103', range: '98-107 mmol/L', flag: '' },
    { name: 'CO2', value: '24', range: '21-31 mmol/L', flag: '' },
    { name: 'Calcium', value: '9.4', range: '8.6-10.3 mg/dL', flag: '' },
    { name: 'Total Protein', value: '7.3', range: '6.0-8.0 g/dL', flag: '' },
    { name: 'Albumin', value: '4.5', range: '3.5-5.0 g/dL', flag: '' },
    { name: 'Bilirubin Total', value: '0.6', range: '0.2-1.3 mg/dL', flag: '' },
    { name: 'Alk Phos', value: '59', range: '38-126 U/L', flag: '' },
    { name: 'AST', value: '19', range: '10-40 U/L', flag: '' },
    { name: 'ALT', value: '20', range: '9-46 U/L', flag: '' },
    { name: 'eGFR', value: '>60', range: '>60 mL/min', flag: '' },
    // Other labs
    { name: 'Magnesium', value: '1.9', range: '1.6-2.3 mg/dL', flag: '' },
    { name: 'TSH', value: '3.320', range: '0.358-3.740 uIU/mL', flag: '' }
  ],
  ecgs_json: [
    {
      time: '2:36 AM',
      rate: 162,
      interpretation: 'Sinus tachycardia vs SVT, QTc 499ms (prolonged)',
      critical: true
    },
    {
      time: '2:46 AM',
      rate: 132,
      interpretation: 'Sinus tachycardia, QTc 420ms (normal), post-spontaneous conversion',
      critical: false
    }
  ],
  notes: `Chief Complaint: Tachycardia, Palpitations

Clinical Course:
- Patient arrived via personal vehicle at 02:09. Found in SVT at triage (HR 158).
- Moved to Room 2. Cardiac defib pads placed. IV access established.
- Adenosine was being prepared — the anxiety/anticipation of adenosine triggered a vagal response and patient spontaneously converted to sinus tachycardia.
- Post-conversion: HR ~130s, then stabilized to ~100s over observation.
- 0.5L normal saline IV given.
- Observed ~3 hours. Labs drawn: CBC, CMP, Magnesium, TSH — all returned.
- CBC showed low RBC (4.33), Hgb (12.6), Hct (37.9), Plt (124).
- CMP, Mg, TSH all within normal limits.
- Two 12-lead ECGs obtained (see ECG data).

History:
- ARFID (Avoidant Restrictive Food Intake Disorder) — very poor oral intake
- Anxiety disorder with panic attacks
- History of tachycardia episodes
- Takes Quetiapine 200mg QHS, Lorazepam 1mg TID, Cyproheptadine 4mg, Ondansetron 4mg PRN

Provider Note (Jason Levi, PA-C):
"Initial EKG shows SVT. We were about to give adenosine when he spontaneously converted. The repeat EKG showed sinus tachycardia. The patient's heart rate improved with IV fluids and observation."

Assessment: 23 y.o. male with ARFID, anxiety, presenting with SVT that spontaneously converted. Low CBC values likely secondary to nutritional deficiency (ARFID). Recommend cardiology follow-up.`,
  disposition: 'Discharged — stable, improved',
  follow_up: 'Cardiology ASAP — Oktay F. Rifki, MD PhD, 125 Queens Rd Suite 200, Charlotte NC 28204, 704-343-9800',
  medications_json: [
    'Cyproheptadine 4mg',
    'Lorazepam 1mg TID',
    'Multivitamin daily',
    'Ondansetron 4mg PRN nausea',
    'Quetiapine 200mg QHS'
  ]
};

(async () => {
  const res = await fetch(`${API_BASE}/api/medical-visits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(visit),
  });
  const data = await res.json();
  console.log('Seeded visit:', data);
})();
