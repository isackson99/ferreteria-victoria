import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { VentasService } from '../../../core/services/ventas';
import { ImpresionService, DatosTicket } from '../../../core/services/impresion';

export interface VentaDia {
  id: number;
  folio: string;
  cajero: string;
  cajero_id: number;
  cliente: string;
  estado: string;
  total: number;
  completada: string | null;
  items: ItemDia[];
  pagos: PagoDia[];
}

export interface ItemDia {
  id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  precio_tipo: string;
  es_producto_comun: boolean;
  producto_id: number | null;
}

export interface PagoDia {
  metodo: string;
  metodo_display: string;
  monto_total: number;
  monto_recibido: number;
  vuelto: number;
}

@Component({
  selector: 'app-ventas-del-dia-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatIconModule, MatButtonModule,
    MatSnackBarModule, MatProgressSpinnerModule,
  ],
  templateUrl: './ventas-del-dia-dialog.html',
  styleUrl:    './ventas-del-dia-dialog.scss',
})
export class VentasDelDiaDialogComponent implements OnInit {

  private ventasService = inject(VentasService);
  private impresionService = inject(ImpresionService);
  private snackBar        = inject(MatSnackBar);
  private dialogRef       = inject(MatDialogRef<VentasDelDiaDialogComponent>);

  // ── Estado ──────────────────────────────────────────────────────────────────
  ventas         = signal<VentaDia[]>([]);
  cargando       = signal(false);
  isAdmin        = signal(false);

  ventaSeleccionada  = signal<VentaDia | null>(null);
  itemSeleccionadoId = signal<number | null>(null);

  // Filtros
  fechaFiltro  = this.hoyISO();
  cajeroFiltro = '';
  folioFiltro  = '';

  // Sub-modales
  mostrarDevolverItem = signal(false);
  mostrarClausurar    = signal(false);
  cargandoAccion      = signal(false);

  // Devolución parcial
  itemParaDevolver: ItemDia | null = null;
  cantidadDevolver = 1;

  // ── Computed ─────────────────────────────────────────────────────────────────
  ventasFiltradas = computed(() => {
    const q = this.folioFiltro.toLowerCase();
    return q
      ? this.ventas().filter(v => v.folio.toLowerCase().includes(q))
      : this.ventas();
  });

