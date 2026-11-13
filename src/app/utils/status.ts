import { SubjectSummary } from '../services/grade-calculator.service';

export type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

export interface StatusInfo {
  label: string;
  tone: Tone;
}

/** Texto e cor do status. Evita "aprovado": o app só compara pontos com a meta. */
export function statusInfo(s: SubjectSummary): StatusInfo {
  switch (s.status) {
    case 'completed':
      return s.targetReached
        ? { label: 'Concluída · meta de nota atingida', tone: 'success' }
        : { label: 'Concluída · meta não atingida', tone: 'danger' };
    case 'target-reached':
      return { label: 'Meta de nota atingida', tone: 'success' };
    case 'out-of-reach':
      return { label: 'Meta fora de alcance', tone: 'danger' };
    default:
      return { label: 'Em andamento', tone: 'primary' };
  }
}

export type Outcome = 'reached' | 'in-progress' | 'out-of-reach';

/** Agrupamento usado nos indicadores do painel inicial. */
export function outcomeOf(s: SubjectSummary): Outcome {
  if (s.targetReached) return 'reached';
  return s.achievable ? 'in-progress' : 'out-of-reach';
}
