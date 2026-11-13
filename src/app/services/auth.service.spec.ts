import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GOOGLE_CLIENT_ID } from '../config';
import { enteredGuard, notEnteredGuard } from '../guards/entered.guard';
import { LoginPage } from '../pages/login/login';
import { AuthService, BASE_STORAGE_KEY, decodeJwtPayload, GUEST_KEY, SESSION_KEY } from './auth.service';
import { SubjectService } from './subject.service';

const CLIENT = 'teste.apps.googleusercontent.com';
const WEB = 'dev-web-2026-2';

/** JWT falso (sem assinatura real): o app só lê o payload. */
function fakeToken(overrides: Record<string, unknown> = {}): string {
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT,
    sub: 'conta-A',
    email: 'ana@gmail.com',
    email_verified: true,
    name: 'Ana José',
    picture: 'https://lh3.googleusercontent.com/a/foto',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify(payload))}.assinatura`;
}

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: GOOGLE_CLIENT_ID, useValue: CLIENT }, provideRouter([{ path: '', children: [] }])] });
}

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    configure();
  });

  it('lê o payload com acentos (UTF-8)', () => {
    expect(decodeJwtPayload(fakeToken())['name']).toBe('Ana José');
  });

  it('aceita um login válido, guarda só o perfil (nunca o token) e muda a chave de armazenamento', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.entered()).toBe(false);
    const token = fakeToken();
    const user = auth.acceptCredential(token);
    expect(user).toEqual({ sub: 'conta-A', email: 'ana@gmail.com', name: 'Ana José', picture: 'https://lh3.googleusercontent.com/a/foto' });
    expect(auth.entered()).toBe(true);
    expect(auth.storageKey()).toBe(`${BASE_STORAGE_KEY}:u:conta-A`);
    expect(localStorage.getItem(SESSION_KEY)).not.toContain(token);
    expect(localStorage.getItem(SESSION_KEY)).toContain('ana@gmail.com');
  });

  it('recusa token de outro app, emissor desconhecido, vencido, ilegível ou com e-mail não verificado', () => {
    const auth = TestBed.inject(AuthService);
    expect(() => auth.acceptCredential(fakeToken({ aud: 'outro-app' }))).toThrowError(/validado/);
    expect(() => auth.acceptCredential(fakeToken({ iss: 'https://evil.example' }))).toThrowError(/validado/);
    expect(() => auth.acceptCredential(fakeToken({ exp: 1000 }))).toThrowError(/validado/);
    expect(() => auth.acceptCredential('lixo')).toThrowError(/ler a resposta/);
    expect(() => auth.acceptCredential(fakeToken({ email_verified: false }))).toThrowError(/verificado/);
    expect(() => auth.acceptCredential(fakeToken({ email: undefined }))).toThrowError(/e-mail/);
    expect(auth.user()).toBeNull();
  });

  it('usa a parte antes do @ quando a conta não tem nome', () => {
    expect(TestBed.inject(AuthService).acceptCredential(fakeToken({ name: undefined })).name).toBe('ana');
  });

  it('restaura a sessão depois de recarregar e limpa ao sair', () => {
    TestBed.inject(AuthService).acceptCredential(fakeToken());
    configure();
    const again = TestBed.inject(AuthService);
    expect(again.user()?.email).toBe('ana@gmail.com');
    again.signOut();
    expect(again.entered()).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    configure();
    expect(TestBed.inject(AuthService).entered()).toBe(false);
  });

  it('"continuar sem conta" é lembrado e usa a chave original (dados antigos preservados)', () => {
    const auth = TestBed.inject(AuthService);
    auth.continueAsGuest();
    expect(auth.entered()).toBe(true);
    expect(auth.storageKey()).toBe(BASE_STORAGE_KEY);
    expect(localStorage.getItem(GUEST_KEY)).toBe('1');
    configure();
    expect(TestBed.inject(AuthService).entered()).toBe(true);
  });

  describe('notas por conta', () => {
    it('cada conta tem as suas notas; só a primeira conta herda o que foi feito sem conta', () => {
      // 1) sem conta: lança uma nota
      const auth = TestBed.inject(AuthService);
      const svc = TestBed.inject(SubjectService);
      auth.continueAsGuest();
      svc.setGrade(WEB, 'prova1', 1.5);

      // 2) Ana entra: herda a nota do modo sem conta
      auth.acceptCredential(fakeToken());
      TestBed.tick();
      expect(svc.gradesOf(WEB)['prova1']).toBe(1.5);
      svc.setGrade(WEB, 'prova1', 2);
      expect(JSON.parse(localStorage.getItem(`${BASE_STORAGE_KEY}:u:conta-A`)!).grades[WEB].prova1).toBe(2);
      expect(JSON.parse(localStorage.getItem(BASE_STORAGE_KEY)!).grades[WEB].prova1).toBe(1.5); // o modo sem conta não foi alterado

      // 3) Bruno entra no mesmo aparelho: começa do zero
      auth.acceptCredential(fakeToken({ sub: 'conta-B', email: 'bruno@gmail.com', name: 'Bruno' }));
      TestBed.tick();
      expect(svc.gradesOf(WEB)).toEqual({});

      // 4) Ana volta: as notas dela continuam lá
      auth.acceptCredential(fakeToken());
      TestBed.tick();
      expect(svc.gradesOf(WEB)['prova1']).toBe(2);
    });
  });

  describe('guardas de rota', () => {
    it('quem não entrou vai para /entrar; quem entrou segue', () => {
      const router = TestBed.inject(Router);
      const run = (g: typeof enteredGuard) => TestBed.runInInjectionContext(() => g({} as never, {} as never));
      expect(router.serializeUrl(run(enteredGuard) as never)).toBe('/entrar');
      expect(run(notEnteredGuard)).toBe(true);

      TestBed.inject(AuthService).continueAsGuest();
      expect(run(enteredGuard)).toBe(true);
      expect(router.serializeUrl(run(notEnteredGuard) as never)).toBe('/');
    });
  });
});

describe('LoginPage', () => {
  beforeEach(() => localStorage.clear());

  it('sem Client ID configurado: mostra "continuar sem conta" e o aviso, sem botão do Google', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', children: [] }])] });
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.nc-login__google')).toBeNull();
    expect(root.textContent).toContain('ainda não foi configurado');

    root.querySelector<HTMLButtonElement>('.nc-login__guest')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).entered()).toBe(true);
  });

  it('com Client ID: reserva o espaço do botão do Google além do "continuar sem conta"', async () => {
    configure();
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.nc-login__google')).not.toBeNull();
    expect(root.querySelector('.nc-login__guest')).not.toBeNull();
  });
});
