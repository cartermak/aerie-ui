<svelte:options immutable={false} />

<script context="module">
  // Radio button implementation taken from: https://svelte.dev/repl/8e68120858e5322272dc9136c4bb79cc?version=3.7.0

  export const DefaultRadioButtonContextKey = 'radio-buttons';
</script>

<script lang="ts">
  import { createEventDispatcher, onDestroy, setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import type { RadioButtonContext, RadioButtonId } from '../../../types/radio-buttons';
  import { classNames } from '../../../utilities/generic';

  export { className as class };
  export let radioButtonContextKey: string = DefaultRadioButtonContextKey;
  export let radioButtonContainerClassName: string | undefined = undefined;
  export let selectedButtonId: RadioButtonId | undefined = undefined;
  export let id: string = '';

  let className: string = '';

  const dispatch = createEventDispatcher<{
    'select-radio-button': {
      id: RadioButtonId;
      index: number;
    };
  }>();

  const radioButtons: RadioButtonId[] = [];
  const selectedRadioButton = writable<RadioButtonId>();

  $: if (selectedButtonId != null) {
    selectedRadioButton.set(selectedButtonId);
  }

  function unregisterRadioButton(radioButtonId: RadioButtonId) {
    const i = radioButtons.indexOf(radioButtonId);
    radioButtons.splice(i, 1);
    selectedRadioButton.update(current =>
      current === radioButtonId ? radioButtons[i] || radioButtons[radioButtons.length - 1] : current,
    );
  }

  const radioButtonContext = setContext<RadioButtonContext>(radioButtonContextKey, {
    registerRadioButton: (radioButtonId: RadioButtonId) => {
      const existingRadioButton = radioButtons.find(existingRadioButtonId => radioButtonId === existingRadioButtonId);
      if (existingRadioButton) {
        console.error(
          `Radio Button ID "${existingRadioButton}" already exists. Please provide a unique radio button ID.`,
        );
      } else {
        radioButtons.push(radioButtonId);
        selectedRadioButton.update(current => current || radioButtonId);

        onDestroy(() => {
          unregisterRadioButton(radioButtonId);
        });
      }
    },
    selectRadioButton: (radioButtonId: RadioButtonId) => {
      const i = radioButtons.indexOf(radioButtonId);
      selectedRadioButton.set(radioButtonId);

      dispatch('select-radio-button', {
        id: radioButtonId,
        index: i,
      });
    },
    selectedRadioButton,
    unregisterRadioButton,
  });

  export function selectRadioButton(radioButtonId: RadioButtonId) {
    radioButtonContext.selectRadioButton(radioButtonId);
  }
</script>

<div
  class={classNames('radio-buttons', {
    [className]: !!className,
    ...(radioButtonContainerClassName ? { [radioButtonContainerClassName]: !!radioButtonContainerClassName } : {}),
  })}
  role="radiogroup"
  {id}
>
  <div class="radio-buttons-background"></div>
  <slot />
</div>

<style>
  .radio-buttons {
    align-items: center;
    background-color: var(--st-gray-10);
    border-radius: 4px;
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    position: relative;
    width: 100%;
  }

  .radio-buttons-background {
    border: 1px solid var(--st-gray-20);
    border-radius: 4px;
    height: 100%;
    left: 0;
    pointer-events: none;
    position: absolute;
    top: 0;
    width: 100%;
    z-index: 0;
  }
</style>
