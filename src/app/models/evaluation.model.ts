/**
 * Uma avaliação (prova, trabalho, lista...) de uma disciplina.
 *
 * Todo cálculo do app é linear e usa dois números por avaliação:
 *  - `scale`: nota máxima que o aluno digita (ex.: 10 em uma prova ponderada, 2 em uma prova que "vale 2 pontos");
 *  - `maxPoints`: quanto essa avaliação contribui, no máximo, para a nota final.
 *
 * Contribuição = nota / scale × maxPoints.
 */
export interface Evaluation {
  id: string;
  name: string;
  description?: string;
  /** Id do grupo (RA) ao qual a avaliação pertence, quando houver. */
  group?: string;
  scale: number;
  maxPoints: number;
  /** Peso percentual (0–100) sobre a nota final, quando a disciplina é ponderada. */
  weight?: number;
  /** Precisão da nota exigida nas sugestões (padrão 0,01). */
  step?: number;
  /**
   * Como ela aparece no AVA, quando o nome do NotaCerta não bastaria para achar (ex.: "1 Avaliação Somativa").
   * Cada frase é procurada como sequência de palavras no nome da atividade.
   */
  aliases?: string[];
  /**
   * Como as atividades do AVA viram a nota. Padrão: proporção (pontos obtidos ÷ pontos possíveis × valor da avaliação).
   * `sum`: a professora compõe a nota somando pontos de várias atividades; soma os pontos e limita ao valor da avaliação.
   */
  importMode?: ImportMode;
}

export type ImportMode = 'proportion' | 'sum';

/** Notas lançadas por avaliação. `null`/ausente = pendente (diferente de zero). */
export type Grades = Readonly<Record<string, number | null | undefined>>;

export type GradeParseResult = { ok: true; value: number | null } | { ok: false; error: string };
