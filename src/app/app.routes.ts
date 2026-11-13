import { Routes } from '@angular/router';
import { enteredGuard, notEnteredGuard } from './guards/entered.guard';
import { AddSubjectPage } from './pages/add-subject/add-subject';
import { DashboardPage } from './pages/dashboard/dashboard';
import { LoginPage } from './pages/login/login';
import { SubjectDetailsPage } from './pages/subject-details/subject-details';

export const routes: Routes = [
  { path: 'entrar', component: LoginPage, canActivate: [notEnteredGuard], title: 'Entrar · NotaCerta' },
  { path: '', component: DashboardPage, canActivate: [enteredGuard], title: 'NotaCerta — Saiba quanto falta para passar' },
  { path: 'disciplina/:id', component: SubjectDetailsPage, canActivate: [enteredGuard], title: 'Disciplina · NotaCerta' },
  { path: 'adicionar', component: AddSubjectPage, canActivate: [enteredGuard], title: 'Adicionar matéria · NotaCerta' },
  { path: '**', redirectTo: '' },
];
