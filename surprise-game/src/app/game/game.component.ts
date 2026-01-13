import { Component, inject, ElementRef, ViewChild, EffectRef, effect } from '@angular/core';
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

  zoomedCase: Briefcase | null = null;
  heldCase: Briefcase | null = null;
  remainingToOpen = 0;
  
  private animationId: number | null = null;

  constructor() {
    effect(() => {
      const state = this.gs.gameState();
      // Ensure heldCase is up to date immediately
      this.heldCase = this.gs.briefcases().find(c => c.isHeld) || null;
      
      if (state === 'PLAYING') {
        const opened = this.gs.casesOpenedInCurrentRound();
        const total = this.gs.rounds[this.gs.currentRoundIndex()];
        this.remainingToOpen = total - opened;
      }

      // Updated Logic: Only try to start fireworks if game is finished AND case is open
      if (state === 'FINISHED' && this.heldCase?.isOpen) {
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

  // --- ROBUST FIREWORKS LAUNCHER ---

  tryStartWinnerFireworks() {
    // Retry looking for the canvas for up to 1 second (20 attempts x 50ms)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      
      // Check if canvas is now available in the DOM
      if (this.winnerCanvasRef?.nativeElement) {
        clearInterval(interval);
        this.startFireworks(this.winnerCanvasRef);
      } else if (attempts >= 20) {
        // Give up after 1 second to prevent infinite loop
        clearInterval(interval);
      }
    }, 50);
  }

  // --- FIREWORKS ENGINE ---

  startFireworks(canvasRef?: ElementRef<HTMLCanvasElement>) {
    if (!canvasRef) return;
    const canvas = canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    // Ensure canvas is sized correctly
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Reset any existing animation
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
      // Clear with trail effect
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      // Randomly spawn new explosions
      if (Math.random() < 0.05) {
        createExplosion(
          Math.random() * canvas.width, 
          Math.random() * canvas.height * 0.5
        );
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // Gravity
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