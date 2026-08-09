import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardSize, GeneratorSettings } from '../catan/types';
import { SettingsPanel } from './SettingsPanel';
import { setAppLocale, type AppLocale } from '../i18n';
import { openFeedbackEmail, openPrivacyPolicy } from '../native/feedback';
import { APP_VERSION_LABEL } from '../product/appIdentity';
import { upcomingVariants } from '../catan/variants';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: GeneratorSettings;
  onSettingsChange: (settings: GeneratorSettings) => void;
  boardSize: BoardSize;
  onBoardSizeChange: (size: BoardSize) => void;
  canUseBonanza?: boolean;
  onPremiumRequired?: () => void;
}

export function SettingsModal({
  open,
  onClose,
  settings,
  onSettingsChange,
  boardSize,
  onBoardSizeChange,
  canUseBonanza = true,
  onPremiumRequired,
}: SettingsModalProps) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const locale = (i18n.language === 'nb' ? 'nb' : 'en') as AppLocale;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="settings-modal-title">{t('settings.title')}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>{t('language.label')}</h3>
            <label className="field">
              {t('language.label')}
              <select
                value={locale}
                onChange={(e) => {
                  void setAppLocale(e.target.value as AppLocale);
                }}
              >
                <option value="en">{t('language.en')}</option>
                <option value="nb">{t('language.nb')}</option>
              </select>
            </label>
          </section>

          <section className="modal-section">
            <h3>{t('settings.boardSize')}</h3>
            <label className="field">
              {t('variants.heading')}
              <select
                value={boardSize}
                onChange={(e) => onBoardSizeChange(e.target.value as BoardSize)}
              >
                <option value="base">{t('settings.base')}</option>
                <option value="extension56">{t('settings.extension56')}</option>
              </select>
            </label>
            {upcomingVariants().length > 0 && (
              <p className="muted small">
                {upcomingVariants()
                  .map((v) => t(v.labelKey))
                  .join(' · ')}
              </p>
            )}
          </section>

          <SettingsPanel
            settings={settings}
            onChange={onSettingsChange}
            embedded
            boardSize={boardSize}
            canUseBonanza={canUseBonanza}
            onPremiumRequired={onPremiumRequired}
          />

          <section className="modal-section settings-support">
            <button type="button" className="btn btn-block" onClick={openFeedbackEmail}>
              {t('settings.feedback')}
            </button>
            <button type="button" className="btn btn-block" onClick={openPrivacyPolicy}>
              {t('settings.privacy')}
            </button>
            <p className="muted small">
              {t('settings.aboutVersion', { version: APP_VERSION_LABEL })}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
