import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
}

const rules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Contains lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  { label: 'Contains a symbol (!@#$...)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function getPasswordStrength(password: string) {
  const passed = rules.filter((r) => r.test(password)).length;
  return passed;
}

export function isPasswordValid(password: string) {
  return getPasswordStrength(password) >= 4;
}

const PasswordStrengthIndicator = ({ password }: PasswordStrengthIndicatorProps) => {
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const strengthLabel = useMemo(() => {
    if (password.length === 0) return '';
    if (strength <= 1) return 'Very weak';
    if (strength === 2) return 'Weak';
    if (strength === 3) return 'Fair';
    if (strength === 4) return 'Strong';
    return 'Very strong';
  }, [strength, password]);

  const barColor = useMemo(() => {
    if (strength <= 1) return 'bg-[hsl(var(--bear))]';
    if (strength === 2) return 'bg-[hsl(var(--warning))]';
    if (strength === 3) return 'bg-[hsl(var(--warning))]';
    return 'bg-[hsl(var(--bull))]';
  }, [strength]);

  if (password.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors duration-300 ${
                i < strength ? barColor : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground min-w-[70px] text-right">
          {strengthLabel}
        </span>
      </div>

      {/* Rules checklist */}
      <ul className="space-y-0.5">
        {rules.map((rule) => {
          const passed = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                passed ? 'text-[hsl(var(--bull))]' : 'text-muted-foreground'
              }`}
            >
              {passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PasswordStrengthIndicator;
