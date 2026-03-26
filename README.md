# 🔧 Sistema POS — Ferretería Victoria

> Sistema de punto de venta e inventario en tiempo real desarrollado desde cero para una ferretería real en operación.  
> Reemplaza un software comercial de pago por una solución propia, personalizada y moderna.

---

## 📌 Descripción

Sistema fullstack completo que gestiona ventas, inventario, créditos, clientes y reportes en tiempo real. Diseñado para operar en red local con múltiples cajeros simultáneos, impresión térmica directa y sincronización instantánea mediante WebSockets.

No es un ejercicio académico — está siendo desarrollado para una ferretería real con operación diaria, reemplazando software comercial de pago.

---

## 📸 Capturas del sistema

> *Próximamente — capturas del módulo de ventas, inventario y reportes.*

---

## ✨ Módulos del sistema

| Módulo | Descripción |
|---|---|
| **Ventas** | Múltiples tickets simultáneos, búsqueda por código de barras, productos a granel, kits, mayoreo automático, crédito, impresión térmica |
| **Inventario** | Ajustes, kardex, movimientos, stock crítico, reportes |
| **Productos** | CRUD completo, kits con componentes, importación masiva desde Excel |
| **Créditos** | Estado de cuenta, abonos, liquidación, impresión con precios especiales |
| **Clientes** | Facturación con RUT chileno, integración en tickets |
| **Reportes** | Gráficos por período, ventas por departamento, forma de pago, ganancia |
| **Corte de caja** | Resumen de turno, cierre de sesión automático |
| **Notificaciones** | WebSocket en tiempo real, campana en navbar |
| **Usuarios** | Roles, permisos, gestión desde frontend |
| **Configuración** | Impresora térmica (80mm/58mm), precio especial por cliente, seguridad |

---

## 🛠️ Stack tecnológico

### Backend
| Tecnología | Uso |
|---|---|
| Python 3.13 + Django 6 | Framework principal |
| Django REST Framework | API REST |
| Django Channels + Redis | WebSockets en tiempo real |
| PostgreSQL | Base de datos en producción |
| JWT (simplejwt) | Autenticación |
| Daphne (ASGI) | Servidor de producción |
| APScheduler | Tareas programadas |

### Frontend
| Tecnología | Uso |
|---|---|
| Angular 21 (standalone) | Framework principal |
| Angular Material UI | Componentes de interfaz |
| Chart.js | Gráficos y reportes |
| Signals + BehaviorSubject | Estado reactivo |

### Infraestructura
| Tecnología | Uso |
|---|---|
| PostgreSQL | Base de datos producción |
| Redis + WSL | Broker para WebSockets |
| Git + GitHub | Control de versiones |
| Red local | Acceso multi-dispositivo simultáneo |

---

## 🗂️ Estructura del proyecto

```
ferreteria-victoria/
│
├── backend/                        # Django + DRF
│   ├── config/                     # Settings, URLs, ASGI
│   ├── apps/
│   │   ├── ventas/                 # Tickets, items, pagos
│   │   ├── inventario/             # Movimientos, kardex
│   │   ├── productos/              # CRUD, kits, importación
│   │   ├── creditos/               # Estado de cuenta, abonos
│   │   ├── clientes/               # RUT, facturación
│   │   ├── reportes/               # Gráficos, cierres
│   │   ├── usuarios/               # Roles, permisos
│   │   └── notificaciones/         # WebSocket, campana
│   └── requirements.txt
│
├── frontend/                       # Angular 21
│   ├── src/
│   │   ├── app/
│   │   │   ├── modules/            # Ventas, inventario, reportes...
│   │   │   ├── shared/             # Componentes reutilizables
│   │   │   ├── core/               # Guards, interceptores, servicios
│   │   │   └── environments/
│   └── package.json
│
└── README.md
```

---

## ⚙️ Arquitectura del sistema

```
Múltiples cajeros (navegador)
        │
        ▼
  Angular 21 Frontend
  ├── HTTP requests → Django REST Framework
  └── WebSocket ──→ Django Channels + Redis
                          │
                          ▼
                    PostgreSQL (BD)
                    
  Sincronización en tiempo real:
  Cajero A agrega venta → Redis → Cajero B recibe notificación instantánea
```

---

## 🚀 Cómo ejecutar localmente

### Requisitos previos
- Python 3.13+
- Node.js 20+
- PostgreSQL
- Redis (en WSL si usas Windows)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
ng serve
```

### Redis (Windows con WSL)
```bash
wsl
redis-server
```

---

## 🔐 Variables de entorno

Crear un archivo `.env` en `/backend/` basado en `.env.example`:

```env
SECRET_KEY=tu_secret_key_aqui
DEBUG=True
DB_NAME=ferreteria_db
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://localhost:6379
```

---

## 🧠 Desafíos técnicos superados

- **Sincronización en tiempo real** entre múltiples cajeros mediante WebSockets con Django Channels y Redis
- **Impresión térmica directa** desde el navegador (80mm/58mm) sin drivers externos
- **Cálculo dinámico de stock** para productos tipo kit basado en sus componentes en tiempo real
- **Productos a granel** con decimales y activación automática de precio mayoreo por cantidad
- **Migración de SQLite a PostgreSQL** en producción sin pérdida de datos
- **Acceso multi-dispositivo** en red local con autofocus inteligente en input de código de barras
- **Estado reactivo sin NgRx** usando Angular Signals y BehaviorSubject

---

## 🔒 Seguridad implementada

- Autenticación JWT con blacklist de tokens al cerrar sesión
- Rate limiting en endpoints críticos
- Sanitización de inputs
- Headers de seguridad HTTP
- Permisos granulares por rol de usuario

---

## 👨‍💻 Autor

**Isaac Serrano**  
Ingeniero en Informática — DUOC UC, Viña del Mar

[![LinkedIn](https://img.shields.io/badge/LinkedIn-isaac--serrano99-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/isaac-serrano99/)
[![GitHub](https://img.shields.io/badge/GitHub-isackson99-black?style=flat&logo=github)](https://github.com/isackson99)
[![Gmail](https://img.shields.io/badge/Gmail-isaac82015@gmail.com-red?style=flat&logo=gmail)](mailto:isaac82015@gmail.com)

---

> *Proyecto en desarrollo activo. Algunos módulos pueden estar incompletos o en proceso de refinamiento.*  
> *Los datos mostrados en capturas son ficticios o han sido anonimizados.*
