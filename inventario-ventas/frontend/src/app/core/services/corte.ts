import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface ResumenCorte {
  desde: string | null;
  hasta: string;
  usuario: string;
  cantidad_tickets: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_credito: number;
  total_mixto: number;
  total_ventas: number;
  total_entradas: number;
  total_salidas: number;
  total_abonos_credito: number;
  total_devoluciones: number;
  ventas_por_departamento: Record<string, number>;
  clientes_top: { cliente_credito__nombre: string; total: number; compras: number }[];
  efectivo_en_caja: number;
  entradas_detalle: { id: number; motivo: string; monto: number; fecha: string }[];
  salidas_detalle: { id: number; motivo: string; monto: number; fecha: string }[];
  abonos_detalle: { id: number; cliente: string; monto: number; metodo_pago: string; fecha: string }[];
}

export interface HistorialCorte {
  id: number;
  usuario: string;
  fecha_corte: string;
  fecha_inicio: string | null;
  cantidad_tickets: number;
  total_ventas: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_credito: number;
  total_mixto: number;
  total_entradas: number;
  total_salidas: number;
  total_abonos_credito: number;
  total_devoluciones: number;
  efectivo_en_caja: number;
  notas: string;
}

@Injectable({ providedIn: 'root' })
export class CorteService {
  private api = inject(ApiService);

  getResumen(): Observable<ResumenCorte> {
    return this.api.get<ResumenCorte>('corte/resumen/');
  }

  confirmar(notas = ''): Observable<{ mensaje: string; corte_id: number }> {
    return this.api.post<{ mensaje: string; corte_id: number }>('corte/confirmar/', { notas });
  }

  getHistorial(): Observable<HistorialCorte[]> {
    return this.api.get<HistorialCorte[]>('corte/historial/');
  }
}
