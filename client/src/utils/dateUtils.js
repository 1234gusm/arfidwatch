export const pad = n => String(n).padStart(2, '0');

export const toDateKey = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const localToday = () => toDateKey(new Date());

export const localOffset = days => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

export const localMonthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return toDateKey(d);
};

export const formatDay = key => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

export const isToday = dateKey => dateKey === localToday();
