import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameService, Prize, Category } from '../game.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent {
  gameService = inject(GameService);
  router = inject(Router);

  categories: Category[] = ['Novice', 'Avancé', 'Élite', 'Prestige', 'Légendaire'];
  prizes = this.gameService.prizes;

  newPrize: Partial<Prize> = { category: 'Novice' };

  addPrize() {
    if (this.newPrize.name && this.newPrize.value && this.prizes().length < 16) {
      const prize: Prize = {
        id: crypto.randomUUID(),
        name: this.newPrize.name!,
        imageUrl: this.newPrize.imageUrl || '',
        value: this.newPrize.value!,
        category: this.newPrize.category as Category,
        isRevealed: false
      };
      this.gameService.prizes.update(p => [...p, prize]);
      this.newPrize = { category: 'Novice', name: '', imageUrl: '', value: 0 };
    }
  }

  removePrize(index: number) {
    this.gameService.prizes.update(p => p.filter((_, i) => i !== index));
  }

  resetGame() {
    if(confirm('Are you sure? This will delete all prizes and reset the game state.')) {
      this.gameService.resetAllData();
    }
  }

  startGame() {
    this.gameService.startGame();
    this.router.navigate(['/']);
  }
}