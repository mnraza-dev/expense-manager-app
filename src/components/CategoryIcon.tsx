import {
  ShoppingBag,
  Utensils,
  Bus,
  Home,
  Heart,
  Briefcase,
  Tag,
  ArrowRightLeft,
} from 'lucide-react-native';
import { useTheme } from './ui';
export function CategoryIcon({ name, transfer = false }: { name: string; transfer?: boolean }) {
  const c = useTheme();
  const Icon = transfer
    ? ArrowRightLeft
    : /food|dining|grocer/i.test(name)
      ? Utensils
      : /transport|travel|fuel/i.test(name)
        ? Bus
        : /rent|home|utilit/i.test(name)
          ? Home
          : /health/i.test(name)
            ? Heart
            : /salary|work/i.test(name)
              ? Briefcase
              : /shop/i.test(name)
                ? ShoppingBag
                : Tag;
  return (
    <Icon
      size={19}
      color={c.muted}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
