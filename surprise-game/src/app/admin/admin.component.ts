import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameService, Prize, Category } from '../game.service';

// ... (Helper function extractSrcFromIframe if needed) ...

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
  editingId: string | null = null;
  previewPrize: Prize | null = null;

toggleAutoWin(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.gameService.isAutoWin.set(isChecked);
  }

  setTargetPrize(id: string | null) {
    // "null" string from select option needs to be converted to actual null
    const val = id === 'null' ? null : id;
    this.gameService.targetPrizeId.set(val);
  }
  // ... (Keep existing methods: getCategoryColor, savePrize, editPrize, cancelEdit, etc.) ...
  
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

  savePrize() {
    // ... (Keep existing implementation) ...
    if (!this.newPrize.name || !this.newPrize.value) return;

    let cleanVideoUrl = this.newPrize.videoUrl || '';
    if (cleanVideoUrl.includes('<iframe')) {
       // Assuming extract function is here or logic is simple
       const match = cleanVideoUrl.match(/src="([^"]+)"/);
       if (match) cleanVideoUrl = match[1];
    }

    if (this.editingId) {
      this.gameService.prizes.update(prizes => prizes.map(p => {
        if (p.id === this.editingId) {
          return {
            ...p,
            name: this.newPrize.name!,
            imageUrl: this.newPrize.imageUrl || '',
            videoUrl: cleanVideoUrl,
            value: this.newPrize.value!,
            category: this.newPrize.category as Category
          };
        }
        return p;
      }));
      this.cancelEdit();
    } else {
      if (this.prizes().length < 16) {
        const prize: Prize = {
          id: crypto.randomUUID(),
          name: this.newPrize.name!,
          imageUrl: this.newPrize.imageUrl || '',
          videoUrl: cleanVideoUrl,
          value: this.newPrize.value!,
          category: this.newPrize.category as Category,
          isRevealed: false
        };
        this.gameService.prizes.update(p => [...p, prize]);
        this.resetForm();
      }
    }
  }

  editPrize(prize: Prize) {
    this.editingId = prize.id;
    this.newPrize = { ...prize };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingId = null;
    this.resetForm();
  }

  resetForm() {
    const currentCategory = this.newPrize.category;
    this.newPrize = { category: currentCategory, name: '', imageUrl: '', videoUrl: '', value: 0 };
  }

  removePrize(id: string) {
    if (this.editingId === id) this.cancelEdit();
    this.gameService.prizes.update(p => p.filter(item => item.id !== id));
  }

  openPreview(prize: Prize) { this.previewPrize = prize; }
  closePreview() { this.previewPrize = null; }

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
    // ... (Keep existing implementation) ...
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
    // ... (Keep existing implementation) ...
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
        }
      } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
  }
}