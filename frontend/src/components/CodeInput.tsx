import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CODE_LENGTH } from '../lib/twoFactor.ts';

interface Props {
  /** One entry per box: a digit, or '' while empty. Always CODE_LENGTH long. */
  digits: string[];
  onChange: (digits: string[]) => void;
  /** Called with the whole code the moment the last box is filled. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** What the group is for, for screen readers: "Код од мејлот". */
  label: string;
}

/**
 * Six boxes for an emailed code. Typing moves on to the next box, Backspace
 * steps back, the arrow keys move freely, and pasting the code — or the
 * browser filling it from the email — fills every box at once. The first box
 * carries autocomplete="one-time-code" so phones offer the code on their own.
 */
export function CodeInput({ digits, onChange, onComplete, disabled, invalid, autoFocus, label }: Props) {
  const { t } = useTranslation();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  const focus = (index: number) => {
    const box = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))];
    box?.focus();
    box?.select();
  };

  /** Puts digits in from `start` onwards, then reports completion. */
  const fill = (start: number, incoming: string) => {
    const next = [...digits];
    const clean = incoming.replace(/\D/g, '').slice(0, CODE_LENGTH - start);
    [...clean].forEach((digit, offset) => {
      next[start + offset] = digit;
    });
    onChange(next);
    focus(start + clean.length);
    if (next.every((digit) => digit !== '')) onComplete?.(next.join(''));
  };

  const handleChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 0) {
      const next = [...digits];
      next[index] = '';
      onChange(next);
      return;
    }
    // A full code arriving in one box — autofill from the email — starts at the first box.
    fill(clean.length >= CODE_LENGTH ? 0 : index, clean.length > 1 ? clean : clean.slice(-1));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      onChange(next);
      focus(index - 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    fill(pasted.length >= CODE_LENGTH ? 0 : index, pasted);
  };

  return (
    <div className={`code-input${invalid ? ' is-invalid' : ''}`} role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          className="code-input-box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? CODE_LENGTH : 1}
          value={digit}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-label={t('twoFactor.digit', { position: index + 1, total: CODE_LENGTH })}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
