import {
  Component, OnInit, OnDestroy, ChangeDetectorRef,
  signal, computed, inject, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { ReportesService, ResumenVentas, UsuarioReporte } from '../../core/services/reportes';
import { AuthService } from '../../core/services/auth';
import { Chart, registerables } from 'chart.js';
import { nextSort, sortArr, sortIcon, isActive, SortState, SORT_NONE } from '../../core/utils/sort';

Chart.register(...registerables);

type Periodo = 'semana' | 'mes' | 'mes_anterior' | 'año' | 'personalizado';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, NavbarComponent, DatePipe],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss',
})
export class ReportesComponent implements OnInit, OnDestroy {
  private svc = inject(ReportesService);
  authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  periodo = signal<Periodo>('semana');
  desde = signal('');
  hasta = signal('');
  usuarioId = signal<number | null>(null);
  datos = signal<ResumenVentas | null>(null);
  usuarios = signal<UsuarioReporte[]>([]);
  cargando = signal(false);

  busquedaDia       = signal('');
  busquedaCategoria = signal('');
  ordenDia          = signal<SortState>(SORT_NONE);
  ordenCategoria    = signal<SortState>(SORT_NONE);

  readonly sortIcon = sortIcon;
  readonly isActive = isActive;

  isAdmin = computed(() => {
    const u = this.authService.usuarioActual();
    return !!u && (u.is_superuser || u.rol?.nombre === 'Admin');
  });

  // Chart instances
  private chartVG: Chart | null = null;
  private chartMetodos: Chart | null = null;
  private chartDeptVentas: Chart | null = null;
  private chartDeptGanancia: Chart | null = null;

