import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService, Briefcase } from '../game.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent {
  gs = inject(GameService);
  zoomedCase: Briefcase | null = null;

  // Getters for template
  get heldCase() { return this.gs.briefcases().find(c => c.isHeld); }
  get boardCases() { return this.gs.briefcases().filter(c => !c.isHeld); }
  
  get remainingToOpen() {
    return this.gs.rounds[this.gs.currentRoundIndex()] - this.gs.casesOpenedInCurrentRound();
  }

  handleCaseClick(c: Briefcase) {
    if (this.gs.gameState() === 'PICK_OWN') {
      this.gs.selectMainCase(c.id);
    } else if (this.gs.gameState() === 'PLAYING' && !c.isOpen) {
      this.gs.openCase(c.id);
      this.zoomedCase = c; // Trigger animation
    }
  }

  closeZoom() {
    this.zoomedCase = null;
  }
}