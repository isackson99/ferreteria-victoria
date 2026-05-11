> ⚠️ **Versión Demostrativa**
>
> Este repositorio contiene una **versión demo** del proyecto, publicada con fines
> de portafolio profesional. La versión en producción puede incluir funcionalidades,
> configuraciones y datos distintos a los presentados aquí.
>
> 📄 Consulta el archivo [LICENSE](./LICENSE) para conocer los términos de uso.

# 🏪 Ferretería Victoria - POS DEMO

Una **solución de Punto de Venta (POS) e Inventario** completa, desarrollada para tiendas de hardware.

Este es un **proyecto de demostración** que muestra todas las funcionalidades del sistema.

## ✨ Features

- ✅ **Módulo de Ventas**: mayoreo, descuentos, devoluciones, pago múltiple
- ✅ **Inventario**: gestión de stock, ajustes, reportes
- ✅ **Clientes & Créditos**: gestión de clientes, créditos y cuentas corrientes
- ✅ **Corte de Caja**: cierre de turno, reportes de venta diaria
- ✅ **Reportes**: ventas, inventario, movimientos
- ✅ **Usuarios & Permisos**: roles granulares (Admin, Vendedor, Gerente)
- ✅ **Notificaciones en tiempo real**: WebSocket con Django Channels
- ✅ **Impresora térmica**: compatible con 80mm y 58mm

## 🛠️ Tech Stack

| Layer | Tecnología |
|-------|-----------|
| Backend | Django 4.x, Django REST Framework, Django Channels |
| Frontend | Angular 21, Angular Material, Chart.js |
| Database | PostgreSQL 15 |
| Realtime | Redis + WebSocket |
| Deployment | Docker + Docker Compose |

## 🚀 Quick Start (3 pasos)

### Prerequisitos
- Docker y Docker Compose instalados
- Git
- ~2GB de espacio disponible

### Pasos

1. **Clonar repositorio**
```bash
   git clone https://github.com/tu-usuario/ferreteria-victoria-pos-demo.git
   cd ferreteria-victoria-pos-demo
```

2. **Levanta la demo con Docker**
```bash
   docker-compose up -d
```
   *Espera ~30 segundos para que se inicialice todo*

3. **Abre en el navegador**
http://localhost:4200
### Credenciales Demo
- **Usuario**: `admin`
- **Password**: `demo123`

---

## 📖 Documentación

- [DEMO.md](./DEMO.md) - Guía completa para ejecutar y explorar
- [SETUP.md](./SETUP.md) - Instalación para desarrolladores (local, sin Docker)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Arquitectura y decisiones técnicas
- [API.md](./API.md) - Documentación de endpoints (Swagger en `/api/docs/`)

---

## 🎮 Prueba la Demo

### Casos de uso para explorar:

1. **Vendedor**: Hacer una venta completa
   - Escanear productos
   - Aplicar descuento
   - Cambiar cantidad
   - Pagar (efectivo/tarjeta)
   - Imprimir ticket

2. **Gerente**: Ver reportes
   - Ventas del día
   - Productos más vendidos
   - Movimientos de inventario
   - Deudas de clientes

3. **Admin**: Gestionar sistema
   - Crear productos
   - Ajustar stock
   - Crear usuarios
   - Configurar permisos

---

## 🏗️ Estructura del Proyecto
```
ferreteria-victoria-pos-demo/
│
├── README.md                    # Este archivo
├── DEMO.md                      # Guía de uso y casos de ejemplo
├── LICENSE                      # Licencia MIT
├── .env.example                 # Variables de entorno (sin secretos)
├── .gitignore                   # Archivos ignorados por Git
├── docker-compose.yml           # Orquestación de servicios
│
├── backend/                     # Django REST API
│   ├── ferreteria/              # Django project settings
│   │   ├── settings.py
│   │   ├── asgi.py
│   │   └── urls.py
│   │
│   ├── apps/                    # Módulos de negocio
│   │   ├── ventas/              # Módulo de Ventas
│   │   ├── inventario/          # Gestión de Inventario
│   │   ├── clientes/            # Gestión de Clientes
│   │   ├── creditos/            # Créditos y Cuentas Corrientes
│   │   ├── usuarios/            # Usuarios y Permisos
│   │   └── ...
│   │
│   ├── fixtures/                # Datos de demostración
│   │   └── demo_data.json
│   │
│   ├── Dockerfile
│   ├── entrypoint.sh            # Script de inicialización
│   ├── requirements.txt
│   ├── manage.py
│   └── load_demo_data.py        # Carga datos demo
│
├── frontend/                    # Angular 21 Application
│   ├── src/
│   │   ├── app/                 # Componentes y módulos
│   │   │   ├── ventas/
│   │   │   ├── inventario/
│   │   │   ├── clientes/
│   │   │   └── ...
│   │   │
│   │   ├── assets/              # Imágenes, íconos
│   │   │
│   │   └── environments/        # Configuraciones por ambiente
│   │       ├── environment.ts
│   │       └── environment.demo.ts
│   │
│   ├── Dockerfile
│   ├── package.json
│   ├── angular.json
│   └── docker-compose.yml       # (composición local)
│
└── .github/                     # Configuración de GitHub (opcional)
└── workflows/               # CI/CD (si se implementa)
```
---

### **Explicación de estructura:**

| Directorio | Descripción |
|-----------|-----------|
| **backend/** | API REST con Django + DRF |
| **frontend/** | Aplicación Angular 21 |
| **backend/apps/** | Módulos: ventas, inventario, clientes, créditos, usuarios |
| **frontend/src/environments/** | Configuración por ambiente (dev, demo, prod) |
| **backend/fixtures/** | Datos de demostración para la BD |
| **docker-compose.yml** | Orquesta todos los servicios |

## 🐛 Reportar Issues

¿Encontraste un bug? ¿Tienes una sugerencia?

- Abre un [GitHub Issue](https://github.com/tu-usuario/ferreteria-victoria-pos-demo/issues)
- Describe el problema con claridad
- Incluye screenshots si es relevante
## 📝 License

Este proyecto está bajo la licencia [MIT](./LICENSE).

---

## 👤 Autor

Desarrollado por Isaac Kson

- GitHub: [@isackson99](https://github.com/isackson99)
- Email: isaac82015@gmail.com

---

## 🙏 Agradecimientos

- Django & DRF community
- Angular community
- PostgreSQL & Redis

---

## 📞 Soporte

¿Preguntas sobre cómo deployar o usar la demo?

- Abre un Issue con etiqueta `question`
- Revisa la documentación en `SETUP.md` y `DEMO.md`