  @ViewChild('canvasVG')           private canvasVG!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasMetodos')      private canvasMetodos!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasDeptVentas')   private canvasDeptVentas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasDeptGanancia') private canvasDeptGanancia!: ElementRef<HTMLCanvasElement>;

  ngOnInit(): void {
    this.cargarDatos();
    if (this.isAdmin()) {
      this.svc.getUsuarios().subscribe({ next: u => this.usuarios.set(u) });
    }
  }

  ngOnDestroy(): void {
    this.destruirGraficos();
  }

  seleccionarPeriodo(p: Periodo): void {
    this.periodo.set(p);
    if (p !== 'personalizado') {
      this.cargarDatos();
    }
  }

  aplicarPeriodoPersonalizado(): void {
    if (this.desde() && this.hasta()) {
      this.cargarDatos();
    }
  }

  cambiarUsuario(id: number | null): void {
    this.usuarioId.set(id);
    this.cargarDatos();
  }

  cargarDatos(): void {
    const p = this.periodo();
    if (p === 'personalizado' && (!this.desde() || !this.hasta())) return;
    this.cargando.set(true);
    const params: any = {
      periodo: p,
      usuario_id: this.usuarioId(),
    };
    if (p === 'personalizado') {
      params.desde = this.desde();
      params.hasta = this.hasta();
    }
    this.svc.getResumen(params).subscribe({
      next: data => {
        console.log('datos reporte:', JSON.stringify(data));
        this.datos.set(data);
        this.busquedaDia.set('');
        this.busquedaCategoria.set('');
        this.ordenDia.set(SORT_NONE);
        this.ordenCategoria.set(SORT_NONE);
        this.cargando.set(false);
        // Force Angular to render @if blocks before Chart.js accesses canvases
        this.cdr.detectChanges();
        setTimeout(() => {
          console.log('canvasVG existe:', !!this.canvasVG?.nativeElement);
          this.actualizarGraficos(data);
        }, 50);
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al cargar reportes', '', { duration: 2500 });
      }
    });
  }

  private destruirGraficos(): void {
    this.chartVG?.destroy();           this.chartVG = null;
    this.chartMetodos?.destroy();      this.chartMetodos = null;
    this.chartDeptVentas?.destroy();   this.chartDeptVentas = null;
    this.chartDeptGanancia?.destroy(); this.chartDeptGanancia = null;
  }

  private actualizarGraficos(d: ResumenVentas): void {
    this.destruirGraficos();

    const labels = d.por_dia.map(r => this.formatDiaLabel(r.dia));
    const dias   = d.por_dia.map(r => r.dia);

    // 1. Ventas + Ganancia por día (bar)
    if (this.canvasVG?.nativeElement) {
      this.chartVG = new Chart(this.canvasVG.nativeElement.getContext('2d')!, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Ventas',   data: d.por_dia.map(r => r.total),   backgroundColor: '#3f51b5', borderRadius: 3 },
            { label: 'Ganancia', data: d.por_dia.map(r => r.ganancia), backgroundColor: '#81c784', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => '$' + Number(v).toLocaleString('es-CL') } } },
        },
      });
    }

    // 2. Métodos de pago por día (stacked bar)
    if (this.canvasMetodos?.nativeElement) {
      this.chartMetodos = new Chart(this.canvasMetodos.nativeElement.getContext('2d')!, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Efectivo', data: dias.map(d2 => d.por_metodo_dia[d2]?.efectivo ?? 0), backgroundColor: '#4caf50', stack: 'a', borderRadius: 2 },
            { label: 'Tarjeta',  data: dias.map(d2 => d.por_metodo_dia[d2]?.tarjeta  ?? 0), backgroundColor: '#2196f3', stack: 'a', borderRadius: 2 },
            { label: 'Crédito',  data: dias.map(d2 => d.por_metodo_dia[d2]?.credito  ?? 0), backgroundColor: '#ff9800', stack: 'a', borderRadius: 2 },
            { label: 'Mixto',    data: dias.map(d2 => d.por_metodo_dia[d2]?.mixto    ?? 0), backgroundColor: '#9c27b0', stack: 'a', borderRadius: 2 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => '$' + Number(v).toLocaleString('es-CL') } },
          },
        },
      });
    }

    // 3. Ventas por departamento (doughnut)
    const cats    = d.por_categoria.map(c => c.producto__categoria__nombre || 'Sin Categoría');
    const colores = this.paleta(cats.length);
    if (this.canvasDeptVentas?.nativeElement) {
      this.chartDeptVentas = new Chart(this.canvasDeptVentas.nativeElement.getContext('2d')!, {
        type: 'doughnut',
        data: { labels: cats, datasets: [{ data: d.por_categoria.map(c => c.total), backgroundColor: colores }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      });
    }

    // 4. Ganancia por departamento (doughnut)
    if (this.canvasDeptGanancia?.nativeElement) {
      const ganancias = d.por_categoria.map(c => Math.max(0, c.ganancia || 0));
      this.chartDeptGanancia = new Chart(this.canvasDeptGanancia.nativeElement.getContext('2d')!, {
        type: 'doughnut',
        data: { labels: cats, datasets: [{ data: ganancias, backgroundColor: colores }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      });
    }
  }

  private formatDiaLabel(dia: string): string {
    const d = new Date(dia + 'T12:00:00');
    const dias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
  }

  private paleta(n: number): string[] {
    const base = ['#1a237e','#283593','#3949ab','#5c6bc0','#7986cb','#9fa8da',
                  '#1565c0','#1976d2','#1e88e5','#2196f3','#42a5f5','#64b5f6'];
    const result: string[] = [];
    for (let i = 0; i < n; i++) result.push(base[i % base.length]);
    return result;
  }

  formatCLP(n: number): string {
    return '$' + Math.round(n || 0).toLocaleString('es-CL');
  }

  formatPct(n: number): string {
    return (n || 0).toFixed(1) + '%';
  }

  get diasFiltrados() {
    const d = this.datos();
    if (!d) return [];
    const q = this.busquedaDia().toLowerCase().trim();
    let res = d.por_dia;
    if (q) res = res.filter(r =>
      r.dia.includes(q) ||
      String(r.total).includes(q) ||
      String(r.cantidad).includes(q)
    );
    return sortArr(res, this.ordenDia());
  }

  get categoriasFiltradas() {
    const q = this.busquedaCategoria().toLowerCase().trim();
    let res = this.categoriasList;
    if (q) res = res.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      String(c.total).includes(q) ||
      String(c.ganancia).includes(q)
    );
    return sortArr(res, this.ordenCategoria());
  }

  ordenarDia(col: string): void      { this.ordenDia.set(nextSort(this.ordenDia(), col)); }
  ordenarCategoria(col: string): void { this.ordenCategoria.set(nextSort(this.ordenCategoria(), col)); }

  get metodosList(): { label: string; valor: number; color: string }[] {
    const d = this.datos();
    if (!d) return [];
    return [
      { label: 'Efectivo', valor: d.por_metodo.efectivo, color: '#4caf50' },
      { label: 'Tarjeta',  valor: d.por_metodo.tarjeta,  color: '#2196f3' },
      { label: 'Crédito',  valor: d.por_metodo.credito,  color: '#ff9800' },
      { label: 'Mixto',    valor: d.por_metodo.mixto,    color: '#9c27b0' },
    ].filter(m => m.valor > 0);
  }

  get categoriasList(): { nombre: string; total: number; ganancia: number }[] {
    const d = this.datos();
    if (!d) return [];
    return d.por_categoria.map(c => ({
      nombre: c.producto__categoria__nombre || 'Sin Categoría',
      total: c.total,
      ganancia: c.ganancia || 0,
    }));
  }

  get periodoLabel(): string {
    const labels: Record<string, string> = {
      semana: 'Semana Actual', mes: 'Mes Actual',
      mes_anterior: 'Mes Anterior', año: 'Año Actual',
      personalizado: 'Período Personalizado',
    };
    return labels[this.periodo()] ?? '';
  }
}
