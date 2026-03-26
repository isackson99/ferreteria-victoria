import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface ClienteFactura {
  id: number;
  rut: string;
  nombre: string;
  correo: string | null;
  telefono: string;
  giro: string;
  ciudad: string;
  domicilio: string;
  notas: string;
  activo: boolean;
  creado: string;
}

@Injectable({ providedIn: 'root' })
export class ClientesFacturaService {
  private api = inject(ApiService);

  listar(): Observable<ClienteFactura[]> {
    return this.api.get<ClienteFactura[]>('clientes-factura/', { page_size: 1000 });
  }

  buscar(query: string): Observable<ClienteFactura[]> {
    return this.api.get<ClienteFactura[]>('clientes-factura/', { search: query });
  }

  crear(data: Partial<ClienteFactura>): Observable<ClienteFactura> {
    return this.api.post<ClienteFactura>('clientes-factura/', data);
  }

  actualizar(id: number, data: Partial<ClienteFactura>): Observable<ClienteFactura> {
    return this.api.patch<ClienteFactura>(`clientes-factura/${id}/`, data);
  }

  eliminar(id: number): Observable<void> {
    return this.api.delete<void>(`clientes-factura/${id}/`);
  }
}
