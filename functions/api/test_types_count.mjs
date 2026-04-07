// Count how many types end up in the Query.equal after expansion
const VITALS_METRICS = [
  { key: 'heart_rate_avg_countmin', altKeys: ['heart_rate', 'heartrate', 'pulse', 'heart_ratebeatsmin'] },
  { key: 'resting_heart_rate_countmin' },
  { key: 'blood_pressure_systolic_mmhg', altKeys: ['systolic', 'systolicmmhg', 'systolic_mmhg', 'sys', 'sysmmhg'] },
  { key: 'blood_pressure_diastolic_mmhg', altKeys: ['diastolic', 'diastolicmmhg', 'diastolic_mmhg', 'dia', 'diammhg'] },
  { key: 'heart_rate_variability_ms' },
  { key: 'weight_lb', altKeys: ['weight_kg'] },
  { key: 'height_cm', altKeys: ['height_in'] },
  { key: 'blood_oxygen_saturation__' },
  { key: 'vo2_max_mlkgmin' },
  { key: 'body_fat_percentage__' },
  { key: 'body_mass_index_count' },
  { key: 'body_temperature_degf' },
  { key: 'blood_glucose_mgdl' },
  { key: 'respiratory_rate_countmin' },
];

const keys = new Set();
VITALS_METRICS.forEach(m => { keys.add(m.key); (m.altKeys || []).forEach(k => keys.add(k)); });
const baseTypes = [...keys];
console.log('Base types sent by client:', baseTypes.length);

// Server expansion
const expanded = new Set(baseTypes);
for (const t of baseTypes) {
  expanded.add(`macrofactor_${t}`);
  expanded.add(`apple_${t}`);
}
const typeArr = [...expanded];
console.log('Expanded types for Query.equal:', typeArr.length);
console.log('Under 100 limit?', typeArr.length <= 100);
