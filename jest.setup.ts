import 'jest-axe/extend-expect';
import '@testing-library/jest-dom';

// Some test files run under the Node test environment (API routes, server actions),
// where DOM globals like MouseEvent/Element don't exist — skip the DOM polyfills there.
if (typeof Element !== 'undefined') {
  // jsdom has no PointerEvent constructor at all — Base UI's Menu (used by shadcn's
  // DropdownMenu) and userEvent's click() both depend on real pointer events.
  if (typeof globalThis.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;

      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? 'mouse';
        this.isPrimary = params.isPrimary ?? true;
      }
    }
    globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
    window.PointerEvent = globalThis.PointerEvent;
  }

  // jsdom doesn't implement these — Base UI's Menu (used by shadcn's DropdownMenu)
  // calls them during pointer interaction and positioning.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia === 'undefined') {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  }

  // jsdom's Blob/File implementation doesn't implement the stream-based read methods
  // (`.text()`, `.arrayBuffer()`) — the global `File` under jsdom resolves to jsdom's own
  // File-API implementation rather than Node's built-in File, and that implementation simply
  // omits these prototype methods. Components that read an uploaded File via `file.text()`
  // (e.g. RankingsUploadForm) need this to work under `@testing-library/user-event`'s
  // `user.upload()`.
  if (typeof File !== 'undefined' && !File.prototype.text) {
    File.prototype.text = function (this: File) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
}
