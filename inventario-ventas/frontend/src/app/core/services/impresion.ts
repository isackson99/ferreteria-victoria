import { Injectable } from '@angular/core';

export interface ItemTicketImpresion {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  precio_tipo: string;
  subtotal: number;
}

export interface PagoTicketImpresion {
  metodo: string;
  monto_recibido: number;
  monto_tarjeta: number;
  monto_efectivo?: number;
  vuelto: number;
}

export interface DatosTicket {
  numero: string;
  fecha: string;   // ISO date string
  cajero: string;
  productos: ItemTicketImpresion[];
  total: number;
  pagos: PagoTicketImpresion[];
  cliente_factura?: { nombre: string; rut: string; correo?: string | null; telefono?: string | null } | null;
  copia?: 'COPIA CLIENTE' | 'COPIA COMERCIO';
}

export interface ItemTicketCreditoImpresion {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  precio_costo: number;
  subtotal: number;
}

export interface DatosTicketCredito {
  numero: string;
  fecha: string;   // ISO date string
  items: ItemTicketCreditoImpresion[];
  total: number;
}

// Modos de impresión para tickets de crédito:
// 'normal':         precio_unitario (precio venta registrado en la venta)
// 'venta_sin_iva':  precio_unitario / 1.19 (precio venta menos 19% IVA)
// 'precio_especial': precio_costo si > 0, sino precio_unitario (marcado con *)
export type ModoImpresionCredito = 'normal' | 'venta_sin_iva' | 'precio_especial';

@Injectable({ providedIn: 'root' })
export class ImpresionService {

  private iframeImpresion: HTMLIFrameElement | null = null;

  // ---- Configuración (localStorage) ----

  get autoImprimir(): boolean {
    return localStorage.getItem('auto_imprimir') === 'true';
  }

  get anchoPapel(): '80' | '58' {
    return (localStorage.getItem('ancho_papel') as '80' | '58') || '80';
  }

  get formatoDescripcion(): 'corto' | 'completo' {
    return (localStorage.getItem('formato_descripcion') as 'corto' | 'completo') || 'completo';
  }

  guardarConfig(key: string, value: string): void {
    // Limpiar claves obsoletas de QZ al guardar cualquier config
    localStorage.removeItem('usar_qz');
    localStorage.removeItem('impresora_defecto');
    localStorage.removeItem('impresora_tickets');
    localStorage.setItem(key, value);
  }

  // ---- Impresión ----

  imprimirTicket(datos: DatosTicket, modo: 'normal' | 'venta_sin_iva' = 'normal'): void {
    this.imprimirDocumento(this.generarHTMLTicket(datos, modo));
  }

  imprimirDocumento(html: string): void {
    if (!this.iframeImpresion) {
      this.iframeImpresion = document.createElement('iframe');
      this.iframeImpresion.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
      document.body.appendChild(this.iframeImpresion);
    }

    const doc = this.iframeImpresion.contentDocument ||
                (this.iframeImpresion.contentWindow as any).document;
    doc.open();
    doc.write(html);
    doc.close();
  }

  // ---- Ticket de prueba ----

  ticketDePrueba(): DatosTicket {
    return {
      numero: 'TKT-PRUEBA-0001',
      fecha: new Date().toISOString(),
      cajero: 'cajero',
      productos: [
        { nombre: 'Tornillo hex 1/2"',  cantidad: 10, precio_unitario: 150,  precio_tipo: 'normal', subtotal: 1500  },
        { nombre: 'Tuerca 1/2"',        cantidad: 10, precio_unitario: 80,   precio_tipo: 'normal', subtotal: 800   },
        { nombre: 'Llave stilson 14"',  cantidad: 1,  precio_unitario: 8900, precio_tipo: 'normal', subtotal: 8900  },
      ],
      total: 11200,
      pagos: [{ metodo: 'efectivo', monto_recibido: 15000, monto_tarjeta: 0, vuelto: 3800 }],
    };
  }

  // ---- Impresión crédito (multi-ticket separados por página) ----

  imprimirTicketsCredito(tickets: DatosTicketCredito[], modo: ModoImpresionCredito): void {
    this.imprimirDocumento(this.generarHTMLTicketsCredito(tickets, modo));
  }

