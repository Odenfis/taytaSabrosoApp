# Plan actual — Tests pendientes del flujo de Compras (E3, opcionales)

> Objetivo: cubrir los 2 casos de control que quedan de la revisión de Compras antes de pasar a la Fase E4:
> **compra a crédito** y **error visible (re-regularizar una compra ya regularizada)**. Ambos son **opcionales**
> y NO bloquean el avance a E4.
> El avance histórico y las decisiones van en `progreso/progress.md`.

---

## Contexto

- La revisión de Compras E3 quedó funcional y verificada por el usuario ("Quedó todo bien"):
  factura/caja, vale provisional y **regularización con propagación del folio formal a Kardex/Caja** (migración
  `0003` — kardex/tx con `[antes <VALE>]` sin recargar).
- Restan 2 casos de control, ambos opcionales:
  1. **Compra a crédito**: al registrarla con modo de pago "Crédito 15 días" debe quedar registrada **sin**
     tocar caja ni cuentas bancarias (sin transacción en Caja ni decremento de saldo en Bancos).
  2. **Error visible**: intentar regularizar una compra que ya está `regularizado` → el server responde
     **409 ALREADY_REGULARIZED** y la UI debe mostrar la notificación de error sin romperse.

---

## Plan de ejecución

### Paso 0 — Preparación
- [ ] Asegurar seed canónico y sesión iniciada (PIN `1004`).

### Paso 1 — Test "compra a crédito" (opcional)
- [ ] Compras → Registrar Compra → modo de pago **Crédito 15 días** → Guardar.
- [ ] Verificar: la compra aparece en la lista, pero **NO** se crea transacción "Pago Proveedor" en Caja
      ni cambia el saldo de ninguna cuenta bancaria.

### Paso 2 — Test "error visible" (opcional)
- [ ] Tomar una compra ya `regularizado` (o regularizar primero) e intentar **regularizar de nuevo**.
- [ ] Verificar: notificación de error visible ("La compra ya fue regularizada." / 409), sin pantalla en blanco.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Los 2 tests son opcionales | No bloquean E4; pueden marcarse como hechos o diferirse |
| Reintento de regularizar en el replay de E4 | `regularizePurchase` aún **no usa `clientOpId`** → pendiente para el replay idempotente de la cola (E4) |

---

## Estado

- [ ] Paso 0 — Preparación
- [ ] Paso 1 — Test "compra a crédito" (opcional)
- [ ] Paso 2 — Test "error visible" (opcional)
- [ ] Documentar resultado en `progreso/progress.md` y limpiar este archivo.