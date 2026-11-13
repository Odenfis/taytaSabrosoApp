import { prisma } from '../lib/prisma.js';

/** Aggregate in SQL; ledger pagination must never truncate the payment totals. */
export async function paymentSummary(companyId: string | undefined, currentOnly: boolean) {
  return prisma.$transaction(async db => {
    const companies = await db.company.findMany({ where: companyId ? { id: companyId } : {}, select: { id:true, tradeName:true } });
    const methods = await db.customPaymentMethod.findMany({ where: companyId ? { OR:[{companyId},{companyId:null}] } : {} });
    const rows: {id:string;companyId:string;companyName:string;name:string;icon:string;historical:boolean;amount:number}[] = [];
    for (const company of companies) {
      const shift = currentOnly ? await db.companyShift.findUnique({where:{companyId:company.id}}) : null;
      const groups = await db.transaction.groupBy({by:['customPaymentMethodId','paymentMethod'],where:{companyId:company.id,isDeleted:false,isIncome:true,type:{startsWith:'Venta ('},...(currentOnly ? {timestamp:{gte:shift?.openedUtc ?? new Date(0)},OR:[{shift:null},{shift:shift?.currentShift ?? 'Día'}]} : {})},_sum:{amount:true}});
      const totals = new Map<string,number>(); let unknown=0;
      for(const group of groups) {
        const amount=Number(group._sum.amount ?? 0);
        const method=methods.find(m=>m.id===group.customPaymentMethodId && (!m.companyId || m.companyId===company.id));
        if(method?.category==='Efectivo') continue;
        if(!method) { if(!group.customPaymentMethodId && ['efectivo','efectivo en caja'].includes((group.paymentMethod??'').trim().toLowerCase())) continue; unknown+=amount; continue; }
        totals.set(method.id,(totals.get(method.id)??0)+amount);
      }
      for(const method of methods.filter(m=>(!m.companyId || m.companyId===company.id) && m.category!=='Efectivo')) {
        const amount=totals.get(method.id)??0;
        if((!method.isActive || method.isDeleted) && !amount) continue;
        rows.push({id:method.id,companyId:company.id,companyName:company.tradeName,name:method.name,icon:method.icon,historical:!method.isActive||method.isDeleted,amount:Math.round(amount*100)/100});
      }
      if(unknown) rows.push({id:'unidentified',companyId:company.id,companyName:company.tradeName,name:'Medio sin identificar',icon:'help',historical:true,amount:Math.round(unknown*100)/100});
    }
    return {scope:currentOnly?'current_shift':'accumulated',updatedAt:new Date().toISOString(),rows:rows.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.companyName.localeCompare(b.companyName,'es'))};
  },{isolationLevel:'Serializable'});
}
