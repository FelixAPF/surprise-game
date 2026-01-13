import { Injectable, signal, computed, effect } from '@angular/core';

export type Category = 'Novice' | 'Avancé' | 'Élite' | 'Prestige' | 'Légendaire';

export interface Prize {
  id: string;
  name: string;
  imageUrl: string;
  value: number;
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
  
  // Track prestige revealed count for the specific round logic
  private prestigeRevealedInRound = 0;

  sortedPrizes = computed(() => {
    return this.prizes().slice().sort((a, b) => a.value - b.value);
  });

  constructor() {
    this.loadState();
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
    this.prestigeRevealedInRound = 0;
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
    this.prestigeRevealedInRound = 0;
  }

  // Helper to swap prizes between two cases seamlessly
  private swapPrizes(caseId1: number, caseId2: number) {
    this.briefcases.update(cases => {
      const c1 = cases.find(c => c.id === caseId1)!;
      const c2 = cases.find(c => c.id === caseId2)!;
      const tempPrize = c1.prize;
      
      return cases.map(c => {
        if (c.id === caseId1) return { ...c, prize: c2.prize };
        if (c.id === caseId2) return { ...c, prize: tempPrize };
        return c;
      });
    });
  }

  selectMainCase(id: number) {
    // RIGGED: Ensure the selected case contains "Légendaire"
    const currentCases = this.briefcases();
    const legendaryCase = currentCases.find(c => c.prize.category === 'Légendaire');
    
    if (legendaryCase && legendaryCase.id !== id) {
      // Swap Legendary into the chosen case
      this.swapPrizes(id, legendaryCase.id);
    }

    this.briefcases.update(cases => cases.map(c => 
      c.id === id ? { ...c, isHeld: true } : c
    ));
    this.gameState.set('PLAYING');
  }

  openCase(id: number) {
    let currentCases = this.briefcases();
    let targetCase = currentCases.find(c => c.id === id);
    if (!targetCase || targetCase.isOpen || targetCase.isHeld) return;

    // --- RIGGING LOGIC ---
    const roundIdx = this.currentRoundIndex();
    const neededForRound = this.rounds[roundIdx];
    const openedInRound = this.casesOpenedInCurrentRound();
    const shotsLeft = neededForRound - openedInRound - 1; // -1 because we are about to open this one

    // Helper: Find valid swap candidates (Closed, Not Held, Not Legendary)
    const getCandidates = (filterFn: (c: Briefcase) => boolean) => {
      return this.briefcases().filter(c => 
        !c.isOpen && !c.isHeld && 
        c.prize.category !== 'Légendaire' && // Never swap Legendary back in
        c.id !== id && // Don't swap with self
        filterFn(c)
      );
    };

    // ROUND 1: No Prestige Removed
    if (roundIdx === 0) {
      if (targetCase.prize.category === 'Prestige') {
        // Swap with ANY non-Prestige
        const candidates = getCandidates(c => c.prize.category !== 'Prestige');
        if (candidates.length > 0) {
          const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
          this.swapPrizes(id, swapTarget.id);
        }
      }
    }

    // ROUND 2 & 3: Exactly 1 Prestige Removed
    else if (roundIdx === 1 || roundIdx === 2) {
      const isPrestige = targetCase.prize.category === 'Prestige';
      
      if (isPrestige) {
        // If we already found one, we can't find another
        if (this.prestigeRevealedInRound >= 1) {
          const candidates = getCandidates(c => c.prize.category !== 'Prestige');
          if (candidates.length > 0) {
            const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
            this.swapPrizes(id, swapTarget.id);
          }
        }
      } else {
        // If it's NOT Prestige, but it's the LAST SHOT and we haven't found one yet
        if (this.prestigeRevealedInRound === 0 && shotsLeft === 0) {
          // Force Swap IN a Prestige
          const candidates = getCandidates(c => c.prize.category === 'Prestige');
          if (candidates.length > 0) {
            const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
            this.swapPrizes(id, swapTarget.id);
          }
        }
      }
    }

    // --- END RIGGING ---

    // Refresh state after potential swaps
    currentCases = this.briefcases();
    targetCase = currentCases.find(c => c.id === id)!;

    if (targetCase.prize.category === 'Prestige') {
      this.prestigeRevealedInRound++;
    }

    // Standard Open Logic
    this.briefcases.update(cases => cases.map(c => 
      c.id === id ? { ...c, isOpen: true } : c
    ));
    this.prizes.update(prizes => prizes.map(p => 
      p.id === targetCase!.prize.id ? { ...p, isRevealed: true } : p
    ));

    this.casesOpenedInCurrentRound.update(v => v + 1);
    
    // NOTE: We do NOT advance the round here anymore.
    // 'advanceGame()' must be called by the UI after the user closes the popup.
  }

  // New method called when user closes the "Zoom" popup
  advanceGame() {
    const opened = this.casesOpenedInCurrentRound();
    const needed = this.rounds[this.currentRoundIndex()];

    if (opened >= needed) {
      if (this.currentRoundIndex() < this.rounds.length - 1) {
        // Next Round
        this.currentRoundIndex.update(i => i + 1);
        this.casesOpenedInCurrentRound.set(0);
        this.prestigeRevealedInRound = 0; // Reset counter for new round
      } else {
        // Go to Final Decision
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