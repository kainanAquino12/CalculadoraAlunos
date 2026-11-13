import { TestBed } from '@angular/core/testing';
import { STORAGE_KEY } from './storage.service';
import { SubjectService } from './subject.service';

const WEB = 'dev-web-2026-2';
const LOGICA = 'logica-2026-2';

/** Simula fechar e abrir o navegador: nova instância dos serviços lendo o mesmo localStorage. */
function reload(): SubjectService {
  TestBed.resetTestingModule();
  return TestBed.inject(SubjectService);
}

describe('SubjectService (persistência)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('salva a nota automaticamente e restaura depois de recarregar', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(WEB, 'prova1', 1.5);
    svc.setGrade(WEB, 'tde1', 0); // zero precisa ser preservado
    expect(localStorage.getItem(STORAGE_KEY)).toContain('prova1');

    const again = reload();
    expect(again.gradesOf(WEB)['prova1']).toBe(1.5);
    expect(again.gradesOf(WEB)['tde1']).toBe(0);
    expect(again.summaries()[WEB].accumulated).toBeCloseTo(1.5);
    expect(again.summaries()[WEB].doneCount).toBe(2);
  });

  it('limpar um campo volta a ser pendente', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(WEB, 'prova1', 2);
    svc.setGrade(WEB, 'prova1', null);
    expect(reload().gradesOf(WEB)['prova1']).toBeUndefined();
  });

  it('simulações nunca são gravadas como notas reais', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setSimulation(WEB, 'prova2', 1.5);
    expect(svc.gradesOf(WEB)['prova2']).toBeUndefined();
    expect(reload().simulatedOf(WEB)['prova2']).toBeUndefined();
  });

  it('lançar a nota real remove a simulação daquela avaliação', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setSimulation(WEB, 'prova2', 1);
    svc.setGrade(WEB, 'prova2', 0.5);
    expect(svc.simulatedOf(WEB)['prova2']).toBeUndefined();
  });

  it('zerar notas só afeta a disciplina escolhida', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(WEB, 'prova1', 2);
    svc.setGrade('arq-bd-2026-2', 'prova1', 1);
    svc.resetGrades(WEB);
    const again = reload();
    expect(again.gradesOf(WEB)).toEqual({});
    expect(again.gradesOf('arq-bd-2026-2')['prova1']).toBe(1);
  });

  it('meta personalizada persiste', () => {
    TestBed.inject(SubjectService).setTarget(WEB, 6);
    expect(reload().findSubject(WEB)!.target).toBe(6);
  });

  it('pesos inválidos (soma ≠ 100%) são recusados e as notas continuam intactas', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(LOGICA, 'a1', 8);
    expect(svc.setWeights(LOGICA, { a1: 30, a2: 30, tde1: 30, tde2: 30 })).toContain('100%');
    expect(svc.setWeights(LOGICA, { a1: -10, a2: 60, tde1: 25, tde2: 25 })).toContain('negativos');
    expect(svc.findSubject(LOGICA)!.weightsCustomized).toBe(false);
    expect(svc.gradesOf(LOGICA)['a1']).toBe(8);
  });

  it('pesos válidos alteram o cálculo e podem ser restaurados', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(LOGICA, 'tde2', 10);
    expect(svc.summaries()[LOGICA].accumulated).toBeCloseTo(2); // 20% padrão
    expect(svc.setWeights(LOGICA, { a1: 30, a2: 30, tde1: 10, tde2: 30 })).toBeNull();
    const again = reload();
    expect(again.summaries()[LOGICA].accumulated).toBeCloseTo(3);
    again.setWeights(LOGICA, null);
    expect(again.summaries()[LOGICA].accumulated).toBeCloseTo(2);
  });

  it('confirmar a fórmula remove o status provisório', () => {
    const svc = TestBed.inject(SubjectService);
    expect(svc.findSubject(LOGICA)!.provisional).toBe(true);
    svc.setConfirmed(LOGICA, true);
    expect(reload().findSubject(LOGICA)!.provisional).toBe(false);
  });

  it('backup exportado e importado reproduz os dados', () => {
    const svc = TestBed.inject(SubjectService);
    svc.setGrade(WEB, 'prova1', 1.25);
    const backup = svc.exportBackup();
    localStorage.clear();
    const fresh = reload();
    expect(fresh.gradesOf(WEB)).toEqual({});
    fresh.importBackup(backup);
    expect(fresh.gradesOf(WEB)['prova1']).toBe(1.25);
    expect(() => fresh.importBackup('{"qualquer":"coisa"}')).toThrowError(/backup válido/);
    expect(fresh.gradesOf(WEB)['prova1']).toBe(1.25); // importação inválida não apaga nada
  });

  it('dados corrompidos no localStorage não derrubam o app', () => {
    localStorage.setItem(STORAGE_KEY, '{não é json');
    expect(TestBed.inject(SubjectService).subjects().length).toBe(5);
    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, grades: { [WEB]: { prova1: 'abc', tde1: -3, prova2: 1 } } }));
    expect(TestBed.inject(SubjectService).gradesOf(WEB)).toEqual({ prova2: 1 });
  });

  it('disciplina personalizada pode ser adicionada, sobrevive ao reload e pode ser excluída', () => {
    const svc = TestBed.inject(SubjectService);
    svc.addSubject({
      id: 'custom-x',
      name: 'Minha matéria',
      semester: '2026/2',
      target: 6,
      finalScale: 10,
      model: 'direct',
      evaluations: [{ id: 'av1', name: 'P1', scale: 10, maxPoints: 10 }],
      formula: { validation: 'confirmed', text: '', source: '', explanation: '', notes: [] },
    });
    svc.setGrade('custom-x', 'av1', 8);
    const again = reload();
    expect(again.findSubject('custom-x')!.custom).toBe(true);
    expect(again.summaries()['custom-x'].targetReached).toBe(true);
    again.removeSubject('custom-x');
    expect(reload().findSubject('custom-x')).toBeUndefined();
  });
});

