import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface DiaVenta {
  dia: string;
  total: number;
  cantidad: number;
  ganancia: number;
}

export interface CategoriaVenta {
  producto__categoria__nombre: string | null;
  total: number;
  ganancia: number;
}

export interface ResumenVentas {
  periodo: string;
  desde: string;
  hasta: string;
  es_admin: boolean;
  resumen: {
    total_ventas: number;
    cantidad_ventas: number;
    venta_promedio: number;
    ganancia: number;
    margen_utilidad: number;
  };
  por_metodo: {
    efectivo: number;
    tarjeta: number;
    credito: number;
    mixto: number;
  };
  por_dia: DiaVenta[];
  por_categoria: CategoriaVenta[];
  por_metodo_dia: Record<string, { efectivo: number; tarjeta: number; mixto: number; credito: number }>;
}

export interface UsuarioReporte {
  id: number;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private api = inject(ApiService);

  getResumen(params: {
    periodo?: string;
    desde?: string;
    hasta?: string;
    usuario_id?: number | null;
  }): Observable<ResumenVentas> {
    const p: Record<string, any> = { periodo: params.periodo ?? 'semana' };
    if (params.desde) p['desde'] = params.desde;
    if (params.hasta) p['hasta'] = params.hasta;
    if (params.usuario_id) p['usuario_id'] = params.usuario_id;
    return this.api.get<ResumenVentas>('reportes/resumen-ventas/', p);
  }

  getUsuarios(): Observable<UsuarioReporte[]> {
    return this.api.get<UsuarioReporte[]>('reportes/usuarios/');
  }
}
