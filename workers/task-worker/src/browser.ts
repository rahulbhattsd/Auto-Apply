import { chromium, type Browser } from 'playwright';

export const launchPlaywrightBrowser = async (): Promise<Browser> => {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
      return await chromium.launch({ headless: true });
    }
  }
};
