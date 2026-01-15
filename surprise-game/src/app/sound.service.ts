import { Injectable } from '@angular/core';
import { Category } from './game.service';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private currentBgMusic: HTMLAudioElement | null = null;

  constructor() {
    this.preloadSounds();
  }

  private preloadSounds() {
    // Add 'waiting-loop' to your assets
    const soundFiles = [
      'click',
      'whoosh',
      'reveal-novice',
      'reveal-avance',
      'reveal-elite',
      'reveal-prestige',
      'reveal-legendary',
      'win-fireworks',
      'waiting-loop' // NEW FILE
    ];

    soundFiles.forEach(file => {
      const audio = new Audio();
      audio.src = `assets/sounds/${file}.mp3`;
      audio.load();
      this.sounds.set(file, audio);
    });
  }

  play(name: string) {
    const audio = this.sounds.get(name);
    if (audio) {
      // Clone node ensures we can play overlapping sounds (like multiple clicks)
      // except for big tracks which we might want to control singly
      if (name === 'click' || name === 'whoosh') {
         const clone = audio.cloneNode() as HTMLAudioElement;
         clone.volume = 0.5;
         clone.play().catch(() => {});
      } else {
         audio.currentTime = 0;
         audio.volume = 0.5;
         audio.play().catch(e => console.warn(`Failed to play ${name}`, e));
      }
    }
  }

  playReveal(category: Category) {
    let soundFile = 'reveal-novice';
    let volume = 0.5;

    switch (category) {
      case 'Novice': soundFile = 'reveal-novice'; volume = 0.4; break;
      case 'Avancé': soundFile = 'reveal-avance'; volume = 0.5; break;
      case 'Élite': soundFile = 'reveal-elite'; volume = 0.6; break;
      case 'Prestige': soundFile = 'reveal-prestige'; volume = 0.8; break;
      case 'Légendaire': soundFile = 'reveal-legendary'; volume = 1.0; break;
    }

    const audio = this.sounds.get(soundFile);
    if (audio) {
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(e => console.warn(`Failed to play reveal ${soundFile}`, e));
    }
  }

  // --- BACKGROUND MUSIC CONTROLS ---

  startBackgroundMusic() {
    // Prevent double-starting
    if (this.currentBgMusic && !this.currentBgMusic.paused) return;

    const audio = this.sounds.get('waiting-loop');
    if (audio) {
      audio.loop = true; // IMPORTANT: Loop it
      audio.volume = 0.3; // Keep it subtle (30%)
      audio.currentTime = 0;
      audio.play().catch(e => console.warn('Bg Music Auto-play blocked', e));
      this.currentBgMusic = audio;
    }
  }

  stopBackgroundMusic() {
    if (this.currentBgMusic) {
      // Fade out effect could go here, but immediate stop is fine
      this.currentBgMusic.pause();
      this.currentBgMusic.currentTime = 0;
      this.currentBgMusic = null;
    }
  }

  stopAll() {
    this.stopBackgroundMusic();
    this.sounds.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
}