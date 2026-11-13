import { DEFAULT_SUBJECTS } from '../data/default-subjects';
import { Evaluation } from '../models/evaluation.model';
import { Subject } from '../models/subject.model';
import { GradeCalculatorService } from './grade-calculator.service';

const calc = new GradeCalculatorService();

const formula = { validation: 'confirmed' as const, text: '', source: '', explanation: '', notes: [] };

function directSubject(maxes: number[], target = 7): Subject {
  const evaluations: Evaluation[] = maxes.map((m, i) => ({ id: `e${i + 1}`, name: `Aval ${i + 1}`, scale: m, maxPoints: m }));
  return { id: 's', name: 'S', semester: '2026/2', target, finalScale: maxes.reduce((a, b) => a + b, 0), model: 'direct', evaluations, formula };
}

function weightedSubject(weights: number[], target = 7): Subject {
  const evaluations: Evaluation[] = weights.map((w, i) => ({ id: `e${i + 1}`, name: `Aval ${i + 1}`, scale: 10, weight: w, maxPoints: (w * 10) / 100 }));
  return { id: 'w', name: 'W', semester: '2026/2', target, finalScale: 10, model: 'weighted', evaluations, formula };
}

const subject = (id: string): Subject => DEFAULT_SUBJECTS.find((s) => s.id === id)!;

