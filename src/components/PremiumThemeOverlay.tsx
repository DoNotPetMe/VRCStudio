import { useThemeStore } from '../stores/themeStore';

export default function PremiumThemeOverlay() {
  const premiumTheme = useThemeStore(s => s.theme.premiumTheme);
  if (!premiumTheme || premiumTheme === 'none') return null;
  return (
    <div
      className={`premium-overlay premium-overlay-${premiumTheme}`}
      aria-hidden="true"
    />
  );
}
