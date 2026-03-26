import { Injectable, inject, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth';

const TIMEOUT_MS    = 8 * 60 * 60 * 1000; // 8 horas
const WARNING_MS    = 5 * 60 * 1000;       // avisar 5 min antes

@Injectable({ providedIn: 'root' })
export class InactividadService {
  private auth     = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private zone     = inject(NgZone);

  private timerLogout:  ReturnType<typeof setTimeout> | null = null;
  private timerWarning: ReturnType<typeof setTimeout> | null = null;
  private snackRef: any = null;
  private iniciado = false;

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    const EVENTOS = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    this.zone.runOutsideAngular(() => {
      EVENTOS.forEach(ev =>
        document.addEventListener(ev, () => this.resetTimer(), { passive: true })
      );
    });

    this.resetTimer();
  }

  resetTimer(): void {
    clearTimeout(this.timerLogout  ?? undefined);
    clearTimeout(this.timerWarning ?? undefined);
    this.snackRef?.dismiss();

    if (!this.auth.estaAutenticado()) return;

    // Aviso 5 minutos antes del cierre
    this.timerWarning = setTimeout(() => {
      this.zone.run(() => {
        this.snackRef = this.snackBar.open(
          'Tu sesión expirará en 5 minutos por inactividad',
          'Continuar',
          { duration: WARNING_MS }
        );
        this.snackRef.onAction().subscribe(() => this.resetTimer());
      });
    }, TIMEOUT_MS - WARNING_MS);

    // Cierre de sesión automático
    this.timerLogout = setTimeout(() => {
      this.zone.run(() => {
        this.snackRef?.dismiss();
        this.snackBar.open('Sesión cerrada por inactividad', '', { duration: 3000 });
        this.auth.logout();
      });
    }, TIMEOUT_MS);
  }
}
