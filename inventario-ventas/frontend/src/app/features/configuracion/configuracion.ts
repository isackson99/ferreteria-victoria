import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ImpresionService } from '../../core/services/impresion';
import { AuthService } from '../../core/services/auth';
import { CreditosService, ClienteCredito } from '../../core/services/creditos';
import { ApiService } from '../../core/services/api';
import { UsuariosService, UsuarioData, Rol, Permiso } from '../../core/services/usuarios';
import { NavbarComponent } from '../../shared/components/navbar/navbar';

export interface BackupInfo {
  nombre: string;
  fecha: string;
  tamano_mb: number;
}

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
  private apiService       = inject(ApiService);
  private usuariosService  = inject(UsuariosService);
  private snackBar         = inject(MatSnackBar);

  autoImprimir = false;
  anchoPapel: '80' | '58' = '80';
  formatoDescripcion: 'corto' | 'completo' = 'completo';

  // ── Admin: precio especial ──────────────────────────────
  clientes = signal<ClienteCredito[]>([]);
  cargandoClientes = signal(false);
  guardandoId = signal<number | null>(null);

  // ── Admin: backups ──────────────────────────────────────
  backups = signal<BackupInfo[]>([]);
  cargandoBackups = signal(false);
  creandoBackup = signal(false);

  espacioUsadoMB = computed(() =>
    this.backups().reduce((acc, b) => acc + b.tamano_mb, 0)
  );

  ultimoBackup = computed(() => this.backups()[0] ?? null);

  proximaLimpieza = computed(() => {
    const hoy = new Date();
    const mes = hoy.getDate() < 5 ? hoy.getMonth() : hoy.getMonth() + 1;
    const anio = mes > 11 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    return new Date(anio, mes % 12, 5);
  });

  esAdmin = computed(() => {
    const u = this.authService.usuarioActual();
    return u?.is_superuser === true || u?.rol?.nombre?.toLowerCase() === 'admin';
  });

  esSuperusuario = computed(() =>
    this.authService.usuarioActual()?.is_superuser === true
  );

  // ── Navegación lateral ──────────────────────────────────
  seccion = signal<'impresion' | 'ventas' | 'recuperacion' | 'usuarios'>('impresion');

  readonly navItems = [
    { id: 'impresion',    label: 'Impresión',    icono: 'print',         adminOnly: false },
    { id: 'ventas',       label: 'Ventas',        icono: 'point_of_sale', adminOnly: false },
    { id: 'recuperacion', label: 'Recuperación',  icono: 'backup',        adminOnly: true  },
    { id: 'usuarios',     label: 'Usuarios',      icono: 'people',        adminOnly: true  },
  ] as const;

  private adminDataCargado = false;

  constructor() {
    effect(() => {
      if (this.esAdmin() && !this.adminDataCargado) {
        this.adminDataCargado = true;
        this.cargarClientes();
        this.cargarBackups();
        this.cargarUsuarios();
        this.cargarRoles();
        this.cargarPermisos();
      }
    });
  }

  ngOnInit(): void {
    localStorage.removeItem('usar_qz');
    localStorage.removeItem('impresora_defecto');
    localStorage.removeItem('impresora_tickets');

    this.autoImprimir        = this.impresionService.autoImprimir;
    this.anchoPapel          = this.impresionService.anchoPapel;
    this.formatoDescripcion  = this.impresionService.formatoDescripcion;
  }

  // ── Precio especial ────────────────────────────────────
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

  // ── Backups ────────────────────────────────────────────
  cargarBackups(): void {
    this.cargandoBackups.set(true);
    this.apiService.get<BackupInfo[]>('configuracion/backups/').subscribe({
      next: data => {
        this.backups.set(data);
        this.cargandoBackups.set(false);
      },
      error: (err) => {
        this.cargandoBackups.set(false);
        console.error('Error al cargar backups:', err);
      },
    });
  }

  crearBackupManual(): void {
    this.creandoBackup.set(true);
    this.apiService.post<{ mensaje: string }>('configuracion/backup_manual/', {}).subscribe({
      next: res => {
        this.creandoBackup.set(false);
        this.snackBar.open(res.mensaje, '', { duration: 3000 });
        this.cargarBackups();
      },
      error: err => {
        this.creandoBackup.set(false);
        this.snackBar.open(err.error?.error ?? 'Error al crear backup', '', { duration: 3000 });
      },
    });
  }

  ultimoBackupHace(): string {
    const b = this.ultimoBackup();
    if (!b) return 'Nunca';
    const diff = Date.now() - new Date(b.fecha).getTime();
    const horas = Math.floor(diff / 3600000);
    if (horas < 1) return 'Hace menos de 1 hora';
    if (horas < 24) return `Hace ${horas} hora(s)`;
    const dias = Math.floor(horas / 24);
    return `Hace ${dias} día(s)`;
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

  // ── Usuarios ───────────────────────────────────────────
  tabUsuarios = signal<'usuarios' | 'roles'>('usuarios');
  busqueda = signal('');
  usuarios = signal<UsuarioData[]>([]);
  roles = signal<Rol[]>([]);
  permisos = signal<Permiso[]>([]);
  cargandoUsuarios = signal(false);
  guardandoUsuario = signal(false);

  usuarioSeleccionado = signal<UsuarioData | null>(null);
  modoFormulario = signal<'nuevo' | 'editar' | null>(null);

  form = signal({
    username: '', email: '', first_name: '', last_name: '',
    rol: null as number | null, is_active: true, is_superuser: false,
    password: '', confirmar_password: '', cambiar_password: false,
  });

  rolSeleccionado = signal<Rol | null>(null);
  permisosRolActual = signal<Set<number>>(new Set());
  nuevoRolNombre = signal('');
  creandoRol = signal(false);

  usuariosFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase();
    if (!q) return this.usuarios();
    return this.usuarios().filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.rol_nombre?.toLowerCase().includes(q)
    );
  });

  cargarUsuarios(): void {
    this.cargandoUsuarios.set(true);
    this.usuariosService.getUsuarios().subscribe({
      next: data => { this.usuarios.set(data); this.cargandoUsuarios.set(false); },
      error: () => { this.cargandoUsuarios.set(false); this.snackBar.open('Error al cargar usuarios', '', { duration: 2500 }); },
    });
  }

  cargarRoles(): void {
    this.usuariosService.getRoles().subscribe({ next: data => this.roles.set(data) });
  }

  cargarPermisos(): void {
    this.usuariosService.getPermisos().subscribe({ next: data => this.permisos.set(data) });
  }

  nuevoUsuario(): void {
    this.usuarioSeleccionado.set(null);
    this.modoFormulario.set('nuevo');
    this.form.set({
      username: '', email: '', first_name: '', last_name: '',
      rol: null, is_active: true, is_superuser: false,
      password: '', confirmar_password: '', cambiar_password: false,
    });
  }

  seleccionarUsuario(u: UsuarioData): void {
    this.usuarioSeleccionado.set(u);
    this.modoFormulario.set('editar');
    this.form.set({
      username: u.username, email: u.email || '',
      first_name: u.first_name || '', last_name: u.last_name || '',
      rol: u.rol, is_active: u.is_active, is_superuser: u.is_superuser,
      password: '', confirmar_password: '', cambiar_password: false,
    });
  }

  cancelarUsuario(): void {
    this.modoFormulario.set(null);
    this.usuarioSeleccionado.set(null);
  }

  guardarUsuario(): void {
    const f = this.form();
    if (f.username.length > 150)   { this.snackBar.open('Username: máximo 150 caracteres', '', { duration: 2500 }); return; }
    if (f.first_name.length > 100) { this.snackBar.open('Nombre: máximo 100 caracteres', '', { duration: 2500 }); return; }
    if (f.last_name.length > 100)  { this.snackBar.open('Apellido: máximo 100 caracteres', '', { duration: 2500 }); return; }
    if (f.email.length > 150)      { this.snackBar.open('Email: máximo 150 caracteres', '', { duration: 2500 }); return; }
    if (f.password && f.password.length > 100) { this.snackBar.open('Contraseña: máximo 100 caracteres', '', { duration: 2500 }); return; }
    if (!f.username.trim()) { this.snackBar.open('El username es obligatorio', '', { duration: 2000 }); return; }

    if (this.modoFormulario() === 'nuevo') {
      if (!f.password) { this.snackBar.open('La contraseña es obligatoria', '', { duration: 2000 }); return; }
      if (f.password !== f.confirmar_password) { this.snackBar.open('Las contraseñas no coinciden', '', { duration: 2000 }); return; }
    }
    if (f.cambiar_password && f.password !== f.confirmar_password) {
      this.snackBar.open('Las contraseñas no coinciden', '', { duration: 2000 }); return;
    }

    const payload: any = {
      username: f.username.trim(), email: f.email, first_name: f.first_name,
      last_name: f.last_name, rol: f.rol, is_active: f.is_active, is_superuser: f.is_superuser,
    };
    if (this.modoFormulario() === 'nuevo' || f.cambiar_password) {
      payload.password = f.password;
    }

    this.guardandoUsuario.set(true);
    const obs = this.modoFormulario() === 'nuevo'
      ? this.usuariosService.crearUsuario(payload)
      : this.usuariosService.editarUsuario(this.usuarioSeleccionado()!.id, payload);

    obs.subscribe({
      next: () => {
        this.guardandoUsuario.set(false);
        this.snackBar.open(this.modoFormulario() === 'nuevo' ? 'Usuario creado' : 'Usuario actualizado', '', { duration: 2000 });
        this.cancelarUsuario();
        this.cargarUsuarios();
      },
      error: (err) => {
        this.guardandoUsuario.set(false);
        const e = err?.error;
        const msg = e?.username?.[0] || e?.password?.[0] || e?.detail || e?.error || 'Error al guardar';
        this.snackBar.open(msg, '', { duration: 3000 });
      },
    });
  }

  toggleActivoUsuario(u: UsuarioData): void {
    this.usuariosService.editarUsuario(u.id, { is_active: !u.is_active }).subscribe({
      next: () => { this.cargarUsuarios(); },
      error: () => this.snackBar.open('Error', '', { duration: 2000 }),
    });
  }

  seleccionarRol(rol: Rol): void {
    this.rolSeleccionado.set(rol);
    this.permisosRolActual.set(new Set(rol.permisos.map(p => p.id)));
  }

  cancelarRol(): void { this.rolSeleccionado.set(null); }

  tienePermiso(permisoId: number): boolean {
    return this.permisosRolActual().has(permisoId);
  }

  togglePermiso(permisoId: number): void {
    const set = new Set(this.permisosRolActual());
    if (set.has(permisoId)) set.delete(permisoId);
    else set.add(permisoId);
    this.permisosRolActual.set(set);
  }

  guardarPermisos(): void {
    const rol = this.rolSeleccionado();
    if (!rol) return;
    this.guardandoUsuario.set(true);
    this.usuariosService.asignarPermisos(rol.id, [...this.permisosRolActual()]).subscribe({
      next: (rolActualizado) => {
        this.guardandoUsuario.set(false);
        this.snackBar.open('Permisos actualizados', '', { duration: 2000 });
        this.roles.update(list => list.map(r => r.id === rol.id ? rolActualizado : r));
        this.rolSeleccionado.set(rolActualizado);
      },
      error: () => { this.guardandoUsuario.set(false); this.snackBar.open('Error', '', { duration: 2000 }); },
    });
  }

  crearRol(): void {
    const nombre = this.nuevoRolNombre().trim();
    if (!nombre) return;
    this.usuariosService.crearRol(nombre).subscribe({
      next: (rol) => {
        this.roles.update(list => [...list, rol]);
        this.nuevoRolNombre.set('');
        this.creandoRol.set(false);
        this.snackBar.open(`Rol "${rol.nombre}" creado`, '', { duration: 2000 });
      },
      error: () => this.snackBar.open('Error al crear rol', '', { duration: 2000 }),
    });
  }

  iniciales(u: UsuarioData): string {
    const n = (u.first_name || u.username)[0]?.toUpperCase() ?? '?';
    const a = u.last_name?.[0]?.toUpperCase() ?? '';
    return n + a;
  }

  colorRol(nombre: string): string {
    const map: Record<string, string> = { 'Admin': '#c62828', 'Cajero': '#2e7d32', 'Vendedor': '#1565c0' };
    return map[nombre] ?? '#6a1b9a';
  }

  updateForm(field: string, value: any): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }
}
