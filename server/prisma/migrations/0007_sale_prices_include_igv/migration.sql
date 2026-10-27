-- Los precios de detalle_pedidos ya incluyen IGV. Solo ajustar órdenes no cobradas.
UPDATE pedido
SET
  [subtotal] = ROUND(importes.[total] / 1.18, 2),
  [igv] = importes.[total] - ROUND(importes.[total] / 1.18, 2),
  [total] = importes.[total]
FROM [dbo].[pedidos] AS pedido
CROSS APPLY (
  SELECT CAST(ROUND(COALESCE(SUM(detalle.[precio] * detalle.[cantidad]), 0), 2) AS DECIMAL(12, 2)) AS [total]
  FROM [dbo].[detalle_pedidos] AS detalle
  WHERE detalle.[pedido_id] = pedido.[id]
) AS importes
WHERE pedido.[esta_eliminado] = 0
  AND pedido.[estado] IN ('abierto', 'en_cocina', 'por_cobrar');
