import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { CanvasImportComponent } from '../components/canvas-import/canvas-import';
import {
  CanvasAssignment,
  CanvasError,
  CanvasService,
  effectiveMax,
  gradeFromAssignments,
  nameScore,
  normalizeHost,
  parseNextLink,
  suggestAssignmentIds,
  weightFromName,
} from './canvas.service';
import { SubjectService } from './subject.service';

const assignment = (over: Partial<CanvasAssignment> = {}): CanvasAssignment => ({ id: 1, name: 'Prova 1', pointsPossible: 10, score: 8, graded: true, ...over });

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

describe('funções do Canvas', () => {
  it('normalizeHost aceita endereço com ou sem https e rejeita lixo', () => {
    expect(normalizeHost('pucpr.instructure.com')).toBe('pucpr.instructure.com');
    expect(normalizeHost('  HTTPS://PucPR.Instructure.com/courses/1?x=2 ')).toBe('pucpr.instructure.com');
    expect(normalizeHost('ava.escola.edu.br')).toBe('ava.escola.edu.br');
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('sem ponto')).toBeNull();
    expect(normalizeHost('javascript:alert(1)')).toBeNull();
  });

  it('parseNextLink lê a próxima página do cabeçalho Link', () => {
    const link = '<https://x.instructure.com/api/v1/courses?page=1&per_page=100>; rel="current", <https://x.instructure.com/api/v1/courses?page=2&per_page=100>; rel="next", <https://x.instructure.com/api/v1/courses?page=3>; rel="last"';
    expect(parseNextLink(link)).toBe('/api/v1/courses?page=2&per_page=100');
    expect(parseNextLink('<https://x/api/v1/courses?page=1>; rel="current"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });

  it('nameScore ignora acentos, maiúsculas e palavras de ligação', () => {
    expect(nameScore('TDE 1 — Site estático', 'tde 1 - SITE ESTATICO individual')).toBe(1);
    expect(nameScore('Prova 1', 'Prova 2')).toBe(0.5); // o número conta
    expect(nameScore('', 'qualquer')).toBe(0);
  });

  it('suggestAssignmentIds só sugere quando todas as palavras batem', () => {
    const list = [assignment({ id: 1, name: 'Prova 1' }), assignment({ id: 2, name: 'Prova 2' }), assignment({ id: 3, name: 'Lista de exercícios' })];
    expect(suggestAssignmentIds('Prova 1', list)).toEqual([1]);
    expect(suggestAssignmentIds('Projeto Angular', list)).toEqual([]);
  });

  describe('gradeFromAssignments', () => {
    it('converte para a escala da avaliação (8/10 numa prova que vale 2 → 1,60)', () => {
      expect(gradeFromAssignments({ scale: 2 }, [assignment()])).toMatchObject({ grade: 1.6 });
    });

    it('várias atividades somam pontos (listas)', () => {
      const r = gradeFromAssignments({ scale: 2 }, [assignment({ score: 5, pointsPossible: 10 }), assignment({ id: 2, score: 10, pointsPossible: 10 })]);
      expect(r).toMatchObject({ grade: 1.5 }); // 15 de 20
    });

    it('zero publicado é nota zero (não pendente)', () => {
      expect(gradeFromAssignments({ scale: 2 }, [assignment({ score: 0 })])).toMatchObject({ grade: 0 });
    });

    it('não devolve nota se alguma atividade ainda não foi corrigida', () => {
      const r = gradeFromAssignments({ scale: 2 }, [assignment(), assignment({ id: 2, score: null, graded: false })]);
      expect(r.grade).toBeNull();
    });

    it('não passa do máximo da avaliação (pontos extras) e evita divisão por zero', () => {
      expect(gradeFromAssignments({ scale: 2 }, [assignment({ score: 12, pointsPossible: 10 })])).toMatchObject({ grade: 2 });
      expect(gradeFromAssignments({ scale: 2 }, [assignment({ pointsPossible: 0 })]).grade).toBeNull();
      expect(gradeFromAssignments({ scale: 2 }, []).grade).toBeNull();
    });
  });
});

/** Simula o site: a ponte `/api/canvas?p=...` responde conforme o caminho do Canvas pedido. */
function mockBridge(routes: (path: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (!u.startsWith('/api/canvas?p=')) throw new TypeError('Failed to fetch'); // chamada direta: bloqueada por CORS
    return routes(decodeURIComponent(u.split('?p=')[1]), init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CanvasService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('conecta pela ponte do site e, por padrão, guarda o token só na sessão (some ao fechar a aba)', async () => {
    const fetchMock = mockBridge(() => json({ name: 'Kainan' }));
    const canvas = TestBed.inject(CanvasService);

    expect(await canvas.connect('https://pucpr.instructure.com/profile/settings', '  segredo  ', false)).toBe('Kainan');
    expect(canvas.connected).toBe(true);
    expect(canvas.connection()?.host).toBe('pucpr.instructure.com'); // aceitou a URL colada inteira
    expect(sessionStorage.getItem('notacerta:canvas')).toContain('segredo');
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/canvas?p=%2Fapi%2Fv1%2Fusers%2Fself');
    expect((init as RequestInit).headers).toMatchObject({ 'x-canvas-host': 'pucpr.instructure.com', 'x-canvas-token': 'segredo' }); // token sem espaços
  });

  it('"lembrar neste aparelho" guarda no localStorage; desconectar apaga tudo', async () => {
    mockBridge(() => json({ name: 'K' }));
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 'abc', true);
    expect(localStorage.getItem('notacerta:canvas')).toContain('abc');
    expect(sessionStorage.getItem('notacerta:canvas')).toBeNull();

    canvas.disconnect();
    expect(canvas.connected).toBe(false);
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();
  });

  it('restaura a conexão salva depois de recarregar', async () => {
    mockBridge(() => json({ name: 'K' }));
    await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 'abc', true);
    TestBed.resetTestingModule();
    expect(TestBed.inject(CanvasService).connection()?.host).toBe('pucpr.instructure.com');
  });

  it('token recusado (401) vira mensagem amigável e não deixa conexão salva', async () => {
    mockBridge(() => json({}, { status: 401 }));
    const canvas = TestBed.inject(CanvasService);
    await expect(canvas.connect('pucpr.instructure.com', 'ruim', true)).rejects.toThrowError(/recusou o token/);
    expect(canvas.connected).toBe(false);
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();
  });

  it('repassa o motivo quando a ponte recusa (ex.: host não permitido)', async () => {
    mockBridge(() => json({ error: 'Endereço do AVA não permitido.' }, { status: 400 }));
    await expect(TestBed.inject(CanvasService).connect('escola.edu.br', 't', false)).rejects.toThrowError(/não permitido/);
  });

  it('valida endereço e token antes de qualquer chamada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const canvas = TestBed.inject(CanvasService);
    await expect(canvas.connect('???', 'x', false)).rejects.toBeInstanceOf(CanvasError);
    await expect(canvas.connect('pucpr.instructure.com', '   ', false)).rejects.toThrowError(/Cole o token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('segue a paginação (cabeçalho Link) ao listar disciplinas', async () => {
    const fetchMock = mockBridge((path) => {
      if (path.includes('users/self')) return json({ name: 'K' });
      if (path.includes('page=2')) return json([{ id: 2, name: 'Banco' }, { id: 3 }]); // sem nome (acesso restrito): ignorada
      return json([{ id: 1, name: 'Web' }], { headers: { 'Content-Type': 'application/json', Link: '<https://pucpr.instructure.com/api/v1/courses?page=2>; rel="next"' } });
    });
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 't', false);
    expect(await canvas.courses()).toEqual([
      { id: 1, name: 'Web' },
      { id: 2, name: 'Banco' },
    ]);
    expect(decodeURIComponent(String(fetchMock.mock.calls[2][0]))).toContain('/api/v1/courses?page=2');
  });

  it('só considera "corrigida" a atividade com nota publicada e não dispensada', async () => {
    mockBridge((path) =>
      path.includes('users/self')
        ? json({ name: 'K' })
        : json([
            { id: 1, name: 'A', points_possible: 10, submission: { score: 9, workflow_state: 'graded' } },
            { id: 2, name: 'B', points_possible: 10, submission: { score: null, workflow_state: 'submitted' } },
            { id: 3, name: 'C', points_possible: 10, submission: { score: 10, workflow_state: 'graded', excused: true } },
            { id: 4, name: 'D', points_possible: 10 },
          ]),
    );
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 't', false);
    expect((await canvas.assignments(7)).map((a) => a.graded)).toEqual([true, false, false, false]);
  });

  it('sem a ponte (o site devolve a página HTML do app), tenta direto e explica o bloqueio do navegador', async () => {
    // Era o que acontecia no `npm start` antigo: /api/canvas caía na página do app e a chamada direta é barrada por CORS.
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/canvas')) return new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false)).rejects.toThrowError(/bloqueia consultas diretas.*ponte/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // ponte, depois direto
  });

  it('se a ponte não existir mas o AVA aceitar chamada direta (CORS liberado), funciona direto', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/canvas')) return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/html' } });
      return json({ name: 'Direto' });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 'tok', false)).toBe('Direto');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://pucpr.instructure.com/api/v1/users/self');
  });

  it('resposta que não é JSON vira mensagem amigável (nunca "erro genérico")', async () => {
    mockBridge(() => new Response('<html>manutenção</html>', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false)).rejects.toThrowError(/resposta inesperada/);
  });
});

