import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DisableTwoFactorModal, EnableTwoFactorModal } from '../../components/TwoFactorModals.tsx';
import {
  describeDevice,
  formatDateTime,
  twoFactorApi,
  twoFactorErrorMessage,
  type TrustedDevice,
  type TwoFactorStatus,
} from '../../lib/twoFactor.ts';

/**
 * The signed-in person's own security, shown under their profile: email
 * two-factor on or off, and the browsers remembered to skip the code.
 * Everyone has one, whatever their role in the company — two-factor belongs
 * to the person, not the membership.
 *
 * It loads on its own, after the profile form: if it cannot, the form above
 * still works and this part offers to try again.
 */
export function SecuritySettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState<'enable' | 'disable' | null>(null);

  const loadDevices = useCallback(async () => {
    setDevices(await twoFactorApi.devices());
  }, []);

  const load = useCallback(() => {
    Promise.all([twoFactorApi.status(), twoFactorApi.devices()])
      .then(([loadedStatus, loadedDevices]) => {
        setStatus(loadedStatus);
        setDevices(loadedDevices);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(load, [load]);

  const retry = () => {
    setLoadError(false);
    load();
  };

  if (loadError) {
    return (
      <section className="card settings-card">
        <header className="settings-card-head">
          <h2>{t('settings.security.twoFactorTitle')}</h2>
        </header>
        <div className="security-load-error">
          <p className="form-error" role="alert">
            {t('settings.security.loadError')}
          </p>
          <button type="button" className="btn-ghost" onClick={retry}>
            {t('settings.security.retry')}
          </button>
        </div>
      </section>
    );
  }
  if (!status || !devices) return <p className="dashboard-placeholder">{t('common.loading')}</p>;

  return (
    <>
      <section className="card settings-card">
        <header className="settings-card-head settings-card-head--action">
          <div>
            <h2>{t('settings.security.twoFactorTitle')}</h2>
            <p>{t('settings.security.twoFactorHint')}</p>
          </div>
          {status.enabled ? (
            <button type="button" className="btn-ghost" onClick={() => setModal('disable')}>
              {t('settings.security.turnOff')}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setModal('enable')}>
              {t('settings.security.turnOn')}
            </button>
          )}
        </header>

        <div className="security-status">
          <span className={`security-status-dot${status.enabled ? ' is-on' : ''}`} aria-hidden="true" />
          <span className="security-status-text">
            {status.enabled
              ? t('settings.security.on', { since: status.enabledAt ? formatDateTime(status.enabledAt) : '' })
              : t('settings.security.off')}
          </span>
        </div>
      </section>

      <TrustedDevicesCard devices={devices} onChanged={loadDevices} />

      {modal === 'enable' && (
        <EnableTwoFactorModal
          onClose={() => setModal(null)}
          onEnabled={(next) => {
            setStatus(next);
          }}
        />
      )}
      {modal === 'disable' && (
        <DisableTwoFactorModal
          onClose={() => setModal(null)}
          onDisabled={(next) => {
            setStatus(next);
            // Turning it off forgets every remembered device.
            setDevices([]);
          }}
        />
      )}
    </>
  );
}

function TrustedDevicesCard({ devices, onChanged }: { devices: TrustedDevice[]; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(twoFactorErrorMessage(t, err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card settings-card">
      <header className="settings-card-head settings-card-head--action">
        <div>
          <h2>{t('settings.security.devicesTitle')}</h2>
          <p>{t('settings.security.devicesHint')}</p>
        </div>
        {devices.length > 1 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void run('all', twoFactorApi.revokeAllDevices)}
            disabled={busyId !== null}
          >
            {t('settings.security.revokeAll')}
          </button>
        )}
      </header>

      {devices.length === 0 ? (
        <p className="security-empty">{t('settings.security.noDevices')}</p>
      ) : (
        <ul className="device-list">
          {devices.map((device) => {
            const { browser, os } = describeDevice(device.userAgent);
            const name =
              browser && os
                ? t('settings.security.deviceName', { browser, os })
                : (browser ?? os ?? t('settings.security.unknownDevice'));
            return (
              <li key={device.id} className="device-row">
                <div className="device-text">
                  <span className="device-name">
                    {name}
                    {device.current && <span className="badge-outline device-current">{t('settings.security.thisDevice')}</span>}
                  </span>
                  <span className="device-meta">
                    {t('settings.security.lastUsed', { when: formatDateTime(device.lastUsedAt) })}
                    {device.ip && ` · ${device.ip}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-quiet device-revoke"
                  onClick={() => void run(device.id, () => twoFactorApi.revokeDevice(device.id))}
                  disabled={busyId !== null}
                >
                  {busyId === device.id ? t('common.loading') : t('settings.security.revoke')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
