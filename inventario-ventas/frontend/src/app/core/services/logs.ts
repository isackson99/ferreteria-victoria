import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { environment } from '../../../environments/environment';

export interface LogEvento {
  id: number;
  timestamp: string;
  usuario: number | null;
  usuario_nombre: string;
  tipo: string;
  modulo: string;
  descripcion: string;
  detalle: string | null;
  ip: string | null;
  nivel: string;
  ticket_id: number | null;
  session_id: string | null;
  duracion_ms: number | null;
  datos_extra: Record<string, any> | null;
}

export interface LogResumen {
  errores_24h: number;
  usuario_activo_hoy: string | null;
  operacion_lenta_hoy: { descripcion: string; duracion_ms: number; modulo: string } | null;
  ventas_hoy: number;
}

export interface LogsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LogEvento[];
}

export interface LogFiltros {
  tipo?: string;
  nivel?: string;
  modulo?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  search?: string;
  ticket_id?: number | string;
  session_id?: string;
  duracion_min?: number;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class LogsService {
  private api = inject(ApiService);
  private baseUrl = environment.baseUrl;

  /** UUID único para esta sesión de navegador. Se incluye automáticamente en todos los logs. */
  readonly sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  listar(filtros: LogFiltros = {}): Observable<LogsResponse> {
    const params: Record<string, any> = {};
    if (filtros.tipo)         params['tipo']         = filtros.tipo;
    if (filtros.nivel)        params['nivel']        = filtros.nivel;
    if (filtros.modulo)       params['modulo']       = filtros.modulo;
    if (filtros.fecha_inicio) params['fecha_inicio'] = filtros.fecha_inicio;
    if (filtros.fecha_fin)    params['fecha_fin']    = filtros.fecha_fin;
    if (filtros.search)       params['search']       = filtros.search;
    if (filtros.ticket_id)    params['ticket_id']    = filtros.ticket_id;
    if (filtros.session_id)   params['session_id']   = filtros.session_id;
    if (filtros.duracion_min) params['duracion_min'] = filtros.duracion_min;
    if (filtros.page && filtros.page > 1) params['page'] = filtros.page;
    return this.api.get<LogsResponse>('logs/', params);
  }

  resumen(): Observable<LogResumen> {
    return this.api.get<LogResumen>('logs/resumen/');
  }

  /** Fire-and-forget: registra un evento desde el frontend. */
  registrar(
    tipo: string,
    modulo: string,
    descripcion: string,
    detalle?: string,
    nivel = 'INFO',
    extra?: { ticket_id?: number; duracion_ms?: number; datos_extra?: any },
  ): void {
    const payload: any = {
      tipo, modulo, descripcion,
      detalle: detalle ?? null,
      nivel,
      session_id: this.sessionId,
    };
    if (extra?.ticket_id)    payload['ticket_id']    = extra.ticket_id;
    if (extra?.duracion_ms)  payload['duracion_ms']  = extra.duracion_ms;
    if (extra?.datos_extra)  payload['datos_extra']  = extra.datos_extra;
    this.api.post('logs/', payload).subscribe({ error: () => {} });
  }

  /** Registra un error HTTP usando fetch (evita loop en interceptors). */
  static registrarError(status: number, method: string, url: string, errorBody: any, sessionId?: string): void {
    const token = localStorage.getItem('access_token');
    const path  = url.replace(/https?:\/\/[^/]+/, '').slice(0, 120);
    const payload = {
      tipo: 'ERROR',
      modulo: path.split('?')[0].slice(0, 100),
      descripcion: `HTTP ${status} ${method} ${path}`,
      detalle: JSON.stringify(errorBody).slice(0, 2000),
      nivel: status >= 500 ? 'ERROR' : 'WARNING',
      ...(sessionId ? { session_id: sessionId } : {}),
    };
    fetch(`${environment.baseUrl}/logs/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}
