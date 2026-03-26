import { Injectable } from '@angular/core';
import { ApiService } from './api';
import { Observable, Subject } from 'rxjs';
import { BehaviorSubject } from 'rxjs';


export interface Venta {
  id: number;
  usuario: number;
  usuario_nombre: string;
  cliente_credito: number | null;
  cliente_factura: number | null;
  cliente_factura_id: number | null;
  cliente_factura_nombre: string | null;
  cliente_factura_rut: string | null;
  cliente_factura_correo: string | null;
  cliente_factura_telefono: string | null;
  estado: string;
  es_credito: boolean;
  total: number;
  notas: string;
  creada: string;
  items: DetalleVenta[];
  ticket: any;
  numero_display?: number;
}

export interface DetalleVenta {
  id: number;
  producto: number | null;
  producto_nombre: string;
  producto_tipo: string;
  es_producto_comun: boolean;
  producto_comun_nombre: string;
  cantidad: number;
  precio_unitario: number;
  precio_tipo: string;
  subtotal: number;
  // Campos opcionales enriquecidos (pueden venir del backend o del cache local)
  producto_codigo?: string;
  inventario_actual?: number;
  descuento?: number;
  precio_mayoreo?: number;
  minimo_mayoreo?: number;
}

export interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  tipo: string;
  precio_venta: number;
  precio_mayoreo: number;
  minimo_mayoreo: number;
  inventario_actual: number;
  categoria_nombre: string;
}

@Injectable({
  providedIn: 'root'
})
export class VentasService {

  constructor(private api: ApiService) {}

  // --- Contador de tickets por sesión ---

  private get usuarioId(): string {
    try { return JSON.parse(localStorage.getItem('usuario') ?? '{}').id ?? '0'; }
    catch { return '0'; }
  }

  private get contadorKey(): string { return `ticket_contador_${this.usuarioId}`; }
  private get numerosKey(): string   { return `ticket_numeros_${this.usuarioId}`; }

  siguienteNumero(): number {
    const actual = parseInt(localStorage.getItem(this.contadorKey) ?? '0', 10);
    const siguiente = actual + 1;
    localStorage.setItem(this.contadorKey, String(siguiente));
    return siguiente;
  }

  guardarNumeroTicket(ticketId: number, numero: number): void {
    const numeros = this.getMapaNumeros();
    numeros[ticketId] = numero;
    localStorage.setItem(this.numerosKey, JSON.stringify(numeros));
  }

  getNumeroTicket(ticketId: number): number | undefined {
    return this.getMapaNumeros()[ticketId];
  }

  private getMapaNumeros(): Record<number, number> {
    try { return JSON.parse(localStorage.getItem(this.numerosKey) ?? '{}'); }
    catch { return {}; }
  }

  limpiarContador(): void {
    localStorage.removeItem(this.contadorKey);
    localStorage.removeItem(this.numerosKey);
  }

  // Tickets
  getTicketsAbiertos(): Observable<Venta[]> {
    return this.api.get<Venta[]>('ventas/tickets_abiertos/');
  }

  nuevoTicket(): Observable<Venta> {
    return this.api.post<Venta>('ventas/nuevo_ticket/', {});
  }

  // Items
  agregarItem(ventaId: number, productoId: number, cantidad: number, usarMayoreo = false): Observable<Venta> {
    return this.api.post<Venta>(`ventas/${ventaId}/agregar_item/`, {
      producto_id: productoId,
      cantidad,
      usar_precio_mayoreo: usarMayoreo
    });
  }

  agregarProductoComun(ventaId: number, nombre: string, cantidad: number, precio: number): Observable<Venta> {
    return this.api.post<Venta>(`ventas/${ventaId}/agregar_producto_comun/`, {
      nombre, cantidad, precio
    });
  }

  quitarItem(ventaId: number, itemId: number): Observable<Venta> {
    return this.api.delete<Venta>(`ventas/${ventaId}/quitar_item/${itemId}/`);
  }

  // Confirmar
  confirmar(ventaId: number, datos: any): Observable<any> {
    return this.api.post<any>(`ventas/${ventaId}/confirmar/`, datos);
  }

  // Cancelar
  cancelar(ventaId: number): Observable<any> {
    return this.api.post<any>(`ventas/${ventaId}/cancelar/`, {});
  }

  // Último ticket
  ultimoTicket(): Observable<any> {
    return this.api.get<any>('ventas/ultimo_ticket/');
  }

  // Reimprimir último ticket
  reimprimir(): Observable<any> {
    return this.api.post<any>('ventas/reimprimir_ultimo/', {});
  }

  // Buscar productos
  buscarProducto(query: string): Observable<Producto[]> {
    return this.api.get<Producto[]>('productos/', { search: query });
  }

  getProducto(id: number): Observable<Producto> {
    return this.api.get<Producto>(`productos/${id}/`);
  }

  // Cambiar cantidad de un item (delta positivo o negativo)
  cambiarCantidad(ventaId: number, itemId: number, delta: number): Observable<Venta> {
    return this.api.post<Venta>(`ventas/${ventaId}/cambiar_cantidad/`, { item_id: itemId, delta });
  }

  // Aplicar o revertir precio mayoreo en un item
  aplicarMayoreoItem(ventaId: number, itemId: number, activar: boolean): Observable<Venta> {
    return this.api.post<Venta>(`ventas/${ventaId}/aplicar_mayoreo/`, { item_id: itemId, activar });
  }

  // Asignar o quitar cliente factura (null para quitar)
  asignarClienteFactura(ventaId: number, clienteId: number | null): Observable<Venta> {
    return this.api.post<Venta>(`ventas/${ventaId}/asignar_cliente_factura/`, {
      cliente_factura_id: clienteId,
    });
  }

  ticketActivo$ = new BehaviorSubject<Venta | null>(null);

  setTicketActivo(ticket: Venta): void {
    this.ticketActivo$.next(ticket);
  }

  /** Emite el id del producto que fue modificado en el módulo de Productos */
  notificarProductoActualizado$ = new Subject<number>();
}
