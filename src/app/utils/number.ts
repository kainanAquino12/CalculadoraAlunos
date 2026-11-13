/** Tolerância para comparar números de ponto flutuante. */
export const EPS = 1e-9;

const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Arredonda PARA CIMA na precisão `step` (ex.: 0,8333 → 0,84), tolerando ruído de ponto flutuante. */
export function ceilTo(value: number, step = 0.01): number {
  if (!Number.isFinite(value)) return value;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return roundTo(Math.ceil(value / step - 1e-7) * step, decimals);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Formata com vírgula e duas casas (2 → "2,00"). */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return nf.format(Math.abs(value) < 5e-7 ? 0 : value);
}

/** Formata arredondando para cima — usado em "quanto falta/preciso", para nunca prometer menos que o necessário. */
export function fmtCeil(value: number): string {
  return fmt(ceilTo(value));
}

export function fmtPercent(fraction: number): string {
  return `${fmt(fraction * 100)}%`;
}

export function pointsWord(value: number): string {
  return Math.abs(value - 1) < 1e-9 ? 'ponto' : 'pontos';
}

/** Texto que vai dentro do campo de nota (sem separador de milhar, vírgula decimal). */
export function toInputText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(roundTo(value, 6)).replace('.', ',');
}
