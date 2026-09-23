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
  createOutline,
  callOutline,
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
  selectedPersonForEdit = signal<Person | null>(null);
  showEditModal = signal<boolean>(false);

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
      createOutline,
      callOutline,
    });
  }

  getPersonPhone(personId: string): string | undefined {
    return this.state.people().find((p) => p.id === personId)?.phoneNumber;
  }

  openPerson(personId: string): void {
    this.router.navigate(['/people', personId], { state: { from: '/tabs/people' } });
  }

  openEditModal(personId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const person = this.state.people().find((p) => p.id === personId) || null;
    if (person) {
      this.selectedPersonForEdit.set(person);
      this.showEditModal.set(true);
    }
  }

  onPersonCreated(person: Person): void {
    this.router.navigate(['/people', person.id], { state: { from: '/tabs/people' } });
  }
}
