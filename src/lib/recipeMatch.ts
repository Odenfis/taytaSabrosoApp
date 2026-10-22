// Igual criterio que la API: vínculo explícito y empresa; fallback legacy no ambiguo.
export function matchingRecipe<T extends { companyId: string; productId?: string | null; productName: string; isDeleted?: boolean }>(
  recipes: T[], companyId: string, item: { productId?: string | null; name: string }
): T | undefined {
  const local = recipes.filter((r) => !r.isDeleted && r.companyId === companyId);
  const linked = item.productId ? local.filter((r) => r.productId === item.productId) : [];
  if (linked.length) return linked[0];
  const legacy = local.filter((r) => !r.productId && r.productName === item.name);
  return legacy.length === 1 ? legacy[0] : undefined;
}
