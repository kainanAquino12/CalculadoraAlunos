import { Evaluation } from '../models/evaluation.model';
import { Subject } from '../models/subject.model';

/**
 * Disciplinas do 2º período de Engenharia de Software (PUCPR Toledo), 2026/2.
 * Fonte: planos de ensino em PDF. A meta de 7,0 é padrão do app (os planos não a definem).
 *
 * Tabela interna (avaliação → valor máximo):
 *  Desenvolvimento Web      Prova 1 2,0 | TDE 1 2,0 | Prova 2 1,5 | Listas 1,0 | Projeto 1,5 | Doc 2,0      = 10,0 (soma direta, confirmada)
 *  Arq. de Banco de Dados   Prova 2,0 | TDE 3 2,0 | TDE 5 2,0 | Listas 2,0 | TDE 6 1,0 | TDE 7 1,0        = 10,0 (soma direta, confirmada)
 *  Requisitos de Software   (Aval 7,0 + TDE 3,0) por grupo RA1/RA2 e RA3, média dos grupos                  (PENDENTE: divergência com o cronograma)
 *  Lógica Matemática        A1 3,0 | A2 3,0 | TDE1 2,0 | TDE2 2,0 — pesos 30/30/10/30 vs 30/30/20/20       (PENDENTE: divergência interna)
 *  Conectividade            4×(AS1+AS2)/2 + 4×(L1+L2)/2 + 2×NTDE, escala das notas não explícita            (PENDENTE: normalização e nomenclatura)
 */

const SEM = '2026/2';
const RECUPERACAO_NOTA =
  'A recuperação e a aprovação oficial (frequência mínima de 75% etc.) dependem de regras institucionais que o app não calcula.';

const pct = (p: number): number => p;
/** Avaliação ponderada: escala 0–10 e peso em % da nota final (escala final 10). */
const weighted = (id: string, name: string, group: string, weight: number, description?: string): Evaluation => ({
  id,
  name,
  group,
  description,
  scale: 10,
  weight: pct(weight),
  maxPoints: (weight * 10) / 100,
});

