from django.urls import path
from . import views

urlpatterns = [
    path('resumen-dia/', views.ResumenDiaView.as_view()),
    path('resumen-rango/', views.ResumenRangoView.as_view()),
    path('productos-mas-vendidos/', views.ProductosMasVendidosView.as_view()),
    path('stock-critico/', views.StockCriticoView.as_view()),
    path('clientes-deuda/', views.ClientesDeudaView.as_view()),
    path('movimientos-credito/', views.MovimientosCreditoDiaView.as_view()),
    path('ventas-por-usuario/', views.VentasPorUsuarioView.as_view()),
    path('tickets/', views.HistorialTicketsView.as_view()),
    path('tickets/<str:numero>/', views.DetalleTicketView.as_view()),
    path('movimientos-inventario/', views.HistorialMovimientosView.as_view()),
    path('kardex/<int:producto_id>/', views.KardexProductoView.as_view()),
    path('corte-caja/', views.CorteCajaView.as_view()),
    path('resumen-ventas/', views.ResumenVentasView.as_view()),
    path('usuarios/', views.UsuariosReportesView.as_view()),
]