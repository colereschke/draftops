import type { Page } from '@playwright/test';

export interface CspViolation {
  directive: string;
  disposition: string;
  documentPath: string;
  blockedResource: string;
}

const COLLECTOR_KEY = '__draftopsCspViolations';

export async function installCspViolationCollector(page: Page): Promise<void> {
  await page.addInitScript((collectorKey) => {
    type CollectorWindow = Window & { [key: string]: CspViolation[] | undefined };
    const collectorWindow = window as unknown as CollectorWindow;
    collectorWindow[collectorKey] = [];
    const safeBlockedResource = (value: string) => {
      if (['inline', 'eval', 'wasm-eval'].includes(value)) return value;
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
      } catch {
        return 'other';
      }
    };

    window.addEventListener('securitypolicyviolation', (event) => {
      collectorWindow[collectorKey]?.push({
        directive: event.effectiveDirective || event.violatedDirective,
        disposition: event.disposition,
        documentPath: new URL(event.documentURI).pathname,
        blockedResource: safeBlockedResource(event.blockedURI),
      });
    });
  }, COLLECTOR_KEY);
}

export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  return page.evaluate((collectorKey) => {
    type CollectorWindow = Window & { [key: string]: CspViolation[] | undefined };
    return [...((window as unknown as CollectorWindow)[collectorKey] ?? [])];
  }, COLLECTOR_KEY);
}
