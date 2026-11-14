import type { ConfigContext, ExpoConfig } from 'expo/config';

const DEFAULT_TERMS_URL = 'https://housegains.app/terms';
const DEFAULT_PRIVACY_POLICY_URL = 'https://housegains.app/privacy';
const SUPPORT_URL = 'https://housegains.app/support';
const DELETE_ACCOUNT_URL = 'https://housegains.app/delete-account';

type AppVariant = 'dev' | 'prod';

type VariantConfig = {
  name: string;
  iosBundleId: string;
  androidPackage: string;
  firebaseProject: string;
};

type TermsConfig = {
  requiredVersion: string;
  url: string;
  privacyPolicyUrl: string;
};

type GoogleAuthConfig = {
  androidClientId: string;
  iosClientId: string;
  webClientId: string;
};

type AppleWebAuthConfig = {
  clientId: string;
  redirectUri: string;
};

function resolveTermsConfig(): TermsConfig {
  const requiredVersion = process.env.EXPO_PUBLIC_TERMS_REQUIRED_VERSION?.trim() || 'v1';
  const url = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || DEFAULT_TERMS_URL;
  const privacyPolicyUrl =
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || DEFAULT_PRIVACY_POLICY_URL;

  return {
    requiredVersion,
    url,
    privacyPolicyUrl,
  };
}

function resolveGoogleAuthConfig(): GoogleAuthConfig {
  return {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID?.trim() ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID?.trim() ?? '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID?.trim() ?? '',
  };
}

function resolveAppleWebAuthConfig(): AppleWebAuthConfig {
  return {
    clientId: process.env.EXPO_PUBLIC_APPLE_WEB_CLIENT_ID?.trim() ?? '',
    redirectUri: process.env.EXPO_PUBLIC_APPLE_WEB_REDIRECT_URI?.trim() ?? '',
  };
}

const VARIANT_IDENTIFIERS: Record<AppVariant, VariantConfig> = {
  dev: {
    name: 'HouseGains Dev',
    iosBundleId: 'com.housegains.app.dev',
    androidPackage: 'com.housegains.app.dev',
    firebaseProject: 'housegains-dev',
  },
  prod: {
    name: 'HouseGains',
    iosBundleId: 'com.housegains.app',
    androidPackage: 'com.housegains.app',
    firebaseProject: 'housegains-prod',
  },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'prod' ? 'prod' : 'dev';
  const { name, iosBundleId, androidPackage, firebaseProject } = VARIANT_IDENTIFIERS[variant];
  const terms = resolveTermsConfig();
  const googleAuth = resolveGoogleAuthConfig();
  const appleWebAuth = resolveAppleWebAuthConfig();

  return {
    ...config,
    name,
    slug: 'housegains',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'housegains',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: iosBundleId,
      associatedDomains: ['applinks:housegains.app'],
      infoPlist: {
        CFBundleLocalizations: ['en', 'pt-BR', 'es', 'fr', 'de', 'it'],
        NSCameraUsageDescription:
          'HouseGains uses the camera to scan household invitation QR codes.',
        // Native permission strings live in ios/HouseGains/Info.plist (native folders are maintained by hand).
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#2563EB',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: androidPackage,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            { scheme: 'https', host: 'housegains.app', pathPrefix: '/j/' },
            { scheme: 'https', host: 'housegains.app', pathPrefix: '/join/' },
          ],
        },
      ],
    },
    web: {
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-apple-authentication',
      ['expo-router', { root: './housegains-app' }],
      'expo-localization',
      // expo-camera native permissions are applied directly to ios/HouseGains/Info.plist and
      // android/app/src/main/AndroidManifest.xml (no expo prebuild policy).
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#2563EB',
          dark: {
            backgroundColor: '#2563EB',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant: variant,
      firebaseProject,
      terms,
      supportUrl: SUPPORT_URL,
      deleteAccountUrl: DELETE_ACCOUNT_URL,
      googleAuth,
      appleWebAuth,
    },
  };
};
