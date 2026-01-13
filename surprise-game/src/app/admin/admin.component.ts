import { Component, inject, computed } from '@angular/core';
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
  
  // Category Ranking for Sorting
  private categoryOrder: Record<Category, number> = {
    'Novice': 0,
    'Avancé': 1,
    'Élite': 2,
    'Prestige': 3,
    'Légendaire': 4
  };

  // Original list (for adding/removing)
  prizes = this.gameService.prizes;

  // Sorted list for Display: 1. Category, 2. Value
  sortedPrizes = computed(() => {
    return this.prizes().slice().sort((a, b) => {
      // First sort by Category
      const catDiff = this.categoryOrder[a.category] - this.categoryOrder[b.category];
      if (catDiff !== 0) return catDiff;
      
      // Then sort by Price
      return a.value - b.value;
    });
  });

  newPrize: Partial<Prize> = { category: 'Novice' };
  previewPrize: Prize | null = null;

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

  // UPDATED: Now removes by ID because the index in 'sortedPrizes' 
  // doesn't match the index in the original 'prizes' array.
  removePrize(id: string) {
    this.gameService.prizes.update(p => p.filter(item => item.id !== id));
  }

  openPreview(prize: Prize) {
    this.previewPrize = prize;
  }

  closePreview() {
    this.previewPrize = null;
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

  exportPrizes() {
    const data = JSON.stringify(this.prizes(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'surprise-game-prizes.json';
    a.click();
    
    URL.revokeObjectURL(url);
  }

  importPrizes(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
          const freshPrizes = data.map((p: any) => ({
            ...p,
            isRevealed: false 
          }));
          this.gameService.prizes.set(freshPrizes);
          input.value = '';
        } else {
          alert('Invalid JSON: Root must be an array.');
        }
      } catch (err) {
        console.error('Error parsing JSON', err);
        alert('Failed to parse JSON file.');
      }
    };
    
    reader.readAsText(file);
  }
}