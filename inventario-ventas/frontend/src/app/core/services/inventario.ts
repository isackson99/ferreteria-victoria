import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { ProductoDetalle } from './productos';

export interface StockCritico {
  agotados: StockItem[];
  stock_bajo: StockItem[];
}

export interface StockItem {
  id: number;
  nombre: string;
  codigo: string;
  inventario_actual: number;
  inventario_minimo: number;
}

export interface MovimientoInventario {
  id: number;
  tipo: string;
  tipo_display: string;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  cantidad: number;
  stock_antes: number;
  stock_despues: number;
  motivo: string;
  usuario: string | null;
  referencia_venta: number | null;
  fecha: string;
}

export interface KardexResponse {
  producto: { id: number; nombre: string; codigo: string; inventario_actual: number };
  movimientos: KardexMovimiento[];
}

export interface KardexMovimiento {
  id: number;
  fecha: string;
  tipo: string;
  tipo_display: string;
  cantidad: number;
  stock_antes: number;
  stock_despues: number;
  motivo: string;
  usuario: string | null;
  referencia_venta: number | null;
}

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private api = inject(ApiService);

  ajustarInventario(id: number, payload: {
    nueva_cantidad: number;
    tipo?: string;
    motivo?: string;
    precio_venta?: number;
    precio_mayoreo?: number | null;
  }): Observable<ProductoDetalle> {
    return this.api.patch<ProductoDetalle>(`productos/${id}/ajustar_inventario/`, payload);
  }

  getStockCritico(): Observable<StockCritico> {
    return this.api.get<StockCritico>('reportes/stock-critico/');
  }

  getMovimientos(params?: { fecha?: string; tipo?: string; search?: string }): Observable<MovimientoInventario[]> {
    const p: Record<string, any> = {};
    if (params?.fecha) p['fecha'] = params.fecha;
    if (params?.tipo) p['tipo'] = params.tipo;
    if (params?.search) p['search'] = params.search;
    return this.api.get<MovimientoInventario[]>('reportes/movimientos-inventario/', p);
  }

  getKardex(productoId: number, params?: { desde?: string; hasta?: string }): Observable<KardexResponse> {
    const p: Record<string, any> = {};
    if (params?.desde) p['desde'] = params.desde;
    if (params?.hasta) p['hasta'] = params.hasta;
    return this.api.get<KardexResponse>(`reportes/kardex/${productoId}/`, p);
  }
}
