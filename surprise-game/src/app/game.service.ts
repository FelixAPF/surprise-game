import { Injectable, signal, computed, effect } from '@angular/core';

export type Category = 'Novice' | 'Avancé' | 'Élite' | 'Prestige' | 'Légendaire';

export interface Prize {
  id: string;
  name: string; // e.g., "Trip to Disney"
  imageUrl: string;
  value: number; // The Price/Cost (e.g., 1000000 for $1M)
  category: Category;
  isRevealed: boolean;
}

export interface Briefcase {
  id: number;
  prize: Prize;
  isOpen: boolean;
  isHeld: boolean;
  isRemoved: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  prizes = signal<Prize[]>([]);
  briefcases = signal<Briefcase[]>([]);
  gameState = signal<'SETUP' | 'PICK_OWN' | 'PLAYING' | 'SWAP_ROUND' | 'FINISHED'>('SETUP');
  
  // Rounds: 3, 3, 3, 3, 2 cases to open
  rounds = [3, 3, 3, 3, 2];
  currentRoundIndex = signal(0);
  casesOpenedInCurrentRound = signal(0);

  // Helper: Sorts prizes by Price (Low to High) for the ladder display
  sortedPrizes = computed(() => {
    return this.prizes().slice().sort((a, b) => a.value - b.value);
  });

  constructor() {
    this.loadState();
    // Auto-save
    effect(() => {
      const state = {
        prizes: this.prizes(),
        briefcases: this.briefcases(),
        gameState: this.gameState(),
        currentRoundIndex: this.currentRoundIndex(),
        casesOpenedInCurrentRound: this.casesOpenedInCurrentRound()
      };
      localStorage.setItem('surpriseGameState', JSON.stringify(state));
    });
  }

  private loadState() {
    const saved = localStorage.getItem('surpriseGameState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.prizes) this.prizes.set(state.prizes);
        if (state.briefcases) this.briefcases.set(state.briefcases);
        if (state.gameState) this.gameState.set(state.gameState);
        if (state.currentRoundIndex) this.currentRoundIndex.set(state.currentRoundIndex);
        if (state.casesOpenedInCurrentRound) this.casesOpenedInCurrentRound.set(state.casesOpenedInCurrentRound);
      } catch (e) {
        console.error('Failed to load state', e);
      }
    }
  }

  resetAllData() {
    this.prizes.set([]);
    this.briefcases.set([]);
    this.gameState.set('SETUP');
    this.currentRoundIndex.set(0);
    this.casesOpenedInCurrentRound.set(0);
    localStorage.removeItem('surpriseGameState');
  }

  startGame() {
    if (this.prizes().length !== 16) return;
    const shuffledPrizes = [...this.prizes()].sort(() => Math.random() - 0.5);
    const newCases: Briefcase[] = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      prize: shuffledPrizes[i],
      isOpen: false,
      isHeld: false,
      isRemoved: false
    }));
    this.briefcases.set(newCases);
    this.gameState.set('PICK_OWN');
    this.currentRoundIndex.set(0);
    this.casesOpenedInCurrentRound.set(0);
  }

  selectMainCase(id: number) {
    this.briefcases.update(cases => cases.map(c => 
      c.id === id ? { ...c, isHeld: true } : c
    ));
    this.gameState.set('PLAYING');
  }

  openCase(id: number) {
    const currentCase = this.briefcases().find(c => c.id === id);
    if (!currentCase || currentCase.isOpen || currentCase.isHeld) return;

    this.briefcases.update(cases => cases.map(c => 
      c.id === id ? { ...c, isOpen: true } : c
    ));
    this.prizes.update(prizes => prizes.map(p => 
      p.id === currentCase.prize.id ? { ...p, isRevealed: true } : p
    ));

    const opened = this.casesOpenedInCurrentRound() + 1;
    this.casesOpenedInCurrentRound.set(opened);
    const neededForRound = this.rounds[this.currentRoundIndex()];

    if (opened >= neededForRound) {
      if (this.currentRoundIndex() < this.rounds.length - 1) {
        this.currentRoundIndex.update(i => i + 1);
        this.casesOpenedInCurrentRound.set(0);
      } else {
        this.gameState.set('SWAP_ROUND');
      }
    }
  }

  swapCase() {
    this.briefcases.update(cases => {
      const held = cases.find(c => c.isHeld)!;
      const remaining = cases.find(c => !c.isHeld && !c.isOpen)!;
      return cases.map(c => {
        if (c.id === held.id) return { ...c, isHeld: false };
        if (c.id === remaining.id) return { ...c, isHeld: true };
        return c;
      });
    });
    this.finishGame();
  }

  keepCase() {
    this.finishGame();
  }

  private finishGame() {
    this.gameState.set('FINISHED');
    const held = this.briefcases().find(c => c.isHeld)!;
    this.briefcases.update(cases => cases.map(c => 
      c.id === held.id ? { ...c, isOpen: true } : c
    ));
  }
}