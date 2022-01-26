/**
 * Comparator function for numbers or strings.
 * Defaults to ascending order.
 */
export function compare(
  a: number | string,
  b: number | string,
  isAsc = true,
): number {
  return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
}

/**
 * Clamp a number between min and max.
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

/**
 * Returns a target based on an Event.
 */
export function getTarget(event: Event | FocusEvent) {
  const { target: eventTarget } = event;
  const target = eventTarget as HTMLElement;

  if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    const { name, type, value: valueAsString, valueAsNumber } = input;
    const value = type === 'number' ? valueAsNumber : valueAsString;

    return { name, value };
  } else if (target.tagName === 'SELECT') {
    const select = target as HTMLSelectElement;
    const type = select.getAttribute('data-type') ?? 'text';
    const { name, value: valueAsString } = select;
    const valueAsFloat = parseFloat(valueAsString);
    const valueAsNumber = Number.isNaN(valueAsFloat) ? null : valueAsFloat;
    const value = type === 'number' ? valueAsNumber : valueAsString;

    return { name, value };
  } else {
    console.log('getTarget called with unknown tag');

    return { name: 'unknown', value: 'unknown' };
  }
}

/**
 * Converts a list to a map keyed by 'id' (or alternate key).
 */
export function keyBy<T>(list: T[], key = 'id'): Record<number, T> {
  return list.reduce((map: Record<number, T>, value: T) => {
    map[value[key]] = value;
    return map;
  }, {});
}

/**
 * Removes a query param from the current URL.
 */
export function removeQueryParam(key: string): void {
  const { history, location } = window;
  const { hash, host, pathname, protocol, search } = location;

  const urlSearchParams = new URLSearchParams(search);
  urlSearchParams.delete(key);
  const params = urlSearchParams.toString();

  let path = `${protocol}//${host}${pathname}`;

  if (params !== '') {
    path = `${path}?${params}`;
  }

  if (hash !== '') {
    path = `${path}${hash}`;
  }

  history.replaceState({ path }, '', path);
}

/**
 * Changes the current URL to include a query parameter given by [key]=[value].
 * @note Only runs in the browser (not server-side).
 */
export function setQueryParam(key: string, value: string): void {
  const { history, location } = window;
  const { hash, host, pathname, protocol, search } = location;

  const urlSearchParams = new URLSearchParams(search);
  urlSearchParams.set(key, value);
  const params = urlSearchParams.toString();

  const path = `${protocol}//${host}${pathname}?${params}${hash}`;
  history.replaceState({ path }, '', path);
}

/**
 * Returns a promise that resolves after the given number of milliseconds has passed.
 */
export function sleep(milliseconds = 250): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), milliseconds));
}
