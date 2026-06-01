const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withUsbHost(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    const hasUsbHost = manifest['uses-feature'].some(
      f => f.$?.['android:name'] === 'android.hardware.usb.host'
    );
    if (!hasUsbHost) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.usb.host', 'android:required': 'false' }
      });
    }

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const hasUsbPerm = manifest['uses-permission'].some(
      p => p.$?.['android:name'] === 'android.permission.USB_PERMISSION'
    );
    if (!hasUsbPerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.USB_PERMISSION' }
      });
    }

    return config;
  });
};
