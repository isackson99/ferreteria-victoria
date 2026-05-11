// environment.demo.ts
export const environment = {
  production: false,
  baseUrl: 'http://localhost:8000/api',
  apiTimeout: 30000,
  wsProtocol: 'ws',
  wsHost: 'localhost',
  wsPort: 8000,
  enableLogging: true,
  logLevel: 'debug',
  
  // Demo defaults
  demoMode: true,
  demoUser: 'admin',
  ticketPaperWidth: 80,  // 80mm
  
  features: {
    ventas: true,
    inventario: true,
    creditos: true,
    clientes: true,
    reportes: true,
    corte_caja: true,
    usuarios: true,
    notificaciones: true,
  }
};