  // ---- Impresión crédito (tira única continua agrupada por fecha) ----

  imprimirMultiplesTicketsCredito(
    tickets: DatosTicketCredito[],
    clienteNombre: string,
    modo: ModoImpresionCredito
  ): void {
    this.imprimirDocumento(this.generarHTMLTiraCredito(tickets, clienteNombre, modo));
  }

  // ---- Helpers monospace ----

  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private centrar(texto: string, ancho: number): string {
    if (texto.length >= ancho) return texto;
    const pad = Math.floor((ancho - texto.length) / 2);
    return ' '.repeat(pad) + texto;
  }

  private procesarDescripcion(nombre: string, formato: 'corto' | 'completo', maxChars: number): string[] {
    if (formato === 'corto') {
      return [nombre.length > maxChars ? nombre.substring(0, maxChars) : nombre];
    }
    const lineas: string[] = [];
    let restante = nombre;
    while (restante.length > maxChars) {
      let corte = restante.lastIndexOf(' ', maxChars);
      if (corte <= 0) corte = maxChars;
      lineas.push(restante.substring(0, corte));
      restante = restante.substring(corte).trimStart();
    }
    if (restante) lineas.push(restante);
    return lineas;
  }

  // Genera una fila de producto con espacio explícito entre cada columna:
  // [CNT] [DESC] [P.UNIT] [TOTAL]
  // El ancho total = anchoLot + 1 + anchoDesc + 1 + anchoPU + 1 + anchoImp
  private generarFilaProducto(
    cant: string | number,
    nombre: string,
    puStr: string,
    impStr: string,
    formato: 'corto' | 'completo',
    anchoDesc: number,
    anchoPU: number,
    anchoImp: number,
    anchoLot: number
  ): string {
    const cantStr    = String(cant).padStart(anchoLot);
    const lineas     = this.procesarDescripcion(nombre, formato, anchoDesc);
    const primerDesc = lineas[0].padEnd(anchoDesc);
    let fila = `${cantStr} ${primerDesc} ${puStr.padStart(anchoPU)} ${impStr.padStart(anchoImp)}`;
    for (let i = 1; i < lineas.length; i++) {
      fila += `\n${' '.repeat(anchoLot + 1)}${lineas[i]}`;
    }
    return fila;
  }

  // En modo venta_sin_iva: muestra sinIVA/conIVA en columna TOTAL
  // 80mm: una sola línea  →  $840,34/$1.000
  // 58mm: dos líneas      →  $840,34 / línea 2 indentada →$1.000
  private generarFilaVentaSinIVA(
    cant: string | number,
    nombre: string,
    puStr: string,
    sinIVAStr: string,
    conIVAStr: string,
    formato: 'corto' | 'completo',
    anchoDesc: number,
    anchoPU: number,
    anchoLot: number,
    labelWidth: number,
    es58: boolean
  ): string {
    const cantStr    = String(cant).padStart(anchoLot);
    const lineas     = this.procesarDescripcion(nombre, formato, anchoDesc);
    const primerDesc = lineas[0].padEnd(anchoDesc);
    let fila: string;
    if (es58) {
      // 58mm: sin IVA en línea 1, →conIVA en línea 2 alineada al inicio de columna TOTAL
      fila  = `${cantStr} ${primerDesc} ${puStr.padStart(anchoPU)} ${sinIVAStr}`;
      fila += `\n${' '.repeat(labelWidth)}→${conIVAStr}`;
    } else {
      // 80mm: sin IVA / con IVA en una sola línea
      fila = `${cantStr} ${primerDesc} ${puStr.padStart(anchoPU)} ${sinIVAStr}/${conIVAStr}`;
    }
    for (let i = 1; i < lineas.length; i++) {
      fila += `\n${' '.repeat(anchoLot + 1)}${lineas[i]}`;
    }
    return fila;
  }

  // ---- Impresión crédito: tira continua ----
  // Columnas 80mm (36 chars): CNT(3)+sp+DESC(14)+sp+P.UNIT(8)+sp+TOTAL(8)
  // Columnas 58mm (28 chars): CNT(3)+sp+DESC(10)+sp+P.UNIT(6)+sp+TOTAL(6)

