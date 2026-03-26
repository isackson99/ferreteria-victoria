import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface UsuarioData {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  rol: number | null;
  rol_nombre: string;
  is_active: boolean;
  is_superuser: boolean;
}

export interface Permiso {
  id: number;
  codigo: string;
  descripcion: string;
}

export interface Rol {
  id: number;
  nombre: string;
  permisos: Permiso[];
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private api = inject(ApiService);

  getUsuarios(): Observable<UsuarioData[]> { return this.api.get<UsuarioData[]>('usuarios/'); }
  crearUsuario(data: any): Observable<UsuarioData> { return this.api.post<UsuarioData>('usuarios/', data); }
  editarUsuario(id: number, data: any): Observable<UsuarioData> { return this.api.patch<UsuarioData>(`usuarios/${id}/`, data); }
  eliminarUsuario(id: number): Observable<any> { return this.api.delete(`usuarios/${id}/`); }
  getRoles(): Observable<Rol[]> { return this.api.get<Rol[]>('roles/'); }
  crearRol(nombre: string): Observable<Rol> { return this.api.post<Rol>('roles/', { nombre }); }
  asignarPermisos(rolId: number, permisoIds: number[]): Observable<Rol> {
    return this.api.post<Rol>(`roles/${rolId}/asignar_permisos/`, { permisos: permisoIds });
  }
  getPermisos(): Observable<Permiso[]> { return this.api.get<Permiso[]>('permisos/'); }
}
