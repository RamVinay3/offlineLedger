import { Component, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { DatabaseService } from './core/database/database.service';
import { SecurityService } from './core/services/security.service';
import { LoopStateService } from './core/state/loop-state.service';
import { LockScreenComponent } from './components/lock-screen/lock-screen.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet, LockScreenComponent],
  templateUrl: 'app.component.html',
})
export class AppComponent implements OnInit {
  isReady = signal<boolean>(false);

  constructor(
    private db: DatabaseService,
    private security: SecurityService,
    private state: LoopStateService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // 0. Ensure Android status bar does not overlay app header
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setOverlaysWebView({ overlay: false });
        } catch (e) {
          // Ignored on web/unsupported platforms
        }
      }
      // 1. Initialize SQLite Database
      await this.db.init();

      // 2. Initialize Security & Settings
      await this.security.init();

      // 3. Load initial domain state into Angular Signals
      await this.state.loadInitialData();

      // 4. Apply initial theme
      this.state.applyTheme(this.state.settings().theme);
    } catch (error) {
      console.error('Fatal initialization error in LOOP app:', error);
    } finally {
      this.isReady.set(true);
      this.cdr.markForCheck();
    }
  }
}
