import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { parseDecimalInput, formatDecimalInput } from '../utils/costCalculations';

export interface DecimalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  allowTimeFormat?: boolean;
  placeholder?: string;
  className?: string;
}

export function DecimalInput({
  value,
  onChange,
  allowTimeFormat = true,
  placeholder = '0,0',
  className = '',
  onFocus,
  onBlur,
  ...props
}: DecimalInputProps) {
  const [text, setText] = useState<string>(() => {
    if (value === undefined || value === null || isNaN(value) || value === 0) return '0';
    return formatDecimalInput(value);
  });

  // Sincroniza se o valor numérico externo mudar significativamente
  useEffect(() => {
    const currentParsed = parseDecimalInput(text);
    if (Math.abs(currentParsed - (value || 0)) > 0.0001) {
      setText(value === 0 ? '0' : formatDecimalInput(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Permite digitação apenas de números, vírgula, ponto, dois pontos (HH:MM) e traço
    const regex = allowTimeFormat ? /^[-0-9.,:]*$/ : /^[-0-9.,]*$/;
    if (raw !== '' && !regex.test(raw)) {
      return;
    }

    setText(raw);
    const parsed = parseDecimalInput(raw);
    onChange(parsed);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseDecimalInput(text);
    if (text.includes(':')) {
      // Converte HH:MM para horas decimais formatadas (ex: 2:30 -> 2,5)
      setText(formatDecimalInput(parsed));
    } else if (text.endsWith(',') || text.endsWith('.')) {
      setText(formatDecimalInput(parsed));
    } else if (text.trim() === '') {
      setText('0');
    }
    onChange(parsed);
    onBlur?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (text === '0') {
      e.target.select();
    }
    onFocus?.(e);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  );
}
