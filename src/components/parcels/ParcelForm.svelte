<svelte:options immutable={true} />

<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { createEventDispatcher, onMount } from 'svelte';
  import { sequenceAdaptations } from '../../stores/sequence-adaptation';
  import {
    channelDictionaries,
    commandDictionaries,
    parameterDictionaries,
    parcelToParameterDictionaries,
  } from '../../stores/sequencing';
  import type { User, UserId } from '../../types/app';
  import type { Parcel, ParcelInsertInput, ParcelToParameterDictionary } from '../../types/sequencing';
  import effects from '../../utilities/effects';
  import { permissionHandler } from '../../utilities/permissionHandler';
  import { featurePermissions } from '../../utilities/permissions';
  import PageTitle from '../app/PageTitle.svelte';
  import CssGrid from '../ui/CssGrid.svelte';
  import Panel from '../ui/Panel.svelte';
  import SectionTitle from '../ui/SectionTitle.svelte';
  import DictionaryTable from './DictionaryTable.svelte';

  export let mode: 'create' | 'edit' = 'create';
  export let parcelChannelDictionaryId: number | null = null;
  export let parcelCommandDictionaryId: number | null = null;
  export let parcelCreatedAt: string | undefined = undefined;
  export let parcelId: number | null = null;
  export let parcelName: string | undefined = undefined;
  export let parcelOwner: UserId = null;
  export let parcelSequenceAdaptationId: number | null = null;
  export let user: User | null;

  let hasPermission: boolean = false;
  let pageSubtitle: string = '';
  let pageTitle: string = '';
  let parcelModified: boolean = false;
  let permissionError = 'You do not have permission to edit this parcel.';
  let saveButtonClass: 'primary' | 'secondary' = 'primary';
  let saveButtonText: string = '';
  let saveButtonEnabled: boolean = false;
  let savedParcelChannelDictionaryId: number | null;
  let savedParcelCommandDictionaryId: number | null;
  let savedParcelName: string | undefined;
  let savedParameterDictionaryIds: Record<number, boolean> = {};
  let savedSequenceAdaptationId: number | null;
  let selectedParmeterDictionaries: Record<number, boolean> = {};

  const dispatch = createEventDispatcher<{
    save: { parcelId: number };
  }>();

  $: selectedParmeterDictionaries = savedParameterDictionaryIds = $parcelToParameterDictionaries.reduce(
    (prevBooleanMap: Record<number, boolean>, parcelToParameterDictionary: ParcelToParameterDictionary) => {
      return parcelToParameterDictionary.parcel_id === parcelId
        ? {
            ...prevBooleanMap,
            [parcelToParameterDictionary.parameter_dictionary_id]: true,
          }
        : {};
    },
    {},
  );

  $: saveButtonClass = parcelModified && saveButtonEnabled ? 'primary' : 'secondary';
  $: saveButtonEnabled = parcelCommandDictionaryId !== null && parcelName !== undefined && parcelName !== '';
  $: parcelModified =
    parcelChannelDictionaryId !== savedParcelChannelDictionaryId ||
    parcelCommandDictionaryId !== savedParcelCommandDictionaryId ||
    parcelName !== savedParcelName ||
    parcelSequenceAdaptationId !== savedSequenceAdaptationId ||
    didParameterDictionariesChange(selectedParmeterDictionaries);

  $: {
    hasPermission =
      mode === 'edit'
        ? featurePermissions.parcels.canUpdate(user, { owner: parcelOwner })
        : featurePermissions.parcels.canCreate(user);
    permissionError = `You do not have permission to ${mode === 'edit' ? 'edit this' : 'create a'} parcel.`;
    pageTitle = mode === 'edit' ? 'Parcel' : 'New Parcel';
    pageSubtitle = mode === 'edit' && savedParcelName !== undefined ? savedParcelName : '';
    saveButtonText = mode === 'edit' && !parcelModified ? 'Saved' : 'Save';
  }

  onMount(() => {
    savedParcelChannelDictionaryId = parcelChannelDictionaryId;
    savedParcelCommandDictionaryId = parcelCommandDictionaryId;
    savedParcelName = parcelName;
    savedSequenceAdaptationId = parcelSequenceAdaptationId;
  });

  /**
   * selectedParameterDictionaries keeps track of false values for the table while the saved list doesn't so
   * we need to do a custom comparison.
   */
  function didParameterDictionariesChange(parameterDictionaryMap: Record<number, boolean>): boolean {
    for (const parameterDictionaryIdString of Object.keys(parameterDictionaryMap)) {
      const parameterDictionaryId = parseInt(parameterDictionaryIdString);

      if (
        (selectedParmeterDictionaries[parameterDictionaryId] &&
          !(parameterDictionaryId in savedParameterDictionaryIds)) ||
        (!selectedParmeterDictionaries[parameterDictionaryId] && savedParameterDictionaryIds[parameterDictionaryId])
      ) {
        return true;
      }
    }

    return false;
  }

  function onToggleChannelDictionary(event: CustomEvent<{ id: number; value: boolean }>) {
    parcelChannelDictionaryId = event.detail.value ? event.detail.id : null;
  }

  function onToggleCommandDictionary(event: CustomEvent<{ id: number; value: boolean }>) {
    parcelCommandDictionaryId = event.detail.value ? event.detail.id : null;
  }

  function onToggleParameterDictionary(event: CustomEvent<{ id: number; value: boolean }>) {
    selectedParmeterDictionaries = {
      ...selectedParmeterDictionaries,
      [event.detail.id]: event.detail.value,
    };
  }

  function onToggleSequenceAdaptation(event: CustomEvent<{ id: number; value: boolean }>) {
    parcelSequenceAdaptationId = event.detail.value ? event.detail.id : null;
  }

  async function saveParcelToParameterDictionaries(): Promise<void> {
    const parcelToParameterDictionariesToAdd: Omit<ParcelToParameterDictionary, 'id'>[] = [];
    const parcelToParameterDictionaryIdsToDelete: number[] = [];

    Object.keys(selectedParmeterDictionaries).forEach(parameterDictionaryIdString => {
      const parameterDictionaryId = parseInt(parameterDictionaryIdString);
      const isSelected = selectedParmeterDictionaries[parameterDictionaryId];

      if (!isSelected && savedParameterDictionaryIds[parameterDictionaryId]) {
        // Parameter dictionary was removed from the parcel.
        parcelToParameterDictionaryIdsToDelete.push(parameterDictionaryId);
      } else if (isSelected && !savedParameterDictionaryIds[parameterDictionaryId] && parcelId) {
        // Parameter dictionary was freshly added to the parcel and hasn't been saved yet.
        parcelToParameterDictionariesToAdd.push({
          parameter_dictionary_id: parameterDictionaryId,
          parcel_id: parcelId,
        });
      }
    });

    if (parcelToParameterDictionariesToAdd.length > 0) {
      await effects.createParcelToParameterDictionaries(parcelOwner, parcelToParameterDictionariesToAdd, user);
    }

    if (parcelToParameterDictionaryIdsToDelete.length > 0) {
      const parcelToParameterDictionaryAssociationsToDelete: ParcelToParameterDictionary[] = [];

      for (const paramDictionaryId of parcelToParameterDictionaryIdsToDelete) {
        const parcelToParameterDictionary: ParcelToParameterDictionary | undefined =
          $parcelToParameterDictionaries.find(
            p => p.parameter_dictionary_id === paramDictionaryId && p.parcel_id === parcelId,
          );

        if (parcelToParameterDictionary) {
          parcelToParameterDictionaryAssociationsToDelete.push(parcelToParameterDictionary);
        }
      }

      if (parcelToParameterDictionaryAssociationsToDelete.length > 0) {
        await effects.deleteParcelToDictionaryAssociations(parcelToParameterDictionaryAssociationsToDelete, user);
      }
    }
  }

  async function saveParcel() {
    if (saveButtonEnabled) {
      if (parcelCommandDictionaryId !== null && parcelName && parcelName !== '') {
        if (mode === 'create') {
          const newParcel: ParcelInsertInput = {
            channel_dictionary_id: parcelChannelDictionaryId,
            command_dictionary_id: parcelCommandDictionaryId,
            name: parcelName,
            sequence_adaptation_id: parcelSequenceAdaptationId,
          };
          parcelId = await effects.createParcel(newParcel, user);

          await saveParcelToParameterDictionaries();

          if (parcelId !== null) {
            dispatch('save', { parcelId });
          }
        } else if (mode === 'edit' && parcelId !== null) {
          const updatedParcel: Partial<Parcel> = {
            channel_dictionary_id: parcelChannelDictionaryId,
            command_dictionary_id: parcelCommandDictionaryId,
            name: parcelName,
            sequence_adaptation_id: parcelSequenceAdaptationId,
          };

          await saveParcelToParameterDictionaries();
          await effects.updateParcel(parcelId, updatedParcel, parcelOwner, user);
        }

        savedParcelChannelDictionaryId = parcelChannelDictionaryId;
        savedParcelCommandDictionaryId = parcelCommandDictionaryId;
        savedSequenceAdaptationId = parcelSequenceAdaptationId;
        savedParcelName = parcelName;
      }
    }
  }
