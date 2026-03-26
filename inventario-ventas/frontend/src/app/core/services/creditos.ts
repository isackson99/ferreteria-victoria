import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface ClienteCredito {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string;
  credito_ilimitado: boolean;
  credito_maximo: number | null;
  precio_especial: boolean;
  saldo_usado: number;
  saldo_disponible: number | null;
  porcentaje_uso: number;
  cuenta_id: number | null;
}

export interface CuentaCredito {
  id: number;
  cliente: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_direccion: string;
  cliente_telefono: string;
  limite_credito: number | null;
  credito_ilimitado: boolean;
  saldo_usado: number;
  saldo_disponible: number | null;
  porcentaje_uso: number;
  ultimo_pago: string | null;
}

export interface MovimientoCredito {
  id: number;
  tipo: string;
  monto: number;
  fecha: string;
  usuario_nombre: string | null;
  metodo_pago: string;
  notas: string;
  ticket_numero: string | null;
}

export interface VentaCredito {
  id: number;
  numero: string;
  total: number;
  fecha: string;
  liquidado: boolean;
  items: DetalleVentaCredito[];
}

export interface DetalleVentaCredito {
  descripcion: string;
  precio_unitario: number;
  precio_costo: number;
  cantidad: number;
  subtotal: number;
  producto_id?: number | null;
}

export interface VentaGrupo {
  mes: string;
  ventas: VentaCredito[];
}

@Injectable({ providedIn: 'root' })
export class CreditosService {
  private api = inject(ApiService);

  getClientes(): Observable<ClienteCredito[]> {
    return this.api.get<ClienteCredito[]>('clientes-credito/');
  }

  crearCliente(payload: Partial<ClienteCredito>): Observable<ClienteCredito> {
    return this.api.post<ClienteCredito>('clientes-credito/', payload);
  }

  modificarCliente(id: number, payload: Partial<ClienteCredito>): Observable<ClienteCredito> {
    return this.api.patch<ClienteCredito>(`clientes-credito/${id}/`, payload);
  }

  eliminarCliente(id: number): Observable<void> {
    return this.api.delete<void>(`clientes-credito/${id}/`);
  }

  getCuentas(): Observable<CuentaCredito[]> {
    return this.api.get<CuentaCredito[]>('cuentas-credito/');
  }

  getCuenta(id: number): Observable<CuentaCredito> {
    return this.api.get<CuentaCredito>(`cuentas-credito/${id}/`);
  }

  getVentasCredito(cuentaId: number): Observable<VentaCredito[]> {
    return this.api.get<VentaCredito[]>(`cuentas-credito/${cuentaId}/ventas/`);
  }

  abonar(cuentaId: number, monto: number): Observable<CuentaCredito> {
    return this.api.post<CuentaCredito>(`cuentas-credito/${cuentaId}/abonar/`, { monto });
  }

  getAbonos(cuentaId: number): Observable<MovimientoCredito[]> {
    return this.api.get<MovimientoCredito[]>('movimientos-credito/', { cuenta_id: cuentaId, tipo: 'abono' });
  }
}
