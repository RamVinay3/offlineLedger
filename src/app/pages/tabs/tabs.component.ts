import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FastEntryModalComponent } from '../../components/fast-entry-modal/fast-entry-modal.component';
import { LoopStateService } from '../../core/state/loop-state.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  home,
  peopleOutline,
  people,
  timeOutline,
  time,
  settingsOutline,
  settings,
  addOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, IonIcon, FastEntryModalComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.css',
})
export class TabsComponent {
  showFastEntry = signal<boolean>(false);

  constructor(public state: LoopStateService) {
    addIcons({
      homeOutline,
      home,
      peopleOutline,
      people,
      timeOutline,
      time,
      settingsOutline,
      settings,
      addOutline,
    });
  }

  onFastEntrySaved(): void {
    this.showFastEntry.set(false);
  }
}
