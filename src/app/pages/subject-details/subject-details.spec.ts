import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from '../dashboard/dashboard';
import { SubjectDetailsPage } from './subject-details';

function setup(id: string) {
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SubjectDetailsPage);
  fixture.componentRef.setInput('id', id);
  return fixture;
}

async function type(el: HTMLInputElement, value: string, fixture: { whenStable(): Promise<unknown> }) {
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

describe('SubjectDetailsPage (interface)', () => {
  it('digitar uma nota atualiza o resumo na hora e salva', async () => {
    const fixture = setup('dev-web-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const inputs = root.querySelectorAll<HTMLInputElement>('.nc-details__evals input.nc-grade');
    expect(inputs.length).toBe(6);
    const summary = () => root.querySelector('.nc-summary')!.textContent!.replace(/\s+/g, '');
    expect(summary()).toContain('0,00/10,00');

    await type(inputs[0], '1,5', fixture); // Prova 1
    await type(inputs[1], '1,8', fixture); // Site
    expect(summary()).toContain('3,30/10,00');
    expect(root.querySelector('.nc-trio')!.textContent!.replace(/\s+/g, '')).toContain('Meta7,00Faltam3,70Disponíveis6,00');
    expect(summary()).toContain('Aindaépossívelalcançarsuameta.');
    expect(summary()).toContain('pelomenos61,67%dospontosrestantes');
    expect(localStorage.getItem('notacerta:v1')).toContain('"prova1":1.5');
  });

  it('campo vazio é pendente, zero é nota; texto inválido mostra erro e não salva', async () => {
    const fixture = setup('dev-web-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const first = root.querySelector<HTMLInputElement>('.nc-details__evals input.nc-grade')!;

    await type(first, '0', fixture);
    expect(root.querySelectorAll('.nc-eval__state--done').length).toBe(1);

    await type(first, '2,5', fixture); // acima do máximo (2,00)
    expect(root.textContent).toContain('Essa avaliação vale no máximo 2,00.');
    expect(localStorage.getItem('notacerta:v1')).toContain('"prova1":0'); // última nota válida preservada

    await type(first, '', fixture);
    expect(root.querySelectorAll('.nc-eval__state--done').length).toBe(0);
    expect(root.textContent).not.toContain('Essa avaliação vale no máximo');
  });

  it('disciplina com fórmula ambígua mostra aviso de provisório', async () => {
    const fixture = setup('logica-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Fórmula aguardando confirmação');
    expect(root.querySelector('.nc-summary')!.textContent).toContain('Resultado provisório');
  });

  it('simulação mostra a nota projetada sem alterar as notas reais', async () => {
    const fixture = setup('dev-web-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.nc-sim .nc-grade')).toBeNull(); // simulador fechado por padrão
    root.querySelector<HTMLButtonElement>('.nc-sim__toggle')!.click();
    await fixture.whenStable();
    const sim = root.querySelector<HTMLInputElement>('.nc-sim .nc-grade')!;
    await type(sim, '1,5', fixture);
    expect(root.querySelector('.nc-sim__result')?.textContent).toContain('Nota final projetada');
    expect(root.querySelector('.nc-summary')!.textContent!.replace(/\s+/g, '')).toContain('0,00/10,00');
    expect(localStorage.getItem('notacerta:v1') ?? '').not.toContain('1.5');
  });

  it('lista de "o que preciso" só aparece dentro do simulador, como sugestão', async () => {
    const fixture = setup('dev-web-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Sugestão de distribuição');
    root.querySelector<HTMLButtonElement>('.nc-sim__toggle')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.nc-sim')!.textContent).toContain('Sugestão de distribuição');
    expect(root.querySelector('.nc-sim')!.textContent).toContain('não uma nota mínima obrigatória');
  });

  it('descrição da avaliação fica escondida até clicar no ícone de informação', async () => {
    const fixture = setup('dev-web-2026-2');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('HTML, CSS, Flexbox e media query');
    root.querySelector<HTMLButtonElement>('.nc-info')!.click();
    await fixture.whenStable();
    expect(root.textContent).toContain('HTML, CSS, Flexbox e media query');
  });

  it('disciplina inexistente mostra mensagem amigável', async () => {
    const fixture = setup('nao-existe');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Disciplina não encontrada');
  });
});

describe('DashboardPage', () => {
  it('lista as cinco disciplinas e os indicadores', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-subject-card').length).toBe(5);
    expect(root.textContent).toContain('Seu semestre, sem surpresas.');
    expect(root.querySelector('.nc-stat__n')?.textContent).toBe('5');
  });
});

describe('Dashboard: seletor de período', () => {
  async function render() {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture;
  }

  it('mostra os períodos com o atual marcado e filtra as disciplinas ao trocar', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.nc-period')];
    expect(chips.map((c) => c.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['2026/2 (Atual)', '2026/1', '2025/2']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('app-subject-card').length).toBe(5);

    chips[1].click();
    await fixture.whenStable();
    expect(root.querySelectorAll('app-subject-card').length).toBe(0);
    expect(root.querySelector('.nc-period-empty')!.textContent).toContain('Nenhuma matéria em 2026/1');
    expect(root.querySelector('.nc-stat__n')!.textContent).toBe('0'); // indicadores seguem o período
    expect(root.querySelector('.nc-add-tile')).not.toBeNull();
  });
});