describe('CanvasImportComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());

  function mockCanvas() {
    mockBridge((path) => {
      if (path.includes('/users/self')) return json({ name: 'K' });
      if (path.includes('/assignments'))
        return json([
          { id: 10, name: 'Prova 1', points_possible: 10, submission: { score: 8, workflow_state: 'graded' } },
          { id: 11, name: 'TDE 1 - Site estático', points_possible: 10, submission: { score: null, workflow_state: 'unsubmitted' } },
        ]);
      return json([{ id: 1, name: 'DESENVOLVIMENTO WEB - 2026/2' }, { id: 2, name: 'Outra matéria' }]);
    });
  }

  it('sugere o curso e as atividades pelo nome, mostra a nota convertida e aplica só onde está vazio', async () => {
    mockCanvas();
    await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false);
    const svc = TestBed.inject(SubjectService);
    svc.setGrade('dev-web-2026-2', 'angular', 1); // já lançada: não pode ser trocada

    const fixture = TestBed.createComponent(CanvasImportComponent);
    fixture.componentRef.setInput('subject', svc.findSubject('dev-web-2026-2'));
    fixture.componentRef.setInput('grades', svc.gradesOf('dev-web-2026-2'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Buscar no AVA'))!.click();
    await new Promise((r) => setTimeout(r, 20));
    await fixture.whenStable();

    const rows = [...root.querySelectorAll('.nc-import-row')];
    expect(rows.length).toBe(6);
    const text = (name: string) => rows.find((r) => r.textContent!.includes(name))!.textContent!.replace(/\s+/g, ' ');
    expect(text('Prova 1')).toContain('1,60 de 2,00'); // 8/10 × 2
    expect(text('TDE 1 — Site estático')).toContain('ainda não publicou'); // atividade sem nota
    expect(text('Projeto Angular')).not.toContain('de 2,00');

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Aplicar'))!.click();
    await fixture.whenStable();
    expect(svc.gradesOf('dev-web-2026-2')['prova1']).toBe(1.6);
    expect(svc.gradesOf('dev-web-2026-2')['tde1']).toBeUndefined(); // não corrigida no AVA: continua pendente
    expect(svc.gradesOf('dev-web-2026-2')['angular']).toBe(1); // intacta
    expect(TestBed.inject(CanvasService).loadLink('dev-web-2026-2')?.courseId).toBe(1); // vínculo lembrado
  });

  it('sem conexão, oferece o caminho para conectar', async () => {
    const svc = TestBed.inject(SubjectService);
    const fixture = TestBed.createComponent(CanvasImportComponent);
    fixture.componentRef.setInput('subject', svc.findSubject('dev-web-2026-2'));
    fixture.componentRef.setInput('grades', {});
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Conectar ao AVA');
  });
});

