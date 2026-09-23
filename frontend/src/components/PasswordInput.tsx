import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeIcon, EyeOffIcon } from './icons.tsx';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password field with an eye to show what was typed — in place of a second
 * "repeat the password" field, which only guards against the typo the eye
 * lets you see.
 */
export function PasswordInput(props: Props) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="password-input">
      <input {...props} type={isVisible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={t(isVisible ? 'auth.password.hide' : 'auth.password.show')}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}
