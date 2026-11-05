import { AddHostSheet } from '@/features/hosts/AddHostSheet';
import { useAddHostNavigation } from '@/navigation/addHostNavigation';

/** `/add-host`: the choice sheet over whatever screen asked to add a Host. */
export default function AddHostRoute() {
  const navigation = useAddHostNavigation();
  return (
    <AddHostSheet
      onClose={navigation.close}
      onEasyPair={navigation.easyPair}
      onAddManually={navigation.addManually}
    />
  );
}
