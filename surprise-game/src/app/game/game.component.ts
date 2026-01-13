import { Component, inject, ElementRef, ViewChild, EffectRef, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { GameService, Briefcase } from '../game.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent {
  gs = inject(GameService);

  @ViewChild('winnerCanvas') winnerCanvasRef?: ElementRef<HTMLCanvasElement>;

  // COMPUTED SIGNAL: Guaranteed source of truth
  heldCase = computed(() => this.gs.briefcases().find(c => c.isHeld) || null);
  
  zoomedCase: Briefcase | null = null;
  
  // Computed for UI counts
  remainingToOpen = computed(() => {
    if (this.gs.gameState() === 'PLAYING') {
      const opened = this.gs.casesOpenedInCurrentRound();
      const total = this.gs.rounds[this.gs.currentRoundIndex()];
      return total - opened;
    }
    return 0;
  });

  private animationId: number | null = null;

  constructor() {
    // Effect only manages Side Effects (Fireworks), not State
    effect(() => {
      const state = this.gs.gameState();
      const currentHeld = this.heldCase();

      // Trigger fireworks ONLY when Game Finished and Case is Open
      if (state === 'FINISHED' && currentHeld?.isOpen) {
        this.tryStartWinnerFireworks();
      }
    });
  }

  get boardCases() {
    return this.gs.briefcases().filter(c => !c.isHeld);
  }

  handleCaseClick(c: Briefcase) {
    if (this.gs.gameState() === 'PICK_OWN') {
      this.gs.selectMainCase(c.id);
    } else if (this.gs.gameState() === 'PLAYING') {
      if (!c.isOpen && !c.isHeld) {
        this.gs.openCase(c.id);
        
        // Fetch updated case to get the post-swap prize
        const updatedCase = this.gs.briefcases().find(item => item.id === c.id);
        if (updatedCase) {
          this.zoomedCase = updatedCase;
        }
      }
    }
  }

  closeZoom() {
    this.zoomedCase = null;
    this.stopFireworks(); 
    this.gs.advanceGame();
  }

  resetGame() {
    window.location.reload(); 
  }

  // --- FIREWORKS ENGINE ---

  tryStartWinnerFireworks() {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (this.winnerCanvasRef?.nativeElement) {
        clearInterval(interval);
        this.startFireworks(this.winnerCanvasRef);
      } else if (attempts >= 20) {
        clearInterval(interval);
      }
    }, 50);
  }

  startFireworks(canvasRef?: ElementRef<HTMLCanvasElement>) {
    if (!canvasRef) return;
    const canvas = canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.stopFireworks();

    const particles: any[] = [];
    
    const createExplosion = (x: number, y: number) => {
      const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
      for (let i = 0; i < 50; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          alpha: 1,
          color
        });
      }
    };

    const loop = () => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      if (Math.random() < 0.05) {
        createExplosion(
          Math.random() * canvas.width, 
          Math.random() * canvas.height * 0.5
        );
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; 
        p.alpha -= 0.01;
        
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();

        if (p.alpha <= 0) particles.splice(i, 1);
      }

      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  }

  stopFireworks() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}