  private generarHTMLTiraCredito(
    tickets: DatosTicketCredito[],
    clienteNombre: string,
    modo: ModoImpresionCredito
  ): string {
    const es58        = this.anchoPapel === '58';
    const anchoMM     = es58 ? '58mm' : '80mm';
    const anchoBody   = es58 ? '50mm' : '72mm';
    const fontSize    = es58 ? '9px'  : '10px';
    const fontGrande  = es58 ? '11px' : '13px';
    const fontTotal   = es58 ? '10px' : '11px';
    const anchoLot    = 3;
    const anchoDesc   = es58 ? 10 : 14;
    const anchoPU     = es58 ? 6  : 8;
    const anchoImp    = es58 ? 6  : 8;
    // labelWidth: ancho de todas las columnas antes de TOTAL (incluye espacios separadores)
    const labelWidth  = anchoLot + 1 + anchoDesc + 1 + anchoPU + 1;
    const anchoTotal  = labelWidth + anchoImp;
    const sep         = '-'.repeat(anchoTotal);
    const sepDoble    = '='.repeat(anchoTotal);
    const fmt         = this.mkFmt(modo);
    const formato     = this.formatoDescripcion;

    // Agrupar por fecha (día), preservando orden cronológico ASC
    const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const grupos = new Map<string, { d: Date; tickets: DatosTicketCredito[] }>();
    for (const t of tickets) {
      const d   = new Date(t.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!grupos.has(key)) grupos.set(key, { d, tickets: [] });
      grupos.get(key)!.tickets.push(t);
    }

    let totalGeneral    = 0;
    let totalGeneralCIV = 0; // con IVA (solo aplica en venta_sin_iva)
    const bloques: string[] = [];

    const headerRow = `${'CNT'.padStart(anchoLot)} ${'DESCRIPCION'.padEnd(anchoDesc)} ${'P.UNIT'.padStart(anchoPU)} ${'TOTAL'.padStart(anchoImp)}`;

    for (const { d, tickets: tGroup } of grupos.values()) {
      const fechaLabel = `${String(d.getDate()).padStart(2,'0')}/${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      let subtotal    = 0;
      let subtotalCIV = 0; // subtotal con IVA (solo venta_sin_iva)
      const filas: string[] = [];

      let hayFallbackGroup = false;
      for (const t of tGroup) {
        for (const item of t.items) {
          const pu  = this.precioSegunModo(item, modo);
          const sub = pu * Number(item.cantidad);
          subtotal += sub;

          // Marcar con * items que usan precio_unitario como reemplazo (precio_costo = 0)
          const esFallback = modo === 'precio_especial' && item.precio_costo <= 0;
          if (esFallback) hayFallbackGroup = true;
          const desc = esFallback ? item.descripcion + ' *' : item.descripcion;

          if (modo === 'venta_sin_iva') {
            const subCIV = item.precio_unitario * Number(item.cantidad);
            subtotalCIV += subCIV;
            filas.push(this.generarFilaVentaSinIVA(
              item.cantidad, desc, fmt(pu), fmt(sub), this.formatCLP(subCIV),
              formato, anchoDesc, anchoPU, anchoLot, labelWidth, es58
            ));
          } else {
            filas.push(this.generarFilaProducto(
              item.cantidad, desc, fmt(pu), fmt(sub),
              formato, anchoDesc, anchoPU, anchoImp, anchoLot
            ));
          }
        }
      }

      totalGeneral    += subtotal;
      totalGeneralCIV += subtotalCIV;

      // Sección de subtotal del grupo
      let resumenSubtotal: string;
      if (modo === 'venta_sin_iva') {
        const ivaTotal = subtotalCIV - subtotal;
        resumenSubtotal = [
          'Subtotal s/IVA:'.padEnd(labelWidth) + fmt(subtotal).padStart(anchoImp),
          '+ IVA (19%):'.padEnd(labelWidth)    + fmt(ivaTotal).padStart(anchoImp),
          sep,
          'Subtotal c/IVA:'.padEnd(labelWidth) + this.formatCLP(subtotalCIV).padStart(anchoImp),
        ].join('\n');
      } else {
        resumenSubtotal = 'Subtotal:'.padEnd(labelWidth) + fmt(subtotal).padStart(anchoImp);
      }

      const notaFallback = hayFallbackGroup ? '\n* Precio venta (sin costo cargado)' : '';

      bloques.push(`<pre class="tabla-prods">${this.esc(sep)}
${this.esc(this.centrar(fechaLabel, anchoTotal))}
${this.esc(sep)}
${this.esc(headerRow)}
${this.esc(sep)}
${this.esc(filas.join('\n'))}
${this.esc(sep)}
${this.esc(resumenSubtotal)}${hayFallbackGroup ? '\n' + this.esc(notaFallback.trim()) : ''}</pre>`);
    }

    // Total general
    let totalGeneralHtml: string;
    if (modo === 'venta_sin_iva') {
      const ivaGeneral = totalGeneralCIV - totalGeneral;
      const lines = [
        sepDoble,
        'TOTAL S/IVA:'.padEnd(labelWidth)   + fmt(totalGeneral).padStart(anchoImp),
        '+ IVA (19%):'.padEnd(labelWidth)   + fmt(ivaGeneral).padStart(anchoImp),
        sepDoble,
        'TOTAL C/IVA:'.padEnd(labelWidth)   + this.formatCLP(totalGeneralCIV).padStart(anchoImp),
        sepDoble,
      ].join('\n');
      totalGeneralHtml = `<pre class="tabla-prods">${this.esc(lines)}</pre>`;
    } else {
      const lines = [
        sepDoble,
        'TOTAL GENERAL:'.padEnd(labelWidth) + fmt(totalGeneral).padStart(anchoImp),
        sepDoble,
      ].join('\n');
      totalGeneralHtml = `<pre class="tabla-prods">${this.esc(lines)}</pre>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${anchoMM}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: ${anchoBody};
    margin: 0 auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    line-height: 1.4;
    color: #000;
  }
  @page { size: ${anchoMM} auto; margin: 4mm 2mm; }
  body { padding: 2mm 0; }
  .centro      { text-align: center; }
  .negrita     { font-weight: bold; }
  .grande      { font-size: ${fontGrande}; }
  .total-row   { display: flex; justify-content: space-between; font-weight: bold; font-size: ${fontTotal}; margin: 4px 0; }
  .tabla-prods { font-family: inherit; font-size: inherit; white-space: pre-wrap; word-break: break-all; margin: 2px 0; }
</style>
</head>
<body>
  <div class="centro negrita grande">FERRETERIA VICTORIA</div>
  <div class="centro">DIRECCION: OLGA VILLANUEVA 2386</div>
  <div class="centro">COMUNA: VILLA ALEMANA</div>
  <div class="negrita">${clienteNombre.toUpperCase()}</div>
  <div>${this.formatFecha(new Date().toISOString())}</div>
  ${bloques.join('\n')}
  ${totalGeneralHtml}
  <div class="centro negrita">GRACIAS POR SU COMPRA</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
  }