describe('GradeCalculatorService', () => {
  describe('soma direta', () => {
    const s = directSubject([2, 2, 1.5, 1, 1.5, 2]);

    it('todas pendentes: nada acumulado, tudo disponível', () => {
      const r = calc.summarize(s, {});
      expect(r.accumulated).toBe(0);
      expect(r.pendingMax).toBeCloseTo(10);
      expect(r.status).toBe('in-progress');
      expect(r.requiredShare).toBeCloseTo(0.7);
    });

    it('todas zero: nota zero concluída e meta não atingida', () => {
      const r = calc.summarize(s, { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0 });
      expect(r.accumulated).toBe(0);
      expect(r.allDone).toBe(true);
      expect(r.status).toBe('completed');
      expect(r.targetReached).toBe(false);
    });

    it('zero é diferente de pendente', () => {
      const r = calc.summarize(s, { e1: 0 });
      expect(r.doneCount).toBe(1);
      expect(r.pendingMax).toBeCloseTo(8);
      expect(calc.summarize(s, { e1: null }).doneCount).toBe(0);
      expect(calc.summarize(s, { e1: undefined }).doneCount).toBe(0);
    });

    it('parcial: acumula e calcula o que falta (exemplo do plano de Desenvolvimento Web)', () => {
      const r = calc.summarize(s, { e1: 1.5, e2: 1.8 });
      expect(r.accumulated).toBeCloseTo(3.3);
      expect(r.missing).toBeCloseTo(3.7);
      // 1,5 + 1,0 + 1,5 + 2,0: os 0,7 não conquistados nas avaliações já feitas não voltam.
      expect(r.pendingMax).toBeCloseTo(6);
      expect(r.requiredShare).toBeCloseTo(3.7 / 6);
    });

    it('meta atingida exatamente', () => {
      const r = calc.summarize(s, { e1: 2, e2: 2, e3: 1.5, e4: 1.5 - 0.5 });
      expect(r.accumulated).toBeCloseTo(6.5);
      const exact = calc.summarize(s, { e1: 2, e2: 2, e3: 1.5, e4: 0.5, e5: 1 });
      expect(exact.accumulated).toBeCloseTo(7);
      expect(exact.targetReached).toBe(true);
      expect(exact.status).toBe('target-reached');
      expect(exact.missing).toBe(0);
    });

    it('meta superada', () => {
      const r = calc.summarize(s, { e1: 2, e2: 2, e3: 1.5, e4: 1, e5: 1.5, e6: 2 });
      expect(r.accumulated).toBeCloseTo(10);
      expect(r.status).toBe('completed');
      expect(r.targetReached).toBe(true);
    });

    it('meta matematicamente impossível', () => {
      const r = calc.summarize(s, { e1: 0, e2: 0, e3: 0, e4: 0 }); // restam 3,5 pontos
      expect(r.maxPossible).toBeCloseTo(3.5);
      expect(r.achievable).toBe(false);
      expect(r.status).toBe('out-of-reach');
      expect(r.requiredShare).toBeNull();
      expect(r.pending.every((p) => p.requiredGrade === null)).toBe(true);
      expect(r.scenarios).toEqual([]);
    });

    it('limite exato: ainda é possível tirando nota máxima no resto', () => {
      const r = calc.summarize(directSubject([5, 5]), { e1: 2 }); // 2 + 5 = 7
      expect(r.achievable).toBe(true);
      expect(r.requiredShare).toBeCloseTo(1);
      expect(r.pending[0].requiredGrade).toBe(5);
    });

    it('uma única avaliação pendente: nota exata', () => {
      const r = calc.summarize(s, { e1: 2, e2: 2, e3: 1.5, e4: 0.5, e6: 0.5 }); // 6,5 → falta 0,5 em e5 (vale 1,5)
      expect(r.pending).toHaveLength(1);
      expect(r.pending[0].evaluation.id).toBe('e5');
      expect(r.pending[0].requiredGrade).toBe(0.5);
      expect(r.scenarios).toEqual([]);
    });

    it('várias pendentes: divisão proporcional e cenários que realmente fecham a meta', () => {
      const r = calc.summarize(s, { e1: 1.5, e2: 1.8 });
      const share = 3.7 / 6;
      const e3 = r.pending.find((p) => p.evaluation.id === 'e3')!;
      expect(e3.requiredGrade).toBeCloseTo(Math.ceil(1.5 * share * 100) / 100, 6);
      expect(r.scenarios.length).toBeGreaterThan(0);
      for (const sc of r.scenarios) {
        let total = r.accumulated;
        for (const it of sc.items) {
          const ev = s.evaluations.find((e) => e.id === it.evaluationId)!;
          expect(it.grade).toBeGreaterThanOrEqual(0);
          expect(it.grade).toBeLessThanOrEqual(ev.scale);
          total += calc.pointsFor(ev, it.grade);
        }
        expect(total).toBeGreaterThanOrEqual(7 - 1e-9);
      }
    });

    it('pesos/valores máximos diferentes entre avaliações', () => {
      const r = calc.summarize(directSubject([1, 4, 5]), { e3: 2 });
      expect(r.pendingMax).toBe(5);
      expect(r.requiredShare).toBeCloseTo(1);
      expect(r.pending.map((p) => p.requiredGrade)).toEqual([1, 4]);
    });
  });

  describe('média ponderada', () => {
    const s = weightedSubject([30, 30, 20, 20]);

    it('converte pesos percentuais em contribuição', () => {
      const r = calc.summarize(s, { e1: 8, e2: 6 });
      expect(r.accumulated).toBeCloseTo(8 * 0.3 + 6 * 0.3);
    });

    it('nota mínima na última avaliação considera o peso', () => {
      const r = calc.summarize(s, { e1: 8, e2: 6, e3: 7 }); // 2,4 + 1,8 + 1,4 = 5,6 → falta 1,4 em e4 (peso 0,2)
      expect(r.pending).toHaveLength(1);
      expect(r.pending[0].requiredGrade).toBe(7);
    });

    it('nota necessária acima do máximo vira impossibilidade, não nota inválida', () => {
      const r = calc.summarize(s, { e1: 0, e2: 0, e3: 0 }); // máx. possível = 2,0
      expect(r.achievable).toBe(false);
      expect(r.pending[0].requiredGrade).toBeNull();
    });

    it('arredonda a exigência para cima, nunca para baixo', () => {
      // 5 avaliações iguais, alvo 7: após 4 notas 7,0 faltam 7,0 pontos? usa caso com dízima.
      const t = weightedSubject([30, 30, 40], 7);
      const r = calc.summarize(t, { e1: 5, e2: 5 }); // 3 pontos; falta 4 em e3 (vale 4) → 10 exato
      expect(r.pending[0].requiredGrade).toBe(10);
      const u = weightedSubject([30, 70], 7);
      const q = calc.summarize(u, { e1: 6 }); // 1,8 → falta 5,2 em e2 (7,0) → 7,428571… → 7,43
      expect(q.pending[0].requiredGrade).toBe(7.43);
      const check = q.accumulated + calc.pointsFor(u.evaluations[1], q.pending[0].requiredGrade!);
      expect(check).toBeGreaterThanOrEqual(7);
    });

    it('erros de ponto flutuante (0,1 + 0,2) não impedem atingir a meta', () => {
      const t = directSubject([0.1, 0.2, 9.7], 0.3);
      const r = calc.summarize(t, { e1: 0.1, e2: 0.2 });
      expect(r.targetReached).toBe(true);
      expect(Number.isFinite(r.accumulated)).toBe(true);
    });

    it('nunca produz NaN/Infinity com avaliações de valor zero ou sem avaliações', () => {
      const z = directSubject([0, 5]);
      const r = calc.summarize(z, { e2: 1 });
      expect(Number.isFinite(r.accumulated)).toBe(true);
      const empty = calc.summarize({ ...directSubject([]), evaluations: [] }, {});
      expect(empty.allDone).toBe(false);
      expect(Number.isFinite(empty.missing)).toBe(true);
    });
  });

  describe('simulação', () => {
    const s = directSubject([2, 2, 3, 3]);

    it('notas simuladas projetam a nota final sem mexer nas reais', () => {
      const real = { e1: 1 };
      const projected = calc.project(s, real, { e2: 2, e3: 3 });
      expect(projected.accumulated).toBeCloseTo(6);
      expect(real).toEqual({ e1: 1 });
      expect(calc.summarize(s, real).accumulated).toBeCloseTo(1);
    });

    it('nota real prevalece sobre a simulada', () => {
      const merged = calc.merge({ e1: 2 }, { e1: 0, e2: 1 });
      expect(merged).toEqual({ e1: 2, e2: 1 });
    });

    it('depois de simular, recalcula o que falta nas restantes', () => {
      const p = calc.project(s, { e1: 1 }, { e2: 1 }); // 2 pontos; faltam 5 de 6
      expect(p.pending).toHaveLength(2);
      expect(p.requiredShare).toBeCloseTo(5 / 6);
    });
  });

  describe('validação de entrada', () => {
    const ev = { scale: 2 };
    it('vazio é pendente', () => expect(calc.parseGrade(ev, '  ')).toEqual({ ok: true, value: null }));
    it('zero é nota', () => expect(calc.parseGrade(ev, '0')).toEqual({ ok: true, value: 0 }));
    it('aceita vírgula e ponto', () => {
      expect(calc.parseGrade(ev, '1,5')).toEqual({ ok: true, value: 1.5 });
      expect(calc.parseGrade(ev, '1.5')).toEqual({ ok: true, value: 1.5 });
    });
    it('rejeita negativo, texto e acima do máximo com mensagem amigável', () => {
      expect(calc.parseGrade(ev, '-1')).toEqual({ ok: false, error: 'A nota não pode ser negativa.' });
      expect(calc.parseGrade(ev, 'abc').ok).toBe(false);
      expect(calc.parseGrade(ev, '2,01')).toEqual({ ok: false, error: 'Essa avaliação vale no máximo 2,00.' });
      expect(calc.parseGrade(ev, '2')).toEqual({ ok: true, value: 2 });
    });
  });

  describe('disciplinas cadastradas', () => {
    it('Desenvolvimento Web e Arquitetura de BD somam 10 pontos e são fórmulas confirmadas', () => {
      for (const id of ['dev-web-2026-2', 'arq-bd-2026-2']) {
        const s = subject(id);
        expect(s.evaluations.reduce((a, e) => a + e.maxPoints, 0)).toBeCloseTo(10);
        expect(s.formula.validation).toBe('confirmed');
      }
    });

    it('Desenvolvimento Web: pontos por RA (4 / 4 / 2)', () => {
      const r = calc.summarize(subject('dev-web-2026-2'), { prova1: 2, tde1: 2, prova2: 1.5, listas: 1, angular: 1.5, doc: 2 });
      expect(r.groups.map((g) => g.maxPoints)).toEqual([4, 4, 2]);
      expect(r.accumulated).toBeCloseTo(10);
    });

    it('Arquitetura de BD: pontos por RA (4 / 4 / 1 / 1)', () => {
      const r = calc.summarize(subject('arq-bd-2026-2'), {});
      expect(r.groups.map((g) => g.maxPoints)).toEqual([4, 4, 1, 1]);
    });

    it('Requisitos: média dos dois grupos, cada um com avaliação (7) + TDE (3) — fórmula pendente', () => {
      const s = subject('requisitos-2026-2');
      expect(s.formula.validation).toBe('pending');
      const r = calc.summarize(s, { av12: 7, tde12: 3, av3: 3.5, tde3: 1.5 });
      expect(r.groups[0].grade).toBeCloseTo(10);
      expect(r.groups[1].grade).toBeCloseTo(5);
      expect(r.accumulated).toBeCloseTo(7.5); // (10 + 5) / 2
    });

    it('Lógica Matemática: pesos alternativos somam 100% e a divergência está sinalizada', () => {
      const s = subject('logica-2026-2');
      expect(s.formula.validation).toBe('pending');
      for (const p of s.formula.profiles!) {
        expect(Object.values(p.percents).reduce((a, b) => a + b, 0)).toBe(100);
      }
      const r = calc.summarize(s, { a1: 10, a2: 10, tde1: 10, tde2: 10 });
      expect(r.accumulated).toBeCloseTo(10);
    });

    it('Conectividade: NF = 4·(AS1+AS2)/2 + 4·(L1+L2)/2 + 2·NTDE normalizada para 0–10', () => {
      const s = subject('conectividade-2026-2');
      const AS1 = 8, AS2 = 6, L1 = 9, L2 = 7, NTDE = 10;
      const esperado = (4 * ((AS1 + AS2) / 2) + 4 * ((L1 + L2) / 2) + 2 * NTDE) / 10;
      const r = calc.summarize(s, { as1: AS1, as2: AS2, l1: L1, l2: L2, tde: NTDE });
      expect(r.accumulated).toBeCloseTo(esperado);
      expect(s.formula.validation).toBe('pending');
    });

    it('recuperação não é aplicada: nunca existe status de recuperação sem regra confirmada', () => {
      const r = calc.summarize(subject('conectividade-2026-2'), { as1: 0, as2: 0, l1: 0, l2: 0, tde: 0 });
      expect(['completed', 'out-of-reach']).toContain(r.status);
    });
  });
});
