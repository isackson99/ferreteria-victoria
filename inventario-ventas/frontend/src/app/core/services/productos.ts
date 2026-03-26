import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface KitComponenteUI {
  id?: number;
  componente: number;
  componente_nombre: string;
  componente_codigo: string;
  cantidad: number;
  stock_actual: number;
}

export interface ProductoDetalle {
  id: number;
  codigo: string;
  nombre: string;
  tipo: 'unidad' | 'granel' | 'kit';
  categoria: number | null;
  categoria_nombre: string;
  precio_costo: number;
  porcentaje_ganancia: number | null;
  precio_venta: number;
  precio_mayoreo: number | null;
  mayoreo_minimo: number | null;
  inventario_actual: number;
  inventario_minimo: number;
  inventario_maximo: number;
  disponible: boolean;
  stock_bajo: boolean;
  stock_sobre: boolean;
  activo: boolean;
  usa_inventario: boolean;
  kit_componentes?: KitComponenteUI[];
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string;
  activa: boolean;
}

export interface ImportarResultado {
  creados: number;
  actualizados: number;
  errores: { fila: number; motivo: string }[];
}

export interface PreviewImportacion {
  columnas: string[];
  filas: string[][];
  columnas_reconocidas: string[];
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private api = inject(ApiService);

  buscar(query: string): Observable<ProductoDetalle[]> {
    return this.api.get<ProductoDetalle[]>('productos/', { search: query });
  }

  buscarPorCodigo(codigo: string): Observable<ProductoDetalle[]> {
    return this.api.get<ProductoDetalle[]>('productos/', { codigo });
  }

  getById(id: number): Observable<ProductoDetalle> {
    return this.api.get<ProductoDetalle>(`productos/${id}/`);
  }

  listar(params?: { search?: string; categoria?: number }): Observable<ProductoDetalle[]> {
    const p: Record<string, any> = {};
    if (params?.search) p['search'] = params.search;
    if (params?.categoria) p['categoria'] = params.categoria;
    return this.api.get<ProductoDetalle[]>('productos/', p);
  }

  crear(data: Partial<ProductoDetalle>): Observable<ProductoDetalle> {
    return this.api.post<ProductoDetalle>('productos/', data);
  }

  actualizar(id: number, data: Partial<ProductoDetalle>): Observable<ProductoDetalle> {
    return this.api.patch<ProductoDetalle>(`productos/${id}/`, data);
  }

  eliminar(id: number): Observable<{ mensaje: string; desactivado?: boolean; eliminado?: boolean }> {
    return this.api.delete(`productos/${id}/`);
  }

  getCategorias(): Observable<Categoria[]> {
    return this.api.get<Categoria[]>('categorias/');
  }

  crearCategoria(data: Partial<Categoria>): Observable<Categoria> {
    return this.api.post<Categoria>('categorias/', data);
  }

  actualizarCategoria(id: number, data: Partial<Categoria>): Observable<Categoria> {
    return this.api.patch<Categoria>(`categorias/${id}/`, data);
  }

  eliminarCategoria(id: number): Observable<void> {
    return this.api.delete<void>(`categorias/${id}/`);
  }

  getComponentesKit(id: number): Observable<KitComponenteUI[]> {
    return this.api.get<KitComponenteUI[]>(`productos/${id}/componentes_kit/`);
  }

  previewImportacion(archivo: File): Observable<PreviewImportacion> {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.api.postFile<PreviewImportacion>('productos/preview_importacion/', fd);
  }

  importarProductos(archivo: File): Observable<ImportarResultado> {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return this.api.postFile<ImportarResultado>('productos/importar/', fd);
  }

  descargarPlantilla(): Observable<Blob> {
    return this.api.getBlob('productos/plantilla_importacion/');
  }
}
