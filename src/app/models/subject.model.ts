import { Evaluation } from './evaluation.model';

/** direct = soma de pontos · weighted = média ponderada · grouped = grupos/RAs que são combinados. */
export type CalcModel = 'direct' | 'weighted' | 'grouped';

/** `pending`: o plano de ensino tem divergência ou a interpretação ainda não foi validada. */
export type FormulaValidation = 'confirmed' | 'pending';

export interface EvaluationGroup {
  id: string;
  name: string;
  /** Fração (0–1) da nota final que o grupo representa. Obrigatória no modelo `grouped`. */
  share?: number;
}

/** Conjunto alternativo de pesos (percentuais sobre a nota final) para fórmulas ambíguas. */
export interface WeightProfile {
  id: string;
  label: string;
  percents: Record<string, number>;
}

export interface FormulaInfo {
  validation: FormulaValidation;
  /** Fórmula como está escrita no plano de ensino. */
  text: string;
  /** Onde a regra foi lida. */
  source: string;
  /** Explicação simples para o aluno ("Como minha nota é calculada?"). */
  explanation: string;
  /** Divergências, suposições e regras que o app NÃO implementa. */
  notes: string[];
  profiles?: WeightProfile[];
  defaultProfile?: string;
}

export interface Subject {
  id: string;
  name: string;
  teacher?: string;
  semester: string;
  /** Meta de nota (padrão 7,0), configurável. */
  target: number;
  /** Escala da nota final (soma dos `maxPoints`). */
  finalScale: number;
  model: CalcModel;
  evaluations: Evaluation[];
  groups?: EvaluationGroup[];
  /** Permite ao aluno editar os pesos percentuais. */
  weightsEditable?: boolean;
  formula: FormulaInfo;
  custom?: boolean;
}

/** Disciplina já com as configurações do aluno aplicadas (meta, pesos, confirmação). */
export interface ResolvedSubject extends Subject {
  /** `true` quando a fórmula ainda não foi validada: resultados são estimativas provisórias. */
  provisional: boolean;
  weightsCustomized: boolean;
  /** Pesos inválidos salvos (soma ≠ 100%) foram ignorados. */
  weightsInvalid: boolean;
}
