import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoopStateService } from '../../core/state/loop-state.service';
import { Activity } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  timeOutline,
  searchOutline,
  personOutline,
  chevronForwardOutline,
  cashOutline,
  cubeOutline,
  checkboxOutline,
  swapHorizontalOutline,
  calendarOutline,
  archiveOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.css',
})
export class ActivityComponent {
  searchQuery = '';

  readonly filteredActivities = computed<Activity[]>(() => {
    const list = this.state.activities();
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((a) => {
      const matchName = (a.personName || '').toLowerCase().includes(q);
      const matchDesc = a.description.toLowerCase().includes(q);
      const matchType = a.eventType.toLowerCase().includes(q);
      return matchName || matchDesc || matchType;
    });
  });

  constructor(
    public state: LoopStateService,
    private router: Router
  ) {
    addIcons({
      timeOutline,
      searchOutline,
      personOutline,
      chevronForwardOutline,
      cashOutline,
      cubeOutline,
      checkboxOutline,
      swapHorizontalOutline,
      calendarOutline,
      archiveOutline,
      checkmarkCircleOutline,
    });
  }

  getBulletClass(type: string): string {
    if (type.includes('MONEY') || type.includes('PAYMENT')) return 'bullet-payment';
    if (type.includes('ITEM')) return 'bullet-item';
    if (type.includes('SETTLEMENT')) return 'bullet-settlement';
    return 'bullet-default';
  }

  getEventIcon(type: string): string {
    if (type.includes('PAYMENT')) return 'cash-outline';
    if (type.includes('ITEM')) return 'cube-outline';
    if (type.includes('SETTLEMENT')) return 'swap-horizontal-outline';
    if (type.includes('DUE_DATE')) return 'calendar-outline';
    if (type.includes('ARCHIVED')) return 'archiveOutline';
    return 'checkmark-circle-outline';
  }

  formatTimestamp(isoStr: string): string {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  openPerson(personId?: string): void {
    if (personId) {
      this.router.navigate(['/people', personId], { state: { from: '/tabs/activity' } });
    }
  }
}
