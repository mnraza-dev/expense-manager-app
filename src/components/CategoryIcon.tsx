import {
  ArrowRightLeft,
  BriefcaseBusiness,
  Bus,
  Clapperboard,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  PiggyBank,
  Plane,
  ReceiptText,
  Repeat,
  RotateCcw,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Tag,
  Utensils,
  Zap,
} from 'lucide-react-native';
import { categoryIconName, type CategoryIconName } from '../utils/categoryIcons';
import { useTheme } from './ui';
const icons: Record<CategoryIconName, typeof Tag> = {
  auto: Tag,
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Bus,
  fuel: Fuel,
  travel: Plane,
  home: House,
  utilities: Zap,
  shopping: ShoppingBag,
  health: HeartPulse,
  education: GraduationCap,
  entertainment: Clapperboard,
  subscriptions: Repeat,
  bills: ReceiptText,
  gift: Gift,
  salary: BriefcaseBusiness,
  business: Store,
  freelance: Laptop,
  savings: PiggyBank,
  refund: RotateCcw,
  tag: Tag,
  transfer: ArrowRightLeft,
};
export function CategoryIcon({
  name,
  icon,
  transfer = false,
  color,
  size = 20,
}: {
  name: string;
  icon?: string;
  transfer?: boolean;
  color?: string;
  size?: number;
}) {
  const c = useTheme();
  const Icon = icons[categoryIconName(name, icon, transfer)];
  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      color={color ?? c.accent}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
