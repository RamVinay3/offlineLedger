import { Routes } from '@angular/router';
import { TabsComponent } from './pages/tabs/tabs.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { PeopleListComponent } from './pages/people/people-list.component';
import { PersonDetailComponent } from './pages/people/person-detail.component';
import { ActivityComponent } from './pages/activity/activity.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'tabs',
    component: TabsComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
      },
      {
        path: 'people',
        component: PeopleListComponent,
      },
      {
        path: 'activity',
        component: ActivityComponent,
      },
      {
        path: 'settings',
        component: SettingsComponent,
      },
    ],
  },
  {
    path: 'people/:id',
    component: PersonDetailComponent,
  },
  {
    path: '**',
    redirectTo: 'tabs/dashboard',
  },
];
