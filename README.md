# Tayta & Sabroso POS

Proyecto de Sedimcorp: React + Express + Prisma/SQL Server.
Hoja de ruta: [plan pendiente](progreso/planpendiente.md).
Evidencia de avances: [bitácora](progreso/progress.md).

## Desarrollo

Instalar dependencias en la raíz y en el backend:

```sh
npm ci
npm ci --prefix server
```

Configurar `server/.env` usando `server/.env.example`, con la conexión SQL Server
del entorno. No ejecutar seeds para arrancar: los existentes eliminan datos.

```sh
npm run dev:all
```

Frontend: `http://localhost:3000`. API: `http://localhost:4000`.
El navegador guarda su identidad de terminal por perfil/origen. Cerrar sesión no
la modifica; limpiar datos del navegador genera otra identidad.

## Backend compilado

```sh
npm run build --prefix server
npm start --prefix server
```

La entrada es `server/dist/index.js`; el build incluye `dist/public` y excluye seeds.
Para ejecutarlo en otra máquina se necesitan `dist`, los manifiestos del backend,
sus dependencias con Prisma Client generado y la configuración del entorno.
No es un ejecutable autónomo.

En producción configurar:

- `NODE_ENV=production`.
- `DATABASE_URL`: conexión SQL Server; el arranque comprueba conectividad.
- `JWT_SECRET`: secreto propio aleatorio de al menos 32 caracteres; los valores
  de ejemplo se rechazan. Usar el mismo secreto entre reinicios; cambiarlo invalida los JWT.
- `CORS_ORIGIN`: orígenes exactos de la interfaz separados por comas, sin barra
  final, rutas ni comodines; se aplica también al handshake WebSocket.
- `PORT`: puerto de la API, por defecto 4000.

El despliegue del frontend en LAN, HTTPS, servicios Windows, respaldos y
consolidación Azure corresponden a las siguientes etapas. Esta configuración
no constituye por sí sola un despliegue completo.

## Verificación

```sh
npm run lint
npm test
npm test --prefix server
npm run build
npm run build --prefix server
npm run smoke:built --prefix server
```

Las pruebas automatizadas de sesión usan almacenamiento en memoria y conexiones
HTTP/Socket.IO locales; no acceden a la base del restaurante. Necesitan permiso
para abrir puertos locales temporales.

`smoke:built` inicia el backend compilado en un puerto temporal, conecta al SQL
configurado y comprueba rutas de lectura y rechazo de acceso sin sesión.
No inicia sesión, no modifica datos y detiene su propio proceso al terminar.

La validación completa offline y de negocio en navegador sigue el checklist
del plan pendiente y debe utilizar una base de pruebas separada.

## Maestro de Productos

El panel **Productos** permite administrar productos con o sin ficha, con disponibilidad
y cambios comerciales coherentes con Fichas & Recetas. Los cambios offline quedan en
la cola del navegador; los conflictos de versión requieren una elección en **Revisar**.

Pruebas de negocio aisladas (desde `server/`):

```bash
npm run test:products:sql
# Revisión visual aislada; requiere primero npm run build en la raíz:
npm run test:products:sql -- --browser
```

El runner usa la conexión de `server/.env` para crear una base temporal independiente,
aplica el esquema solo allí y elimina esa base al terminar. Requiere permisos SQL para
crear/eliminar bases. No usa seeds de la base actual. El modo navegador abre el servicio
en `http://127.0.0.1:4310`; las credenciales temporales aparecen en la consola y dejan de
existir al escribir `fin` para cerrar. La evidencia y pendientes están en
`progreso/progress.md` y `progreso/planpendiente.md`.
