import type { Page } from '@playwright/test';

export interface CspViolation {
  directive: string;
  disposition: string;
  documentPath: string;
  blockedResource: string;
}

const COLLECTOR_BINDING = '__draftopsRecordCspViolation';
const COLLECTOR_FLUSH_BINDING = '__draftopsFlushCspViolations';
const collectedViolations = new WeakMap<Page, CspViolation[]>();

function parseCspViolation(value: unknown): CspViolation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.directive !== 'string' ||
    typeof record.disposition !== 'string' ||
    typeof record.documentPath !== 'string' ||
    typeof record.blockedResource !== 'string'
  ) {
    return undefined;
  }
  let documentPath: string;
  try {
    documentPath = new URL(record.documentPath, 'https://draftops.invalid').pathname;
  } catch {
    return undefined;
  }
  let blockedResource: string;
  if (['inline', 'eval', 'wasm-eval'].includes(record.blockedResource)) {
    blockedResource = record.blockedResource;
  } else {
    try {
      const url = new URL(record.blockedResource);
      blockedResource =
        url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
    } catch {
      blockedResource = 'other';
    }
  }
  return {
    directive: record.directive,
    disposition: record.disposition,
    documentPath,
    blockedResource,
  };
}

export async function installCspViolationCollector(page: Page): Promise<void> {
  const violations: CspViolation[] = [];
  collectedViolations.set(page, violations);
  await page.exposeFunction(COLLECTOR_BINDING, (value: unknown) => {
    const violation = parseCspViolation(value);
    if (violation) violations.push(violation);
  });
  await page.exposeFunction(COLLECTOR_FLUSH_BINDING, () => undefined);
  await page.addInitScript((collectorBinding) => {
    type CollectorWindow = Window & {
      [key: string]: ((violation: CspViolation) => Promise<void>) | undefined;
    };
    const collectorWindow = window as unknown as CollectorWindow;
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
      void collectorWindow[collectorBinding]?.({
        directive: event.effectiveDirective || event.violatedDirective,
        disposition: event.disposition,
        documentPath: new URL(event.documentURI).pathname,
        blockedResource: safeBlockedResource(event.blockedURI),
      });
    });
  }, COLLECTOR_BINDING);
}

export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  await page.evaluate(async (flushBinding) => {
    type FlushWindow = Window & { [key: string]: (() => Promise<void>) | undefined };
    await (window as unknown as FlushWindow)[flushBinding]?.();
  }, COLLECTOR_FLUSH_BINDING);
  return [...(collectedViolations.get(page) ?? [])];
}