  private precioSegunModo(item: ItemTicketCreditoImpresion, modo: ModoImpresionCredito): number {
    // 'normal':         precio_unitario (precio venta registrado en la venta)
    // 'venta_sin_iva':  precio_unitario / 1.19 (precio venta menos 19% IVA)
    // 'precio_especial': precio_costo si > 0, sino precio_unitario (temporal, marcado con *)
    switch (modo) {
      case 'venta_sin_iva':
        return item.precio_unitario / 1.19;
      case 'precio_especial':
        return item.precio_costo > 0 ? item.precio_costo : item.precio_unitario;
      default:
        return item.precio_unitario;
    }
  }

  private mkFmt(modo: ModoImpresionCredito): (n: number) => string {
    // Solo venta_sin_iva muestra decimales (resultado de dividir precio_unitario / 1.19)
    return modo === 'venta_sin_iva'
      ? (n: number) => '$' + n.toFixed(2).replace('.', ',')
      : (n: number) => this.formatCLP(n);
  }

  // ---- Impresión crédito: tickets individuales ----
  // Columnas 80mm (36 chars): CNT(3)+sp+DESC(14)+sp+P.UNIT(8)+sp+TOTAL(8)
  // Columnas 58mm (28 chars): CNT(3)+sp+DESC(10)+sp+P.UNIT(6)+sp+TOTAL(6)

