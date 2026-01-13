import { Routes } from '@angular/router';
import { GameComponent } from './game/game.component';
import { AdminComponent } from './admin/admin.component';

export const routes: Routes = [
  { path: '', component: GameComponent },
  { path: 'admin', component: AdminComponent }
];