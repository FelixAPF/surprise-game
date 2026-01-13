import { Component, inject, ElementRef, ViewChild, EffectRef, effect, computed, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GameService, Briefcase } from '../game.service';

// Declare YouTube API types
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
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

  @ViewChild('winnerCanvas') winnerCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  // Ref for the YouTube placeholder
  @ViewChild('ytPlayer') ytPlayerRef?: ElementRef<HTMLDivElement>;

  heldCase = computed(() => this.gs.briefcases().find(c => c.isHeld) || null);
  
  unwonPrizes = computed(() => {
    const winnerId = this.heldCase()?.prize.id;
    return this.gs.prizes()
      .filter(p => p.id !== winnerId)
      .sort((a, b) => b.value - a.value);
  });

  zoomedCase: Briefcase | null = null;
  
  remainingToOpen = computed(() => {
    if (this.gs.gameState() === 'PLAYING') {
      const opened = this.gs.casesOpenedInCurrentRound();
      const total = this.gs.rounds[this.gs.currentRoundIndex()];
      return total - opened;
    }
    return 0;
  });

  isPlayingVideo = signal(false);
  
  // Helper to determine if the video is YouTube or generic
  videoType = computed(() => {
    const url = this.heldCase()?.prize?.videoUrl || '';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YOUTUBE';
    if (url) return 'GENERIC';
    return 'NONE';
  });

  // Safe URL for Generic Video
  safeVideoUrl = computed(() => {
    const url = this.heldCase()?.prize?.videoUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  private animationId: number | null = null;
  private ytPlayer: any = null;

  constructor() {
    effect(() => {
      const state = this.gs.gameState();
      const currentHeld = this.heldCase();

      if (state === 'FINISHED' && currentHeld?.isOpen) {
        if (currentHeld.prize.videoUrl) {
          this.isPlayingVideo.set(true);
          // If YouTube, init player after view update
          if (this.videoType() === 'YOUTUBE') {
            setTimeout(() => this.initYouTubePlayer(currentHeld.prize.videoUrl!), 100);
          }
        } else {
          this.tryStartWinnerFireworks();
        }
      }
    });
  }

  // --- YOUTUBE LOGIC ---

  initYouTubePlayer(url: string) {
    // 1. Extract Video ID (basic regex support)
    let videoId = '';
    const embedMatch = url.match(/embed\/([^?&]+)/);
    const watchMatch = url.match(/v=([^&]+)/);
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    
    // For CLIPS, extracting ID is hard from URL. 
    // Best effort: Assume user provided a CLEAN Embed URL from Admin.
    // If not, we fall back to a basic parsing.
    
    if (embedMatch) videoId = embedMatch[1];
    else if (watchMatch) videoId = watchMatch[1];
    else if (shortMatch) videoId = shortMatch[1];

    if (!window.YT) {
      // Load API if not ready
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => this.createPlayer(videoId, url);
    } else {
      this.createPlayer(videoId, url);
    }
  }

  createPlayer(videoId: string, fullUrl: string) {
    // If we couldn't parse ID (e.g. complex Clip URL), try using the full URL as source in an iframe manually
    // But the API requires an ID. 
    // FIX: If it's a CLIP URL (youtube.com/clip/...), we strictly need the Embed code logic.
    // Assuming the Admin panel logic (below) fixed the URL to be an embed URL.
    
    // If we still can't find an ID but have an embed URL, we might need a raw iframe.
    // For now, let's assume standard ID works or fallback to just playing.
    
    if (!this.ytPlayerRef) return;

    this.ytPlayer = new window.YT.Player(this.ytPlayerRef.nativeElement, {
      height: '100%',
      width: '100%',
      videoId: videoId, 
      // If videoId is empty, this might fail. 
      // Ideally we'd use playerVars to load a specific URL but API prefers IDs.
      playerVars: {
        'autoplay': 1,
        'controls': 0,
        'rel': 0,
        'playsinline': 1
      },
      events: {
        'onReady': (event: any) => event.target.playVideo(),
        'onStateChange': (event: any) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            this.onVideoEnded();
          }
        }
      }
    });
  }

  // --- GENERIC VIDEO LOGIC ---

  onVideoEnded() {
    this.isPlayingVideo.set(false);
    this.tryStartWinnerFireworks();
    // Cleanup YouTube
    if (this.ytPlayer) {
      this.ytPlayer.destroy();
      this.ytPlayer = null;
    }
  }

  ngOnDestroy() {
    if (this.ytPlayer) {
      this.ytPlayer.destroy();
    }
  }

  // ... (Keep existing Methods: get boardCases, handleCaseClick, closeZoom, resetGame, Fireworks) ...
  
  get boardCases() {
    return this.gs.briefcases().filter(c => !c.isHeld);
  }

  handleCaseClick(c: Briefcase) {
    if (this.gs.gameState() === 'PICK_OWN') {
      this.gs.selectMainCase(c.id);
    } else if (this.gs.gameState() === 'PLAYING') {
      if (!c.isOpen && !c.isHeld) {
        this.gs.openCase(c.id);
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