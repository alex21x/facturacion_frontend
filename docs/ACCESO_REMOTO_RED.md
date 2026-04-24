# Acceso Remoto a Facturación Local desde la Red

## Descripción General

Facturación Local puede configurarse para ser accesible desde otras PCs en la misma red local. Esto permite que múltiples usuarios trabajen simultáneamente con la aplicación desde diferentes máquinas.

## Configuración Durante la Instalación

Cuando ejecutas el instalador (`INSTALAR-FACTURACION.bat` o `instalar-local.bat`), se te preguntará:

```
======================================
  ACCESO REMOTO
======================================

¿Deseas permitir acceso desde otras PCs en la red?

  [s] Si  - Accesible desde cualquier PC de la red
          (puertos abiertos: backend 8000, frontend 5173, admin 5174)

  [n] No - Solo accesible localmente en esta PC (más seguro)

Opcion
```

### Opción [s] - Acceso Remoto Habilitado

Si seleccionas `s`:
- Los servicios Docker escucharán en **0.0.0.0** (todas las interfaces de red)
- Cualquier PC en la red podrá acceder a la aplicación
- Los puertos estarán abiertos en el firewall local

**Configuración guardada:**
```
DOCKER_BIND_HOST=0.0.0.0
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Opción [n] - Solo Acceso Local (Por Defecto)

Si seleccionas `n` (o presionas Enter):
- Los servicios Docker escucharán solo en **127.0.0.1**
- Solo esta PC puede acceder a la aplicación
- Más seguro para PCs aisladas

**Configuración guardada:**
```
DOCKER_BIND_HOST=127.0.0.1
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Acceso Remoto: Cómo Funciona

### 1. Detección Automática de IP

El frontend detecta automáticamente la dirección desde donde se accede:

- **Si accedes desde la misma PC:** `http://127.0.0.1:5173`
- **Si accedes desde otra PC (ej. IP 192.168.1.100):** El frontend automáticamente usa esa IP para conectar con el backend

### 2. URL Base para Acceso Remoto

Para acceder desde otra PC, usa la IP de la máquina donde corre Facturación:

```
http://<IP_DE_LA_PC>:5173
```

**Ejemplo:**
- PC A (servidor) tiene IP: `192.168.1.50`
- PC B (cliente) accede a: `http://192.168.1.50:5173`

### 3. Resolución Automática de API

El frontend incluye lógica inteligente para conectar con la API:

```javascript
// El navegador automáticamente reemplaza localhost con la IP desde donde se accede
// Si accedes desde 192.168.1.50:5173 → API se conecta a 192.168.1.50:8000
// Si accedes desde 127.0.0.1:5173    → API se conecta a 127.0.0.1:8000
```

## Cambiar la Configuración Después de la Instalación

Si ya instalaste y quieres cambiar entre acceso remoto/local:

### Opción A: Editar Manualmente `.client-config.env`

Ubica el archivo `.client-config.env` en la raíz de `facturacion_frontend`:

```env
# Para permitir acceso remoto:
DOCKER_BIND_HOST=0.0.0.0

# Para solo acceso local:
DOCKER_BIND_HOST=127.0.0.1
```

Luego reinicia los servicios:
```powershell
docker compose -p facturacion_local -f docker-compose.local.yml down
docker compose -p facturacion_local -f docker-compose.local.yml up -d
```

### Opción B: Desinstalar y Reinstalar

1. Ejecuta `desinstalar-local.bat` o `Facturacion - Desinstalar` (escritorio)
2. Ejecuta nuevamente `instalar-local.bat` y selecciona la opción que desees

## Consideraciones de Seguridad

⚠️ **Importante:** Si abres acceso remoto, considera:

1. **Firewall del SO:**
   - Asegúrate que solo las IPs de tu red interna pueden acceder
   - En redes públicas/WiFi abierto, esto es inseguro

2. **Credenciales por Defecto:**
   - La aplicación viene con credenciales de prueba
   - Cámbilas en producción

3. **VPN o Red Privada:**
   - Para acceso remoto verdadero (no solo LAN), usa VPN

4. **Monitoreo:**
   - Monitorea los logs en caso de acceso no autorizado

## Puertos Utilizados

Cuando habilitas acceso remoto, los siguientes puertos están disponibles en la red:

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Backend API | 8000 | API REST de facturación |
| Frontend | 5173 | Aplicación web principal |
| Admin Portal | 5174 | Portal administrativo |
| PostgreSQL | 5432 | Base de datos (no expuesto por defecto) |

## Solución de Problemas

### "No puedo acceder desde otra PC"

1. **Verifica que la otra PC puede alcanzar la IP:**
   ```powershell
   ping <IP_DE_LA_PC_SERVIDOR>
   ```

2. **Confirma que acceso remoto está habilitado:**
   ```powershell
   cat .client-config.env | grep DOCKER_BIND_HOST
   # Debe mostrar: DOCKER_BIND_HOST=0.0.0.0
   ```

3. **Verifica los servicios están corriendo:**
   ```powershell
   docker compose -p facturacion_local ps
   # Debe mostrar todos los servicios en "Up"
   ```

4. **Prueba conectar directamente al backend:**
   ```powershell
   curl http://<IP_SERVIDOR>:8000/api/health
   # Debe devolver estado 200 OK
   ```

5. **Revisa el firewall de Windows:**
   - Ve a: Control Panel → Windows Defender Firewall → Allow an app through firewall
   - Verifica que Docker Desktop está permitido

### "Puedo ver el sitio pero no carga datos"

- El frontend detecta la IP automáticamente, pero la API puede no estar escuchando
- Verifica que `DOCKER_BIND_HOST=0.0.0.0` en `.client-config.env`
- Reinicia los servicios: `docker compose -p facturacion_local -f docker-compose.local.yml down && docker compose -p facturacion_local -f docker-compose.local.yml up -d`

## Configuración Avanzada

### Usar Nombre de Host Personalizado

En lugar de IP, puedes usar un nombre de host si tu red tiene DNS configurado:

```
http://facturacion-servidor:5173
```

Edita `.client-config.env`:
```env
VITE_API_BASE_URL=http://facturacion-servidor:8000
```

### Puerto Personalizado

Si hay conflictos de puertos, puedes cambiarlos en `.client-config.env`:

```env
BACKEND_PORT=8001       # En lugar de 8000
FRONTEND_PORT=5180      # En lugar de 5173
ADMIN_PORT=5181         # En lugar de 5174
```

Luego actualiza `VITE_API_BASE_URL`:
```env
VITE_API_BASE_URL=http://127.0.0.1:8001
```

## Soporte

Si tienes problemas:

1. Revisa los logs de instalación: `install-local.log`
2. Verifica logs de Docker: `docker compose -p facturacion_local logs -f`
3. Consulta la documentación de Docker Compose en: https://docs.docker.com/compose/
