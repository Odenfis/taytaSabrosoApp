import { usePOS } from '../context/POSContext';
import { hasPermission, type PosPermission } from '../../server/src/lib/permissions';
export function usePermission() {
  const { currentUser } = usePOS();
  return (permission: PosPermission) => hasPermission(currentUser?.role, permission);
}
