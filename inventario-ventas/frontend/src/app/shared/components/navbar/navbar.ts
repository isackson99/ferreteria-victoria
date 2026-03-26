import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/services/auth';
import { VentasService } from '../../../core/services/ventas';
import { NotificacionesService } from '../../../core/services/notificaciones';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatSnackBarModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class NavbarComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  notifSvc = inject(NotificacionesService);
  private ventasService = inject(VentasService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  panelAbierto = signal(false);

  get navItems() {
    const u = this.authService.usuarioActual();
    const esAdmin = u && (u.is_superuser || u.rol?.nombre === 'Admin');
    const items = [
      { label: 'Ventas',        ruta: '/ventas',        icono: 'point_of_sale' },
      { label: 'Créditos',      ruta: '/creditos',      icono: 'credit_card' },
      { label: 'Clientes',      ruta: '/clientes',      icono: 'people' },
      { label: 'Productos',     ruta: '/productos',     icono: 'inventory_2' },
      { label: 'Inventario',    ruta: '/inventario',    icono: 'warehouse' },
      { label: 'Configuración', ruta: '/configuracion', icono: 'settings' },
      { label: 'Reportes',      ruta: '/reportes',      icono: 'bar_chart' },
      { label: 'Corte',         ruta: '/corte',         icono: 'calculate' },
    ];
    if (esAdmin) {
      items.push({ label: 'Usuarios', ruta: '/usuarios', icono: 'manage_accounts' });
    }
    return items;
  }

  ngOnInit(): void {
    this.notifSvc.conectar();
  }

  ngOnDestroy(): void {}

  togglePanel(): void {
    this.panelAbierto.update(v => !v);
  }

  cerrarPanel(): void {
    this.panelAbierto.set(false);
  }

  marcarTodas(): void {
    this.notifSvc.marcarTodasLeidas();
  }

  abrirNotif(n: any): void {
    this.notifSvc.marcarLeida(n.id);
    this.panelAbierto.set(false);
    this.router.navigate(['/notificaciones']);
  }

  logout(): void {
    this.notifSvc.desconectar();
    this.authService.logout();
  }
}
