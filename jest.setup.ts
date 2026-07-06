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
}