export const DEFAULT_SUBJECTS: Subject[] = [
  // ───────────────────────── Desenvolvimento Web ─────────────────────────
  {
    id: 'dev-web-2026-2',
    name: 'Desenvolvimento Web',
    teacher: 'Diego Luiz Krause',
    semester: SEM,
    target: 7,
    finalScale: 10,
    model: 'direct',
    groups: [
      { id: 'ra1', name: 'RA1 · Páginas estáticas' },
      { id: 'ra2', name: 'RA2 · Angular e TypeScript' },
      { id: 'ra3', name: 'RA3 · Acessibilidade e documentação' },
    ],
    evaluations: [
      { id: 'prova1', name: 'Prova 1', group: 'ra1', scale: 2, maxPoints: 2, description: 'HTML, CSS, Flexbox e media query — escrita, sem computador.' },
      { id: 'tde1', name: 'TDE 1 — Site estático', group: 'ra1', scale: 2, maxPoints: 2, description: 'Site de 3 páginas, validado na defesa individual.' },
      { id: 'prova2', name: 'Prova 2 — Lógica e DOM', group: 'ra2', scale: 1.5, maxPoints: 1.5 },
      { id: 'listas', name: 'Listas em sala', group: 'ra2', scale: 1, maxPoints: 1, description: 'Lista de Atividades 1, manuscrita e individual.' },
      { id: 'angular', name: 'Projeto Angular', group: 'ra2', scale: 1.5, maxPoints: 1.5, description: 'Validado na defesa individual do projeto.' },
      { id: 'doc', name: 'Documentação e acessibilidade', group: 'ra3', scale: 2, maxPoints: 2, description: 'TDE 6: README, relatório Lighthouse e declaração de uso de IA.' },
    ],
    formula: {
      validation: 'confirmed',
      text: 'NF = Prova 1 + Site + Prova 2 + Listas + Projeto Angular + Documentação',
      source: 'Plano de Ensino — Desenvolvimento Web 2026/2, tabela de pesos da seção 4 (total 10,0).',
      explanation:
        'Esta disciplina tem seis avaliações. Cada uma vale uma quantidade fixa de pontos e a nota final é a soma dos pontos conquistados, num total de 10.',
      notes: [
        'Alguns trabalhos só têm a nota validada depois da defesa individual (site na Semana 7, projeto na Semana 16).',
        RECUPERACAO_NOTA,
      ],
    },
  },

  // ───────────────────────── Arquitetura de Banco de Dados ─────────────────────────
  {
    id: 'arq-bd-2026-2',
    name: 'Arquitetura de Banco de Dados',
    teacher: 'Diego Luiz Krause',
    semester: SEM,
    target: 7,
    finalScale: 10,
    model: 'direct',
    groups: [
      { id: 'ra1', name: 'RA1 · Modelagem' },
      { id: 'ra2', name: 'RA2 · SQL e implementação' },
      { id: 'ra3', name: 'RA3 · Diagnóstico de performance' },
      { id: 'ra4', name: 'RA4 · Otimização' },
    ],
    evaluations: [
      { id: 'prova1', name: 'Prova 1', group: 'ra1', scale: 2, maxPoints: 2, description: 'MER, normalização até a 3FN e DDL — manuscrita.' },
      { id: 'tde3', name: 'TDE 3 — Trabalho de Modelagem', group: 'ra1', scale: 2, maxPoints: 2, description: 'MER final, normalização e dicionário de dados.' },
      { id: 'tde5', name: 'TDE 5 — Construção do Banco', group: 'ra2', scale: 2, maxPoints: 2, description: 'DDL, DML, 12 consultas e 3 views; validado no Checkpoint 2.' },
      { id: 'listas', name: 'Listas de Atividades 1, 2 e 3', group: 'ra2', scale: 2, maxPoints: 2, description: 'As três listas somam 2,0 pontos; informe a soma.' },
      { id: 'tde6', name: 'TDE 6 — Planilha de Diagnóstico', group: 'ra3', scale: 1, maxPoints: 1 },
      { id: 'tde7', name: 'TDE 7 — Relatório de Otimização', group: 'ra4', scale: 1, maxPoints: 1 },
    ],
    formula: {
      validation: 'confirmed',
      text: 'NF = Prova + TDE 3 + TDE 5 + Listas + TDE 6 + TDE 7',
      source: 'Plano de Ensino — Arquitetura de Banco de Dados 2026/2, tabela de pesos da seção 4 (total 10,0).',
      explanation:
        'Cada avaliação vale uma quantidade fixa de pontos (RA1 = 4, RA2 = 4, RA3 = 1, RA4 = 1) e a nota final é a soma dos pontos conquistados.',
      notes: [
        'O plano separa as três listas de atividades, mas só informa o peso total delas (2,0). Por isso o app trata as listas como uma avaliação única.',
        'Os TDEs 1 e 2 são preparatórios e não compõem a nota; a numeração segue o plano de ensino.',
        RECUPERACAO_NOTA,
      ],
    },
  },

  // ───────────────────────── Requisitos de Software ─────────────────────────
  {
    id: 'requisitos-2026-2',
    name: 'Requisitos de Software',
    teacher: 'Denise Maria Cotoman',
    semester: SEM,
    target: 7,
    finalScale: 10,
    model: 'grouped',
    groups: [
      { id: 'ra12', name: 'RA1 e RA2', share: 0.5 },
      { id: 'ra3', name: 'RA3', share: 0.5 },
    ],
    evaluations: [
      { id: 'av12', name: 'Avaliação somativa — RA1 e RA2', group: 'ra12', scale: 7, maxPoints: 3.5, description: 'Vale até 7,0 no grupo.' },
      { id: 'tde12', name: 'TDE — RA1 e RA2', group: 'ra12', scale: 3, maxPoints: 1.5, description: 'Vale até 3,0 no grupo.' },
      { id: 'av3', name: 'Avaliação somativa — RA3', group: 'ra3', scale: 7, maxPoints: 3.5, description: 'Vale até 7,0 no grupo.' },
      { id: 'tde3', name: 'TDE — RA3', group: 'ra3', scale: 3, maxPoints: 1.5, description: 'Vale até 3,0 no grupo.' },
    ],
    formula: {
      validation: 'pending',
      text: 'N_RA12 = Avaliação + TDE · N_RA3 = Avaliação + TDE · NF = (N_RA12 + N_RA3) / 2',
      source: 'Plano de Ensino — Requisitos de Software 2026/2, quadro de pesos da seção 4.',
      explanation:
        'A disciplina tem dois grupos de resultados de aprendizagem. Em cada um você soma a avaliação (até 7) e o TDE (até 3), obtendo uma nota de 0 a 10. A nota final é a média dos dois grupos.',
      notes: [
        'O quadro do plano mostra os dois grupos com Avaliação (peso 7,0) + TDE (peso 3,0), mas o cronograma fala em duas avaliações de 5,0 pontos (15/09 e 10/11) e em dois momentos de TDE (17/08 e 05/10).',
        'O plano não deixa claro se a mesma avaliação alimenta os dois grupos. O app assume uma avaliação e um TDE por grupo.',
        'O plano não define a meta de aprovação; 7,0 é o padrão do app e pode ser alterado.',
        RECUPERACAO_NOTA,
      ],
    },
  },

  // ───────────────────────── Lógica Matemática ─────────────────────────
  {
    id: 'logica-2026-2',
    name: 'Resolução de Problemas com Lógica Matemática',
    teacher: 'Eduardo Zorzo Sartoretto',
    semester: SEM,
    target: 7,
    finalScale: 10,
    model: 'weighted',
    weightsEditable: true,
    groups: [
      { id: 'ra1', name: 'RA1 · Modelagem' },
      { id: 'ra2', name: 'RA2 · Estratégias algorítmicas' },
      { id: 'ra3', name: 'RA3 · Otimização discreta' },
    ],
    // Interpretação B (fórmula escrita e valores 3,0/3,0/2,0/2,0) como padrão provisório — ver `notes` e `profiles`.
    evaluations: [
      weighted('a1', 'Avaliação Individual 1', 'ra1', 30, 'Prova escrita (TE1). Nota de 0 a 10.'),
      weighted('a2', 'Avaliação Individual 2', 'ra2', 30, 'Prova escrita (TE2). Nota de 0 a 10.'),
      weighted('tde1', 'TDE 1', 'ra2', 20, 'Análise e implementação de estratégias. Nota de 0 a 10.'),
      weighted('tde2', 'TDE 2', 'ra3', 20, 'Projeto de otimização discreta. Nota de 0 a 10.'),
    ],
    formula: {
      validation: 'pending',
      text: 'NS = A1×0,30 + A2×0,30 + TDE1×0,20 + TDE2×0,20  (cabeçalho do quadro: 30% / 30% / 10% / 30%)',
      source: 'Plano de Ensino — Resolução de Problemas com Lógica Matemática 2026/2, seção 4.1.',
      explanation:
        'Cada avaliação recebe nota de 0 a 10 e tem um peso sobre a nota final. A nota final é a soma de cada nota multiplicada pelo seu peso.',
      notes: [
        'O próprio plano se contradiz: o cabeçalho do quadro indica pesos 30%, 30%, 10% e 30%, mas a fórmula escrita usa 0,30, 0,30, 0,20 e 0,20 (e os valores máximos 3,0/3,0/2,0/2,0 coincidem com a fórmula).',
        'O app NÃO decidiu qual está certa: o padrão provisório usa a fórmula escrita. Use "Ajustar pesos" para escolher a outra interpretação ou digitar os pesos corretos.',
        'No cronograma, o TDE 2 aparece vinculado ao RA2 e, na avaliação, ao RA3; isso não altera o cálculo.',
        RECUPERACAO_NOTA,
      ],
      profiles: [
        { id: 'formula', label: 'Fórmula escrita (30 / 30 / 20 / 20)', percents: { a1: 30, a2: 30, tde1: 20, tde2: 20 } },
        { id: 'cabecalho', label: 'Cabeçalho do quadro (30 / 30 / 10 / 30)', percents: { a1: 30, a2: 30, tde1: 10, tde2: 30 } },
      ],
      defaultProfile: 'formula',
    },
  },

  // ───────────────────────── Conectividade e Sistemas Ciberfísicos ─────────────────────────
  {
    id: 'conectividade-2026-2',
    name: 'Conectividade e Sistemas Ciberfísicos',
    teacher: 'Javan Ataíde de Oliveira Júnior',
    semester: SEM,
    target: 7,
    finalScale: 10,
    model: 'weighted',
    weightsEditable: true,
    groups: [
      { id: 'ra1', name: 'RA1 · Comunicação embarcada' },
      { id: 'ra2', name: 'RA2 · Redes e IoT' },
      { id: 'tde', name: 'Projeto final' },
    ],
    evaluations: [
      weighted('as1', 'Avaliação Somativa 1 (RA1)', 'ra1', 20, 'Prova Teórica 1. Nota de 0 a 10.'),
      weighted('as2', 'Avaliação Somativa 2 (RA2)', 'ra2', 20, 'Prova Teórica 2. Nota de 0 a 10.'),
      weighted('l1', 'Laboratório 1 (RA1)', 'ra1', 20, 'Projeto integrador com ESP32. Nota de 0 a 10.'),
      weighted('l2', 'Laboratório 2 (RA2)', 'ra2', 20, 'Laboratório de redes. Nota de 0 a 10.'),
      weighted('tde', 'Projeto Final (TDE)', 'tde', 20, 'Pré-projeto e protótipo funcional. Nota de 0 a 10.'),
    ],
    formula: {
      validation: 'pending',
      text: 'NF = 4×(AS1+AS2)/2 + 4×(L1+L2)/2 + 2×NTDE',
      source: 'Plano de Ensino — Conectividade e Sistemas Ciberfísicos 2026/2, Tabela 1 da seção 4.',
      explanation:
        'A nota final combina três componentes: avaliações somativas (peso 4), laboratórios (peso 4) e projeto final (peso 2). Dentro de cada componente tira-se a média. Com notas de 0 a 10, isso equivale a 20% para cada um dos cinco instrumentos.',
      notes: [
        'A fórmula escrita soma até 100 se as notas forem de 0 a 10. O app assume notas de 0 a 10 e divide o resultado por 10 (pesos 4 / 4 / 2 de um total de 10). Confirme essa escala.',
        'As fórmulas resumidas do plano usam siglas diferentes (PT, AS, SEM). O app não cria nenhum componente de seminários e assume que "Prova Teórica" equivale a "Avaliação Somativa".',
        'A recuperação (NRA_final = max(NRA, REC) quando NRA < 7,0) não é calculada: o plano não define como a nota de cada RA é formada a partir dos instrumentos.',
        RECUPERACAO_NOTA,
      ],
    },
  },
];
