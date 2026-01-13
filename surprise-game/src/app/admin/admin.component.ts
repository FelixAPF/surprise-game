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
  
  private categoryOrder: Record<Category, number> = {
    'Novice': 0, 'Avancé': 1, 'Élite': 2, 'Prestige': 3, 'Légendaire': 4
  };

  prizes = this.gameService.prizes;

  sortedPrizes = computed(() => {
    return this.prizes().slice().sort((a, b) => {
      const catDiff = this.categoryOrder[a.category] - this.categoryOrder[b.category];
      if (catDiff !== 0) return catDiff;
      return a.value - b.value;
    });
  });

  newPrize: Partial<Prize> = { category: 'Novice' };
  editingId: string | null = null; // Track which ID we are editing
  
  previewPrize: Prize | null = null;

  getCategoryColor(cat: Category): string {
    switch(cat) {
      case 'Novice': return '#ffffff';
      case 'Avancé': return '#ffeb3b';
      case 'Élite': return '#2196f3';
      case 'Prestige': return '#e50914';
      case 'Légendaire': return '#ffd700';
      default: return '#fff';
    }
  }

  // Handle both Create and Update
  savePrize() {
    // Basic validation
    if (!this.newPrize.name || !this.newPrize.value) return;

    if (this.editingId) {
      // UPDATE EXISTING
      this.gameService.prizes.update(prizes => prizes.map(p => {
        if (p.id === this.editingId) {
          return {
            ...p,
            name: this.newPrize.name!,
            imageUrl: this.newPrize.imageUrl || '',
            value: this.newPrize.value!,
            category: this.newPrize.category as Category
          };
        }
        return p;
      }));
      this.cancelEdit(); // Exit edit mode
    } else {
      // CREATE NEW
      if (this.prizes().length < 16) {
        const prize: Prize = {
          id: crypto.randomUUID(),
          name: this.newPrize.name!,
          imageUrl: this.newPrize.imageUrl || '',
          value: this.newPrize.value!,
          category: this.newPrize.category as Category,
          isRevealed: false
        };
        this.gameService.prizes.update(p => [...p, prize]);
        this.resetForm();
      }
    }
  }

  // Load prize data into form
  editPrize(prize: Prize) {
    this.editingId = prize.id;
    this.newPrize = {
      name: prize.name,
      imageUrl: prize.imageUrl,
      value: prize.value,
      category: prize.category
    };
    // Scroll to top to show form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingId = null;
    this.resetForm();
  }

  resetForm() {
    // Keep the last used category for convenience, clear others
    const currentCategory = this.newPrize.category;
    this.newPrize = { category: currentCategory, name: '', imageUrl: '', value: 0 };
  }

  removePrize(id: string) {
    if (this.editingId === id) this.cancelEdit();
    this.gameService.prizes.update(p => p.filter(item => item.id !== id));
  }

  openPreview(prize: Prize) {
    this.previewPrize = prize;
  }

  closePreview() {
    this.previewPrize = null;
  }

  resetGame() {
    if(confirm('⚠ WARNING: This will wipe all game data. Continue?')) {
      this.gameService.resetAllData();
      this.cancelEdit();
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
          const freshPrizes = data.map((p: any) => ({ ...p, isRevealed: false }));
          this.gameService.prizes.set(freshPrizes);
          input.value = '';
          this.cancelEdit();
        } else {
          alert('Invalid JSON');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
  }
}