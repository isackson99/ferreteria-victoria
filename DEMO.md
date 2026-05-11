# 🎮 DEMO - Guía de Uso

Esta guía te ayuda a explorar todas las funcionalidades del sistema POS.

## Tabla de contenidos
1. [Quick Start](#quick-start)
2. [Usuarios de prueba](#usuarios-de-prueba)
3. [Módulo de Ventas](#módulo-de-ventas)
4. [Módulo de Inventario](#módulo-de-inventario)
5. [Reportes](#reportes)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Levantar los servicios

```bash
docker-compose up -d
```

Verifica que todo esté corriendo:
```bash
docker-compose ps
```

Deberías ver:
NAME                COMMAND                  STATUS
ferreteria_db       "docker-entrypoint.s…"   Up
ferreteria_redis    "redis-server --appe…"   Up
ferreteria_backend  "daphne -b 0.0.0.0 -p…"  Up
ferreteria_frontend "ng serve --host 0.0…"   Up

### 2. Acceder a la app

- **Frontend**: http://localhost:4200
- **API Docs**: http://localhost:8000/api/docs/
- **Admin Django**: http://localhost:8000/admin/

### 3. Ver logs

```bash
# Backend
docker-compose logs -f backend

# Frontend
docker-compose logs -f frontend

# Todo
docker-compose logs -f
```

---

## Usuarios de prueba

| Usuario | Password | Rol | Acceso |
|---------|----------|-----|--------|
| `admin` | `demo123` | Superadmin | Todo |
| `vendedor` | `demo123` | Vendedor | Ventas, Inventario (lectura) |
| `gerente` | `demo123` | Gerente | Ventas, Inventario, Reportes |

### Loguear:
1. Abre http://localhost:4200
2. Ingresa usuario y password
3. Click "Ingresar" o Enter

---

## Módulo de Ventas

### Crear una venta

1. **Ir a Ventas** → Click en "Nueva Venta"
2. **Escanear/buscar producto**:
   - Presiona `F10` para abrir búsqueda
   - Escribe "martillo" o el código
   - Selecciona con flechas y Enter
3. **Ajustar cantidad**:
   - Click en el producto o presiona `*`
   - Cambia cantidad
   - Click OK
4. **Aplicar descuento** (opcional):
   - Click en botón "Descuento"
   - Ingresa % o monto
   - El total se actualiza en vivo
5. **Cambiar cantidad de producto**:
   - Click en producto → Cambiar cantidad
6. **Procesar pago**:
   - Click "Cobrar"
   - Selecciona forma de pago
   - Ingresa monto
   - Click "Procesar"
7. **Imprimir ticket**:
   - Automático (si hay impresora)
   - O click "Reimprimir ticket"

### Casos especiales

**Mayoreo**: Click botón "Mayoreo" → automáticamente aplica descuento mayorista

**Devolución**: Click "Devolver" → selecciona la venta anterior → reintegra monto

**Pago múltiple**: Click "Agregar pago" mientras procesas → suma múltiples formas

---

## Módulo de Inventario

### Ver productos

1. **Ir a Inventario** → **Productos**
2. Busca por nombre o código
3. Click en producto para ver detalles y stock por sucursal

### Crear producto

1. Click "Nuevo Producto"
2. Ingresa:
   - **Código**: único (ej: `MART001`)
   - **Nombre**: descriptivo
   - **Categoría**: selecciona
   - **Precio costo**: lo que te cuesta
   - **Precio venta**: lo que vendes
   - **Stock inicial**: unidades disponibles
3. Click "Guardar"

### Ajustar stock

1. **Inventario** → **Ajustes de Stock**
2. Click "Nuevo Ajuste"
3. Selecciona producto
4. Ingresa cantidad (puede ser 0 o negativa)
5. Razón: "Inventario", "Pérdida", "Devolución", etc.
6. Click "Guardar"

---

## Reportes

### Reporte de ventas

1. **Reportes** → **Ventas**
2. Selecciona rango de fechas
3. Filtra por vendedor (opcional)
4. Click "Generar"
5. Gráficos y tabla de detalles

### Reporte de inventario

1. **Reportes** → **Inventario**
2. Selecciona categoría (opcional)
3. Ordena por: "Nombre", "Stock", "Rotación"
4. Exporta a PDF/Excel (si está habilitado)

### Corte de caja

1. **Corte de Caja**
2. Verifica sumas de:
   - Ventas efectivo
   - Ventas tarjeta
   - Créditos cobrados
3. Click "Cerrar turno"
4. Sistema genera reporte automático

---

## Troubleshooting

### "Connection refused" en frontend

```bash
# Verifica que backend está corriendo
docker-compose ps backend

# Si no está, reinicia
docker-compose restart backend
```

### "CORS error" en consola

Asegúrate de que `ALLOWED_HOSTS` en `.env.docker` incluye tu host:

```bash
ALLOWED_HOSTS=localhost,127.0.0.1,mi-pc:8000
```

Luego:
```bash
docker-compose restart backend
```

### Base de datos vacía / sin productos demo

```bash
# Recarga demo data
docker-compose exec backend python manage.py shell < load_demo_data.py

# O reimporta fixture
docker-compose exec backend python manage.py loaddata fixtures/demo_data.json
```

### ¿Cómo borrar todo y empezar de nuevo?

```bash
# Borra volúmenes Docker
docker-compose down -v

# Levanta de nuevo (se recreará BD vacía)
docker-compose up -d

# Carga demo data
docker-compose exec backend python manage.py shell < load_demo_data.py
```

### Puerto 8000 o 4200 en uso

```bash
# Cambia en docker-compose.yml
# Línea 'ports:' para backend o frontend:
#   - "8001:8000"  (cambio a puerto 8001)
#   - "4201:4200"  (cambio a puerto 4201)

docker-compose up -d
```

---

## 📞 ¿Más preguntas?

- Revisa [README.md](./README.md)
- Abre un [Issue en GitHub](https://github.com/tu-usuario/ferreteria-victoria-pos-demo/issues)
- Consulta la [documentación técnica](./ARCHITECTURE.md)