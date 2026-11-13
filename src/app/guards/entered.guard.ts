import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Quem ainda não escolheu entrar (conta ou sem conta) é levado à tela de entrada. */
export const enteredGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.entered() ? true : inject(Router).createUrlTree(['/entrar']);
};

/** A tela de entrada em si: quem já entrou vai direto ao painel. */
export const notEnteredGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.entered() ? inject(Router).createUrlTree(['/']) : true;
};
