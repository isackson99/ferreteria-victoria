import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { UsuariosService, UsuarioData, Rol, Permiso } from '../../core/services/usuarios';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, NavbarComponent],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class UsuariosComponent implements OnInit {
  private svc = inject(UsuariosService);
  authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  tab = signal<'usuarios' | 'roles'>('usuarios');
  busqueda = signal('');
  usuarios = signal<UsuarioData[]>([]);
  roles = signal<Rol[]>([]);
  permisos = signal<Permiso[]>([]);
  cargando = signal(false);
  guardando = signal(false);

  usuarioSeleccionado = signal<UsuarioData | null>(null);
  modoFormulario = signal<'nuevo' | 'editar' | null>(null);

  // Form fields
  form = signal({
    username: '', email: '', first_name: '', last_name: '',
    rol: null as number | null, is_active: true, is_superuser: false,
    password: '', confirmar_password: '', cambiar_password: false,
  });

  rolSeleccionado = signal<Rol | null>(null);
  permisosRolActual = signal<Set<number>>(new Set());

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

  ngOnInit(): void {
    this.cargarUsuarios();
    this.cargarRoles();
    this.cargarPermisos();
  }

  cargarUsuarios(): void {
    this.cargando.set(true);
    this.svc.getUsuarios().subscribe({
      next: data => { this.usuarios.set(data); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.snackBar.open('Error al cargar usuarios', '', { duration: 2500 }); },
    });
  }

  cargarRoles(): void {
    this.svc.getRoles().subscribe({ next: data => this.roles.set(data) });
  }

  cargarPermisos(): void {
    this.svc.getPermisos().subscribe({ next: data => this.permisos.set(data) });
  }

  nuevo(): void {
    this.usuarioSeleccionado.set(null);
    this.modoFormulario.set('nuevo');
    this.form.set({
      username: '', email: '', first_name: '', last_name: '',
      rol: null, is_active: true, is_superuser: false,
      password: '', confirmar_password: '', cambiar_password: false,
    });
  }

  seleccionar(u: UsuarioData): void {
    this.usuarioSeleccionado.set(u);
    this.modoFormulario.set('editar');
    this.form.set({
      username: u.username, email: u.email || '',
      first_name: u.first_name || '', last_name: u.last_name || '',
      rol: u.rol, is_active: u.is_active, is_superuser: u.is_superuser,
      password: '', confirmar_password: '', cambiar_password: false,
    });
  }

  cancelar(): void {
    this.modoFormulario.set(null);
    this.usuarioSeleccionado.set(null);
  }

  guardar(): void {
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

    this.guardando.set(true);
    const obs = this.modoFormulario() === 'nuevo'
      ? this.svc.crearUsuario(payload)
      : this.svc.editarUsuario(this.usuarioSeleccionado()!.id, payload);

    obs.subscribe({
      next: () => {
        this.guardando.set(false);
        this.snackBar.open(this.modoFormulario() === 'nuevo' ? 'Usuario creado' : 'Usuario actualizado', '', { duration: 2000 });
        this.cancelar();
        this.cargarUsuarios();
      },
      error: (err) => {
        this.guardando.set(false);
        const msg = err?.error?.username?.[0] || 'Error al guardar';
        this.snackBar.open(msg, '', { duration: 3000 });
      },
    });
  }

  toggleActivo(u: UsuarioData): void {
    this.svc.editarUsuario(u.id, { is_active: !u.is_active }).subscribe({
      next: () => { this.cargarUsuarios(); },
      error: () => this.snackBar.open('Error', '', { duration: 2000 }),
    });
  }

  // Roles tab
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
    this.guardando.set(true);
    this.svc.asignarPermisos(rol.id, [...this.permisosRolActual()]).subscribe({
      next: (rolActualizado) => {
        this.guardando.set(false);
        this.snackBar.open('Permisos actualizados', '', { duration: 2000 });
        this.roles.update(list => list.map(r => r.id === rol.id ? rolActualizado : r));
        this.rolSeleccionado.set(rolActualizado);
      },
      error: () => { this.guardando.set(false); this.snackBar.open('Error', '', { duration: 2000 }); },
    });
  }

  nuevoRolNombre = signal('');
  creandoRol = signal(false);

  crearRol(): void {
    const nombre = this.nuevoRolNombre().trim();
    if (!nombre) return;
    this.svc.crearRol(nombre).subscribe({
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
