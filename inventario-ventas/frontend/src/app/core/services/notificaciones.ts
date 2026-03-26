import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api';
import { AuthService } from './auth';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';

export interface Notificacion {
  id: number;
  tipo_codigo: string;
  tipo_nombre: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  referencia_id: number | null;
  referencia_tipo: string;
  creada: string;
}

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  cantidadNoLeidas = signal(0);
  notificacionesRecientes = signal<Notificacion[]>([]);

  private ws: WebSocket | null = null;
  private reconectarTimer: any = null;
  private intentos = 0;
  private desconectadoIntencional = false;

  conectar(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.desconectadoIntencional = false;
    const token = localStorage.getItem('access_token');
    if (!token) return;
    const host = window.location.hostname;
    this.ws = new WebSocket(`ws://${host}:8000/ws/notificaciones/?token=${token}`);
    this.ws.onopen = () => { this.intentos = 0; };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.tipo === 'no_leidas') {
          this.cantidadNoLeidas.set(data.cantidad);
          this.notificacionesRecientes.set(data.notificaciones || []);
        } else if (data.tipo === 'nueva_notificacion') {
          const n = data.notificacion;
          this.cantidadNoLeidas.update(c => c + 1);
          this.notificacionesRecientes.update(list => [n, ...list].slice(0, 10));
          this.snackBar.open(n.titulo, 'Ver', { duration: 4000 });
        }
      } catch {}
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.desconectadoIntencional && this.auth.usuarioActual()) {
        this.programarReconexion();
      }
    };
    this.ws.onerror = () => { this.ws?.close(); };
  }

  private programarReconexion(): void {
    if (this.reconectarTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.intentos), 30000);
    this.intentos++;
    this.reconectarTimer = setTimeout(() => {
      this.reconectarTimer = null;
      this.conectar();
    }, delay);
  }

  desconectar(): void {
    this.desconectadoIntencional = true;
    if (this.reconectarTimer) { clearTimeout(this.reconectarTimer); this.reconectarTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.cantidadNoLeidas.set(0);
    this.notificacionesRecientes.set([]);
    this.intentos = 0;
  }

  marcarLeida(id: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ accion: 'marcar_leida', id }));
    } else {
      this.api.post(`notificaciones/${id}/marcar_leida/`, {}).subscribe();
      this.cantidadNoLeidas.update(c => Math.max(0, c - 1));
      this.notificacionesRecientes.update(list =>
        list.map(n => n.id === id ? { ...n, leida: true } : n)
      );
    }
  }

  marcarTodasLeidas(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ accion: 'marcar_todas_leidas' }));
    } else {
      this.api.post('notificaciones/marcar_todas_leidas/', {}).subscribe();
    }
    this.cantidadNoLeidas.set(0);
    this.notificacionesRecientes.update(list => list.map(n => ({ ...n, leida: true })));
  }

  getNotificaciones(params?: any): Observable<Notificacion[]> {
    return this.api.get<Notificacion[]>('notificaciones/', params);
  }

  tiempoRelativo(fechaStr: string): string {
    const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
  }

  iconoTipo(codigo: string): string {
    const map: Record<string, string> = {
      stock_critico: 'warning', credito_vencido: 'credit_card_off',
      credito_por_vencer: 'schedule', producto_sin_stock: 'inventory',
    };
    return map[codigo] ?? 'notifications';
  }
}
