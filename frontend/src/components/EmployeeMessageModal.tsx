import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { Modal } from './Modal.tsx';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_SUBJECT_MAX,
  sendEmployeeMessage,
  type EmployeeMessageResult,
} from '../lib/employeeMessages.ts';
import type { Employee } from '../lib/useEmployees.ts';

interface Props {
  companyId: string;
  employees: readonly Employee[];
  /** The signed-in user's address, where replies will arrive. */
  replyTo: string;
  onClose: () => void;
}

/**
 * Writing to the team by email. Everyone starts selected — a message to the
 * whole team is the common case — and anyone can be unticked. Each person
 * gets their own email, so the form says so: nobody sees the other addresses.
 */
export function EmployeeMessageModal({ companyId, employees, replyTo, onClose }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(employees.map((employee) => employee.id)),
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmployeeMessageResult | null>(null);

  const allSelected = selected.size === employees.length;

  const toggle = (employeeId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(employees.map((employee) => employee.id)));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selected.size === 0) {
      setError(t('employees.message.errors.noRecipients'));
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      setResult(
        await sendEmployeeMessage(companyId, {
          employeeIds: employees.filter((employee) => selected.has(employee.id)).map((employee) => employee.id),
          subject,
          body,
        }),
      );
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setIsSending(false);
    }
  };

  if (result) {
    return (
      <Modal onClose={onClose} labelledBy="employee-message-title">
        <h2 id="employee-message-title" className="modal-title">
          {t(result.sent > 0 ? 'employees.message.result.sentTitle' : 'employees.message.result.notSentTitle')}
        </h2>
        <div className="message-result" role="status">
          {result.sent > 0 && (
            <p>
              {t(result.mode === 'outbox' ? 'employees.message.result.outbox' : 'employees.message.result.sent', {
                count: result.sent,
              })}
            </p>
          )}
          {result.failed.length > 0 && (
            <p className="form-error">
              {t('employees.message.result.failed', { names: result.failed.map((employee) => employee.name).join(', ') })}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose} autoFocus>
            {t('common.close')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="employee-message-title" wide>
      <span className="label-caps modal-eyebrow">{t('employees.message.eyebrow')}</span>
      <h2 id="employee-message-title" className="modal-title">
        {t('employees.message.title')}
      </h2>

      <form className="message-form" onSubmit={handleSubmit}>
        <div className="message-recipients" role="group" aria-labelledby="message-recipients-label">
          <div className="message-recipients-head">
            <span id="message-recipients-label" className="message-recipients-label">
              {t('employees.message.to')}
            </span>
            <span className="field-hint">
              {t('employees.message.selectedCount', { count: selected.size, total: employees.length })}
            </span>
            <button type="button" className="btn-quiet message-recipients-toggle" onClick={toggleAll}>
              {t(allSelected ? 'employees.message.selectNone' : 'employees.message.selectAll')}
            </button>
          </div>

          <ul className="message-recipient-list">
            {employees.map((employee) => (
              <li key={employee.id}>
                <label className={`message-recipient${selected.has(employee.id) ? ' is-selected' : ''}`}>
                  <input type="checkbox" checked={selected.has(employee.id)} onChange={() => toggle(employee.id)} />
                  <span className="message-recipient-name">
                    {employee.firstName} {employee.lastName}
                  </span>
                  <span className="message-recipient-email">{employee.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <label>
          {t('employees.message.subject')}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('employees.message.subjectPlaceholder')}
            maxLength={MESSAGE_SUBJECT_MAX}
            autoComplete="off"
            required
            autoFocus
          />
        </label>

        <label>
          {t('employees.message.body')}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('employees.message.bodyPlaceholder')}
            maxLength={MESSAGE_BODY_MAX}
            rows={8}
            required
          />
          <span className="field-hint">{t('employees.message.privacyHint', { email: replyTo })}</span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isSending}>
            {t('employees.form.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={isSending || selected.size === 0}>
            {isSending ? t('employees.message.sending') : t('employees.message.send', { count: selected.size })}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function describeError(err: unknown, t: TFunction): string {
  if (axios.isAxiosError(err)) {
    // Someone was removed from the team while the form was open.
    if (err.response?.status === 404) return t('employees.message.errors.staleRecipients');
    const message = err.response?.data?.message;
    if (err.response?.status === 400 && Array.isArray(message)) return message.join(', ');
    if (err.response?.status === 400 && typeof message === 'string') return message;
  }
  return t('employees.message.errors.generic');
}
