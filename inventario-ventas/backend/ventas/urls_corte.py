from django.urls import path
from .views_corte import ResumenCorteView, ConfirmarCorteView, HistorialCortesView

urlpatterns = [
    path('resumen/', ResumenCorteView.as_view()),
    path('confirmar/', ConfirmarCorteView.as_view()),
    path('historial/', HistorialCortesView.as_view()),
]