describe('SubjectService (períodos)', () => {
  const custom = (id: string, semester: string) => ({
    id,
    name: `Matéria ${semester}`,
    semester,
    target: 7,
    finalScale: 10,
    model: 'direct' as const,
    evaluations: [{ id: 'av1', name: 'P1', scale: 10, maxPoints: 10 }],
    formula: { validation: 'confirmed' as const, text: '', source: '', explanation: '', notes: [] },
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('abre no período atual e oferece o atual + 2 anteriores, do mais novo ao mais antigo', () => {
    const svc = TestBed.inject(SubjectService);
    expect(svc.selectedSemester()).toBe('2026/2');
    expect(svc.semesters()).toEqual(['2026/2', '2026/1', '2025/2']);
    expect(svc.visibleSubjects().length).toBe(5);
  });

  it('períodos anteriores a 2026/1 viram virada de ano corretamente', async () => {
    const { previousSemesters } = await import('./subject.service');
    expect(previousSemesters('2026/2', 3)).toEqual(['2026/1', '2025/2', '2025/1']);
    expect(previousSemesters('lixo', 2)).toEqual([]);
  });

  it('trocar de período filtra as matérias e a escolha é lembrada', () => {
    const svc = TestBed.inject(SubjectService);
    svc.selectSemester('2026/1');
    expect(svc.visibleSubjects()).toEqual([]);
    TestBed.resetTestingModule();
    expect(TestBed.inject(SubjectService).selectedSemester()).toBe('2026/1');
  });

  it('matéria personalizada aparece só no seu período e cria o período na lista', () => {
    const svc = TestBed.inject(SubjectService);
    svc.addSubject(custom('c1', '2024/2'));
    expect(svc.semesters()).toEqual(['2026/2', '2026/1', '2025/2', '2024/2']);
    svc.selectSemester('2024/2');
    expect(svc.visibleSubjects().map((s) => s.id)).toEqual(['c1']);
    svc.selectSemester('2026/2');
    expect(svc.visibleSubjects().some((s) => s.id === 'c1')).toBe(false);
  });

  it('ignora valor salvo inválido e volta ao período atual', () => {
    localStorage.setItem('notacerta:period', 'qualquer coisa');
    expect(TestBed.inject(SubjectService).selectedSemester()).toBe('2026/2');
  });

  it('as notas de um período não se misturam com as de outro', () => {
    const svc = TestBed.inject(SubjectService);
    svc.addSubject(custom('c1', '2025/2'));
    svc.setGrade('c1', 'av1', 9);
    svc.setGrade(WEB, 'prova1', 1);
    expect(svc.summaries()['c1'].accumulated).toBe(9);
    expect(svc.summaries()[WEB].accumulated).toBeCloseTo(1);
  });
});
