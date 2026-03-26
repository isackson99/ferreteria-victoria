from django.db import models
from django.contrib.auth.models import AbstractUser


class Permiso(models.Model):
    codigo = models.CharField(max_length=100, unique=True)
    descripcion = models.CharField(max_length=200)

    def __str__(self):
        return self.descripcion

    class Meta:
        verbose_name_plural = "Permisos"


class Rol(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    permisos = models.ManyToManyField(Permiso, blank=True, related_name='roles')

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name_plural = "Roles"


class Usuario(AbstractUser):
    rol = models.ForeignKey(Rol, on_delete=models.SET_NULL, null=True, blank=True, related_name='usuarios')

    def tiene_permiso(self, codigo):
        if self.is_superuser:
            return True
        if self.rol:
            return self.rol.permisos.filter(codigo=codigo).exists()
        return False

    def __str__(self):
        return f"{self.username} ({self.rol})"

    class Meta:
        verbose_name_plural = "Usuarios"