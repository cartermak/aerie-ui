<svelte:options immutable={true} />

<script lang="ts">
  import type { FswCommandArgumentVarString } from '@nasa-jpl/aerie-ampcs';
  import { isQuoted, quoteEscape, unquoteUnescape } from './../../../utilities/codemirror/codemirror-utils';

  export let argDef: FswCommandArgumentVarString;
  export let initVal: string;
  export let setInEditor: (val: string) => void;

  let initHadQuotes: boolean = false;
  let value: string;

  $: initHadQuotes = isQuoted(initVal);
  $: value = unquoteUnescape(initVal);

  $: {
    if (value !== unquoteUnescape(initVal)) {
      // normal case is string tokens contain quotes
      if (initHadQuotes) {
        setInEditor(quoteEscape(value));
      } else {
        setInEditor(value);
      }
    }
  }
</script>

<input class="st-input w-100" spellcheck="false" bind:value title={argDef.description} />