describe('notas lançadas na escala do peso (caso real: Banco de Dados)', () => {
  // Exatamente como aparece no AVA: nome, "valor da atividade" e nota.
  const bd = (id: number, name: string, pointsPossible: number | null, score: number | null) => ({
    id,
    name,
    points_possible: pointsPossible,
    submission: { score, workflow_state: score === null ? 'unsubmitted' : 'graded' },
  });
  const screenshot = [
    bd(1, 'TDE 3 - Avaliativo - Peso 2,0', 2, 1.9),
    bd(2, 'Prova 1 - Peso 2,0 - 03/09/2026', 10, 1.9), // valor 10 pt, mas a nota 1,90 já está na escala do peso 2,0
    bd(3, 'Revisão', null, null),
    bd(4, 'Nota Extra PigData', 1, 1),
    bd(5, 'SQL da aula 29/09 sobre WHERE', 0, null),
    bd(6, 'TDE 4', 0, null),
    bd(7, 'Nota extra Planeta PUC', 0.5, null),
    bd(8, 'TDE 5 - Peso 2', 2, 0.4),
    bd(9, 'Atividade Banco de Dados - Dashboards', 0, null),
    bd(10, 'TDE 6 - Peso 1,0', 1, 1),
    bd(11, 'TDE 7 - Peso 1,0', 1, 1),
  ];

  it('weightFromName lê o peso do nome', () => {
    expect(weightFromName('Prova 1 - Peso 2,0 - 03/09/2026')).toBe(2);
    expect(weightFromName('TDE 5 - Peso 2')).toBe(2);
    expect(weightFromName('TDE 6 - peso: 1.5')).toBe(1.5);
    expect(weightFromName('Revisão')).toBeNull();
  });

  it('effectiveMax usa o peso do nome quando a nota cabe nele; senão, o valor da atividade', () => {
    expect(effectiveMax({ name: 'Prova 1 - Peso 2,0', score: 1.9, pointsPossible: 10 })).toBe(2);
    expect(effectiveMax({ name: 'Prova 1 - Peso 2,0', score: 8.5, pointsPossible: 10 })).toBe(10); // nota passa do peso: está na escala de 10
    expect(effectiveMax({ name: 'Prova 2', score: 8, pointsPossible: 10 })).toBe(10); // sem peso no nome
  });

  it('Prova 1 vale 1,90 de 2,00 (antes saía 0,38) e o número do peso não confunde a sugestão', () => {
    const list = screenshot.map((a) => ({ id: a.id, name: a.name, pointsPossible: a.points_possible, score: a.submission.score, graded: a.submission.score !== null }));
    expect(suggestAssignmentIds('TDE 3 — Trabalho de Modelagem', list)).toEqual([1]); // não pega "TDE 5 - Peso 3" nem "TDE 4"
    expect(suggestAssignmentIds('Prova 1 — Modelagem', list)).toEqual([2]);
    expect(suggestAssignmentIds('TDE 5 — Construção do Banco', list)).toEqual([8]);
    expect(suggestAssignmentIds('TDE 6 — Planilha de Diagnóstico', list)).toEqual([10]);
    expect(suggestAssignmentIds('TDE 7 — Relatório de Otimização', list)).toEqual([11]);
    const prova = list.find((a) => a.id === 2)!;
    expect(gradeFromAssignments({ scale: 2 }, [prova])).toMatchObject({ grade: 1.9 });
  });

  it('na tela: importa 1,90 / 1,90 / 0,40 / 1,00 / 1,00 e deixa as listas para o aluno escolher', async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    mockBridge((path) => {
      if (path.includes('/users/self')) return json({ name: 'K' });
      if (path.includes('/assignments')) return json(screenshot);
      return json([{ id: 5, name: 'ARQUITETURA DE BANCO DE DADOS - TESF-2U-N-2026/2' }]);
    });
    try {
      await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false);
      const svc = TestBed.inject(SubjectService);
      const fixture = TestBed.createComponent(CanvasImportComponent);
      fixture.componentRef.setInput('subject', svc.findSubject('arq-bd-2026-2'));
      fixture.componentRef.setInput('grades', svc.gradesOf('arq-bd-2026-2'));
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;

      [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Buscar no AVA'))!.click();
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();

      // só o cabeçalho da linha (nome da avaliação + nota convertida), sem a lista de atividades do AVA
      const line = (name: string) => [...root.querySelectorAll('.nc-import-row__head')].find((h) => h.textContent!.includes(name))!.textContent!.replace(/\s+/g, ' ');
      expect(line('Prova 1')).toContain('1,90 de 2,00');
      expect(line('TDE 3')).toContain('1,90 de 2,00');
      expect(line('TDE 5')).toContain('0,40 de 2,00');
      expect(line('TDE 6')).toContain('1,00 de 1,00');
      expect(line('TDE 7')).toContain('1,00 de 1,00');
      expect(line('Listas de Atividades')).not.toContain('de 2,00'); // sem sugestão: o aluno escolhe

      [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Aplicar 5'))!.click();
      await fixture.whenStable();
      const g = svc.gradesOf('arq-bd-2026-2');
      expect([g['prova1'], g['tde3'], g['tde5'], g['tde6'], g['tde7']]).toEqual([1.9, 1.9, 0.4, 1, 1]);
      expect(svc.summaries()['arq-bd-2026-2'].accumulated).toBeCloseTo(6.2); // 1,9 + 1,9 + 0,4 + 1 + 1
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Engenharia de Requisitos: TDE composto pela soma de atividades (caso real)', () => {
  const a = (id: number, name: string, pointsPossible: number | null, score: number | null) => ({
    id,
    name,
    points_possible: pointsPossible,
    submission: { score, workflow_state: score === null ? 'unsubmitted' : 'graded' },
  });
  // Como aparece no AVA (colunas do print).
  const ava = [
    a(1, '1 Avaliação Somativa (7,0)', 7, 5),
    a(2, '1 - TDE (3,0)', 3, 2.1),
    a(3, '2 - TDE (3,0 pts)', 3, null),
    a(4, 'Atividade de revisão (1,5 de 3,0 pts)', 1.5, 1.5),
    a(5, 'TDE - Atividade Extra 19/10', 1, 1),
    a(6, 'Exercício 09 da 1ª lista - Dashboards', 3.5, 3),
    a(7, 'Atividade avaliativa (2,0 de 3,0 pts)', 2, null),
  ];
  const list = ava.map((x) => ({ id: x.id, name: x.name, pointsPossible: x.points_possible, score: x.submission.score, graded: x.submission.score !== null }));
  const sub = () => TestBed.inject(SubjectService).findSubject('requisitos-2026-2')!;
  const ev = (id: string) => sub().evaluations.find((e) => e.id === id)!;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('acha cada coluna pela numeração do AVA (o nome genérico "TDE" não casa com tudo)', () => {
    const ids = (id: string) => suggestAssignmentIds(ev(id).name, list, ev(id).aliases);
    expect(ids('av12')).toEqual([1]);
    expect(ids('tde12')).toEqual([2]); // só "1 - TDE", não "2 - TDE" nem "TDE - Atividade Extra"
    expect(ids('tde3')).toEqual([3]); // a coluna "2 - TDE"
    expect(ids('av3')).toEqual([]); // ainda não existe no AVA
  });

  it('proporção (padrão geral) e soma de pontos dão resultados diferentes: aqui vale a soma', () => {
    const parts = [list[3], list[4], list[5]]; // revisão 1,5 + extra 1 + exercício 3
    expect(gradeFromAssignments({ scale: 3 }, parts, 'sum')).toMatchObject({ grade: 3 }); // 5,5 limitado a 3,0
    expect(gradeFromAssignments({ scale: 3 }, parts, 'proportion')).toMatchObject({ grade: 2.75 }); // 5,5 ÷ 6 × 3 — não é como ela soma
    expect(gradeFromAssignments({ scale: 3 }, [list[3], list[4]], 'sum')).toMatchObject({ grade: 2.5 }); // abaixo do limite: soma direta
  });

  it('sem nota em alguma atividade escolhida, explica como importar só o que já saiu', () => {
    const r = gradeFromAssignments({ scale: 3 }, [list[3], list[6]], 'sum');
    expect(r.grade).toBeNull();
    expect('reason' in r && r.reason).toContain('Desmarque as atividades sem nota');
  });

  it('o padrão dos TDEs desta disciplina é somar; das avaliações somativas é proporção', () => {
    expect(ev('tde12').importMode).toBe('sum');
    expect(ev('tde3').importMode).toBe('sum');
    expect(ev('av12').importMode).toBeUndefined();
  });

  it('na tela: 5 de 7 e 2,1 de 3 entram sozinhos; o TDE 2 vira soma das atividades marcadas (limitada a 3,0)', async () => {
    mockBridge((path) => {
      if (path.includes('/users/self')) return json({ name: 'K' });
      if (path.includes('/assignments')) return json(ava);
      return json([{ id: 9, name: 'REQUISITOS DE SOFTWARE - TESF-2U-N-2026/2' }]);
    });
    await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false);
    const svc = TestBed.inject(SubjectService);
    const fixture = TestBed.createComponent(CanvasImportComponent);
    fixture.componentRef.setInput('subject', svc.findSubject('requisitos-2026-2'));
    fixture.componentRef.setInput('grades', svc.gradesOf('requisitos-2026-2'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Buscar no AVA'))!.click();
    await new Promise((r) => setTimeout(r, 20));
    await fixture.whenStable();

    const rows = () => [...root.querySelectorAll('.nc-import-row')];
    const head = (name: string) => [...root.querySelectorAll('.nc-import-row__head')].find((h) => h.textContent!.includes(name))!.textContent!.replace(/\s+/g, ' ');
    expect(head('Avaliação Somativa 1')).toContain('5,00 de 7,00');
    expect(head('TDE 1')).toContain('2,10 de 3,00');
    expect(head('TDE 2')).not.toContain('de 3,00'); // a coluna "2 - TDE" ainda está sem nota

    // marca as atividades pequenas no TDE 2 (revisão, extra e exercício) e desmarca a coluna sem nota
    const tde2 = rows().find((r) => r.querySelector('.nc-import-row__head')!.textContent!.includes('TDE 2'))!;
    const boxes = [...tde2.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    const box = (text: string) => boxes.find((b) => b.parentElement!.textContent!.includes(text))!;
    for (const t of ['2 - TDE (3,0 pts)', 'Atividade de revisão', 'TDE - Atividade Extra', 'Exercício 09']) {
      box(t).click();
      await fixture.whenStable();
    }
    expect(head('TDE 2')).toContain('3,00 de 3,00'); // 1,5 + 1 + 3 = 5,5, limitado a 3,0
    expect(tde2.textContent).toContain('soma de 5,50 pontos, limitada a 3,00');

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Aplicar 3'))!.click();
    await fixture.whenStable();
    const g = svc.gradesOf('requisitos-2026-2');
    expect([g['av12'], g['tde12'], g['tde3']]).toEqual([5, 2.1, 3]);
    expect(svc.summaries()['requisitos-2026-2'].groups[0].grade).toBeCloseTo(7.1); // 5 + 2,1: nota do grupo RA1/RA2
  });
});
