const STEP_ATTR_KEY = 'data-original-step';

function isNumberInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'number';
}

export function installIntegerSpinnerStepBehavior(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if ((window as Window & { __integerSpinnerStepInstalled?: boolean }).__integerSpinnerStepInstalled) {
    return;
  }

  (window as Window & { __integerSpinnerStepInstalled?: boolean }).__integerSpinnerStepInstalled = true;

  document.addEventListener('focusin', (event) => {
    if (!isNumberInput(event.target)) {
      return;
    }

    if (!event.target.hasAttribute(STEP_ATTR_KEY)) {
      const original = event.target.getAttribute('step');
      if (original !== null) {
        event.target.setAttribute(STEP_ATTR_KEY, original);
      }
    }

    event.target.setAttribute('step', '1');
  });

  document.addEventListener('focusout', (event) => {
    if (!isNumberInput(event.target)) {
      return;
    }

    const original = event.target.getAttribute(STEP_ATTR_KEY);
    if (original === null) {
      event.target.removeAttribute('step');
      return;
    }

    event.target.setAttribute('step', original);
    event.target.removeAttribute(STEP_ATTR_KEY);
  });
}
