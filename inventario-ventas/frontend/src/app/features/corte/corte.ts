import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { CorteService, ResumenCorte, HistorialCorte } from '../../core/services/corte';
import { ImpresionService } from '../../core/services/impresion';
import { AuthService } from '../../core/services/auth';
import { VentasService } from '../../core/services/ventas';
import { nextSort, sortArr, sortIcon, isActive, SortState, SORT_NONE } from '../../core/utils/sort';

@Component({
  selector: 'app-corte',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule, MatButtonModule, DatePipe, NavbarComponent],
  templateUrl: './corte.html',
  styleUrl: './corte.scss',
})
export class CorteComponent implements OnInit {
  private corteService = inject(CorteService);
  private impresionService = inject(ImpresionService);
  authService = inject(AuthService);
  private ventasService = inject(VentasService);
  private snackBar = inject(MatSnackBar);

  readonly sortIcon = sortIcon;
  readonly isActive = isActive;

  tab = signal<'hacer' | 'historial'>('hacer');
  resumen = signal<ResumenCorte | null>(null);
  historial = signal<HistorialCorte[]>([]);
  cargando = signal(false);
  cargandoHistorial = signal(false);
  dialogConfirmar = signal(false);
  confirmando = signal(false);
  ordenHistorial = signal<SortState>(SORT_NONE);

  historialOrdenado = computed(() => sortArr(this.historial(), this.ordenHistorial()));

  ventasDept = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    return Object.entries(r.ventas_por_departamento)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);
  });

  ngOnInit(): void {
    this.cargarResumen();
  }

  cargarResumen(): void {
    this.cargando.set(true);
    this.corteService.getResumen().subscribe({
      next: data => {
        this.resumen.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al cargar resumen del turno', '', { duration: 2500 });
      }
    });
  }

  switchTab(t: 'hacer' | 'historial'): void {
    this.tab.set(t);
    if (t !== 'historial') this.ordenHistorial.set(SORT_NONE);
    if (t === 'historial' && this.historial().length === 0) {
      this.cargarHistorial();
    }
  }

  ordenarHistorial(col: string): void {
    this.ordenHistorial.set(nextSort(this.ordenHistorial(), col));
  }

  cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.corteService.getHistorial().subscribe({
      next: data => {
        this.historial.set(data);
        this.cargandoHistorial.set(false);
      },
      error: () => {
        this.cargandoHistorial.set(false);
        this.snackBar.open('Error al cargar historial', '', { duration: 2500 });
      }
    });
  }

  abrirConfirmacion(): void {
    this.dialogConfirmar.set(true);
  }

  confirmar(imprimir: boolean): void {
    const r = this.resumen();
    if (!r) return;
    this.confirmando.set(true);

    if (imprimir) {
      this.impresionService.imprimirCorte(r);
    }

    // Small delay if printing to allow print dialog to open
    const delay = imprimir ? 500 : 0;
    setTimeout(() => {
      this.corteService.confirmar().subscribe({
        next: () => {
          this.confirmando.set(false);
          this.dialogConfirmar.set(false);
          this.ventasService.limpiarContador();
          this.authService.logout();
        },
        error: () => {
          this.confirmando.set(false);
          this.snackBar.open('Error al realizar el corte', '', { duration: 2500 });
        }
      });
    }, delay);
  }

  formatCLP(n: number): string {
    return '$' + Math.round(n).toLocaleString('es-CL');
  }
}
