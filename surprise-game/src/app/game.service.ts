import { Injectable, signal, computed, effect } from '@angular/core';

export type Category = 'Novice' | 'Avancé' | 'Élite' | 'Prestige' | 'Légendaire';

export interface Prize {
  id: string;
  name: string;
  imageUrl: string;
  videoUrl?: string;
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
  // ADDED 'RULES' STATE
  gameState = signal<'SETUP' | 'RULES' | 'PICK_OWN' | 'PLAYING' | 'SWAP_ROUND' | 'FINISHED'>('SETUP');
  
  isAutoWin = signal(true); 
  targetPrizeId = signal<string | null>(null);

  rounds = [3, 3, 3, 3, 2];
  currentRoundIndex = signal(0);
  casesOpenedInCurrentRound = signal(0);
  
  private prestigeRevealedInRound = 0;

  private categoryOrder: Record<Category, number> = {
    'Novice': 0, 'Avancé': 1, 'Élite': 2, 'Prestige': 3, 'Légendaire': 4
  };

  sortedPrizes = computed(() => {
    return this.prizes().slice().sort((a, b) => {
      const catDiff = this.categoryOrder[a.category] - this.categoryOrder[b.category];
      if (catDiff !== 0) return catDiff;
      return a.value - b.value;
    });
  });

  constructor() {
    this.loadState();
    effect(() => {
      const state = {
        prizes: this.prizes(),
        briefcases: this.briefcases(),
        gameState: this.gameState(),
        currentRoundIndex: this.currentRoundIndex(),
        casesOpenedInCurrentRound: this.casesOpenedInCurrentRound(),
        isAutoWin: this.isAutoWin(),
        targetPrizeId: this.targetPrizeId()
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
        if (state.isAutoWin !== undefined) this.isAutoWin.set(state.isAutoWin);
        if (state.targetPrizeId !== undefined) this.targetPrizeId.set(state.targetPrizeId);
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
    // CHANGED: Go to RULES first, not PICK_OWN
    this.gameState.set('RULES'); 
    this.currentRoundIndex.set(0);
    this.casesOpenedInCurrentRound.set(0);
    this.prestigeRevealedInRound = 0;
  }

  // NEW: Call this when user clicks "I Understand"
  confirmRules() {
    this.gameState.set('PICK_OWN');
  }

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
    const currentCases = this.briefcases();
    const specificTargetId = this.targetPrizeId();

    if (specificTargetId) {
      const targetCase = currentCases.find(c => c.prize.id === specificTargetId);
      if (targetCase && targetCase.id !== id) {
        this.swapPrizes(id, targetCase.id);
      }
    } 
    else if (this.isAutoWin()) {
      let highestRank = -1;
      currentCases.forEach(c => {
        const rank = this.categoryOrder[c.prize.category];
        if (rank > highestRank) highestRank = rank;
      });
      const topTierCases = currentCases.filter(c => 
        this.categoryOrder[c.prize.category] === highestRank
      );
      if (topTierCases.length > 0) {
        const randomBest = topTierCases[Math.floor(Math.random() * topTierCases.length)];
        if (randomBest.id !== id) {
          this.swapPrizes(id, randomBest.id);
        }
      }
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

    const roundIdx = this.currentRoundIndex();
    const neededForRound = this.rounds[roundIdx];
    const openedInRound = this.casesOpenedInCurrentRound();
    const shotsLeft = neededForRound - openedInRound - 1;

    const getCandidates = (filterFn: (c: Briefcase) => boolean) => {
      return this.briefcases().filter(c => 
        !c.isOpen && !c.isHeld && 
        c.prize.category !== 'Légendaire' && 
        c.prize.id !== this.targetPrizeId() &&
        c.id !== id && 
        filterFn(c)
      );
    };

    if (roundIdx === 0) {
      if (targetCase.prize.category === 'Prestige') {
        const candidates = getCandidates(c => c.prize.category !== 'Prestige');
        if (candidates.length > 0) {
          const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
          this.swapPrizes(id, swapTarget.id);
        }
      }
    }
    else if (roundIdx === 1 || roundIdx === 2) {
      const isPrestige = targetCase.prize.category === 'Prestige';
      if (isPrestige) {
        if (this.prestigeRevealedInRound >= 1) {
          const candidates = getCandidates(c => c.prize.category !== 'Prestige');
          if (candidates.length > 0) {
            const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
            this.swapPrizes(id, swapTarget.id);
          }
        }
      } else {
        if (this.prestigeRevealedInRound === 0 && shotsLeft === 0) {
          const candidates = getCandidates(c => c.prize.category === 'Prestige');
          if (candidates.length > 0) {
            const swapTarget = candidates[Math.floor(Math.random() * candidates.length)];
            this.swapPrizes(id, swapTarget.id);
          }
        }
      }
    }

    currentCases = this.briefcases();
    targetCase = currentCases.find(c => c.id === id)!;

    if (targetCase.prize.category === 'Prestige') {
      this.prestigeRevealedInRound++;
    }

    this.briefcases.update(cases => cases.map(c => 
      c.id === id ? { ...c, isOpen: true } : c
    ));
    this.prizes.update(prizes => prizes.map(p => 
      p.id === targetCase!.prize.id ? { ...p, isRevealed: true } : p
    ));

    this.casesOpenedInCurrentRound.update(v => v + 1);
  }

  advanceGame() {
    const opened = this.casesOpenedInCurrentRound();
    const needed = this.rounds[this.currentRoundIndex()];
    if (opened >= needed) {
      if (this.currentRoundIndex() < this.rounds.length - 1) {
        this.currentRoundIndex.update(i => i + 1);
        this.casesOpenedInCurrentRound.set(0);
        this.prestigeRevealedInRound = 0;
      } else {
        this.gameState.set('SWAP_ROUND');
      }
    }
  }

  swapCase() {
    const held = this.briefcases().find(c => c.isHeld)!;
    const remaining = this.briefcases().find(c => !c.isHeld && !c.isOpen)!;

    this.briefcases.update(cases => {
      return cases.map(c => {
        if (c.id === held.id) return { ...c, isHeld: false };
        if (c.id === remaining.id) return { ...c, isHeld: true };
        return c;
      });
    });

    if (this.targetPrizeId() || this.isAutoWin()) {
       this.swapPrizes(held.id, remaining.id);
    }

    this.finishGame();
  }

  keepCase() {
    this.finishGame();
  }

  private finishGame() {
    const held = this.briefcases().find(c => c.isHeld)!;
    this.briefcases.update(cases => cases.map(c => 
      c.id === held.id ? { ...c, isOpen: true } : c
    ));
    this.gameState.set('FINISHED');
  }
}