  private generarHTMLTicketsCredito(tickets: DatosTicketCredito[], modo: ModoImpresionCredito): string {
    const es58        = this.anchoPapel === '58';
    const anchoMM     = es58 ? '58mm' : '80mm';
    const anchoBody   = es58 ? '50mm' : '72mm';
    const fontSize    = es58 ? '9px'  : '10px';
    const fontGrande  = es58 ? '11px' : '13px';
    const fontTotal   = es58 ? '10px' : '11px';
    const anchoLot    = 3;
    const anchoDesc   = es58 ? 10 : 14;
    const anchoPU     = es58 ? 6  : 8;
    const anchoImp    = es58 ? 6  : 8;
    const labelWidth  = anchoLot + 1 + anchoDesc + 1 + anchoPU + 1;
    const anchoTotal  = labelWidth + anchoImp;
    const sep         = '-'.repeat(anchoTotal);
    const fmt         = this.mkFmt(modo);
    const formato     = this.formatoDescripcion;

    const modoLabel = modo === 'venta_sin_iva' ? '* PRECIO VENTA S/IVA *' : '';

    const headerRow = `${'CNT'.padStart(anchoLot)} ${'DESCRIPCION'.padEnd(anchoDesc)} ${'P.UNIT'.padStart(anchoPU)} ${'TOTAL'.padStart(anchoImp)}`;

    const bloques = tickets.map((t, i) => {
      let totalSIV = 0; // sin IVA (precio calculado según modo)
      let totalCIV = 0; // con IVA original (solo venta_sin_iva)
      const filas: string[] = [];

      const hayFallback = modo === 'precio_especial' && t.items.some(item => item.precio_costo <= 0);

      for (const item of t.items) {
        const pu  = this.precioSegunModo(item, modo);
        const sub = pu * Number(item.cantidad);
        totalSIV += sub;

        // Marcar con * items que usan precio_unitario como reemplazo (precio_costo = 0)
        const esFallback = modo === 'precio_especial' && item.precio_costo <= 0;
        const desc = esFallback ? item.descripcion + ' *' : item.descripcion;

        if (modo === 'venta_sin_iva') {
          const subCIV = item.precio_unitario * Number(item.cantidad);
          totalCIV += subCIV;
          filas.push(this.generarFilaVentaSinIVA(
            item.cantidad, desc, fmt(pu), fmt(sub), this.formatCLP(subCIV),
            formato, anchoDesc, anchoPU, anchoLot, labelWidth, es58
          ));
        } else {
          filas.push(this.generarFilaProducto(
            item.cantidad, desc, fmt(pu), fmt(sub),
            formato, anchoDesc, anchoPU, anchoImp, anchoLot
          ));
        }
      }

      const totalItems = t.items.reduce((s, item) => s + Number(item.cantidad), 0);
      const artLabel   = 'NO. DE ARTICULOS:'.padEnd(labelWidth);

      // Sección de totales (varía según modo)
      let seccionTotal: string;
      if (modo === 'venta_sin_iva') {
        const ivaTotal = totalCIV - totalSIV;
        seccionTotal = [
          sep,
          artLabel + String(totalItems).padStart(anchoImp),
          sep,
          'TOTAL S/IVA:'.padEnd(labelWidth) + fmt(totalSIV).padStart(anchoImp),
          '+ IVA (19%):'.padEnd(labelWidth) + fmt(ivaTotal).padStart(anchoImp),
          sep,
          'TOTAL C/IVA:'.padEnd(labelWidth) + this.formatCLP(totalCIV).padStart(anchoImp),
          'METODO PAGO: CREDITO',
          sep,
        ].join('\n');
      } else {
        const notaFallback = hayFallback ? '\n* Precio venta (sin costo cargado)' : '';
        seccionTotal = [
          sep,
          artLabel + String(totalItems).padStart(anchoImp),
          sep,
          'TOTAL:'.padEnd(labelWidth) + fmt(totalSIV).padStart(anchoImp),
          'METODO PAGO: CREDITO',
          sep + notaFallback,
        ].join('\n');
      }

      const esUltimo    = i === tickets.length - 1;
      const claseBloque = esUltimo ? '' : ' class="ticket-bloque"';

      return `<div${claseBloque}>
  <div class="centro negrita grande">FERRETERIA VICTORIA</div>
  <div class="centro">DIRECCION: OLGA VILLANUEVA 2386</div>
  <div class="centro">COMUNA: VILLA ALEMANA</div>
  ${modoLabel ? `<div class="centro negrita modo-lbl">${modoLabel}</div>` : ''}
  <div class="fila"><span>${this.formatFecha(t.fecha)}</span></div>
  <div class="fila"><span>FOLIO:</span><span>${t.numero}</span></div>
  <div class="fila"><span>TIPO:</span><span>CRÉDITO</span></div>
  <pre class="tabla-prods">${this.esc(sep)}
${this.esc(headerRow)}
${this.esc(sep)}
${this.esc(filas.join('\n'))}
${this.esc(seccionTotal)}</pre>
  <div class="centro negrita">GRACIAS POR SU COMPRA</div>
</div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${anchoMM}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: ${anchoBody};
    margin: 0 auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    line-height: 1.4;
    color: #000;
  }
  @page { size: ${anchoMM} auto; margin: 4mm 2mm; }
  body { padding: 2mm 0; }
  .centro      { text-align: center; }
  .negrita     { font-weight: bold; }
  .grande      { font-size: ${fontGrande}; }
  .modo-lbl    { font-size: ${fontGrande}; margin: 2px 0; }
  .fila        { display: flex; justify-content: space-between; }
  .total-row   { display: flex; justify-content: space-between; font-weight: bold; font-size: ${fontTotal}; margin: 2px 0; }
  .tabla-prods { font-family: inherit; font-size: inherit; white-space: pre-wrap; word-break: break-all; margin: 2px 0; }
  .ticket-bloque { page-break-after: always; padding-bottom: 4mm; }
</style>
</head>
<body>
  ${bloques}
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
  }

  // ---- Generación HTML ----

  // ---- Impresión corte de caja ----

  imprimirCorte(datos: {
    desde: string | null; hasta: string; usuario: string; cantidad_tickets: number;
    total_efectivo: number; total_tarjeta: number; total_credito: number; total_mixto: number;
    total_ventas: number; total_entradas: number; total_salidas: number;
    total_abonos_credito: number; total_devoluciones: number; efectivo_en_caja: number;
  }): void {
    this.imprimirDocumento(this.generarHTMLCorte(datos));
  }

  private generarHTMLCorte(d: {
    desde: string | null; hasta: string; usuario: string; cantidad_tickets: number;
    total_efectivo: number; total_tarjeta: number; total_credito: number; total_mixto: number;
    total_ventas: number; total_entradas: number; total_salidas: number;
    total_abonos_credito: number; total_devoluciones: number; efectivo_en_caja: number;
  }): string {
    const es58 = this.anchoPapel === '58';
    const anchoMM = es58 ? '58mm' : '80mm';
    const anchoBody = es58 ? '50mm' : '72mm';
    const fontSize = es58 ? '9px' : '10px';
    const fontGrande = es58 ? '11px' : '13px';
    const ancho = es58 ? 28 : 36;
    const sep = '-'.repeat(ancho);
    const sepDoble = '='.repeat(ancho);
    const labelW = es58 ? 18 : 22;
    const valW = ancho - labelW;
    const f = (n: number) => this.formatCLP(n);
    const fila = (label: string, valor: string) =>
      label.padEnd(labelW) + valor.padStart(valW);
    const filaPos = (label: string, n: number) => fila(label, f(n));

    const fechaHasta = this.formatFecha(d.hasta);
    const fechaDesde = d.desde ? this.formatFecha(d.desde) : 'Inicio';

    const lines = [
      this.centrar('FERRETERIA VICTORIA', ancho),
      this.centrar('CORTE DE CAJA', ancho),
      sep,
      fila('Cajero:', d.usuario.toUpperCase()),
      fila('Desde:', fechaDesde),
      fila('Hasta:', fechaHasta),
      sep,
      'VENTAS DEL TURNO:',
      filaPos('En Efectivo:', d.total_efectivo),
      filaPos('Con Tarjeta:', d.total_tarjeta),
      filaPos('A Credito:', d.total_credito),
      ...(d.total_mixto > 0 ? [filaPos('Mixto:', d.total_mixto)] : []),
      sep,
      filaPos('TOTAL VENTAS:', d.total_ventas),
      sep,
      'MOVIMIENTOS CAJA:',
      filaPos('Entradas:    +', d.total_entradas),
      filaPos('Salidas:     -', d.total_salidas),
      filaPos('Abonos cred: +', d.total_abonos_credito),
      filaPos('Devoluciones:-', d.total_devoluciones),
      sep,
      filaPos('EFECTIVO EN CAJA:', d.efectivo_en_caja),
      sepDoble,
      fila('TICKETS PROCESADOS:', String(d.cantidad_tickets)),
      sep,
      this.centrar('GRACIAS', ancho),
    ].join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${anchoMM}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: ${anchoBody};
    margin: 0 auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    line-height: 1.4;
    color: #000;
  }
  @page { size: ${anchoMM} auto; margin: 4mm 2mm; }
  body { padding: 2mm 0; }
  pre { font-family: inherit; font-size: inherit; white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>
  <pre>${this.esc(lines)}</pre>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
  }

  private formatCLP(n: number): string {
    return '$' + Math.round(n).toLocaleString('es-CL');
  }

  private formatFecha(iso: string): string {
    const d = new Date(iso);
    const dia  = String(d.getDate()).padStart(2, '0');
    const mes  = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    let   h    = d.getHours();
    const min  = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dia}/${mes}/${anio} ${String(h).padStart(2, '0')}:${min} ${ampm}`;
  }

  private generarHTMLTicket(d: DatosTicket, modo: 'normal' | 'venta_sin_iva' = 'normal'): string {
    const es58       = this.anchoPapel === '58';
    const anchoMM    = es58 ? '58mm' : '80mm';
    const anchoBody  = es58 ? '50mm' : '72mm';
    const fontSize   = es58 ? '9px'  : '10px';
    const fontGrande = es58 ? '11px' : '13px';
    const fontTotal  = es58 ? '10px' : '11px';
    const anchoLot   = es58 ? 2 : 3;
    const anchoDesc  = es58 ? 13 : 20;
    const anchoPU    = es58 ? 7 : 8;
    const anchoImp   = es58 ? 7 : 8;
    const labelWidth = anchoLot + 1 + anchoDesc + 1 + anchoPU + 1;
    const anchoTotal = labelWidth + anchoImp;
    const sep        = '-'.repeat(anchoTotal);
    const totalItems = d.productos.reduce((s, p) => s + Number(p.cantidad), 0);
    const formato    = this.formatoDescripcion;
    const fmtD       = (n: number) => '$' + n.toFixed(2).replace('.', ',');

    const headerRow  = `${'CNT'.padStart(anchoLot)} ${'DESCRIPCION'.padEnd(anchoDesc)} ${'P.UNIT'.padStart(anchoPU)} ${'TOTAL'.padStart(anchoImp)}`;

    let totalSinIVA = 0;
    const filasProductos = d.productos.map(p => {
      const nombre = p.nombre + (p.precio_tipo === 'mayoreo' ? ' *' : '');
      if (modo === 'venta_sin_iva') {
        const puSIV  = p.precio_unitario / 1.19;
        const subSIV = puSIV * p.cantidad;
        const subCIV = p.precio_unitario * p.cantidad;
        totalSinIVA += subSIV;
        return this.generarFilaVentaSinIVA(
          p.cantidad, nombre,
          fmtD(puSIV), fmtD(subSIV), this.formatCLP(subCIV),
          formato, anchoDesc, anchoPU, anchoLot, labelWidth, es58
        );
      }
      return this.generarFilaProducto(
        p.cantidad, nombre,
        this.formatCLP(p.precio_unitario), this.formatCLP(p.subtotal),
        formato, anchoDesc, anchoPU, anchoImp, anchoLot
      );
    }).join('\n');

    const artLabel   = 'NO. DE ARTICULOS:'.padEnd(labelWidth);

    const filasPago = d.pagos.map(p => {
      const metodoLabel = p.metodo === 'efectivo' ? 'EFECTIVO'
        : p.metodo === 'tarjeta' ? 'TARJETA'
        : 'MIXTO';
      let rows = `<div class="total-row"><span>METODO PAGO:</span><span>${metodoLabel}</span></div>`;
      if (p.metodo === 'mixto') {
        const efectivo = p.monto_efectivo ?? (p.monto_recibido - p.monto_tarjeta);
        rows += `<div class="total-row"><span>  EFECTIVO:</span><span>${this.formatCLP(efectivo)}</span></div>`;
        rows += `<div class="total-row"><span>  TARJETA:</span><span>${this.formatCLP(p.monto_tarjeta)}</span></div>`;
      } else if (p.metodo === 'efectivo') {
        rows += `<div class="total-row"><span>PAGO CON:</span><span>${this.formatCLP(p.monto_recibido)}</span></div>`;
      }
      rows += `<div class="total-row"><span>SU CAMBIO:</span><span>${this.formatCLP(p.vuelto)}</span></div>`;
      return rows;
    }).join('');

    // Sección de totales (varía según modo)
    let totalHtml: string;
    if (modo === 'venta_sin_iva') {
      const totalConIVA = d.total;
      const ivaTotal    = totalConIVA - totalSinIVA;
      totalHtml = `
  <div class="total-row"><span>TOTAL S/IVA:</span><span>${fmtD(totalSinIVA)}</span></div>
  <div class="total-row"><span>+ IVA (19%):</span><span>${fmtD(ivaTotal)}</span></div>
  <div class="separador">${sep}</div>
  <div class="total-row total-grande"><span>TOTAL C/IVA:</span><span>${this.formatCLP(totalConIVA)}</span></div>`;
    } else {
      totalHtml = `<div class="total-row"><span>TOTAL:</span><span>${this.formatCLP(d.total)}</span></div>`;
    }

    const copiaLabel = d.copia
      ? `<div class="centro negrita copia-lbl">*** ${d.copia} ***</div>`
      : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${anchoMM}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: ${anchoBody};
    margin: 0 auto;
    padding: 0;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    line-height: 1.4;
    color: #000;
  }

  @page {
    size: ${anchoMM} auto;
    margin: 4mm 2mm;
  }

  body {
    padding: 2mm 0;
  }

  .centro      { text-align: center; }
  .negrita     { font-weight: bold; }
  .grande      { font-size: ${fontGrande}; }
  .separador   { margin: 3px 0; }
  .copia-lbl   { font-size: ${fontGrande}; margin: 2px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1px 0; }
  .total-grande { font-size: ${fontGrande}; }

  .fila {
    display: flex;
    justify-content: space-between;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    font-weight: bold;
    font-size: ${fontTotal};
    margin: 2px 0;
  }

  .tabla-prods {
    font-family: inherit;
    font-size: inherit;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 2px 0;
  }
</style>
</head>
<body>
  <div class="centro negrita grande">FERRETERIA VICTORIA</div>
  <div class="centro">DIRECCION: OLGA VILLANUEVA 2386</div>
  <div class="centro">COMUNA: VILLA ALEMANA</div>
  ${copiaLabel}
  <div class="separador">${sep}</div>
  <div class="fila"><span>${this.formatFecha(d.fecha)}</span></div>
  <div class="fila"><span>CAJERO:</span><span>${d.cajero.toUpperCase()}</span></div>
  <div class="fila"><span>FOLIO:</span><span>${d.numero}</span></div>
  ${d.cliente_factura ? `
  <div class="fila"><span>CLIENTE:</span><span>${this.esc(d.cliente_factura.nombre)}</span></div>
  <div class="fila"><span>RUT:</span><span>${this.esc(d.cliente_factura.rut)}</span></div>
  ${d.cliente_factura.correo   ? `<div class="fila"><span>CORREO:</span><span>${this.esc(d.cliente_factura.correo)}</span></div>` : ''}
  ${d.cliente_factura.telefono ? `<div class="fila"><span>TEL:</span><span>${this.esc(d.cliente_factura.telefono)}</span></div>` : ''}` : ''}
  <pre class="tabla-prods">${this.esc(sep)}
${this.esc(headerRow)}
${this.esc(sep)}
${this.esc(filasProductos)}
${this.esc(sep)}
${this.esc(artLabel + String(totalItems).padStart(anchoImp))}
${this.esc(sep)}</pre>
  ${totalHtml}
  ${filasPago}
  <div class="separador">${sep}</div>
  <div class="centro negrita">GRACIAS POR SU COMPRA</div>
<script>
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;
  }
}
