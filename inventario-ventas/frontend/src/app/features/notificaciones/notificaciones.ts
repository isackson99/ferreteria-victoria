import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { NotificacionesService, Notificacion } from '../../core/services/notificaciones';

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, NavbarComponent],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.scss',
})
export class NotificacionesComponent implements OnInit {
  svc = inject(NotificacionesService);
  private snackBar = inject(MatSnackBar);

  notificaciones = signal<Notificacion[]>([]);
  cargando = signal(false);
  filtroLeida = signal<'' | 'true' | 'false'>('');

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    const params: any = {};
    if (this.filtroLeida() !== '') params['leida'] = this.filtroLeida();
    this.svc.getNotificaciones(params).subscribe({
      next: data => { this.notificaciones.set(data); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  marcarLeida(n: Notificacion): void {
    if (n.leida) return;
    this.svc.marcarLeida(n.id);
    this.notificaciones.update(list => list.map(x => x.id === n.id ? { ...x, leida: true } : x));
  }

  marcarTodas(): void {
    this.svc.marcarTodasLeidas();
    this.notificaciones.update(list => list.map(n => ({ ...n, leida: true })));
    this.snackBar.open('Todas marcadas como leídas', '', { duration: 2000 });
  }
}