</script>

<PageTitle subTitle={pageSubtitle} title={pageTitle} />

<CssGrid columns="20% auto">
  <Panel borderRight padBody={false}>
    <svelte:fragment slot="header">
      <SectionTitle>{mode === 'create' ? 'New Parcel' : 'Edit Parcel'}</SectionTitle>

      <div class="right">
        <button class="st-button secondary ellipsis" on:click={() => goto(`${base}/parcels`)}>
          {mode === 'create' ? 'Cancel' : 'Close'}
        </button>
        <button
          class="st-button {saveButtonClass} ellipsis"
          disabled={!saveButtonEnabled || !parcelModified}
          use:permissionHandler={{
            hasPermission,
            permissionError,
          }}
          on:click={saveParcel}
        >
          {saveButtonText}
        </button>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="body">
      {#if mode === 'edit'}
        <fieldset>
          <label for="parcelId">ID</label>
          <input class="st-input w-100" disabled name="parcelId" value={parcelId} />
        </fieldset>

        <fieldset>
          <label for="createdAt">Created At</label>
          <input class="st-input w-100" disabled name="createdAt" value={parcelCreatedAt} />
        </fieldset>
      {/if}

      <fieldset>
        <label for="sequenceName">Name (required)</label>
        <input
          bind:value={parcelName}
          autocomplete="off"
          class="st-input w-100"
          name="parcelName"
          placeholder="Enter Parcel Name"
          required
          use:permissionHandler={{
            hasPermission,
            permissionError,
          }}
        />
      </fieldset>
    </svelte:fragment>
  </Panel>

  <div class="table-container">
    <DictionaryTable
      dictionaries={$commandDictionaries}
      selectedDictionaryIds={parcelCommandDictionaryId ? { [parcelCommandDictionaryId]: true } : {}}
      isEditingParcel={true}
      hasEditPermission={hasPermission}
      type="Command"
      {user}
      on:select={onToggleCommandDictionary}
    />

    <DictionaryTable
      dictionaries={$channelDictionaries}
      selectedDictionaryIds={parcelChannelDictionaryId ? { [parcelChannelDictionaryId]: true } : {}}
      isEditingParcel={true}
      hasEditPermission={hasPermission}
      type="Channel"
      {user}
      on:select={onToggleChannelDictionary}
    />

    <DictionaryTable
      dictionaries={$parameterDictionaries}
      selectedDictionaryIds={selectedParmeterDictionaries}
      isEditingParcel={true}
      isMultiselect={true}
      hasEditPermission={hasPermission}
      type="Parameter"
      {user}
      on:select={onToggleParameterDictionary}
    />

    <DictionaryTable
      dictionaries={$sequenceAdaptations}
      selectedDictionaryIds={parcelSequenceAdaptationId ? { [parcelSequenceAdaptationId]: true } : {}}
      isEditingParcel={true}
      hasEditPermission={hasPermission}
      type="Sequence"
      {user}
      on:select={onToggleSequenceAdaptation}
    />
  </div>
</CssGrid>

<style>
  .table-container {
    display: grid;
  }
</style>
