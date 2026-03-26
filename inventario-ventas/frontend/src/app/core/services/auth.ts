import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, map, catchError } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  is_superuser: boolean;
  rol: { id: number; nombre: string };
  permisos: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl = 'http://192.168.1.8:8000/api';
  
  usuarioActual = signal<Usuario | null>(null);
  cargando = signal(false);

  constructor(private http: HttpClient, private router: Router) {
    this.cargarUsuarioDesdeStorage();
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/token/`, { username, password }).pipe(
      tap(response => {
        localStorage.setItem('access_token', response.access);
        localStorage.setItem('refresh_token', response.refresh);
        this.cargarUsuario();
      })
    );
  }

  cargarUsuario(): void {
    this.http.get<Usuario>(`${this.baseUrl}/auth/me/`).subscribe({
      next: usuario => {
        this.usuarioActual.set(usuario);
        localStorage.setItem('usuario', JSON.stringify(usuario));
      },
      error: () => this.logout()
    });
  }

  private cargarUsuarioDesdeStorage(): void {
    const token = localStorage.getItem('access_token');
    const usuarioGuardado = localStorage.getItem('usuario');
    if (token && usuarioGuardado) {
      try {
        this.usuarioActual.set(JSON.parse(usuarioGuardado));
      } catch {
        this.logout();
      }
    }
  }

  refreshToken(): Observable<any> {
    const refresh = localStorage.getItem('refresh_token');
    return this.http.post<any>(`${this.baseUrl}/token/refresh/`, { refresh }).pipe(
      tap(response => {
        localStorage.setItem('access_token', response.access);
        // ROTATE_REFRESH_TOKENS=True: el backend devuelve un nuevo refresh token
        if (response.refresh) {
          localStorage.setItem('refresh_token', response.refresh);
        }
      })
    );
  }

  verificarToken(): Observable<boolean> {
    return this.http.get<Usuario>(`${this.baseUrl}/auth/me/`).pipe(
      map(usuario => {
        this.usuarioActual.set(usuario);
        localStorage.setItem('usuario', JSON.stringify(usuario));
        return true;
      }),
      catchError(() => {
        this.logout();
        return of(false);
      })
    );
  }

  logout(): void {
    const usuarioId = this.usuarioActual()?.id;

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('ultima_verificacion');

    // Limpiar contador de tickets del usuario actual
    if (usuarioId) {
      localStorage.removeItem(`ticket_contador_${usuarioId}`);
      localStorage.removeItem(`ticket_numeros_${usuarioId}`);
    }
    localStorage.removeItem('ticket_contador_null');

    // NO limpiar: ancho_papel, formato_descripcion, impresora_defecto, auto_imprimir
    // (son configuraciones del equipo, no de la sesión)

    this.usuarioActual.set(null);
    this.router.navigate(['/login']);
  }

  estaAutenticado(): boolean {
    return !!localStorage.getItem('access_token');
  }

  tienePermiso(permiso: string): boolean {
    const usuario = this.usuarioActual();
    if (!usuario) return false;
    if (usuario.rol?.nombre === 'Admin') return true;
    return usuario.permisos?.includes(permiso) ?? false;
  }
}