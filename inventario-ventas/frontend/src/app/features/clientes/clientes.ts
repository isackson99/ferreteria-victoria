import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { ClientesFacturaService, ClienteFactura } from '../../core/services/clientes-factura';

@Component({
  selector: 'app-clientes',
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
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
})
export class ClientesComponent implements OnInit {

  private service  = inject(ClientesFacturaService);
  private snackBar = inject(MatSnackBar);

  // ── Estado ──────────────────────────────────────────────
  clientes     = signal<ClienteFactura[]>([]);
  cargando     = signal(false);
  guardando    = signal(false);

  busqueda     = signal('');
  seleccionado = signal<ClienteFactura | null>(null);
  modoNuevo    = signal(false);

  // ── Confirmación eliminar ────────────────────────────────
  mostrarConfirm = false;
  confirmMensaje = '';

  // ── Campos del formulario ────────────────────────────────
  fRut      = '';
  fNombre   = '';
  fCorreo   = '';
  fTelefono = '';
  fDomicilio = '';
  fNotas    = '';

  // ── Validación RUT ───────────────────────────────────────
  rutValido    = true;
  rutDuplicado = false;

  // ── Lista filtrada ───────────────────────────────────────
  clientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.clientes();
    return this.clientes().filter(c =>
      c.rut.toLowerCase().includes(q) ||
      c.nombre.toLowerCase().includes(q)
    );
  });

  // ── Avatar ───────────────────────────────────────────────
  private readonly COLORES = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

  avatarInfo(c: ClienteFactura): { iniciales: string; color: string } {
    const palabras = c.nombre.trim().split(/\s+/).filter(Boolean);
    const iniciales = palabras.length
      ? palabras.map(p => p[0]).join('').substring(0, 2).toUpperCase()
      : '?';
    const color = this.COLORES[c.id % this.COLORES.length];
    return { iniciales, color };
  }

  get previewIniciales(): string {
    const palabras = this.fNombre.trim().split(/\s+/).filter(Boolean);
    return palabras.length
      ? palabras.map(p => p[0]).join('').substring(0, 2).toUpperCase()
      : '?';
  }

  // ── Ciclo de vida ────────────────────────────────────────
  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.service.listar().subscribe({
      next: (data) => { this.clientes.set(data); this.cargando.set(false); },
      error: ()     => this.cargando.set(false),
    });
  }

  // ── Selección ────────────────────────────────────────────
  seleccionar(c: ClienteFactura): void {
    this.seleccionado.set(c);
    this.modoNuevo.set(false);
    this.fRut       = c.rut;
    this.fNombre    = c.nombre;
    this.fCorreo    = c.correo ?? '';
    this.fTelefono  = c.telefono;
    this.fDomicilio = c.domicilio;
    this.fNotas     = c.notas;
    this.rutValido    = true;
    this.rutDuplicado = false;
  }

  nuevoCliente(): void {
    this.seleccionado.set(null);
    this.modoNuevo.set(true);
    this.limpiarForm();
  }

  cancelar(): void {
    const sel = this.seleccionado();
    if (sel) {
      this.seleccionar(sel);
    } else {
      this.modoNuevo.set(false);
      this.limpiarForm();
    }
  }

  private limpiarForm(): void {
    this.fRut = this.fNombre = this.fCorreo = this.fTelefono = this.fDomicilio = this.fNotas = '';
    this.rutValido = true;
    this.rutDuplicado = false;
  }

  // ── RUT ──────────────────────────────────────────────────
  onRutInput(event: Event): void {
    const el        = event.target as HTMLInputElement;
    const formatted = this.formatRut(el.value);
    this.fRut       = formatted;
    el.value        = formatted;
    this.rutValido  = formatted.replace(/[^0-9kK]/gi, '').length >= 3
      ? this.validarRut(formatted)
      : true;
    this.verificarDuplicado();
  }

  private verificarDuplicado(): void {
    const rut       = this.fRut.toLowerCase();
    const idActual  = this.seleccionado()?.id;
    this.rutDuplicado = this.clientes().some(
      c => c.rut.toLowerCase() === rut && c.id !== idActual
    );
  }

  formatRut(valor: string): string {
    const clean = valor.replace(/[^0-9kK]/gi, '').toUpperCase();
    if (clean.length < 2) return clean;
    const dv   = clean.slice(-1);
    const body = clean.slice(0, -1);
    let fmt = '';
    for (let i = body.length - 1, cnt = 0; i >= 0; i--, cnt++) {
      if (cnt > 0 && cnt % 3 === 0) fmt = '.' + fmt;
      fmt = body[i] + fmt;
    }
    return fmt + '-' + dv;
  }

  validarRut(rut: string): boolean {
    const clean = rut.replace(/[^0-9kK]/gi, '').toUpperCase();
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv   = clean.slice(-1);
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const rem      = 11 - (sum % 11);
    const expected = rem === 11 ? '0' : rem === 10 ? 'K' : String(rem);
    return dv === expected;
  }

  // ── Guardar ──────────────────────────────────────────────
  guardar(): void {
    // Validar longitudes máximas
    if (this.fNombre.length > 200)   { this.snackBar.open('Razón Social: máximo 200 caracteres', '', { duration: 2500 }); return; }
    if (this.fCorreo.length > 150)   { this.snackBar.open('Correo: máximo 150 caracteres', '', { duration: 2500 }); return; }
    if (this.fTelefono.length > 20)  { this.snackBar.open('Teléfono: máximo 20 caracteres', '', { duration: 2500 }); return; }
    if (this.fDomicilio.length > 200) { this.snackBar.open('Domicilio: máximo 200 caracteres', '', { duration: 2500 }); return; }
    if (this.fNotas.length > 500)    { this.snackBar.open('Notas: máximo 500 caracteres', '', { duration: 2500 }); return; }

    if (!this.fRut.trim() || !this.fNombre.trim()) {
      this.snackBar.open('RUT y Razón Social son requeridos', '', { duration: 2500 });
      return;
    }
    if (!this.rutValido) {
      this.snackBar.open('RUT inválido', '', { duration: 2500 });
      return;
    }
    if (this.rutDuplicado) {
      this.snackBar.open('RUT ya registrado', '', { duration: 2500 });
      return;
    }

    const payload: Partial<ClienteFactura> = {
      rut:       this.fRut.trim(),
      nombre:    this.fNombre.trim(),
      correo:    this.fCorreo.trim() || null,
      telefono:  this.fTelefono.trim(),
      domicilio: this.fDomicilio.trim(),
      notas:     this.fNotas.trim(),
    };

    this.guardando.set(true);

    const sel = this.seleccionado();
    if (sel) {
      this.service.actualizar(sel.id, payload).subscribe({
        next: (updated) => {
          this.clientes.update(list => list.map(c => c.id === updated.id ? updated : c));
          this.seleccionado.set(updated);
          this.guardando.set(false);
          this.snackBar.open('Cliente actualizado', '', { duration: 2000 });
        },
        error: (err) => {
          this.guardando.set(false);
          const msg = err?.error?.rut?.[0] ?? err?.error?.non_field_errors?.[0] ?? 'Error al guardar';
          this.snackBar.open(msg, '', { duration: 3000 });
        },
      });
    } else {
      this.service.crear(payload).subscribe({
        next: (nuevo) => {
          this.clientes.update(list =>
            [...list, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
          this.seleccionado.set(nuevo);
          this.modoNuevo.set(false);
          this.guardando.set(false);
          this.snackBar.open('Cliente creado', '', { duration: 2000 });
        },
        error: (err) => {
          this.guardando.set(false);
          const msg = err?.error?.rut?.[0] ?? err?.error?.non_field_errors?.[0] ?? 'Error al crear';
          this.snackBar.open(msg, '', { duration: 3000 });
        },
      });
    }
  }

  // ── Eliminar ─────────────────────────────────────────────
  solicitarEliminar(): void {
    const c = this.seleccionado();
    if (!c) return;
    this.confirmMensaje = `¿Eliminar a "${c.nombre}"?\nEsta acción no se puede deshacer.`;
    this.mostrarConfirm = true;
  }

  confirmarEliminar(): void {
    const id = this.seleccionado()!.id;
    this.mostrarConfirm = false;
    this.service.eliminar(id).subscribe({
      next: () => {
        this.clientes.update(list => list.filter(c => c.id !== id));
        this.seleccionado.set(null);
        this.modoNuevo.set(false);
        this.limpiarForm();
        this.snackBar.open('Cliente eliminado', '', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('No se puede eliminar: el cliente tiene registros asociados', '', { duration: 3500 });
      },
    });
  }

  cancelarEliminar(): void {
    this.mostrarConfirm = false;
  }

  // ── Exportar CSV ─────────────────────────────────────────
  exportarCSV(): void {
    const lista = this.clientesFiltrados();
    if (!lista.length) {
      this.snackBar.open('No hay clientes para exportar', '', { duration: 2000 });
      return;
    }
    const cabeceras = ['ID', 'RUT', 'Razón Social', 'Correo', 'Teléfono', 'Domicilio', 'Notas'];
    const filas = lista.map(c => [
      c.id, c.rut, c.nombre,
      c.correo ?? '', c.telefono, c.domicilio, c.notas,
    ]);
    const csv = [cabeceras, ...filas]
      .map(fila => fila.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'clientes-factura.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
