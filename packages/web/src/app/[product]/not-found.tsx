import { GoneNotice } from '@/components/GoneNotice';

// notFound() anywhere under a product — a session, a type, a node that is not there — lands here, inside the product's
// shell (the rail, the top bar, the column stay); the notice names what is missing from the address.
export default function ProductNotFound() {
  return <GoneNotice what="route" slug="" />;
}
