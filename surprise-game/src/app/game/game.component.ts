import { Component, inject, ElementRef, ViewChild, EffectRef, effect, computed, signal, OnDestroy, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GameService, Briefcase } from '../game.service';
import { SoundService } from '../sound.service';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export enum CATEGORY {
  NOVICE, AVANCE, ELITE, PRESTIGE, LEGENDAIRE
}

export const categoriesDetails = {
  [CATEGORY.NOVICE]: {
    "title": "Novice",
    "description": "Prix de consolation"
  },
  [CATEGORY.AVANCE]: {
    "title": "Avancé",
    "description": "Sympathique"
  },
  [CATEGORY.ELITE]: {
    "title": "Élite",
    "description": "CONVOITÉ"
  },
  [CATEGORY.PRESTIGE]: {
    "title": "Prestige",
    "description": "INCROYABLE"
  },
  [CATEGORY.LEGENDAIRE]: {
    "title": "Légendaire",
    "description": "ULTIME RÉCOMPENSE"
  },
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent implements OnDestroy {
  gs = inject(GameService);
  sanitizer = inject(DomSanitizer);
  sound = inject(SoundService);
  renderer = inject(Renderer2);

  categories = categoriesDetails;
  categoriesKeys = Object.keys(CATEGORY).filter((v) => !isNaN(Number(v)));

  @ViewChild('winnerCanvas') winnerCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  private ytPlayer: any = null;
  private winnerSequenceStarted = false;
  
  // NEW: Timer to force close video
  private videoTimer: any = null;

  // Round Title State
  showRoundTitle = signal(false);
  currentRoundTitle = signal('');

  heldCase = computed(() => this.gs.briefcases().find(c => c.isHeld) || null);
  
  unwonPrizes = computed(() => {
    const winnerId = this.heldCase()?.prize.id;
    return this.gs.prizes()
      .filter(p => p.id !== winnerId)
      .sort((a, b) => b.value - a.value);
  });

  zoomedCase: Briefcase | null = null;
  isRevealed = signal(false);

  remainingToOpen = computed(() => {
    if (this.gs.gameState() === 'PLAYING') {
      const opened = this.gs.casesOpenedInCurrentRound();
      const total = this.gs.rounds[this.gs.currentRoundIndex()];
      return total - opened;
    }
    return 0;
  });

  isPlayingVideo = signal(false);
  
  videoType = computed(() => {
    const url = this.heldCase()?.prize?.videoUrl || '';
    if (url.includes('/clip/')) return 'CLIP';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YOUTUBE_STANDARD';
    if (url) return 'GENERIC';
    return 'NONE';
  });

  safeVideoUrl = computed(() => {
    const url = this.heldCase()?.prize?.videoUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  youTubeEmbedUrl = computed(() => {
    const url = this.heldCase()?.prize?.videoUrl || '';
    let embedSrc = '';
    const origin = window.location.origin;

    const clipMatch = url.match(/youtube\.com\/clip\/([^?&/]+)/);
    const videoMatch = url.match(/v=([^&]+)/);
    const shortMatch = url.match(/youtu\.be\/([^?&/]+)/);

    if (clipMatch) {
      const clipId = clipMatch[1];
      embedSrc = `https://www.youtube.com/embed/clip/${clipId}?autoplay=1&rel=0&playsinline=1&origin=${origin}`;
    } 
    else {
      let videoId = '';
      if (videoMatch) videoId = videoMatch[1];
      else if (shortMatch) videoId = shortMatch[1];
      const embedMatch = url.match(/embed\/([^?&/]+)/);
      if (embedMatch) videoId = embedMatch[1];

      if (videoId) {
        embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&origin=${origin}`;
      }
    }
    return embedSrc ? this.sanitizer.bypassSecurityTrustResourceUrl(embedSrc) : null;
  });

  private animationId: number | null = null;

  constructor() {
    console.log(this.categoriesKeys);
    effect(() => {
      const state = this.gs.gameState();
      const currentHeld = this.heldCase();

      // MUSIC LOGIC
      if (state === 'SETUP' || state === 'RULES') {
        this.sound.startBackgroundMusic();
      } else {
        this.sound.stopBackgroundMusic();
      }

      // TRIGGER WINNER SEQUENCE
      if (state === 'FINISHED' && currentHeld?.isOpen && !this.winnerSequenceStarted) {
        this.winnerSequenceStarted = true;
        this.startWinnerSequence(currentHeld);
      }
    });
  }

  // --- GETTERS ---
  get boardCases() {
    return this.gs.briefcases().filter(c => !c.isHeld);
  }

  // --- ACTIONS ---

  confirmRules() {
    this.sound.play('click');
    this.gs.confirmRules();
  }

  triggerRoundInterstitial(title: string) {
    this.currentRoundTitle.set(title);
    this.showRoundTitle.set(true);
    

    setTimeout(() => {
      this.showRoundTitle.set(false);
    }, 2500);
  }

  handleCaseClick(c: Briefcase) {
    if (this.gs.gameState() === 'PICK_OWN') {
      this.sound.play('click');
      this.gs.selectMainCase(c.id);
      
      // TRIGGER FIRST ROUND
      setTimeout(() => this.triggerRoundInterstitial("ROUND 1"), 500);

    } else if (this.gs.gameState() === 'PLAYING') {
      if (!c.isOpen && !c.isHeld && !this.showRoundTitle()) {
        this.sound.play('whoosh');
        this.gs.openCase(c.id);
        
        const updatedCase = this.gs.briefcases().find(item => item.id === c.id);
        
        if (updatedCase) {
          this.zoomedCase = updatedCase;
          const category = updatedCase.prize.category;

          if (category === 'Prestige' || category === 'Légendaire') {
            this.isRevealed.set(false);
            setTimeout(() => {
              this.isRevealed.set(true);
              this.sound.playReveal(category); 
              if (category === 'Légendaire') this.triggerLegendaryImpact();
            }, 2500);
          } else {
            this.isRevealed.set(true);
            setTimeout(() => { this.sound.playReveal(category); }, 100);
          }
        }
      }
    }
  }

  closeZoom() {
    if (this.gs.gameState() === 'FINISHED') return; 

    this.sound.play('click');
    this.zoomedCase = null;
    this.isRevealed.set(false); 
    this.stopFireworks(); 

    // CHECK FOR ROUND ADVANCEMENT
    const previousRound = this.gs.currentRoundIndex();
    this.gs.advanceGame();
    const newRound = this.gs.currentRoundIndex();
    const newState = this.gs.gameState();

    if (newState === 'SWAP_ROUND') {
      this.triggerRoundInterstitial("DÉCISION FINALE");
    } else if (newRound > previousRound) {
      let title = `RONDE ${newRound + 1}`;
      if (newRound === 4) title = "DERNIÈRE RONDE";
      this.triggerRoundInterstitial(title);
    }
  }

  triggerLegendaryImpact() {
    this.renderer.addClass(document.body, 'impact-flash');
    this.renderer.addClass(document.body, 'impact-shake');
    setTimeout(() => {
      this.renderer.removeClass(document.body, 'impact-flash');
      this.renderer.removeClass(document.body, 'impact-shake');
    }, 1000);
  }

  // --- WINNER SEQUENCE ---

  startWinnerSequence(winner: Briefcase) {
    this.zoomedCase = winner;
    this.sound.play('whoosh');
    this.isRevealed.set(false);
    const category = winner.prize.category;
    if ([categoriesDetails[CATEGORY.LEGENDAIRE].title, categoriesDetails[CATEGORY.PRESTIGE].title].includes(category)) {
      setTimeout(() => { this.executeWinnerReveal(category); }, 2500);
    } else {
      setTimeout(() => { this.executeWinnerReveal(category); }, 100);
    }
  }

  executeWinnerReveal(category: any) {
    this.isRevealed.set(true);
    this.sound.playReveal(category);
    if (category === CATEGORY.LEGENDAIRE) this.triggerLegendaryImpact();
    
    setTimeout(() => { this.transitionToVideoOrSummary(); }, 5000);
  }

  transitionToVideoOrSummary() {
    this.zoomedCase = null;
    if (this.heldCase()?.prize.videoUrl) {
      this.isPlayingVideo.set(true);
      this.sound.play('whoosh');

      this.videoTimer = setTimeout(() => {
        this.onVideoEnded();
      }, 25000);

      if (this.videoType() === 'YOUTUBE_STANDARD') {
        setTimeout(() => this.initYouTubeAPI(), 500);
      }
    } else {
      this.tryStartWinnerFireworks();
    }
  }

  // --- YOUTUBE LOGIC ---

  initYouTubeAPI() {
    if (!window.YT || !window.YT.Player) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => this.waitForIframe();
    } else {
      this.waitForIframe();
    }
  }

  waitForIframe() {
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      const frame = document.getElementById('yt-player-frame');
      if (frame) {
        clearInterval(check);
        this.attachPlayer();
      } else if (attempts > 50) { 
        clearInterval(check);
      }
    }, 100);
  }

  attachPlayer() {
    try {
      this.ytPlayer = new window.YT.Player('yt-player-frame', {
        events: {
          'onReady': (event: any) => { event.target.playVideo(); },
          'onStateChange': (event: any) => { if (event.data === 0) this.onVideoEnded(); }
        }
      });
    } catch (e) { console.warn('YouTube Player API Error:', e); }
  }

  onVideoEnded() {
    // Stop the 20s force timer if it hasn't fired yet
    if (this.videoTimer) {
      clearTimeout(this.videoTimer);
      this.videoTimer = null;
    }

    this.isPlayingVideo.set(false);
    this.tryStartWinnerFireworks();
    if (this.ytPlayer) this.ytPlayer = null; 
  }

  // --- GENERAL ACTIONS ---

  resetGame() {
    this.sound.play('click');
    window.location.reload(); 
  }

  // --- FIREWORKS ---

  tryStartWinnerFireworks() {
    this.sound.play('win-fireworks');
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
        particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, alpha: 1, color });
      }
    };
    const loop = () => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      if (Math.random() < 0.05) createExplosion(Math.random() * canvas.width, Math.random() * canvas.height * 0.5);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.alpha -= 0.01;
        ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
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

  ngOnDestroy() {
    this.stopFireworks();
    if (this.ytPlayer) this.ytPlayer = null;
    if (this.videoTimer) clearTimeout(this.videoTimer);
  }
}