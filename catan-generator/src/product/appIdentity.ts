/**
 * App Store–facing identity (generic settlers coach — not trademarked “Catan”).
 * Internal package folder may still be `catan-generator`.
 */

export const APP_DISPLAY_NAME = 'Hex Settlement Coach';
export const APP_DISPLAY_NAME_NB = 'Hex Settlement Coach';

/** Reverse-DNS bundle id — replace TEAM with your Apple team / company slug before shipping. */
export const APP_BUNDLE_ID = 'com.hexsettlement.coach';

export const APP_SUPPORT_EMAIL = 'support@hexsettlement.coach';

/** Public privacy policy (ship a real URL before App Review). */
export const APP_PRIVACY_POLICY_PATH = '/privacy.html';

export const APP_VERSION_LABEL = '1.0.0';

/** v1.0 scope freeze — what ships in the first App Store build. */
export const V1_SCOPE = {
  included: [
    'standardBoardGeneration',
    'extension56Board',
    'setupSimulationPremium',
    'strategyHarborRoadAdvice',
    'photoImportWithHarborConfirm',
    'midgameV1Premium',
    'englishDefaultNorwegianOptional',
  ],
  excluded: [
    'fullSeafarersRules',
    'citiesAndKnights',
    'liveDiceTracking',
    'tradingAdvisor',
    'developmentCards',
  ],
} as const;
