import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { CanvasImportComponent } from '../components/canvas-import/canvas-import';
import {
  CanvasAssignment,
  CanvasError,
  CanvasService,
  gradeFromAssignments,
  nameScore,
  normalizeHost,
  parseNextLink,
  suggestAssignmentIds,
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

describe('CanvasService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('conecta, e por padrão guarda o token só na sessão (some ao fechar a aba)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ name: 'Kainan' }));
    vi.stubGlobal('fetch', fetchMock);
    const canvas = TestBed.inject(CanvasService);

    expect(await canvas.connect('https://pucpr.instructure.com/', '  segredo  ', false)).toBe('Kainan');
    expect(canvas.connected).toBe(true);
    expect(sessionStorage.getItem('notacerta:canvas')).toContain('segredo');
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pucpr.instructure.com/api/v1/users/self');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer segredo' }); // token sem espaços
  });

  it('"lembrar neste aparelho" guarda no localStorage; desconectar apaga tudo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ name: 'K' })));
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 'abc', true);
    expect(localStorage.getItem('notacerta:canvas')).toContain('abc');
    expect(sessionStorage.getItem('notacerta:canvas')).toBeNull();

    canvas.disconnect();
    expect(canvas.connected).toBe(false);
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();
  });

  it('restaura a conexão salva depois de recarregar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ name: 'K' })));
    await TestBed.inject(CanvasService).connect('pucpr.instructure.com', 'abc', true);
    TestBed.resetTestingModule();
    expect(TestBed.inject(CanvasService).connection()?.host).toBe('pucpr.instructure.com');
  });

  it('token recusado (401) vira mensagem amigável e não deixa conexão salva', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, { status: 401 })));
    const canvas = TestBed.inject(CanvasService);
    await expect(canvas.connect('pucpr.instructure.com', 'ruim', true)).rejects.toThrowError(/recusou o token/);
    expect(canvas.connected).toBe(false);
    expect(localStorage.getItem('notacerta:canvas')).toBeNull();
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: 'K' }))
      .mockResolvedValueOnce(json([{ id: 1, name: 'Web' }], { headers: { 'Content-Type': 'application/json', Link: '<https://pucpr.instructure.com/api/v1/courses?page=2>; rel="next"' } }))
      .mockResolvedValueOnce(json([{ id: 2, name: 'Banco' }, { id: 3 }])); // sem nome (acesso restrito): ignorada
    vi.stubGlobal('fetch', fetchMock);
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 't', false);
    expect(await canvas.courses()).toEqual([
      { id: 1, name: 'Web' },
      { id: 2, name: 'Banco' },
    ]);
    expect(fetchMock.mock.calls[2][0]).toBe('https://pucpr.instructure.com/api/v1/courses?page=2');
  });

  it('só considera "corrigida" a atividade com nota publicada e não dispensada', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ name: 'K' }))
        .mockResolvedValueOnce(
          json([
            { id: 1, name: 'A', points_possible: 10, submission: { score: 9, workflow_state: 'graded' } },
            { id: 2, name: 'B', points_possible: 10, submission: { score: null, workflow_state: 'submitted' } },
            { id: 3, name: 'C', points_possible: 10, submission: { score: 10, workflow_state: 'graded', excused: true } },
            { id: 4, name: 'D', points_possible: 10 },
          ]),
        ),
    );
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 't', false);
    expect((await canvas.assignments(7)).map((a) => a.graded)).toEqual([true, false, false, false]);
  });

  it('se o navegador bloquear a chamada direta (CORS), usa a função /api/canvas do site', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: 'K' })) // conectar (direto)
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // cursos: bloqueado
      .mockResolvedValueOnce(json([{ id: 1, name: 'Web' }])); // cursos via proxy
    vi.stubGlobal('fetch', fetchMock);
    const canvas = TestBed.inject(CanvasService);
    await canvas.connect('pucpr.instructure.com', 'tok', false);
    expect(await canvas.courses()).toEqual([{ id: 1, name: 'Web' }]);

    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toContain('/api/canvas?p=');
    expect(decodeURIComponent(String(url).split('?p=')[1])).toContain('/api/v1/courses');
    expect((init as RequestInit).headers).toMatchObject({ 'x-canvas-host': 'pucpr.instructure.com', 'x-canvas-token': 'tok' });
  });

  it('sem rede nem proxy: mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(TestBed.inject(CanvasService).connect('pucpr.instructure.com', 't', false)).rejects.toThrowError(/Não foi possível falar com o AVA/);
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/users/self')) return json({ name: 'K' });
        if (url.includes('/assignments'))
          return json([
            { id: 10, name: 'Prova 1', points_possible: 10, submission: { score: 8, workflow_state: 'graded' } },
            { id: 11, name: 'TDE 1 - Site estático', points_possible: 10, submission: { score: null, workflow_state: 'unsubmitted' } },
          ]);
        return json([{ id: 1, name: 'DESENVOLVIMENTO WEB - 2026/2' }, { id: 2, name: 'Outra matéria' }]);
      }),
    );
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
