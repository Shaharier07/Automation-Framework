/**
 * Appium (mobile) configuration: Android & iOS, emulator/simulator or real device.
 * Only capabilities that have a value are sent to Appium.
 */
import { env } from '../support/config';

export type MobilePlatform = 'android' | 'ios';

type Caps = Record<string, string | number | boolean>;

const compact = (obj: Record<string, unknown>): Caps =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null)) as Caps;

function androidCapabilities(): Caps {
  return compact({
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': env.str('ANDROID_DEVICE_NAME'),
    'appium:platformVersion': env.str('ANDROID_PLATFORM_VERSION'),
    'appium:udid': env.str('ANDROID_UDID'),
    'appium:avd': env.str('ANDROID_AVD'),
    'appium:app': env.str('ANDROID_APP_PATH'),
    'appium:appPackage': env.str('ANDROID_APP_PACKAGE'),
    'appium:appActivity': env.str('ANDROID_APP_ACTIVITY'),
    'appium:noReset': env.bool('NO_RESET', false),
    'appium:fullReset': env.bool('FULL_RESET', false),
    'appium:autoGrantPermissions': true,
    'appium:newCommandTimeout': 300,
  });
}

function iosCapabilities(): Caps {
  const realDevice = env.str('IOS_UDID') !== '' && env.str('IOS_XCODE_ORG_ID') !== '';
  return compact({
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': env.str('IOS_DEVICE_NAME'),
    'appium:platformVersion': env.str('IOS_PLATFORM_VERSION'),
    'appium:udid': env.str('IOS_UDID'),
    'appium:app': env.str('IOS_APP_PATH'),
    'appium:bundleId': env.str('IOS_BUNDLE_ID'),
    'appium:xcodeOrgId': realDevice ? env.str('IOS_XCODE_ORG_ID') : '',
    'appium:xcodeSigningId': realDevice ? env.str('IOS_XCODE_SIGNING_ID', 'iPhone Developer') : '',
    'appium:noReset': env.bool('NO_RESET', false),
    'appium:fullReset': env.bool('FULL_RESET', false),
    'appium:newCommandTimeout': 300,
    // system permission alerts: accept automatically only when configured; otherwise handle them explicitly in a screen object
    'appium:autoAcceptAlerts': env.bool('IOS_AUTO_ACCEPT_ALERTS', false),
    // first session on a new simulator/device builds WebDriverAgent (several minutes)
    'appium:wdaLaunchTimeout': env.num('IOS_WDA_LAUNCH_TIMEOUT_MS', 300000),
    'appium:wdaConnectionTimeout': env.num('IOS_WDA_LAUNCH_TIMEOUT_MS', 300000),
  });
}

/** Default explicit wait for element conditions (no implicit waits are used). */
export const mobileTimeoutMs = () => env.num('MOBILE_TIMEOUT_MS', 15000);

/** Fail fast when no app under test is configured. */
function requireApp(platform: MobilePlatform): void {
  if (platform === 'android' && !env.str('ANDROID_APP_PATH') && !env.str('ANDROID_APP_PACKAGE')) {
    env.required('ANDROID_APP_PATH', 'Android tests (or set ANDROID_APP_PACKAGE + ANDROID_APP_ACTIVITY)');
  }
  if (platform === 'ios' && !env.str('IOS_APP_PATH') && !env.str('IOS_BUNDLE_ID')) {
    env.required('IOS_APP_PATH', 'iOS tests (or set IOS_BUNDLE_ID)');
  }
}

export function getMobileConfig() {
  const platform = env.str('PLATFORM', 'android').toLowerCase() as MobilePlatform;
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(`Unsupported PLATFORM "${platform}". Use "android" or "ios".`);
  }
  requireApp(platform);
  return {
    platform,
    remote: {
      hostname: env.str('APPIUM_HOST', '127.0.0.1'),
      port: env.num('APPIUM_PORT', 4723),
      path: env.str('APPIUM_BASE_PATH', '/'),
      logLevel: 'warn' as const,
      // session creation can take minutes (WDA build, emulator cold start); no automatic retries that would start it twice
      connectionRetryTimeout: env.num('APPIUM_SESSION_TIMEOUT_MS', 600000),
      connectionRetryCount: 0,
      capabilities: platform === 'android' ? androidCapabilities() : iosCapabilities(),
    },
  };
}
