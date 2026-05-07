import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { LogsService, LogEvento, LogFiltros, LogResumen } from '../../core/services/logs';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatSelectModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, MatTooltipModule,
    NavbarComponent,
  ],
  templateUrl: './logs.html',
  styleUrl: './logs.scss',
})
export class LogsComponent implements OnInit {
  private logsService = inject(LogsService);

  // Datos
  logs        = signal<LogEvento[]>([]);
  totalCount  = signal(0);
  cargando    = signal(false);

  // Dashboard
  resumen     = signal<LogResumen | null>(null);
  cargandoResumen = signal(false);

  // Paginación
  paginaActual = signal(1);
  readonly pageSize = 100;
  totalPaginas = computed(() => Math.ceil(this.totalCount() / this.pageSize));

  // Vista
  modo = signal<'lista' | 'timeline'>('lista');
  logsTimeline = signal<LogEvento[]>([]);
  cargandoTimeline = signal(false);

  // Fila expandida
  filaExpandida = signal<number | null>(null);

  // Filtros principales
  filtroTipo       = '';
  filtroNivel      = '';
  filtroModulo     = '';
  filtroFechaIni   = '';
  filtroFechaFin   = '';
  filtroBusqueda   = '';

  // Filtros avanzados
  filtroTicketId   = '';
  filtroSesion     = '';
  filtroDuracionMin = '';

  readonly tiposDisponibles = [
    'ERROR', 'CAMBIO_TICKET', 'VENTA', 'ACCESO', 'ADVERTENCIA',
    'PRODUCTO', 'CLIENTE', 'CREDITO', 'CAJA', 'CONFIGURACION',
  ];
  readonly nivelesDisponibles = ['INFO', 'WARNING', 'ERROR'];

  ngOnInit(): void {
    this.cargar();
    this.cargarResumen();
  }

  cargar(): void {
    this.cargando.set(true);
    const filtros: LogFiltros = {
      tipo:        this.filtroTipo       || undefined,
      nivel:       this.filtroNivel      || undefined,
      modulo:      this.filtroModulo     || undefined,
      fecha_inicio: this.filtroFechaIni  || undefined,
      fecha_fin:   this.filtroFechaFin   || undefined,
      search:      this.filtroBusqueda   || undefined,
      ticket_id:   this.filtroTicketId   || undefined,
      session_id:  this.filtroSesion     || undefined,
      duracion_min: this.filtroDuracionMin ? Number(this.filtroDuracionMin) : undefined,
      page:        this.paginaActual(),
    };
    this.logsService.listar(filtros).subscribe({
      next: res => { this.logs.set(res.results); this.totalCount.set(res.count); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  cargarResumen(): void {
    this.cargandoResumen.set(true);
    this.logsService.resumen().subscribe({
      next: r => { this.resumen.set(r); this.cargandoResumen.set(false); },
      error: () => this.cargandoResumen.set(false),
    });
  }

  buscarTimeline(): void {
    const tid = this.filtroTicketId.trim();
    if (!tid) return;
    this.modo.set('timeline');
    this.cargandoTimeline.set(true);
    this.logsService.listar({ ticket_id: tid, page: 1 }).subscribe({
      next: res => { this.logsTimeline.set(res.results); this.cargandoTimeline.set(false); },
      error: () => this.cargandoTimeline.set(false),
    });
  }

  aplicarFiltros(): void {
    this.paginaActual.set(1);
    this.filaExpandida.set(null);
    this.modo.set('lista');
    this.cargar();
  }

  limpiarFiltros(): void {
    this.filtroTipo = '';
    this.filtroNivel = '';
    this.filtroModulo = '';
    this.filtroFechaIni = '';
    this.filtroFechaFin = '';
    this.filtroBusqueda = '';
    this.filtroTicketId = '';
    this.filtroSesion = '';
    this.filtroDuracionMin = '';
    this.aplicarFiltros();
  }

  paginaAnterior(): void {
    if (this.paginaActual() > 1) { this.paginaActual.update(p => p - 1); this.cargar(); }
  }
  paginaSiguiente(): void {
    if (this.paginaActual() < this.totalPaginas()) { this.paginaActual.update(p => p + 1); this.cargar(); }
  }

  toggleFila(id: number): void {
    this.filaExpandida.set(this.filaExpandida() === id ? null : id);
  }

  nivelClass(nivel: string): string {
    return nivel === 'ERROR' ? 'nivel-error' : nivel === 'WARNING' ? 'nivel-warning' : 'nivel-info';
  }

  tipoClass(tipo: string): string {
    return `tipo-${tipo.toLowerCase().replace(/_/g, '-')}`;
  }

  formatDatosExtra(datos: Record<string, any> | null): string {
    if (!datos) return '';
    return JSON.stringify(datos, null, 2);
  }

  exportarCSV(): void {
    const filas = this.logs();
    const headers = ['ID', 'Timestamp', 'Nivel', 'Tipo', 'Módulo', 'Usuario', 'IP',
                     'Ticket', 'Duración(ms)', 'Descripción', 'Detalle'];
    const rows = filas.map(l => [
      l.id, l.timestamp, l.nivel, l.tipo, l.modulo,
      l.usuario_nombre || '', l.ip || '',
      l.ticket_id ?? '', l.duracion_ms ?? '',
      `"${(l.descripcion || '').replace(/"/g, '""')}"`,
      `"${(l.detalle || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