  cajerosDisponibles = computed(() => {
    const mapa = new Map<number, string>();
    for (const v of this.ventas()) mapa.set(v.cajero_id, v.cajero);
    return Array.from(mapa.entries()).map(([id, nombre]) => ({ id, nombre }));
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.cargarVentas();
  }

  // ── Carga ────────────────────────────────────────────────────────────────────
  cargarVentas(): void {
    this.cargando.set(true);
    this.ventaSeleccionada.set(null);
    this.itemSeleccionadoId.set(null);
    const cajeroId = this.cajeroFiltro ? parseInt(this.cajeroFiltro, 10) : undefined;
    this.ventasService.getVentasDelDia(this.fechaFiltro, cajeroId).subscribe({
      next: data => {
        this.ventas.set(data.ventas ?? []);
        this.isAdmin.set(data.is_admin ?? false);
        this.cargando.set(false);
      },
      error: () => {
        this.snackBar.open('Error al cargar ventas', '', { duration: 2500 });
        this.cargando.set(false);
      }
    });
  }

  // ── Selección ────────────────────────────────────────────────────────────────
  seleccionarVenta(venta: VentaDia): void {
    this.ventaSeleccionada.set(venta);
    this.itemSeleccionadoId.set(null);
  }

  seleccionarItem(itemId: number): void {
    this.itemSeleccionadoId.set(
      this.itemSeleccionadoId() === itemId ? null : itemId
    );
  }

  // ── Devolver ítem ────────────────────────────────────────────────────────────
  abrirDevolverItem(): void {
    const venta = this.ventaSeleccionada();
    const itemId = this.itemSeleccionadoId();
    if (!venta || itemId === null) return;
    const item = venta.items.find(i => i.id === itemId);
    if (!item) return;
    this.itemParaDevolver = item;
    this.cantidadDevolver = 1;
    this.mostrarDevolverItem.set(true);
  }

  ajustarCantidad(delta: number): void {
    if (!this.itemParaDevolver) return;
    const nuevo = this.cantidadDevolver + delta;
    if (nuevo >= 1 && nuevo <= this.itemParaDevolver.cantidad) {
      this.cantidadDevolver = nuevo;
    }
  }

  confirmarDevolverItem(): void {
    const venta = this.ventaSeleccionada();
    if (!venta || !this.itemParaDevolver) return;
    if (this.cantidadDevolver <= 0 || this.cantidadDevolver > this.itemParaDevolver.cantidad) {
      this.snackBar.open('Cantidad inválida', '', { duration: 2000 });
      return;
    }
    this.cargandoAccion.set(true);
    this.ventasService.devolverItem(venta.id, this.itemParaDevolver.id, this.cantidadDevolver).subscribe({
      next: data => {
        this.cargandoAccion.set(false);
        this.mostrarDevolverItem.set(false);
        this.snackBar.open(data.mensaje ?? 'Devolución registrada', '', { duration: 2500 });
        // Actualizar la venta en la lista con los datos devueltos
        const ventaActualizada: VentaDia = {
          ...venta,
          total: data.venta.total,
          estado: data.venta.estado,
          items: data.venta.items,
          pagos: data.venta.pagos,
        };
        this.ventas.update(lista =>
          lista.map(v => v.id === venta.id ? ventaActualizada : v)
        );
        this.ventaSeleccionada.set(ventaActualizada);
        this.itemSeleccionadoId.set(null);
      },
      error: err => {
        this.cargandoAccion.set(false);
        this.snackBar.open(err.error?.error ?? 'Error al registrar devolución', '', { duration: 3000 });
      }
    });
  }

  // ── Clausurar ────────────────────────────────────────────────────────────────
  abrirClausurar(): void {
    this.mostrarClausurar.set(true);
  }

  confirmarClausurar(): void {
    const venta = this.ventaSeleccionada();
    if (!venta) return;
    this.cargandoAccion.set(true);
    this.ventasService.clausurarVenta(venta.id).subscribe({
      next: data => {
        this.cargandoAccion.set(false);
        this.mostrarClausurar.set(false);
        this.snackBar.open(data.mensaje ?? 'Venta clausurada', '', { duration: 2500 });
        this.cargarVentas();
      },
      error: err => {
        this.cargandoAccion.set(false);
        this.snackBar.open(err.error?.error ?? 'Error al clausurar', '', { duration: 3000 });
      }
    });
  }

  // ── Imprimir copia ───────────────────────────────────────────────────────────
  imprimirCopia(): void {
    const venta = this.ventaSeleccionada();
    if (!venta) return;
    const datos: DatosTicket = {
      numero: venta.folio,
      fecha: venta.completada ?? new Date().toISOString(),
      cajero: venta.cajero,
      productos: venta.items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        precio_tipo: i.precio_tipo,
        subtotal: i.subtotal,
      })),
      total: venta.total,
      pagos: venta.pagos.map(p => ({ ...p, monto_tarjeta: 0 })),
      cliente_factura: venta.cliente !== 'Público General' ? { nombre: venta.cliente, rut: '', correo: null, telefono: null } : null,
      copia: 'COPIA CLIENTE',
    };
    this.impresionService.imprimirTicket(datos);
  }

  // ── Utils ────────────────────────────────────────────────────────────────────
  cerrar(): void {
    this.dialogRef.close();
  }

  private hoyISO(): string {
    const hoy = new Date();
    return hoy.toISOString().slice(0, 10);
  }

  horaCorta(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  metodoIcon(metodo: string): string {
    const map: Record<string, string> = {
      efectivo: 'payments', tarjeta: 'credit_card',
      mixto: 'compare_arrows', credito: 'account_balance',
    };
    return map[metodo] ?? 'payment';
  }
}
