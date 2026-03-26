import { Component, OnInit, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ClientesFacturaService, ClienteFactura } from '../../../core/services/clientes-factura';

@Component({
  selector: 'app-asignar-cliente-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './asignar-cliente-dialog.html',
  styleUrl: './asignar-cliente-dialog.scss',
})
export class AsignarClienteDialogComponent implements OnInit {

  private dialogRef = inject(MatDialogRef<AsignarClienteDialogComponent>);
  private data      = inject<{ clienteActual: number | null }>(MAT_DIALOG_DATA);
  private service   = inject(ClientesFacturaService);

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('listbox')     listboxRef!: ElementRef<HTMLDivElement>;

  clientes     = signal<ClienteFactura[]>([]);
  cargando     = signal(true);
  busqueda     = signal('');
  seleccionado = signal<ClienteFactura | null>(null);

  private readonly COLORES = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

  clientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.clientes();
    return this.clientes().filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.rut.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.service.listar().subscribe({
      next: (lista) => {
        this.clientes.set(lista);
        this.cargando.set(false);
        // Pre-seleccionar el cliente actual si existe, o el primero
        const actual = this.data.clienteActual
          ? lista.find(c => c.id === this.data.clienteActual) ?? null
          : null;
        this.seleccionado.set(actual ?? (lista[0] ?? null));
        setTimeout(() => {
          this.searchInputRef?.nativeElement.focus();
          this.scrollToSelected();
        }, 80);
      },
      error: () => this.cargando.set(false),
    });
  }

  avatarInfo(c: ClienteFactura): { iniciales: string; color: string } {
    const palabras = c.nombre.trim().split(/\s+/).filter(Boolean);
    const iniciales = palabras.length
      ? palabras.map(p => p[0]).join('').substring(0, 2).toUpperCase()
      : '?';
    return { iniciales, color: this.COLORES[c.id % this.COLORES.length] };
  }

  onKeydown(event: KeyboardEvent): void {
    const lista = this.clientesFiltrados();
    if (lista.length === 0) return;
    const selId = this.seleccionado()?.id ?? null;
    const idx   = selId !== null ? lista.findIndex(c => c.id === selId) : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.seleccionado.set(lista[idx < lista.length - 1 ? idx + 1 : 0]);
      this.scrollToSelected();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.seleccionado.set(lista[idx > 0 ? idx - 1 : lista.length - 1]);
      this.scrollToSelected();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.seleccionado()) this.confirmar();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelar();
    }
  }

  private scrollToSelected(): void {
    setTimeout(() => {
      const el = this.listboxRef?.nativeElement?.querySelector('.row-sel') as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }, 10);
  }

  abrirNuevoCliente(): void {
    window.open('/clientes', '_blank');
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  confirmar(): void {
    this.dialogRef.close(this.seleccionado());
  }
}
