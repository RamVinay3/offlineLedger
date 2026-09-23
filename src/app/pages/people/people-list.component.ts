import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoopStateService } from '../../core/state/loop-state.service';
import { PersonBalanceSummary, Person } from '../../core/models';
import { AddPersonModalComponent } from '../../components/add-person-modal/add-person-modal.component';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  peopleOutline,
  personAddOutline,
  searchOutline,
  chevronForwardOutline,
  cubeOutline,
  checkmarkCircleOutline,
  alertCircle,
} from 'ionicons/icons';

@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, AddPersonModalComponent],
  templateUrl: './people-list.component.html',
  styleUrl: './people-list.component.css',
})
export class PeopleListComponent {
  Math = Math;
  searchQuery = '';
  showAddModal = signal<boolean>(false);

  readonly filteredPeople = computed<PersonBalanceSummary[]>(() => {
    const list = this.state.personBalances();
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.personName.toLowerCase().includes(q));
  });

  constructor(
    public state: LoopStateService,
    private router: Router
  ) {
    addIcons({
      peopleOutline,
      personAddOutline,
      searchOutline,
      chevronForwardOutline,
      cubeOutline,
      checkmarkCircleOutline,
      alertCircle,
    });
  }

  openPerson(personId: string): void {
    this.router.navigate(['/people', personId], { state: { from: '/tabs/people' } });
  }

  onPersonCreated(person: Person): void {
    this.router.navigate(['/people', person.id], { state: { from: '/tabs/people' } });
  }
}
