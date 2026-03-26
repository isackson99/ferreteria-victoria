import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ImpresionService } from '../../core/services/impresion';
import { AuthService } from '../../core/services/auth';
import { CreditosService, ClienteCredito } from '../../core/services/creditos';
import { NavbarComponent } from '../../shared/components/navbar/navbar';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    NavbarComponent,
  ],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss'
})
export class ConfiguracionComponent implements OnInit {

  private impresionService = inject(ImpresionService);
  private authService      = inject(AuthService);
  private creditosService  = inject(CreditosService);
  private snackBar         = inject(MatSnackBar);

  autoImprimir = false;
  anchoPapel: '80' | '58' = '80';
  formatoDescripcion: 'corto' | 'completo' = 'completo';

  // ── Admin: precio especial ──────────────────────────────
  clientes = signal<ClienteCredito[]>([]);
  cargandoClientes = signal(false);
  guardandoId = signal<number | null>(null);

  esAdmin = computed(() => {
    const u = this.authService.usuarioActual();
    return u?.is_superuser === true || u?.rol?.nombre === 'Admin';
  });

  ngOnInit(): void {
    localStorage.removeItem('usar_qz');
    localStorage.removeItem('impresora_defecto');
    localStorage.removeItem('impresora_tickets');

    this.autoImprimir        = this.impresionService.autoImprimir;
    this.anchoPapel          = this.impresionService.anchoPapel;
    this.formatoDescripcion  = this.impresionService.formatoDescripcion;

    if (this.esAdmin()) {
      this.cargarClientes();
    }
  }

  private cargarClientes(): void {
    this.cargandoClientes.set(true);
    this.creditosService.getClientes().subscribe({
      next: (data) => {
        this.clientes.set(data);
        this.cargandoClientes.set(false);
      },
      error: () => this.cargandoClientes.set(false),
    });
  }

  togglePrecioEspecial(cliente: ClienteCredito): void {
    this.guardandoId.set(cliente.id);
    const nuevoValor = !cliente.precio_especial;
    this.creditosService.modificarCliente(cliente.id, { precio_especial: nuevoValor }).subscribe({
      next: () => {
        this.clientes.update(lista =>
          lista.map(c => c.id === cliente.id ? { ...c, precio_especial: nuevoValor } : c)
        );
        this.guardandoId.set(null);
        this.snackBar.open(
          nuevoValor ? 'Precio especial activado' : 'Precio especial desactivado',
          '', { duration: 2000 }
        );
      },
      error: () => {
        this.guardandoId.set(null);
        this.snackBar.open('Error al guardar cambio', '', { duration: 2500 });
      },
    });
  }

  // ── Impresión ──────────────────────────────────────────
  onAutoImprimirChange(): void {
    this.impresionService.guardarConfig('auto_imprimir', String(this.autoImprimir));
  }

  onAnchoPapelChange(): void {
    this.impresionService.guardarConfig('ancho_papel', this.anchoPapel);
  }

  onFormatoDescripcionChange(): void {
    this.impresionService.guardarConfig('formato_descripcion', this.formatoDescripcion);
  }

  imprimirPrueba(): void {
    const datos = this.impresionService.ticketDePrueba();
    this.impresionService.imprimirTicket(datos);
    this.snackBar.open('Ticket de prueba enviado a imprimir', '', { duration: 2000 });
  }

  readonly comandoKiosk =
    '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing';

  copiarComando(): void {
    navigator.clipboard.writeText(this.comandoKiosk).then(() => {
      this.snackBar.open('Comando copiado al portapapeles', '', { duration: 2000 });
    });
  }
}
